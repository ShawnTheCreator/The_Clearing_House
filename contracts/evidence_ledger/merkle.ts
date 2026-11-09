import crypto from 'node:crypto';
import type { EvidenceReceipt } from './receipt.ts';
import { hashReceipt } from './receipt.ts';

export interface MerkleProofStep {
  position: 'left' | 'right';
  hash: string;
}

export interface MerkleInclusionProof {
  receipt_id: string;
  leaf_hash: string;
  index: number;
  total_leaves: number;
  root: string;
  path: MerkleProofStep[];
}

export class MerkleTree {
  private leaves: string[] = [];
  private receiptMap = new Map<string, { index: number; receipt: EvidenceReceipt }>();
  private layers: string[][] = [];

  constructor(receipts: EvidenceReceipt[] = []) {
    if (receipts.length > 0) {
      this.buildFromReceipts(receipts);
    }
  }

  /**
   * Leaf hash using RFC 6962 style prefix 0x00 to prevent second-preimage attacks
   */
  public static hashLeaf(leafData: string): string {
    const prefix = Buffer.from([0x00]);
    const data = Buffer.from(leafData, 'hex');
    return crypto.createHash('sha256').update(Buffer.concat([prefix, data])).digest('hex');
  }

  /**
   * Node hash using RFC 6962 style prefix 0x01
   */
  public static hashNode(left: string, right: string): string {
    const prefix = Buffer.from([0x01]);
    const leftBuf = Buffer.from(left, 'hex');
    const rightBuf = Buffer.from(right, 'hex');
    return crypto
      .createHash('sha256')
      .update(Buffer.concat([prefix, leftBuf, rightBuf]))
      .digest('hex');
  }

  public buildFromReceipts(receipts: EvidenceReceipt[]): void {
    this.receiptMap.clear();
    // Sort receipts canonically by receipt_id for deterministic tree construction
    const sorted = [...receipts].sort((a, b) => a.receipt_id.localeCompare(b.receipt_id));

    this.leaves = sorted.map((r, i) => {
      this.receiptMap.set(r.receipt_id, { index: i, receipt: r });
      const rawHash = hashReceipt(r);
      return MerkleTree.hashLeaf(rawHash);
    });

    this.computeLayers();
  }

  private computeLayers(): void {
    this.layers = [];
    if (this.leaves.length === 0) {
      // Empty tree has empty hash
      this.layers.push([crypto.createHash('sha256').update('').digest('hex')]);
      return;
    }

    let currentLayer = [...this.leaves];
    this.layers.push(currentLayer);

    while (currentLayer.length > 1) {
      const nextLayer: string[] = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        if (i + 1 < currentLayer.length) {
          nextLayer.push(MerkleTree.hashNode(currentLayer[i], currentLayer[i + 1]));
        } else {
          // Odd node: pair with itself or promote
          nextLayer.push(MerkleTree.hashNode(currentLayer[i], currentLayer[i]));
        }
      }
      this.layers.push(nextLayer);
      currentLayer = nextLayer;
    }
  }

  public getRoot(): string {
    if (this.layers.length === 0) {
      return crypto.createHash('sha256').update('').digest('hex');
    }
    const topLayer = this.layers[this.layers.length - 1];
    return topLayer[0];
  }

  public getLeafCount(): number {
    return this.leaves.length;
  }

  public getProof(receiptId: string): MerkleInclusionProof | null {
    const entry = this.receiptMap.get(receiptId);
    if (!entry) return null;

    let index = entry.index;
    const leafHash = this.leaves[index];
    const path: MerkleProofStep[] = [];

    for (let layerIdx = 0; layerIdx < this.layers.length - 1; layerIdx++) {
      const layer = this.layers[layerIdx];
      const isRight = index % 2 === 1;
      const siblingIndex = isRight ? index - 1 : index + 1;

      if (siblingIndex < layer.length) {
        path.push({
          position: isRight ? 'left' : 'right',
          hash: layer[siblingIndex],
        });
      } else {
        // Paired with self
        path.push({
          position: 'right',
          hash: layer[index],
        });
      }

      index = Math.floor(index / 2);
    }

    return {
      receipt_id: receiptId,
      leaf_hash: leafHash,
      index: entry.index,
      total_leaves: this.leaves.length,
      root: this.getRoot(),
      path,
    };
  }

  public static verifyProof(proof: MerkleInclusionProof): boolean {
    let currentHash = proof.leaf_hash;

    for (const step of proof.path) {
      if (step.position === 'left') {
        currentHash = MerkleTree.hashNode(step.hash, currentHash);
      } else {
        currentHash = MerkleTree.hashNode(currentHash, step.hash);
      }
    }

    return currentHash.toLowerCase() === proof.root.toLowerCase();
  }
}
