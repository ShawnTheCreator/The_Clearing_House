import path from 'node:path';
import { sha256 } from './crypto_utils.ts';
import { JobBoardContract, type TaskListing } from '../contracts/job_board/Contract.ts';
import { EvidenceLedgerContract, type PublishedRootRecord } from '../contracts/evidence_ledger/LedgerContract.ts';
import { EventRecorder, type HashChainedEvent } from './recorder.ts';
import { NearIntentsClient, type IntentExecutionResult } from './intents_client.ts';
import { NearGatewayClient, type SubAccountRecord } from './near_client.ts';
import type { EvidenceReceipt } from '../contracts/evidence_ledger/receipt.ts';
import type { MerkleInclusionProof } from '../contracts/evidence_ledger/merkle.ts';

export type EventListener = (event: HashChainedEvent) => void;

export class GatewayDaemon {
  public jobBoard: JobBoardContract;
  public evidenceLedger: EvidenceLedgerContract;
  public eventRecorder: EventRecorder;
  public intentsClient: NearIntentsClient;
  public nearClient: NearGatewayClient;
  private listeners: Set<EventListener> = new Set();

  constructor(options: {
    logPath?: string;
    networkId?: string;
  } = {}) {
    const defaultLog = path.resolve(process.cwd(), 'fixtures', 'events.jsonl');
    this.eventRecorder = new EventRecorder(options.logPath || defaultLog);
    this.jobBoard = new JobBoardContract();
    this.evidenceLedger = new EvidenceLedgerContract();
    this.intentsClient = new NearIntentsClient();
    this.nearClient = new NearGatewayClient(options.networkId || 'testnet');
  }

