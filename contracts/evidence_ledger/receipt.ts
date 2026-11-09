import crypto from 'node:crypto';
import { canonicalJson, sha256, signBytes, verifySignature } from '../../gateway/crypto_utils.ts';

export type ReceiptOutcome = 'CLEARED' | 'DISPUTED' | 'FAILED';

export interface EvidenceReceipt {
  receipt_id: string;
  job_id: string;
  employer: string;
  worker: string;
  task_digest: string;
  result_digest: string;
  price_yoctonear: string;
  settlement_tx: string;
  block_height: number;
  timestamp_ns: number;
  outcome: ReceiptOutcome;
  sig: string;
}

export type UnsignedReceipt = Omit<EvidenceReceipt, 'sig'>;

/**
 * Returns canonical bytes of the receipt for cryptographic signing/hashing
 */
export function canonicalReceiptBytes(receipt: UnsignedReceipt | EvidenceReceipt): Buffer {
  const { sig: _, ...unsigned } = receipt as EvidenceReceipt;
  const canonicalStr = canonicalJson(unsigned);
  return Buffer.from(canonicalStr, 'utf-8');
}

/**
 * Computes the 32-byte SHA-256 digest of the canonical receipt
 */
export function hashReceipt(receipt: UnsignedReceipt | EvidenceReceipt): string {
  return sha256(canonicalReceiptBytes(receipt));
}

/**
 * Signs an evidence receipt using the employer / chain signature private key
 */
export function signReceipt(
  unsigned: UnsignedReceipt,
  privateKey: crypto.KeyObject
): EvidenceReceipt {
  const bytes = canonicalReceiptBytes(unsigned);
  const sig = signBytes(bytes, privateKey);
  return {
    ...unsigned,
    sig,
  };
}

/**
 * Verifies that a receipt signature matches the public key
 */
export function verifyReceiptSignature(
  receipt: EvidenceReceipt,
  publicKey: crypto.KeyObject
): boolean {
  const bytes = canonicalReceiptBytes(receipt);
  return verifySignature(bytes, receipt.sig, publicKey);
}
