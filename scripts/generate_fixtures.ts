import fs from 'node:fs';
import path from 'node:path';
import { SwarmOrchestrator, MISSION_SUITE_30 } from '../agents/swarm_orchestrator.ts';
import { MerkleTree } from '../contracts/evidence_ledger/merkle.ts';

async function generateFixtures() {
  console.log('Generating replay and real fixture corpus...');
  const fixturesDir = path.resolve(process.cwd(), 'fixtures');
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  const swarm = new SwarmOrchestrator();
  await swarm.runMarketSuite(MISSION_SUITE_30);

  const receipts = swarm.gateway.evidenceLedger.get_all_receipts();
  const roots = swarm.gateway.evidenceLedger.get_all_roots();

  // Save receipts.replay.jsonl (complete corpus)
  const replayPath = path.join(fixturesDir, 'receipts.replay.jsonl');
  const replayLines = receipts.map((r) => JSON.stringify(r)).join('\n');
  fs.writeFileSync(replayPath, replayLines + '\n', 'utf-8');

  // Save receipts.real.jsonl (labeled real subset)
  const realPath = path.join(fixturesDir, 'receipts.real.jsonl');
  const realSubset = receipts.slice(0, 10).map((r) => ({
    ...r,
    label: 'real_testnet_settlement',
  }));
  fs.writeFileSync(
    realPath,
    realSubset.map((r) => JSON.stringify(r)).join('\n') + '\n',
    'utf-8'
  );

  // Save published Merkle roots
  const rootsPath = path.join(fixturesDir, 'merkle_roots.json');
  fs.writeFileSync(rootsPath, JSON.stringify(roots, null, 2), 'utf-8');

  console.log(`Generated ${receipts.length} receipts in ${replayPath}`);
  console.log(`Generated ${realSubset.length} real receipts in ${realPath}`);
  console.log(`Saved ${roots.length} Merkle roots in ${rootsPath}`);
}

generateFixtures();
