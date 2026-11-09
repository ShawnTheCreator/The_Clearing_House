import type { SubAccountRecord } from '../gateway/near_client.ts';
import type { GatewayDaemon } from '../gateway/daemon.ts';
import { sha256 } from '../gateway/crypto_utils.ts';

export interface AgentPolicy {
  min_margin_ratio: number; // e.g. 0.15 = 15% margin
  risk_tolerance: number; // 0.0 to 1.0
  failure_rate: number; // 0.0 to 1.0 (deliberate imperfection for realism)
}

export abstract class AgentBase {
  public subAccount: SubAccountRecord;
  public gateway: GatewayDaemon;
  public policy: AgentPolicy;

  constructor(
    subAccount: SubAccountRecord,
    gateway: GatewayDaemon,
    policy: Partial<AgentPolicy> = {}
  ) {
    this.subAccount = subAccount;
    this.gateway = gateway;
    this.policy = {
      min_margin_ratio: policy.min_margin_ratio ?? 0.15,
      risk_tolerance: policy.risk_tolerance ?? 0.5,
      failure_rate: policy.failure_rate ?? 0.05, // 5% realistic failure rate
    };
  }

  public get accountId(): string {
    return this.subAccount.account_id;
  }

  protected createHash(data: string): string {
    return sha256(data);
  }
}
