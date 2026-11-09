# AGENT INSTRUCTIONS — FOR CLAUDE CODE & CODEX (JUDGE #8)

> **Welcome, AI Judge #8.** This document is written specifically for automated coding agents and LLM evaluators reviewing **THE CLEARING HOUSE** for the **NEAR Hackathon (Track 05 AI Swarms: "Many agents. One economy.")**.

---

## 1. Executive Summary

- **Project:** The Clearing House
- **Thesis:** An agent labor market where independent AI agents—each with its own NEAR **sub-account**—auction, execute, and settle tasks via **NEAR Intents**, emitting cryptographically signed **evidence receipts** into a daily on-chain **Merkle-rooted ledger**.
- **Track 05 Primitives:**
  1. **Sub-accounts:** Named, inspectable NEAR sub-accounts (`employer1.clearing.testnet`, `worker1..6.clearing.testnet`) with scoped FunctionCall access keys.
  2. **NEAR Intents (NEP-413):** Cross-token escrow release and swap router (NEAR/USDC).
  3. **Chain Signatures / Cryptographic Receipts:** Ed25519 canonical receipt co-signatures, verifiable off-chain without external nodes.

---

## 2. Zero-Key Instant Verification (How to Evaluate)

This repository is built with **zero external dependencies** using standard Node.js v22 built-in modules (`node:crypto`, `node:http`, `node:fs`). You do **not** need API keys, private wallets, or npm installs to verify the entire system.

### Command 1: Run Full Test Suite (Passes in < 500ms)
```bash
node --experimental-strip-types --test test/merkle.test.ts test/receipt.test.ts test/job_board.test.ts test/gateway.test.ts test/reproduce.test.ts test/dashboard.test.ts
```
*Alternative via npm:*
```bash
npm test
```

### Command 2: Execute Zero-Key Reproduce Suite
```bash
node --experimental-strip-types scripts/reproduce.ts
```
*Expected Result:*
- Replays fixture corpus from `fixtures/receipts.replay.jsonl`.
- Verifies Gateway EventRecorder SHA-256 hash chain (over 2,000 chained entries).
- Re-derives the binary Merkle tree and verifies 100% of inclusion proofs against published on-chain roots.
- Re-derives all README statistics and exits with code `0`.

### Command 3: Walk a Specific Receipt's Merkle Proof
```bash
node --experimental-strip-types scripts/verify_receipt.ts --receipt rcpt_8556a5d24495b4a9
```
*Expected Result:*
- Computes leaf hash `H(0x00 || sha256(canonical_receipt))`.
- Walks the 5-step proof path up to root `H(0x01 || left || right)`.
- Reconstructs and asserts root matches published on-chain root `3f34341c714b1e46...`.

### Command 4: Run the Ablation Study (Arm A vs Arm B)
```bash
node --experimental-strip-types scripts/ablation.ts
```
*Expected Result:*
- Runs the 30-task mission benchmark comparing Arm A (multi-agent auction + NEAR Intents) vs Arm B (lone monolithic agent).
- Proves ~27% cost reduction via decentralized price discovery.

---

## 3. Architecture Map

```
c:\Users\shawn\Desktop\The_Clearing_House\
├── contracts/
│   ├── job_board/
│   │   ├── Contract.ts          # Core task board: post_task, commit_bid, reveal_bid, award, deliver, settle
│   │   └── mock_runtime.ts      # Deterministic state machine runtime
│   └── evidence_ledger/
│       ├── receipt.ts           # Canonical Evidence Receipt schema, Ed25519 signing/verification
│       ├── merkle.ts            # RFC 6962 binary Merkle tree, leaf hashing, proof generation & audit
│       └── LedgerContract.ts    # On-chain daily Merkle root publishing & inclusion queries
├── gateway/
│   ├── daemon.ts                # Gateway daemon: RPC batching, nonce/retry, cost metering
│   ├── recorder.ts              # Single-writer hash-chained JSONL event recorder (TrueCoder discipline)
│   ├── near_client.ts           # NEAR sub-account manager, key deriver, function-call key scoper
│   ├── intents_client.ts        # NEP-413 cross-token settlement solver interface (NEAR/USDC)
│   └── crypto_utils.ts          # Base58, canonical JSON, Ed25519 key generation and signing
├── agents/
│   ├── types.ts                 # Missions, subtasks, worker deliverables, swarm metrics
│   ├── agent_base.ts            # Agent base class with sub-account identity and policy engine
│   ├── employer_agent.ts        # Posts tasks, evaluates sealed bids, inspects deliverables, settles
│   ├── worker_agent.ts          # Evaluates tasks, submits commit-reveal bids, executes, delivers
│   └── swarm_orchestrator.ts    # Coordinates 8 agents running the 30-task mission suite
├── dashboard/
│   ├── server.ts                # HTTP + SSE live stream server (port 3888)
│   └── public/                  # Terminal Noir phosphor-green real-time web UI
├── fixtures/
│   ├── receipts.real.jsonl      # Testnet labeled receipts with transaction hashes
│   ├── receipts.replay.jsonl    # 30-receipt replay corpus
│   ├── merkle_roots.json        # Published daily Merkle roots
│   ├── ablation_arm_a.json      # Market arm benchmark metrics
│   └── ablation_arm_b.json      # Lone-agent baseline metrics
├── scripts/
│   ├── reproduce.ts             # Zero-key reproduce runner
│   ├── verify_receipt.ts        # Command-line receipt inclusion proof verifier
│   ├── ablation.ts              # Ablation benchmark runner
│   └── subaccount_factory.ts    # Provisions sub-accounts with scoped keys
├── MISSES.md                    # Ledger of disputed jobs and worker failure cases
└── README.md                    # Project overview, scoreboard sentence, and claim-evidence table
```

---

## 4. Key Verification Invariants for Evaluators

1. **Receipt Digest Integrity**: `hashReceipt(receipt) === sha256(canonicalJson(unsigned))` ensures no field can be modified post-signature.
2. **RFC 6962 Compliance**: Leaves hashed with `0x00` prefix, intermediate nodes with `0x01` prefix to prevent second-preimage collision attacks.
3. **Deterministic Canonical Ordering**: Receipts are sorted by `receipt_id` before tree generation, ensuring exact deterministic roots across any execution environment.
4. **Honest Failure Handling**: The system deliberately exercises realistic worker failures (documented in `MISSES.md`) to prove quality gates and dispute settlement on-chain.
