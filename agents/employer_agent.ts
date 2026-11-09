import { AgentBase } from './agent_base.ts';
import type { SubtaskSpec, MissionSpec } from './types.ts';
import type { TaskListing } from '../contracts/job_board/Contract.ts';
import { signReceipt } from '../contracts/evidence_ledger/receipt.ts';
import { sha256 } from '../gateway/crypto_utils.ts';
import type { EvidenceReceipt } from '../contracts/evidence_ledger/receipt.ts';

export class EmployerAgent extends AgentBase {
  public activeMissions: Map<string, MissionSpec> = new Map();
  public managedTasks: Map<string, TaskListing> = new Map();

  public postSubtask(taskSpec: SubtaskSpec): TaskListing {
    const listing = this.gateway.postTask(this.accountId, {
      job_id: taskSpec.task_id,
      title: taskSpec.title,
      task_spec: JSON.stringify({
        prompt: taskSpec.prompt_or_code,
        type: taskSpec.expected_type,
        difficulty: taskSpec.difficulty_score,
      }),
      max_budget_yoctonear: taskSpec.max_budget_yoctonear,
    });
    this.managedTasks.set(taskSpec.task_id, listing);
    return listing;
  }

  public evaluateAndAward(jobId: string): string | null {
    const revealedMap = this.gateway.jobBoard.revealedBids.get(jobId);
    if (!revealedMap || revealedMap.size === 0) {
      return null;
    }

    // Lowest bid selection (sealed-bid first-price auction)
    let bestWorker: string | null = null;
    let lowestPrice = BigInt('999999999999999999999999999999');

    for (const [worker, bid] of revealedMap.entries()) {
      const price = BigInt(bid.price_yoctonear);
      if (price < lowestPrice) {
        lowestPrice = price;
        bestWorker = worker;
      }
    }

    if (bestWorker) {
      this.gateway.awardJob(this.accountId, jobId, bestWorker);
      return bestWorker;
    }
    return null;
  }

  public async inspectAndSettle(
    jobId: string,
    targetCurrency: string = 'NEAR'
  ): Promise<EvidenceReceipt | null> {
    const task = this.gateway.jobBoard.get_task(jobId);
    if (!task || task.status !== 'DELIVERED') {
      return null;
    }

    // Deliverable inspection / Quality gate
    const isCorruptOrEmpty =
      !task.result_digest ||
      task.result_digest === sha256('NO_DELIVERABLE_OR_FAILED') ||
      task.result_digest === 'CORRUPTED_PAYLOAD';

    if (isCorruptOrEmpty) {
      // Quality gate failed -> Dispute
      return this.gateway.disputeJob(
        this.accountId,
        jobId,
        'Quality gate failed: corrupted deliverable payload or hash mismatch',
        'DISPUTED'
      );
    }

    // Co-sign canonical receipt via Gateway Intent Settlement
    const { receipt } = await this.gateway.settleViaIntents(
      this.accountId,
      jobId,
      (unsigned) => {
        const signed = signReceipt(unsigned, this.subAccount.key_pair.keyObjectPrivate);
        return signed.sig;
      },
      targetCurrency
    );

    return receipt;
  }
}
