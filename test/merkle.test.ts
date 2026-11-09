import test from 'node:test';
import assert from 'node:assert';
import { MerkleTree } from '../contracts/evidence_ledger/merkle.ts';
import type { EvidenceReceipt } from '../contracts/evidence_ledger/receipt.ts';

function createMockReceipt(id: string): EvidenceReceipt {
  return {
    receipt_id: `rcpt_${id}`,
    job_id: `job_${id}`,
    employer: 'employer1.clearing.testnet',
    worker: 'worker2.clearing.testnet',
    task_digest: 'a'.repeat(64),
    result_digest: 'b'.repeat(64),
    price_yoctonear: '10000000000000000000000',
    settlement_tx: 'tx_mock_123',
    block_height: 120000 + parseInt(id, 10),
    timestamp_ns: 1762656000000000000,
    outcome: 'CLEARED',
    sig: 'sig_mock_456',
  };
}

test('MerkleTree: creates deterministic root for receipts', () => {
  const receipts = [createMockReceipt('1'), createMockReceipt('2'), createMockReceipt('3')];
  const tree1 = new MerkleTree(receipts);
  const tree2 = new MerkleTree(receipts);

  assert.strictEqual(tree1.getRoot(), tree2.getRoot());
  assert.strictEqual(tree1.getLeafCount(), 3);
});

test('MerkleTree: generates valid inclusion proof that verifies', () => {
  const receipts = Array.from({ length: 7 }, (_, i) => createMockReceipt(String(i + 1)));
  const tree = new MerkleTree(receipts);

  for (const r of receipts) {
    const proof = tree.getProof(r.receipt_id);
    assert.ok(proof !== null, `Proof should exist for ${r.receipt_id}`);
    assert.strictEqual(proof.root, tree.getRoot());
    const valid = MerkleTree.verifyProof(proof);
    assert.strictEqual(valid, true, `Proof should verify for ${r.receipt_id}`);
  }
});

test('MerkleTree: fails verification if leaf hash or root is tampered', () => {
  const receipts = [createMockReceipt('1'), createMockReceipt('2')];
  const tree = new MerkleTree(receipts);
  const proof = tree.getProof('rcpt_1')!;

  // Tamper leaf hash
  const tamperedLeafProof = { ...proof, leaf_hash: '0'.repeat(64) };
  assert.strictEqual(MerkleTree.verifyProof(tamperedLeafProof), false);

  // Tamper root
  const tamperedRootProof = { ...proof, root: 'f'.repeat(64) };
  assert.strictEqual(MerkleTree.verifyProof(tamperedRootProof), false);
});
