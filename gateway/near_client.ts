import https from 'node:https';
import { generateEd25519KeyPair, type KeyPair, sha256 } from './crypto_utils.ts';

export interface FunctionCallPermission {
  receiver_id: string;
  method_names: string[];
  allowance_yoctonear?: string;
}

export interface SubAccountRecord {
  account_id: string;
  parent_id: string;
  public_key: string;
  key_pair: KeyPair;
  role: 'employer' | 'worker' | 'relayer';
  permissions: FunctionCallPermission[];
  balance_yoctonear: string;
  total_gas_burnt_tgas: number;
}

export class NearGatewayClient {
  public network_id: string;
  public node_url: string;
  public subAccounts = new Map<string, SubAccountRecord>();
  public total_yoctonear_settled: bigint = BigInt(0);
  public total_gas_burnt: number = 0;

  constructor(
    network_id: string = 'testnet',
    node_url: string = 'https://rpc.testnet.near.org'
  ) {
    this.network_id = network_id;
    this.node_url = node_url;
  }

  /**
   * Provision a NEAR sub-account with function-call access key scoped to job_board
   */
  public createSubAccount(
    name: string,
    role: 'employer' | 'worker' | 'relayer',
    parent_id: string = 'clearing.testnet',
    initial_balance: string = '5000000000000000000000000' // 5 NEAR
  ): SubAccountRecord {
    const account_id = `${name}.${parent_id}`;
    const key_pair = generateEd25519KeyPair();

    const permissions: FunctionCallPermission[] = [
      {
        receiver_id: `job_board.${parent_id}`,
        method_names: [
          'post_task',
          'commit_bid',
          'reveal_bid',
          'award_job',
          'deliver_work',
          'accept_and_settle',
          'dispute_job',
        ],
        allowance_yoctonear: '250000000000000000000000', // 0.25 NEAR gas allowance
      },
      {
        receiver_id: `evidence_ledger.${parent_id}`,
        method_names: ['append_receipt', 'publish_daily_root', 'verify_inclusion_proof'],
        allowance_yoctonear: '250000000000000000000000',
      },
    ];

    const record: SubAccountRecord = {
      account_id,
      parent_id,
      public_key: key_pair.publicKeyBase58,
      key_pair,
      role,
      permissions,
      balance_yoctonear: initial_balance,
      total_gas_burnt_tgas: 0,
    };

    this.subAccounts.set(account_id, record);
    return record;
  }

  public getSubAccount(account_id: string): SubAccountRecord | undefined {
    return this.subAccounts.get(account_id);
  }

  public recordGas(account_id: string, tgas: number): void {
    const acc = this.subAccounts.get(account_id);
    if (acc) {
      acc.total_gas_burnt_tgas += tgas;
    }
    this.total_gas_burnt += tgas;
  }

  public recordSettlement(yoctonear: string): void {
    this.total_yoctonear_settled += BigInt(yoctonear);
  }

  /**
   * RPC call to NEAR node (when online)
   */
  public async jsonRpc(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.node_url);
      const postData = JSON.stringify({
        jsonrpc: '2.0',
        id: 'the-clearing-house',
        method,
        params,
      });

      const req = https.request(
        {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: 5000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (e) {
              reject(e);
            }
          });
        }
      );

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('NEAR RPC request timeout'));
      });
      req.write(postData);
      req.end();
    });
  }
}
