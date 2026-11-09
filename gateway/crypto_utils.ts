import crypto from 'node:crypto';

// Base58 alphabet (Bitcoin / NEAR standard)
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE = BigInt(58);

export function base58Encode(buffer: Uint8Array | Buffer): string {
  let num = BigInt(0);
  for (let i = 0; i < buffer.length; i++) {
    num = (num << BigInt(8)) + BigInt(buffer[i]);
  }
  let str = '';
  while (num > 0) {
    const rem = Number(num % BASE);
    num = num / BASE;
    str = ALPHABET[rem] + str;
  }
  // Leading zeros
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0) {
      str = '1' + str;
    } else {
      break;
    }
  }
  return str || '1';
}

export function base58Decode(str: string): Buffer {
  let num = BigInt(0);
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const index = ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid Base58 character: ${char}`);
    }
    num = num * BASE + BigInt(index);
  }

  const bytes: number[] = [];
  while (num > 0) {
    bytes.unshift(Number(num & BigInt(0xff)));
    num = num >> BigInt(8);
  }

  for (let i = 0; i < str.length; i++) {
    if (str[i] === '1') {
      bytes.unshift(0);
    } else {
      break;
    }
  }
  return Buffer.from(bytes);
}

export function sha256(data: string | Buffer | Uint8Array): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function sha256Buffer(data: string | Buffer | Uint8Array): Buffer {
  return crypto.createHash('sha256').update(data).digest();
}

/**
 * Deterministic JSON serialization for cryptographic integrity
 * Sorts object keys recursively.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const entries = keys.map(k => `"${k}":${canonicalJson((obj as Record<string, unknown>)[k])}`);
  return '{' + entries.join(',') + '}';
}

export interface KeyPair {
  publicKeyBase58: string;
  privateKeyBase58: string;
  keyObjectPrivate: crypto.KeyObject;
  keyObjectPublic: crypto.KeyObject;
}

/**
 * Generate Ed25519 keypair for NEAR sub-accounts and Chain Signatures
 */
export function generateEd25519KeyPair(): KeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubRaw = publicKey.export({ type: 'spki', format: 'der' });
  // The last 32 bytes of Ed25519 SPKI DER are the raw 32-byte public key
  const rawPubKey = pubRaw.subarray(pubRaw.length - 32);

  const privRaw = privateKey.export({ type: 'pkcs8', format: 'der' });
  // Raw 32-byte Ed25519 seed is at offset 16..48 of standard PKCS#8
  const rawPrivKey = privRaw.subarray(privRaw.length - 32);

  return {
    publicKeyBase58: 'ed25519:' + base58Encode(rawPubKey),
    privateKeyBase58: 'ed25519:' + base58Encode(Buffer.concat([rawPrivKey, rawPubKey])),
    keyObjectPrivate: privateKey,
    keyObjectPublic: publicKey,
  };
}

/**
 * Sign data bytes with Ed25519 key
 */
export function signBytes(data: Buffer | string, privateKey: crypto.KeyObject): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  const signature = crypto.sign(null, buf, privateKey);
  return base58Encode(signature);
}

/**
 * Verify Ed25519 signature
 */
export function verifySignature(
  data: Buffer | string,
  signatureBase58: string,
  publicKey: crypto.KeyObject
): boolean {
  try {
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    const sig = base58Decode(signatureBase58);
    return crypto.verify(null, buf, publicKey, sig);
  } catch {
    return false;
  }
}
