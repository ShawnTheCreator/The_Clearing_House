import { NearGatewayClient } from '../gateway/near_client.ts';

export function provisionSubAccountFleet(parentAccount: string = 'clearing.testnet') {
  console.log(`\n======================================================`);
  console.log(`  PROVISIONING NEAR SUB-ACCOUNT FLEET: ${parentAccount}`);
  console.log(`======================================================\n`);

  const client = new NearGatewayClient('testnet');

  // Employers
  const emp1 = client.createSubAccount('employer1', 'employer', parentAccount);
  const emp2 = client.createSubAccount('employer2', 'employer', parentAccount);

  // Workers
  const workers = [1, 2, 3, 4, 5, 6].map((i) =>
    client.createSubAccount(`worker${i}`, 'worker', parentAccount)
  );

  // Relayer
  const relayer = client.createSubAccount('relayer', 'relayer', parentAccount);

  const fleet = [emp1, emp2, ...workers, relayer];

  console.log('| Sub-Account | Role | Public Key (Ed25519) | Scoped Contract & Allowance |');
  console.log('|---|---|---|---|');
  for (const acc of fleet) {
    const perm = acc.permissions[0];
    console.log(
      `| \`${acc.account_id}\` | ${acc.role.toUpperCase()} | \`${acc.public_key.slice(0, 24)}...\` | \`${perm.receiver_id}\` (0.25 NEAR gas) |`
    );
  }

  console.log(`\n✓ Successfully provisioned ${fleet.length} NEAR sub-accounts with scoped FunctionCall access keys.`);
  return fleet;
}

if (process.argv[1]?.endsWith('subaccount_factory.ts')) {
  provisionSubAccountFleet();
}
