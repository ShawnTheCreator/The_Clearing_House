import { GatewayDaemon } from '../gateway/daemon.ts';
import { EmployerAgent } from './employer_agent.ts';
import { WorkerAgent } from './worker_agent.ts';
import type { SubtaskSpec, SwarmStats } from './types.ts';

export const MISSION_SUITE_30: SubtaskSpec[] = [
  {
    task_id: 'task_001',
    title: 'Audit near-sdk-js cross-contract call state mutations',
    prompt_or_code: 'Analyze contract bytecode for dirty read vulnerabilities in async promise callbacks',
    expected_type: 'audit',
    max_budget_yoctonear: '120000000000000000000000', // 0.12 NEAR
    difficulty_score: 4,
  },
  {
    task_id: 'task_002',
    title: 'Generate binary Merkle tree RFC 6962 compliance test vectors',
    prompt_or_code: 'Compute 10 deterministic proof paths with odd and even leaf counts',
    expected_type: 'crypto_verify',
    max_budget_yoctonear: '90000000000000000000000',
    difficulty_score: 2,
  },
  {
    task_id: 'task_003',
    title: 'Benchmark NEP-413 intent settlement latency against direct transfer',
    prompt_or_code: 'Measure 50 cross-token intent settlement paths with mock solver solver.defuse.near',
    expected_type: 'data_analysis',
    max_budget_yoctonear: '150000000000000000000000',
    difficulty_score: 3,
  },
  {
    task_id: 'task_004',
    title: 'Validate function-call access key permission scopes',
    prompt_or_code: 'Ensure worker sub-account key cannot invoke transfer or delete_account methods',
    expected_type: 'audit',
    max_budget_yoctonear: '100000000000000000000000',
    difficulty_score: 3,
  },
  {
    task_id: 'task_005',
    title: 'Compile and format terminal noir ANSI dashboard theme palette',
    prompt_or_code: 'Generate high-contrast phosphor green #33ff33 colorway with CRT flicker shaders',
    expected_type: 'code_gen',
    max_budget_yoctonear: '80000000000000000000000',
    difficulty_score: 1,
  },
  {
    task_id: 'task_006',
    title: 'Run fuzzing suite on sealed-bid commit-reveal hash integrity',
    prompt_or_code: 'Verify salt entropy and preimage collision resistance across 10,000 iterations',
    expected_type: 'crypto_verify',
    max_budget_yoctonear: '110000000000000000000000',
    difficulty_score: 4,
  },
  {
    task_id: 'task_007',
    title: 'Profile gas consumption for daily Merkle root publish transactions',
    prompt_or_code: 'Calculate storage staking costs for 1,000 receipts appended into evidence ledger',
    expected_type: 'data_analysis',
    max_budget_yoctonear: '95000000000000000000000',
    difficulty_score: 2,
  },
  {
    task_id: 'task_008',
    title: 'Derive ed25519 chain signature verification fixture',
    prompt_or_code: 'Generate canonical JSON bytes and verify signature using zero external dependencies',
    expected_type: 'crypto_verify',
    max_budget_yoctonear: '100000000000000000000000',
    difficulty_score: 2,
  },
  {
    task_id: 'task_009',
    title: 'Dispute handling: test corrupt payload rejection logic',
    prompt_or_code: 'Inject corrupted result digest and verify DISPUTED receipt generation',
    expected_type: 'audit',
    max_budget_yoctonear: '130000000000000000000000',
    difficulty_score: 3,
  },
  {
    task_id: 'task_010',
    title: 'Synthesize ablation metrics generator for 30-task benchmark',
    prompt_or_code: 'Implement cost/time comparison between Arm A (market) and Arm B (lone agent)',
    expected_type: 'code_gen',
    max_budget_yoctonear: '140000000000000000000000',
    difficulty_score: 3,
  },
  // Adding tasks 11..30 to complete the 30-task suite
  ...Array.from({ length: 20 }, (_, idx) => {
    const num = idx + 11;
    const taskNumStr = num < 10 ? `00${num}` : `0${num}`;
    const types: SubtaskSpec['expected_type'][] = ['audit', 'crypto_verify', 'data_analysis', 'code_gen'];
    const assignedType = types[num % types.length];
    return {
      task_id: `task_${taskNumStr}`,
      title: `Subtask ${num}: Distributed agent task verification ${assignedType}`,
      prompt_or_code: `Execute verified task payload for swarm workload partition ${num}`,
      expected_type: assignedType,
      max_budget_yoctonear: `${80 + (num % 7) * 10}000000000000000000000`,
      difficulty_score: (num % 5) + 1,
    };
  }),
];

export class SwarmOrchestrator {
  public gateway: GatewayDaemon;
  public employers: EmployerAgent[] = [];
  public workers: WorkerAgent[] = [];
  public relayerAccountId: string = 'relayer.clearing.testnet';

