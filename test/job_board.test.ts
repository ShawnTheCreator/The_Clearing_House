import test from 'node:test';
import assert from 'node:assert';
import { JobBoardContract } from '../contracts/job_board/Contract.ts';
import { EvidenceLedgerContract } from '../contracts/evidence_ledger/LedgerContract.ts';
import { generateEd25519KeyPair, sha256 } from '../gateway/crypto_utils.ts';
import { signReceipt, verifyReceiptSignature } from '../contracts/evidence_ledger/receipt.ts';

test('JobBoard + EvidenceLedger: full lifecycle auction, settlement and Merkle inclusion', () => {
  const jobBoard = new JobBoardContract();
  const ledger = new EvidenceLedgerContract();

  const employerKp = generateEd25519KeyPair();
  const workerKp = generateEd25519KeyPair();

  const employer = 'employer1.clearing.testnet';
  const worker = 'worker7.clearing.testnet';
  const jobId = 'job_0042';

  // 1. Post task with escrow
  const task = jobBoard.post_task(
    employer,
    {
      job_id: jobId,
      title: 'Generate Rust unit tests for near-sdk-contract',
      task_spec: 'Implement fuzz test harness for cross-contract call',
      max_budget_yoctonear: '100000000000000000000000', // 0.1 NEAR
    },
    '100000000000000000000000'
  );
  assert.strictEqual(task.status, 'OPEN');

  // 2. Commit sealed bid
  const bidPrice = '80000000000000000000000'; // 0.08 NEAR
  const salt = 'random_salt_xyz_123';
  const bidHash = sha256(`${worker}:${bidPrice}:${salt}`);
  jobBoard.commit_bid(worker, jobId, bidHash);

  // 3. Reveal bid
  const revealed = jobBoard.reveal_bid(worker, jobId, bidPrice, salt);
  assert.strictEqual(revealed.price_yoctonear, bidPrice);

  // 4. Award job
  const awarded = jobBoard.award_job(employer, jobId, worker);
  assert.strictEqual(awarded.status, 'AWARDED');
  assert.strictEqual(awarded.selected_worker, worker);

  // 5. Worker delivers work
  const resultDigest = sha256('unit_test_code_deliverable_bytes');
  const delivered = jobBoard.deliver_work(
    worker,
    jobId,
    resultDigest,
    'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
  );
  assert.strictEqual(delivered.status, 'DELIVERED');

  // 6. Sign receipt and settle
  const unsignedReceipt = {
    receipt_id: `rcpt_${sha256(`${jobId}:${worker}:128455005`).substring(0, 16)}`,
    job_id: jobId,
    employer,
    worker,
    task_digest: task.task_digest,
    result_digest: resultDigest,
    price_yoctonear: bidPrice,
    settlement_tx: sha256(`tx_settle_${jobId}`),
    block_height: 128455005,
    timestamp_ns: Date.now() * 1_000_000,
    outcome: 'CLEARED' as const,
  };
  const signedReceipt = signReceipt(unsignedReceipt, employerKp.keyObjectPrivate);

  const settleResult = jobBoard.accept_and_settle(
    employer,
    jobId,
    signedReceipt.sig,
    signedReceipt.settlement_tx,
    {
      receipt_id: unsignedReceipt.receipt_id,
      timestamp_ns: unsignedReceipt.timestamp_ns,
    }
  );
  assert.strictEqual(settleResult.receipt.outcome, 'CLEARED');
  assert.strictEqual(settleResult.payout_recipient, worker);

  // 7. Verify employer signature
  assert.strictEqual(verifyReceiptSignature(settleResult.receipt, employerKp.keyObjectPublic), true);

  // 8. Append to Evidence Ledger
  ledger.append_receipt(settleResult.receipt);

  // 9. Publish daily root
  const day = new Date().toISOString().slice(0, 10);
  const publishedRecord = ledger.publish_daily_root(day, 'ledger_relayer.clearing.testnet');
  assert.ok(publishedRecord.root.length === 64);
  assert.strictEqual(publishedRecord.leaf_count, 1);

  // 10. Inclusion proof query and verification
  const proof = ledger.get_proof(settleResult.receipt.receipt_id);
  assert.ok(proof !== null);
  const isValidOnChain = ledger.verify_inclusion_proof(proof, day);
  assert.strictEqual(isValidOnChain, true);
});

test('JobBoard: dispute path emits DISPUTED receipt and records failure', () => {
  const jobBoard = new JobBoardContract();
  const employer = 'employer2.clearing.testnet';
  const worker = 'worker_faulty.clearing.testnet';
  const jobId = 'job_fail_09';

  jobBoard.post_task(
    employer,
    {
      job_id: jobId,
      title: 'Analyze benchmark data',
      task_spec: 'Run 100 iterations of optimizer',
      max_budget_yoctonear: '50000000000000000000000',
    },
    '50000000000000000000000'
  );

  const salt = 'salt_9';
  const price = '40000000000000000000000';
  jobBoard.commit_bid(worker, jobId, sha256(`${worker}:${price}:${salt}`));
  jobBoard.reveal_bid(worker, jobId, price, salt);
  jobBoard.award_job(employer, jobId, worker);

  // Worker fails to deliver or delivers corrupted data
  const disputeReceipt = jobBoard.dispute_job(
    employer,
    jobId,
    'Worker delivered corrupted output failing SHA-256 integrity check',
    'DISPUTED'
  );

  assert.strictEqual(disputeReceipt.outcome, 'DISPUTED');
  assert.strictEqual(jobBoard.get_task(jobId)?.status, 'DISPUTED');
});
