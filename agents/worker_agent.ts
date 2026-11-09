import { AgentBase } from './agent_base.ts';
import type { WorkerDeliverable } from './types.ts';
import { sha256 } from '../gateway/crypto_utils.ts';
import type { TaskListing } from '../contracts/job_board/Contract.ts';

export class WorkerAgent extends AgentBase {
  private activeBids = new Map<string, { price: string; salt: string }>();

  public evaluateTaskAndBid(task: TaskListing): { committed: boolean; price?: string } {
    if (task.status !== 'OPEN') return { committed: false };

    // Pricing policy: bid between 70% and 92% of max budget
    const maxBudget = BigInt(task.max_budget_yoctonear);
    const discountMultiplier = BigInt(70 + Math.floor(Math.random() * 22)); // 70..91%
    const bidPrice = (maxBudget * discountMultiplier) / BigInt(100);

    const salt = `salt_${this.accountId}_${Date.now()}_${Math.random()}`;
    const bidHash = sha256(`${this.accountId}:${bidPrice.toString()}:${salt}`);

    this.activeBids.set(task.job_id, {
      price: bidPrice.toString(),
      salt,
    });

    this.gateway.commitBid(this.accountId, task.job_id, bidHash);
    return { committed: true, price: bidPrice.toString() };
  }

  public revealStoredBid(jobId: string): boolean {
    const bid = this.activeBids.get(jobId);
    if (!bid) return false;

    this.gateway.revealBid(this.accountId, jobId, bid.price, bid.salt);
    return true;
  }

  public async executeTask(jobId: string): Promise<WorkerDeliverable> {
    const task = this.gateway.jobBoard.get_task(jobId);
    if (!task) throw new Error(`Task ${jobId} not found`);

    const startTime = Date.now();

    // Check deliberate imperfection rate
    const isSimulatedFailure = Math.random() < this.policy.failure_rate;

    let outputData: string;
    let resultDigest: string;

    if (isSimulatedFailure) {
      // Worker failed or returned corrupted data
      outputData = 'ERR_TIMEOUT_OR_MALFORMED_DELIVERABLE';
      resultDigest = 'CORRUPTED_PAYLOAD';
    } else {
      // Normal successful execution: compute result and digest
      outputData = JSON.stringify({
        status: 'SUCCESS',
        worker: this.accountId,
        job_id: jobId,
        timestamp: Date.now(),
        verified_assertions: [
          'contract_reentrancy_safe',
          'access_key_permissions_checked',
          'merkle_root_computed',
        ],
      });
      resultDigest = sha256(outputData);
    }

    const executionTimeMs = Date.now() - startTime;
    const deliverable: WorkerDeliverable = {
      job_id: jobId,
      worker_id: this.accountId,
      output_data: outputData,
      result_digest: resultDigest,
      execution_time_ms: executionTimeMs,
      simulated_failure: isSimulatedFailure,
    };

    this.gateway.deliverWork(
      this.accountId,
      jobId,
      resultDigest,
      `data://clearing-worker/${jobId}.json`
    );

    return deliverable;
  }
}