  constructor(gateway?: GatewayDaemon) {
    this.gateway = gateway || new GatewayDaemon();
    this.initializeSwarm();
  }

  private initializeSwarm(): void {
    // 1. Create Employer Sub-Accounts
    const emp1 = this.gateway.nearClient.createSubAccount('employer1', 'employer');
    const emp2 = this.gateway.nearClient.createSubAccount('employer2', 'employer');
    this.employers.push(
      new EmployerAgent(emp1, this.gateway, { failure_rate: 0 }),
      new EmployerAgent(emp2, this.gateway, { failure_rate: 0 })
    );

    // 2. Create Worker Sub-Accounts (workers 1 through 6)
    // Giving worker 4 a slightly higher deliberate imperfection rate to exercise dispute mechanics
    for (let i = 1; i <= 6; i++) {
      const isFaulty = i === 4;
      const wSub = this.gateway.nearClient.createSubAccount(`worker${i}`, 'worker');
      this.workers.push(
        new WorkerAgent(wSub, this.gateway, {
          failure_rate: isFaulty ? 0.35 : 0.04, // worker4 fails ~35% of the time
        })
      );
    }

    // 3. Relayer sub-account for publishing daily roots
    this.gateway.nearClient.createSubAccount('relayer', 'relayer');
  }

  /**
   * Run the full 30-task suite through the market (Arm A)
   */
  public async runMarketSuite(
    tasks: SubtaskSpec[] = MISSION_SUITE_30
  ): Promise<{
    stats: SwarmStats;
    results: Array<{ task_id: string; status: string; price?: string; outcome?: string }>;
  }> {
    const results: Array<{ task_id: string; status: string; price?: string; outcome?: string }> = [];

    for (let i = 0; i < tasks.length; i++) {
      const taskSpec = tasks[i];
      const employer = this.employers[i % this.employers.length];

      // 1. Employer posts task
      const task = employer.postSubtask(taskSpec);

      // 2. All workers inspect and submit sealed bids
      for (const worker of this.workers) {
        worker.evaluateTaskAndBid(task);
      }

      // 3. Workers reveal their bids
      for (const worker of this.workers) {
        worker.revealStoredBid(task.job_id);
      }

      // 4. Employer evaluates bids and awards the job
      const awardedWorkerId = employer.evaluateAndAward(task.job_id);
      if (!awardedWorkerId) {
        results.push({ task_id: task.job_id, status: 'NO_BIDS' });
        continue;
      }

      const awardedWorker = this.workers.find((w) => w.accountId === awardedWorkerId)!;

      // 5. Worker executes task and delivers
      await awardedWorker.executeTask(task.job_id);

      // 6. Employer inspects deliverable and settles via NEAR Intents (or disputes)
      const receipt = await employer.inspectAndSettle(task.job_id, i % 3 === 0 ? 'USDC' : 'NEAR');

      results.push({
        task_id: task.job_id,
        status: receipt ? receipt.outcome : 'FAILED',
        price: task.awarded_price_yoctonear,
        outcome: receipt?.outcome,
      });
    }

    // 7. Publish daily Merkle root on-chain
    const day = new Date().toISOString().slice(0, 10);
    this.gateway.publishDailyRoot(day, this.relayerAccountId);

    const stats = this.getStats();
    return { stats, results };
  }

  public getStats(): SwarmStats {
    const allTasks = this.gateway.jobBoard.get_all_tasks();
    const allReceipts = this.gateway.evidenceLedger.get_all_receipts();
    const cleared = allReceipts.filter((r) => r.outcome === 'CLEARED').length;
    const disputed = allReceipts.filter((r) => r.outcome === 'DISPUTED' || r.outcome === 'FAILED').length;
    const roots = this.gateway.evidenceLedger.get_all_roots().length;

    return {
      total_jobs_posted: allTasks.length,
      total_bids_submitted: allTasks.length * this.workers.length,
      total_jobs_cleared: cleared,
      total_jobs_disputed: disputed,
      total_near_settled: (this.gateway.nearClient.total_yoctonear_settled / BigInt(10 ** 24)).toString(),
      total_gas_burnt_tgas: this.gateway.nearClient.total_gas_burnt,
      active_agents_count: this.employers.length + this.workers.length,
      published_merkle_roots: roots,
    };
  }
}

// Standalone execution if invoked directly
if (process.argv[1]?.endsWith('swarm_orchestrator.ts')) {
  console.log('--- STARTING THE CLEARING HOUSE SWARM RUN ---');
  const swarm = new SwarmOrchestrator();
  swarm.runMarketSuite().then(({ stats }) => {
    console.log('Swarm Run Complete!');
    console.log('Stats:', stats);
  });
}
