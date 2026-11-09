import { sha256 } from '../../gateway/crypto_utils.ts';
import type { EvidenceReceipt, ReceiptOutcome } from '../evidence_ledger/receipt.ts';

export type JobStatus =
  | 'OPEN'
  | 'BIDDING_CLOSED'
  | 'AWARDED'
  | 'DELIVERED'
  | 'CLEARED'
  | 'DISPUTED'
  | 'FAILED';

export interface TaskListing {
  job_id: string;
  employer: string;
  title: string;
  task_spec: string;
  task_digest: string;
  max_budget_yoctonear: string;
  escrow_yoctonear: string;
  created_at_ns: number;
  deadline_ns: number;
  status: JobStatus;
  selected_worker?: string;
  awarded_price_yoctonear?: string;
  result_digest?: string;
  deliverable_uri?: string;
  receipt_id?: string;
  settlement_tx?: string;
  dispute_reason?: string;
}

export interface CommittedBid {
  worker: string;
  bid_hash: string;
  committed_at_ns: number;
}

export interface RevealedBid {
  worker: string;
  price_yoctonear: string;
  salt: string;
  revealed_at_ns: number;
}

export interface SettlementResult {
  receipt: EvidenceReceipt;
  payout_recipient: string;
  payout_amount_yoctonear: string;
}

export class JobBoardContract {
  public contract_id: string;
  public tasks = new Map<string, TaskListing>();
  public committedBids = new Map<string, Map<string, CommittedBid>>(); // jobId -> (worker -> bid)
  public revealedBids = new Map<string, Map<string, RevealedBid>>(); // jobId -> (worker -> bid)
  public receipts: EvidenceReceipt[] = [];
  public current_block_height: number = 128455000;

  constructor(contract_id: string = 'job_board.clearing.testnet') {
    this.contract_id = contract_id;
  }

  public post_task(
    employer: string,
    params: {
      job_id: string;
      title: string;
      task_spec: string;
      max_budget_yoctonear: string;
      deadline_duration_ns?: number;
    },
    attached_deposit_yoctonear: string
  ): TaskListing {
    if (this.tasks.has(params.job_id)) {
      throw new Error(`Job ${params.job_id} already exists`);
    }

    const budget = BigInt(params.max_budget_yoctonear);
    const deposit = BigInt(attached_deposit_yoctonear);
    if (deposit < budget) {
      throw new Error(`Attached escrow deposit (${deposit}) must cover max budget (${budget})`);
    }

    const now_ns = Date.now() * 1_000_000;
    const deadline_ns = now_ns + (params.deadline_duration_ns || 3600 * 1_000_000_000);
    const task_digest = sha256(params.task_spec);

    const task: TaskListing = {
      job_id: params.job_id,
      employer,
      title: params.title,
      task_spec: params.task_spec,
      task_digest,
      max_budget_yoctonear: params.max_budget_yoctonear,
      escrow_yoctonear: attached_deposit_yoctonear,
      created_at_ns: now_ns,
      deadline_ns,
      status: 'OPEN',
    };

    this.tasks.set(params.job_id, task);
    this.committedBids.set(params.job_id, new Map());
    this.revealedBids.set(params.job_id, new Map());
    this.current_block_height += 1;

    return task;
  }

  /**
   * Sealed-bid auction: commit phase
   */
  public commit_bid(worker: string, job_id: string, bid_hash: string): void {
    const task = this.tasks.get(job_id);
    if (!task) throw new Error(`Job ${job_id} not found`);
    if (task.status !== 'OPEN') throw new Error(`Job ${job_id} is not open for bidding`);

    const jobBids = this.committedBids.get(job_id)!;
    jobBids.set(worker, {
      worker,
      bid_hash,
      committed_at_ns: Date.now() * 1_000_000,
    });
    this.current_block_height += 1;
  }

  /**
   * Sealed-bid auction: reveal phase
   */
  public reveal_bid(
    worker: string,
    job_id: string,
    price_yoctonear: string,
    salt: string
  ): RevealedBid {
    const task = this.tasks.get(job_id);
    if (!task) throw new Error(`Job ${job_id} not found`);

    const jobBids = this.committedBids.get(job_id);
    const committed = jobBids?.get(worker);
    if (!committed) {
      throw new Error(`Worker ${worker} has not committed a bid for job ${job_id}`);
    }

    // Verify hash commitment
    const expectedHash = sha256(`${worker}:${price_yoctonear}:${salt}`);
    if (committed.bid_hash !== expectedHash) {
      throw new Error(`Commitment mismatch for worker ${worker}`);
    }

    if (BigInt(price_yoctonear) > BigInt(task.max_budget_yoctonear)) {
      throw new Error(`Revealed bid exceeds max budget`);
    }

    const revealed: RevealedBid = {
      worker,
      price_yoctonear,
      salt,
      revealed_at_ns: Date.now() * 1_000_000,
    };

    this.revealedBids.get(job_id)!.set(worker, revealed);
    this.current_block_height += 1;
    return revealed;
  }

