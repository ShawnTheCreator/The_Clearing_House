import fs from 'node:fs';
import path from 'node:path';
import { sha256, canonicalJson } from './crypto_utils.ts';

export interface HashChainedEvent {
  index: number;
  timestamp_ns: number;
  event_type: string;
  payload: unknown;
  prev_hash: string;
  entry_hash: string;
}

export class EventRecorder {
  private logPath: string;
  private lastHash: string = '0'.repeat(64);
  private count: number = 0;
  private writeStream: fs.WriteStream | null = null;

  constructor(logPath: string) {
    this.logPath = logPath;
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.recoverOrInit();
  }

  private recoverOrInit(): void {
    if (fs.existsSync(this.logPath)) {
      const content = fs.readFileSync(this.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as HashChainedEvent;
          this.lastHash = entry.entry_hash;
          this.count = entry.index + 1;
        } catch {
          // ignore malformed trailing line if any
        }
      }
    }
  }

  public recordEvent(event_type: string, payload: unknown): HashChainedEvent {
    const timestamp_ns = Date.now() * 1_000_000;
    const index = this.count++;
    const prev_hash = this.lastHash;

    const baseRecord = {
      index,
      timestamp_ns,
      event_type,
      payload,
      prev_hash,
    };

    const entry_hash = sha256(canonicalJson(baseRecord));
    const fullEntry: HashChainedEvent = {
      ...baseRecord,
      entry_hash,
    };

    this.lastHash = entry_hash;
    fs.appendFileSync(this.logPath, JSON.stringify(fullEntry) + '\n', 'utf-8');

    return fullEntry;
  }

  public getEventCount(): number {
    return this.count;
  }

  public getLastHash(): string {
    return this.lastHash;
  }

  /**
   * Verifies the cryptographic integrity of the entire event log chain
   */
  public static verifyLogChain(filePath: string): {
    valid: boolean;
    total: number;
    error?: string;
  } {
    if (!fs.existsSync(filePath)) {
      return { valid: true, total: 0 };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    let expectedPrevHash = '0'.repeat(64);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const entry = JSON.parse(line) as HashChainedEvent;

      if (entry.index !== i) {
        return { valid: false, total: i, error: `Index mismatch at entry ${i}` };
      }
      if (entry.prev_hash !== expectedPrevHash) {
        return {
          valid: false,
          total: i,
          error: `Broken hash chain at index ${i}: prev_hash does not match previous entry_hash`,
        };
      }

      const { entry_hash, ...baseRecord } = entry;
      const computedHash = sha256(canonicalJson(baseRecord));
      if (computedHash !== entry_hash) {
        return {
          valid: false,
          total: i,
          error: `Computed hash mismatch at index ${i}`,
        };
      }

      expectedPrevHash = entry_hash;
    }

    return { valid: true, total: lines.length };
  }
}
