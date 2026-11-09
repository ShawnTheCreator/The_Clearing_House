import test from 'node:test';
import assert from 'node:assert';
import { reproduceAll } from '../scripts/reproduce.ts';
import { verifyReceiptById } from '../scripts/verify_receipt.ts';

test('Zero-Key Reproduce Kit: verifies fixture corpus, Merkle proofs and claim table', () => {
  const result = reproduceAll();
  assert.strictEqual(result, true, 'Reproduce suite must exit green');
});

test('Receipt Verifier: walks proof and validates against published root', () => {
  const result = verifyReceiptById();
  assert.strictEqual(result, true, 'Single receipt verification must succeed');
});