  /**
   * Employer awards job to worker (lowest bid or quality gate)
   */
  public award_job(employer: string, job_id: string, worker: string): TaskListing {
    const task = this.tasks.get(job_id);
    if (!task) throw new Error(`Job ${job_id} not found`);
    if (task.employer !== employer) throw new Error(`Only task employer can award the job`);
    if (task.status !== 'OPEN') throw new Error(`Job ${job_id} is not in OPEN state`);

    const revealed = this.revealedBids.get(job_id)?.get(worker);
    if (!revealed) {
      throw new Error(`Worker ${worker} has not revealed a valid bid`);
    }

    task.selected_worker = worker;
    task.awarded_price_yoctonear = revealed.price_yoctonear;
    task.status = 'AWARDED';
    this.current_block_height += 1;

    return task;
  }

  /**
   * Worker delivers completed work
   */
  public deliver_work(
    worker: string,
    job_id: string,
    result_digest: string,
    deliverable_uri: string = ''
  ): TaskListing {
    const task = this.tasks.get(job_id);
    if (!task) throw new Error(`Job ${job_id} not found`);
    if (task.selected_worker !== worker) {
      throw new Error(`Worker ${worker} is not the awarded worker for job ${job_id}`);
    }
    if (task.status !== 'AWARDED') {
      throw new Error(`Job ${job_id} is not in AWARDED status`);
    }

    task.result_digest = result_digest;
    task.deliverable_uri = deliverable_uri;
    task.status = 'DELIVERED';
    this.current_block_height += 1;

    return task;
  }

  /**
   * Employer accepts deliverable and clears settlement
   */
  public accept_and_settle(
    employer: string,
    job_id: string,
    signature: string,
    settlement_tx_hash?: string,
    meta?: { receipt_id?: string; timestamp_ns?: number }
  ): SettlementResult {
    const task = this.tasks.get(job_id);
    if (!task) throw new Error(`Job ${job_id} not found`);
    if (task.employer !== employer) throw new Error(`Only employer can accept and settle`);
    if (task.status !== 'DELIVERED') {
      throw new Error(`Job ${job_id} deliverable is not ready for settlement`);
    }

    const price = task.awarded_price_yoctonear!;
    const txHash = settlement_tx_hash || sha256(`tx_settle_${job_id}_${this.current_block_height}`);
    const receipt_id = meta?.receipt_id || `rcpt_${sha256(`${job_id}:${task.selected_worker}:${this.current_block_height}`).substring(0, 16)}`;
    const now_ns = meta?.timestamp_ns ?? Date.now() * 1_000_000;

    const receipt: EvidenceReceipt = {
      receipt_id,
      job_id,
      employer: task.employer,
      worker: task.selected_worker!,
      task_digest: task.task_digest,
      result_digest: task.result_digest!,
      price_yoctonear: price,
      settlement_tx: txHash,
      block_height: this.current_block_height,
      timestamp_ns: now_ns,
      outcome: 'CLEARED',
      sig: signature,
    };

    task.status = 'CLEARED';
    task.receipt_id = receipt_id;
    task.settlement_tx = txHash;
    this.receipts.push(receipt);
    this.current_block_height += 1;

    return {
      receipt,
      payout_recipient: task.selected_worker!,
      payout_amount_yoctonear: price,
    };
  }

  /**
   * Dispute or failure path: logs failure in evidence ledger
   */
  public dispute_job(
    claimant: string,
    job_id: string,
    reason: string,
    outcome: 'DISPUTED' | 'FAILED' = 'DISPUTED',
    signature: string = ''
  ): EvidenceReceipt {
    const task = this.tasks.get(job_id);
    if (!task) throw new Error(`Job ${job_id} not found`);
    if (task.employer !== claimant && task.selected_worker !== claimant) {
      throw new Error(`Only parties of the job can trigger dispute`);
    }

    const receipt_id = `rcpt_${sha256(`dispute_${job_id}_${this.current_block_height}`).substring(0, 16)}`;
    const now_ns = Date.now() * 1_000_000;
    const txHash = sha256(`tx_dispute_${job_id}_${this.current_block_height}`);

    const receipt: EvidenceReceipt = {
      receipt_id,
      job_id,
      employer: task.employer,
      worker: task.selected_worker || 'unassigned',
      task_digest: task.task_digest,
      result_digest: task.result_digest || sha256('NO_DELIVERABLE_OR_FAILED'),
      price_yoctonear: task.awarded_price_yoctonear || '0',
      settlement_tx: txHash,
      block_height: this.current_block_height,
      timestamp_ns: now_ns,
      outcome,
      sig: signature,
    };

    task.status = outcome;
    task.dispute_reason = reason;
    task.receipt_id = receipt_id;
    task.settlement_tx = txHash;
    this.receipts.push(receipt);
    this.current_block_height += 1;

    return receipt;
  }

  public get_task(job_id: string): TaskListing | null {
    return this.tasks.get(job_id) || null;
  }

  public get_all_tasks(): TaskListing[] {
    return Array.from(this.tasks.values());
  }

  public get_receipts(): EvidenceReceipt[] {
    return [...this.receipts];
  }
}
