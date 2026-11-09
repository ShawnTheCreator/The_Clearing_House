export interface MissionSpec {
  mission_id: string;
  title: string;
  description: string;
  subtasks: SubtaskSpec[];
}

export interface SubtaskSpec {
  task_id: string;
  title: string;
  prompt_or_code: string;
  expected_type: 'code_gen' | 'audit' | 'data_analysis' | 'crypto_verify' | 'translation';
  max_budget_yoctonear: string;
  difficulty_score: number; // 1 to 5
}

export interface WorkerDeliverable {
  job_id: string;
  worker_id: string;
  output_data: string;
  result_digest: string;
  execution_time_ms: number;
  simulated_failure?: boolean;
}

export interface SwarmStats {
  total_jobs_posted: number;
  total_bids_submitted: number;
  total_jobs_cleared: number;
  total_jobs_disputed: number;
  total_near_settled: string;
  total_gas_burnt_tgas: number;
  active_agents_count: number;
  published_merkle_roots: number;
}
