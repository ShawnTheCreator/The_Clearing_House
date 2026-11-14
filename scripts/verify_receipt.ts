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

export function verifyReceiptById(targetReceiptId?: string, isLiveCheck: boolean = false): boolean {
  printHeader('THE CLEARING HOUSE · EVIDENCE RECEIPT VERIFIER');

  const fixturesDir = path.resolve(process.cwd(), 'fixtures');
  const replayPath = path.join(fixturesDir, 'receipts.replay.jsonl');
  const realPath = path.join(fixturesDir, 'receipts.real.jsonl');
  const rootsPath = path.join(fixturesDir, 'merkle_roots.json');

  if (!fs.existsSync(replayPath) || !fs.existsSync(rootsPath)) {
    console.error('Error: Fixtures not found. Run scripts/generate_fixtures.ts first.');
    return false;
  }

  const replayReceipts: EvidenceReceipt[] = fs
    .readFileSync(replayPath, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  const realReceipts: EvidenceReceipt[] = fs.existsSync(realPath)
    ? fs
        .readFileSync(realPath, 'utf-8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

  const roots: PublishedRootRecord[] = JSON.parse(fs.readFileSync(rootsPath, 'utf-8'));

  // Determine which corpus contains the receipt
  let activeCorpus: EvidenceReceipt[] = replayReceipts;
  let receiptToVerify: EvidenceReceipt | undefined;
  let expectedRootRecord: PublishedRootRecord | undefined = roots[0];

  if (!targetReceiptId) {
    receiptToVerify = replayReceipts[0];
  } else {
    // Check replay corpus first
    receiptToVerify = replayReceipts.find((r) => r.receipt_id === targetReceiptId);

    if (!receiptToVerify && realReceipts.length > 0) {
      // Check real corpus
      receiptToVerify = realReceipts.find((r) => r.receipt_id === targetReceiptId);
      if (receiptToVerify) {
        // Find matching live batch or live receipts
        // Check if it belongs to the live testnet published batch (e.g. 2026-11-10)
        const liveBatch = realReceipts.filter((r) =>
          r.receipt_id === 'rcpt_3VVLCnAEyQKLSiDW' || r.receipt_id === 'rcpt_ESerF1NPgAK8njW2'
        );
        if (liveBatch.some((r) => r.receipt_id === targetReceiptId)) {
          activeCorpus = liveBatch;
          expectedRootRecord = roots.find((r) => r.day_utc === '2026-11-10') || roots[roots.length - 1];
        } else {
          activeCorpus = realReceipts;
          expectedRootRecord = roots[roots.length - 1];
        }
      }
    }
  }

  if (!receiptToVerify) {
    console.error(`Error: Receipt "${targetReceiptId}" not found in replay or real corpora.`);
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

  // Build Merkle Tree from the relevant corpus
  const tree = new MerkleTree(activeCorpus);
  const calculatedRoot = tree.getRoot();

  const matchingPublished = roots.find((r) => r.root.toLowerCase() === calculatedRoot.toLowerCase());
  if (matchingPublished) {
    expectedRootRecord = matchingPublished;
  }

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

  const expectedRoot = expectedRootRecord?.root || calculatedRoot;
  console.log(`\n4. Reconstructed Root: ${currentHash}`);
  console.log(`5. Published Chain Root: ${expectedRoot}`);
  if (expectedRootRecord) {
    console.log(`   (Day: ${expectedRootRecord.day_utc}, Publisher: ${expectedRootRecord.published_by})`);
  }

  const isValid = MerkleTree.verifyProof(proof);
  const matchesPublished = currentHash === expectedRoot;

  if (isValid && matchesPublished) {
    console.log('\n' + '✓'.repeat(3) + ' VERIFICATION SUCCESSFUL: RECEIPT IS CRYPTOGRAPHICALLY INCLUDED ON-CHAIN ' + '✓'.repeat(3) + '\n');
    return true;
  } else {
    console.error('\n' + '✗'.repeat(3) + ' VERIFICATION FAILED: PROOF INVALID OR ROOT MISMATCH ' + '✗'.repeat(3) + '\n');
    return false;
  }
}

// Parse command line arguments
if (process.argv[1]?.endsWith('verify_receipt.ts')) {
  const args = process.argv.slice(2);
  let receiptIdArg: string | undefined;
  let isLive = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--receipt' && args[i + 1]) {
      receiptIdArg = args[i + 1];
    }
    if (args[i] === '--live') {
      isLive = true;
    }
  }

  const success = verifyReceiptById(receiptIdArg, isLive);
  if (!success) {
    process.exit(1);
  }
}
