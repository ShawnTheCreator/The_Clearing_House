import type { EvidenceReceipt } from './receipt.ts';
import { MerkleTree } from './merkle.ts';
import type { MerkleInclusionProof } from './merkle.ts';

export interface PublishedRootRecord {
  day_utc: string; // YYYY-MM-DD
  root: string;
  leaf_count: number;
  published_at_ns: number;
  published_by: string;
  block_height: number;
}

export class EvidenceLedgerContract {
  public contract_id: string;
  private receipts = new Map<string, EvidenceReceipt>();
  private dailyReceipts = new Map<string, EvidenceReceipt[]>(); // YYYY-MM-DD -> receipts
  private publishedRoots = new Map<string, PublishedRootRecord>(); // YYYY-MM-DD -> root
  private dailyTrees = new Map<string, MerkleTree>();
  public current_block_height: number = 128455000;

  constructor(contract_id: string = 'evidence_ledger.clearing.testnet') {
    this.contract_id = contract_id;
  }

  private getUtcDay(timestamp_ns: number): string {
    const d = new Date(Math.floor(timestamp_ns / 1_000_000));
    return d.toISOString().slice(0, 10);
  }

  public append_receipt(receipt: EvidenceReceipt): void {
    if (this.receipts.has(receipt.receipt_id)) {
      throw new Error(`Receipt ${receipt.receipt_id} already exists`);
    }

    this.receipts.set(receipt.receipt_id, receipt);
    const day = this.getUtcDay(receipt.timestamp_ns);

    if (!this.dailyReceipts.has(day)) {
      this.dailyReceipts.set(day, []);
    }
    this.dailyReceipts.get(day)!.push(receipt);

    // Update in-memory Merkle tree for the day
    const tree = new MerkleTree(this.dailyReceipts.get(day)!);
    this.dailyTrees.set(day, tree);
    this.current_block_height += 1;
  }

  public publish_daily_root(day_utc: string, publisher: string): PublishedRootRecord {
    const receipts = this.dailyReceipts.get(day_utc) || [];
    const tree = new MerkleTree(receipts);
    const root = tree.getRoot();

    const record: PublishedRootRecord = {
      day_utc,
      root,
      leaf_count: receipts.length,
      published_at_ns: Date.now() * 1_000_000,
      published_by: publisher,
      block_height: this.current_block_height,
    };

    this.publishedRoots.set(day_utc, record);
    this.dailyTrees.set(day_utc, tree);
    this.current_block_height += 1;
    return record;
  }

  public get_root(day_utc: string): PublishedRootRecord | null {
    return this.publishedRoots.get(day_utc) || null;
  }

  public get_all_roots(): PublishedRootRecord[] {
    return Array.from(this.publishedRoots.values());
  }

  public get_proof(receipt_id: string): MerkleInclusionProof | null {
    const receipt = this.receipts.get(receipt_id);
    if (!receipt) return null;

    const day = this.getUtcDay(receipt.timestamp_ns);
    const tree = this.dailyTrees.get(day);
    if (!tree) return null;

    return tree.getProof(receipt_id);
  }

  public verify_inclusion_proof(proof: MerkleInclusionProof, day_utc: string): boolean {
    const published = this.publishedRoots.get(day_utc);
    if (!published) {
      return false; // Root has not been published on chain
    }

    if (published.root.toLowerCase() !== proof.root.toLowerCase()) {
      return false; // Root mismatch against chain state
    }

    return MerkleTree.verifyProof(proof);
  }

  public get_receipt(receipt_id: string): EvidenceReceipt | null {
    return this.receipts.get(receipt_id) || null;
  }

  public get_all_receipts(): EvidenceReceipt[] {
    return Array.from(this.receipts.values());
  }
}
