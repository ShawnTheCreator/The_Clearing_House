import test from 'node:test';
import assert from 'node:assert';
import { generateEd25519KeyPair } from '../gateway/crypto_utils.ts';
import type { UnsignedReceipt } from '../contracts/evidence_ledger/receipt.ts';
import {
  signReceipt,
  verifyReceiptSignature,
  hashReceipt,
} from '../contracts/evidence_ledger/receipt.ts';

test('EvidenceReceipt: canonical signing and verification', () => {
  const kp = generateEd25519KeyPair();

  const unsigned: UnsignedReceipt = {
    receipt_id: 'rcpt_test_001',
    job_id: 'job_0042',
    employer: 'employer.clearing.testnet',
    worker: 'worker7.clearing.testnet',
    task_digest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    result_digest: 'ca978112ca1bbdcafac231b39a23dc4da78608149652b41b44d32092a4f48ff1',
    price_yoctonear: '50000000000000000000000',
    settlement_tx: '5K2bW7e9B1qF8h3...',
    block_height: 128455112,
    timestamp_ns: 1762656000000000000,
    outcome: 'CLEARED',
  };

  const signed = signReceipt(unsigned, kp.keyObjectPrivate);
  assert.ok(signed.sig.length > 20, 'Signature should be present');

  const isValid = verifyReceiptSignature(signed, kp.keyObjectPublic);
  assert.strictEqual(isValid, true, 'Valid signature should verify');

  // Verify hash is deterministic
  const hash1 = hashReceipt(unsigned);
  const hash2 = hashReceipt(signed);
  assert.strictEqual(hash1, hash2, 'Hash of unsigned and signed should be identical (sig omitted)');

  // Tamper with payload
  const tampered = { ...signed, price_yoctonear: '99999999999999999999999' };
  const isTamperedValid = verifyReceiptSignature(tampered, kp.keyObjectPublic);
  assert.strictEqual(isTamperedValid, false, 'Tampered receipt must fail verification');
});
