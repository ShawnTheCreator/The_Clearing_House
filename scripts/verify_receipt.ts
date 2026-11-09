import fs from 'node:fs';
import path from 'node:path';
import type { EvidenceReceipt } from '../contracts/evidence_ledger/receipt.ts';
import { hashReceipt } from '../contracts/evidence_ledger/receipt.ts';
import { MerkleTree } from '../contracts/evidence_ledger/merkle.ts';
import type { PublishedRootRecord } from '../contracts/evidence_ledger/LedgerContract.ts';

function printHeader(title: string) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

export function verifyReceiptById(targetReceiptId?: string): boolean {
  printHeader('THE CLEARING HOUSE · EVIDENCE RECEIPT VERIFIER');

  const fixturesDir = path.resolve(process.cwd(), 'fixtures');
  const replayPath = path.join(fixturesDir, 'receipts.replay.jsonl');
  const rootsPath = path.join(fixturesDir, 'merkle_roots.json');

  if (!fs.existsSync(replayPath) || !fs.existsSync(rootsPath)) {
    console.error('Error: Fixtures not found. Run scripts/generate_fixtures.ts first.');
    return false;
  }

  const receiptsContent = fs.readFileSync(replayPath, 'utf-8');
  const receipts: EvidenceReceipt[] = receiptsContent
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const roots: PublishedRootRecord[] = JSON.parse(fs.readFileSync(rootsPath, 'utf-8'));

  if (receipts.length === 0) {
    console.error('Error: No receipts found in fixtures.');
    return false;
  }

  // If no target specified, select the first receipt
  const receiptToVerify = targetReceiptId
    ? receipts.find((r) => r.receipt_id === targetReceiptId)
    : receipts[0];

  if (!receiptToVerify) {
    console.error(`Error: Receipt ${targetReceiptId} not found in evidence corpus.`);
    return false;
  }

  console.log(`Target Receipt: ${receiptToVerify.receipt_id}`);
  console.log(`Job ID:         ${receiptToVerify.job_id}`);
  console.log(`Employer:       ${receiptToVerify.employer}`);
  console.log(`Worker:         ${receiptToVerify.worker}`);
  console.log(`Outcome:        ${receiptToVerify.outcome}`);
  console.log(`Settlement TX:  ${receiptToVerify.settlement_tx}`);
  console.log(`Block Height:   ${receiptToVerify.block_height}`);
  console.log(`Signature:      ${receiptToVerify.sig.slice(0, 32)}...`);

  // Build Merkle Tree from the day's receipts
  const tree = new MerkleTree(receipts);
  const calculatedRoot = tree.getRoot();

  console.log('\n--- WALKING MERKLE INCLUSION PROOF ---');
  const rawHash = hashReceipt(receiptToVerify);
  const leafHash = MerkleTree.hashLeaf(rawHash);
  console.log(`1. Canonical Receipt Digest : ${rawHash}`);
  console.log(`2. RFC 6962 Leaf Hash (0x00): ${leafHash}`);

  const proof = tree.getProof(receiptToVerify.receipt_id);
  if (!proof) {
    console.error('Failed to generate Merkle proof for receipt.');
    return false;
  }

  console.log(`3. Proof Path Depth: ${proof.path.length} steps across ${proof.total_leaves} leaves`);

  let currentHash = proof.leaf_hash;
  for (let i = 0; i < proof.path.length; i++) {
    const step = proof.path[i];
    const prev = currentHash;
    if (step.position === 'left') {
      currentHash = MerkleTree.hashNode(step.hash, currentHash);
      console.log(`   Step ${i + 1} [L]: H(0x01 || ${step.hash.slice(0, 8)}... || ${prev.slice(0, 8)}...) -> ${currentHash.slice(0, 16)}...`);
    } else {
      currentHash = MerkleTree.hashNode(currentHash, step.hash);
      console.log(`   Step ${i + 1} [R]: H(0x01 || ${prev.slice(0, 8)}... || ${step.hash.slice(0, 8)}...) -> ${currentHash.slice(0, 16)}...`);
    }
  }

  console.log(`\n4. Reconstructed Root: ${currentHash}`);
  console.log(`5. Published Chain Root: ${roots[0]?.root || calculatedRoot}`);

  const isValid = MerkleTree.verifyProof(proof);
  const matchesPublished = roots.length > 0 ? currentHash === roots[0].root : true;

  if (isValid && matchesPublished) {
    console.log('\n' + '✓'.repeat(3) + ' VERIFICATION SUCCESSFUL: RECEIPT IS CRYPTOGRAPHICALLY INCLUDED ON-CHAIN ' + '✓'.repeat(3) + '\n');
    return true;
  } else {
    console.error('\n' + '✗'.repeat(3) + ' VERIFICATION FAILED: PROOF INVALID OR ROOT MISMATCH ' + '✗'.repeat(3) + '\n');
    return false;
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
let receiptIdArg: string | undefined;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--receipt' && args[i + 1]) {
    receiptIdArg = args[i + 1];
    break;
  }
}

const success = verifyReceiptById(receiptIdArg);
if (!success) {
  process.exit(1);
}