  public subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitAndRecord(eventType: string, payload: unknown): HashChainedEvent {
    const event = this.eventRecorder.recordEvent(eventType, payload);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in event listener:', err);
      }
    }
    return event;
  }

  public postTask(
    employerAccountId: string,
    params: {
      job_id: string;
      title: string;
      task_spec: string;
      max_budget_yoctonear: string;
    }
  ): TaskListing {
    const task = this.jobBoard.post_task(
      employerAccountId,
      params,
      params.max_budget_yoctonear
    );
    this.nearClient.recordGas(employerAccountId, 3.2); // Meter gas
    this.emitAndRecord('TASK_POSTED', {
      job_id: task.job_id,
      employer: employerAccountId,
      title: task.title,
      budget: task.max_budget_yoctonear,
      task_digest: task.task_digest,
    });
    return task;
  }

  public commitBid(workerAccountId: string, jobId: string, bidHash: string): void {
    this.jobBoard.commit_bid(workerAccountId, jobId, bidHash);
    this.nearClient.recordGas(workerAccountId, 2.1);
    this.emitAndRecord('BID_COMMITTED', {
      job_id: jobId,
      worker: workerAccountId,
      bid_hash: bidHash,
    });
  }

  public revealBid(
    workerAccountId: string,
    jobId: string,
    price_yoctonear: string,
    salt: string
  ): void {
    const revealed = this.jobBoard.reveal_bid(workerAccountId, jobId, price_yoctonear, salt);
    this.nearClient.recordGas(workerAccountId, 2.4);
    this.emitAndRecord('BID_REVEALED', {
      job_id: jobId,
      worker: workerAccountId,
      price: price_yoctonear,
    });
  }

  public awardJob(employerAccountId: string, jobId: string, workerAccountId: string): TaskListing {
    const task = this.jobBoard.award_job(employerAccountId, jobId, workerAccountId);
    this.nearClient.recordGas(employerAccountId, 2.8);
    this.emitAndRecord('JOB_AWARDED', {
      job_id: jobId,
      employer: employerAccountId,
      worker: workerAccountId,
      price: task.awarded_price_yoctonear,
    });
    return task;
  }

  public deliverWork(
    workerAccountId: string,
    jobId: string,
    resultDigest: string,
    deliverableUri: string = ''
  ): TaskListing {
    const task = this.jobBoard.deliver_work(workerAccountId, jobId, resultDigest, deliverableUri);
    this.nearClient.recordGas(workerAccountId, 2.5);
    this.emitAndRecord('WORK_DELIVERED', {
      job_id: jobId,
      worker: workerAccountId,
      result_digest: resultDigest,
      uri: deliverableUri,
    });
    return task;
  }

  public async settleViaIntents(
    employerAccountId: string,
    jobId: string,
    signFnOrSig: ((unsigned: any) => string) | string,
    targetCurrency: string = 'NEAR',
    meta?: { receipt_id?: string; timestamp_ns?: number }
  ): Promise<{ receipt: EvidenceReceipt; intentResult: IntentExecutionResult }> {
    const task = this.jobBoard.get_task(jobId);
    if (!task) throw new Error(`Job ${jobId} not found`);

    // 1. Create settlement intent
    const intent = this.intentsClient.createSettlementIntent({
      initiator: employerAccountId,
      recipient: task.selected_worker!,
      amount_yoctonear: task.awarded_price_yoctonear!,
      target_currency: targetCurrency,
    });

    // 2. Execute via solver
    const intentResult = await this.intentsClient.executeSettlementIntent(
      intent,
      this.jobBoard.current_block_height
    );

    const receipt_id = meta?.receipt_id || `rcpt_${sha256(`${jobId}:${task.selected_worker}:${this.jobBoard.current_block_height}`).substring(0, 16)}`;
    const timestamp_ns = meta?.timestamp_ns ?? Date.now() * 1_000_000;

    let signature: string;
    if (typeof signFnOrSig === 'function') {
      const unsigned = {
        receipt_id,
        job_id: jobId,
        employer: employerAccountId,
        worker: task.selected_worker!,
        task_digest: task.task_digest,
        result_digest: task.result_digest!,
        price_yoctonear: task.awarded_price_yoctonear!,
        settlement_tx: intentResult.tx_hash,
        block_height: this.jobBoard.current_block_height,
        timestamp_ns,
        outcome: 'CLEARED' as const,
      };
      signature = signFnOrSig(unsigned);
    } else {
      signature = signFnOrSig;
    }

    // 3. Settle on JobBoard contract
    const settlement = this.jobBoard.accept_and_settle(
      employerAccountId,
      jobId,
      signature,
      intentResult.tx_hash,
      { receipt_id, timestamp_ns }
    );

    // 4. Record on Evidence Ledger
    this.evidenceLedger.append_receipt(settlement.receipt);

    // 5. Track metering
    this.nearClient.recordGas(employerAccountId, 5.8);
    this.nearClient.recordSettlement(settlement.payout_amount_yoctonear);

    // 6. Record events
    this.emitAndRecord('SETTLED_INTENT', {
      intent_id: intent.intent_id,
      job_id: jobId,
      tx_hash: intentResult.tx_hash,
      payout: settlement.payout_amount_yoctonear,
      rate: intentResult.effective_rate,
    });

    this.emitAndRecord('RECEIPT_EMITTED', settlement.receipt);

    return {
      receipt: settlement.receipt,
      intentResult,
    };
  }

  public disputeJob(
    claimantAccountId: string,
    jobId: string,
    reason: string,
    outcome: 'DISPUTED' | 'FAILED' = 'DISPUTED',
    signature: string = ''
  ): EvidenceReceipt {
    const receipt = this.jobBoard.dispute_job(
      claimantAccountId,
      jobId,
      reason,
      outcome,
      signature
    );

    this.evidenceLedger.append_receipt(receipt);
    this.nearClient.recordGas(claimantAccountId, 3.5);

    this.emitAndRecord('DISPUTE_FILED', {
      job_id: jobId,
      claimant: claimantAccountId,
      reason,
      outcome,
      receipt_id: receipt.receipt_id,
    });

    return receipt;
  }

  public publishDailyRoot(dayUtc: string, relayerAccountId: string): PublishedRootRecord {
    const record = this.evidenceLedger.publish_daily_root(dayUtc, relayerAccountId);
    this.nearClient.recordGas(relayerAccountId, 8.2);

    this.emitAndRecord('MERKLE_ROOT_PUBLISHED', record);
    return record;
  }

  public getInclusionProof(receiptId: string): MerkleInclusionProof | null {
    return this.evidenceLedger.get_proof(receiptId);
  }
}
