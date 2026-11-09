import test from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { GatewayDaemon } from '../gateway/daemon.ts';
import { EventRecorder } from '../gateway/recorder.ts';
import { signReceipt } from '../contracts/evidence_ledger/receipt.ts';
import { sha256 } from '../gateway/crypto_utils.ts';

test('GatewayDaemon: end-to-end event recording and hash-chain verification', async () => {
  const tmpLog = path.resolve(process.cwd(), 'fixtures', 'test_events.jsonl');
  if (fs.existsSync(tmpLog)) fs.unlinkSync(tmpLog);

  const daemon = new GatewayDaemon({ logPath: tmpLog });

  // Create sub-accounts
  const emp = daemon.nearClient.createSubAccount('employer1', 'employer');
  const w1 = daemon.nearClient.createSubAccount('worker7', 'worker');
  const w2 = daemon.nearClient.createSubAccount('worker3', 'worker');

  // 1. Post task
  const task = daemon.postTask(emp.account_id, {
    job_id: 'job_test_101',
    title: 'Audit Smart Contract for Reentrancy',
    task_spec: 'Check cross-contract call state mutation patterns',
    max_budget_yoctonear: '100000000000000000000000',
  });
  assert.strictEqual(task.status, 'OPEN');

  // 2. Commit and reveal bids
  const salt1 = 'salt_worker7';
  const price1 = '75000000000000000000000';
  daemon.commitBid(w1.account_id, task.job_id, sha256(`${w1.account_id}:${price1}:${salt1}`));

  const salt2 = 'salt_worker3';
  const price2 = '90000000000000000000000';
  daemon.commitBid(w2.account_id, task.job_id, sha256(`${w2.account_id}:${price2}:${salt2}`));

  daemon.revealBid(w1.account_id, task.job_id, price1, salt1);
  daemon.revealBid(w2.account_id, task.job_id, price2, salt2);

  // 3. Award to lowest bidder (w1)
  daemon.awardJob(emp.account_id, task.job_id, w1.account_id);

  // 4. Deliver work
  const resultDigest = sha256('audit_report_findings_reentrancy_none');
  daemon.deliverWork(w1.account_id, task.job_id, resultDigest, 'ipfs://audit_report_hash');

  // 5. Co-sign receipt and settle via NEAR Intents
  const unsignedReceipt = {
    receipt_id: `rcpt_${sha256(`${task.job_id}:${w1.account_id}:128455005`).substring(0, 16)}`,
    job_id: task.job_id,
    employer: emp.account_id,
    worker: w1.account_id,
    task_digest: task.task_digest,
    result_digest: resultDigest,
    price_yoctonear: price1,
    settlement_tx: sha256('intent_tx'),
    block_height: 128455005,
    timestamp_ns: Date.now() * 1_000_000,
    outcome: 'CLEARED' as const,
  };
  const signed = signReceipt(unsignedReceipt, emp.key_pair.keyObjectPrivate);

  const settlement = await daemon.settleViaIntents(
    emp.account_id,
    task.job_id,
    signed.sig,
    'USDC'
  );
  assert.strictEqual(settlement.receipt.outcome, 'CLEARED');
  assert.ok(settlement.intentResult.tx_hash.startsWith('tx_intent_'));

  // 6. Publish daily Merkle root
  const day = new Date().toISOString().slice(0, 10);
  const rootRecord = daemon.publishDailyRoot(day, 'relayer.clearing.testnet');
  assert.strictEqual(rootRecord.leaf_count, 1);

  // 7. Verify EventRecorder hash-chain
  const chainCheck = EventRecorder.verifyLogChain(tmpLog);
  assert.strictEqual(chainCheck.valid, true, `Hash chain check failed: ${chainCheck.error}`);
  assert.ok(chainCheck.total >= 7, 'Chain should contain at least 7 chained events');

  // Cleanup
  if (fs.existsSync(tmpLog)) fs.unlinkSync(tmpLog);
});
