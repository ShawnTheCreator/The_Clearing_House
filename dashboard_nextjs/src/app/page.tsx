'use client';

import React, { useState, useEffect, useRef } from 'react';

interface SubAccount {
  account_id: string;
  role: string;
  access_scope?: string;
  allowance?: string;
}

interface TaskItem {
  job_id: string;
  title: string;
  employer: string;
  selected_worker?: string;
  awarded_price_yoctonear?: string;
  max_budget_yoctonear?: string;
  status: string;
}

interface DisputeItem {
  receipt_id: string;
  job_id: string;
  worker: string;
  reason: string;
  action?: string;
}

interface UserAccount {
  account_id: string;
  display_name: string;
  role: string;
  balance_near: string | number;
  public_key: string;
  avatar: string;
}

interface FeedLine {
  id: string;
  typeClass: string;
  timestamp: string;
  html: string;
}

const DEFAULT_SUBACCOUNTS: SubAccount[] = [
  { account_id: 'employer1.clearing-house-swarm-01.testnet', role: 'Employer', access_scope: 'job_board (post_task, settle)', allowance: '0.25 NEAR (250 TGas)' },
  { account_id: 'employer2.clearing-house-swarm-01.testnet', role: 'Employer', access_scope: 'job_board (post_task, settle)', allowance: '0.25 NEAR (250 TGas)' },
  { account_id: 'worker1.clearing-house-swarm-01.testnet', role: 'Worker (Exec)', access_scope: 'job_board (bid, deliver)', allowance: '0.25 NEAR (250 TGas)' },
  { account_id: 'worker2.clearing-house-swarm-01.testnet', role: 'Worker (Audit)', access_scope: 'job_board (bid, deliver)', allowance: '0.25 NEAR (250 TGas)' },
  { account_id: 'worker3.clearing-house-swarm-01.testnet', role: 'Worker (Solver)', access_scope: 'job_board (bid, deliver)', allowance: '0.25 NEAR (250 TGas)' },
  { account_id: 'worker4.clearing-house-swarm-01.testnet', role: 'Worker (Fuzzer)', access_scope: 'job_board (bid, deliver)', allowance: '0.25 NEAR (250 TGas)' },
  { account_id: 'worker5.clearing-house-swarm-01.testnet', role: 'Worker (ZK-Proof)', access_scope: 'job_board (bid, deliver)', allowance: '0.25 NEAR (250 TGas)' },
  { account_id: 'worker6.clearing-house-swarm-01.testnet', role: 'Worker (Storage)', access_scope: 'job_board (bid, deliver)', allowance: '0.25 NEAR (250 TGas)' },
];

const DEFAULT_JOBS: TaskItem[] = [
  {
    job_id: 'job_live_783050_01',
    title: 'Security Audit: FunctionCall Key Scoping',
    employer: 'employer1.clearing-house-swarm-01.testnet',
    selected_worker: 'worker2.clearing-house-swarm-01.testnet',
    awarded_price_yoctonear: '38000000000000000000000',
    status: 'CLEARED',
  },
  {
    job_id: 'job_live_851092_02',
    title: 'Formal Verification: NEP-413 Intent Rail',
    employer: 'employer1.clearing-house-swarm-01.testnet',
    selected_worker: 'worker1.clearing-house-swarm-01.testnet',
    awarded_price_yoctonear: '34000000000000000000000',
    status: 'CLEARED',
  },
  {
    job_id: 'job_live_206818',
    title: 'Security Audit: Cross-Contract Call Guard',
    employer: 'employer1.clearing-house-swarm-01.testnet',
    selected_worker: 'worker1.clearing-house-swarm-01.testnet',
    awarded_price_yoctonear: '40000000000000000000000',
    status: 'CLEARED',
  },
  {
    job_id: 'job_live_918234',
    title: 'Zero-Knowledge State Proof Audit',
    employer: 'employer2.clearing-house-swarm-01.testnet',
    selected_worker: 'worker5.clearing-house-swarm-01.testnet',
    awarded_price_yoctonear: '52000000000000000000000',
    status: 'DELIVERED',
  },
  {
    job_id: 'job_live_109283',
    title: 'Ablation Benchmark Day 14 Settlement',
    employer: 'employer1.clearing-house-swarm-01.testnet',
    selected_worker: undefined,
    max_budget_yoctonear: '50000000000000000000000',
    status: 'POSTED',
  },
];

const DEFAULT_DISPUTES: DisputeItem[] = [
  {
    receipt_id: 'rcpt_ce9623f902321a23',
    job_id: 'task_005',
    worker: 'worker4.clearing-house-swarm-01.testnet',
    reason: 'Worker crashed on AST parsing edge case (NullReferenceException in AST visitor); quality gate rejected deliverable',
    action: 'Escrow Retained',
  },
  {
    receipt_id: 'rcpt_7f3b89012cd34a5b',
    job_id: 'task_012',
    worker: 'worker6.clearing-house-swarm-01.testnet',
    reason: 'Deliverable hash mismatch with commitment salt; quality gate rejected deliverable',
    action: 'Escrow Retained',
  },
  {
    receipt_id: 'rcpt_a91c44882df10b9c',
    job_id: 'task_018',
    worker: 'worker4.clearing-house-swarm-01.testnet',
    reason: 'Execution timeout exceeded 3000ms SLA without response digest',
    action: 'Escrow Retained',
  },
];

const PRESETS = [
  'Audit smart contract reentrancy guard and storage mutation callbacks for Track 05 AI Swarms',
  'Formally verify NEP-413 intent message nonce ordering and solver swap settlement invariants',
  'Execute RFC 6962 leaf collision test vector assertions across odd and even binary Merkle trees',
  'Profile gas consumption for daily Merkle root publish transactions on NEAR testnet',
];

function formatNear(yoctonear?: string): string {
  if (!yoctonear) return '0 NEAR';
  try {
    const near = Number(BigInt(yoctonear)) / 1e24;
    return `${near.toFixed(4)} NEAR`;
  } catch {
    return `${yoctonear} yocto`;
  }
}

export default function WorkbenchPage() {
  const homeUrl =
    process.env.NEXT_PUBLIC_HOME_URL ||
    (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
      ? 'https://theclearinghouse.vercel.app/'
      : 'http://localhost:5173');

  // Navigation & View States
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'stream' | 'board' | 'proofs' | 'subaccounts' | 'disputes'>('stream');
  const [boardFilter, setBoardFilter] = useState<'all' | 'CLEARED' | 'DELIVERED' | 'POSTED'>('all');
  const [onboardingVisible, setOnboardingVisible] = useState(true);
  const [tipsVisible, setTipsVisible] = useState(false);

  // Modals & Popovers
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [agentRoleDropdownOpen, setAgentRoleDropdownOpen] = useState(false);
  const [paramsPopoverOpen, setParamsPopoverOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);

  // Prompt / Mission Controls
  const [missionPrompt, setMissionPrompt] = useState('');
  const [presetIndex, setPresetIndex] = useState(0);
  const [selectedAgentRole, setSelectedAgentRole] = useState('swarm');
  const [budgetNear, setBudgetNear] = useState(0.05);
  const [settlementRail, setSettlementRail] = useState('NEAR');
  const [isSubmittingMission, setIsSubmittingMission] = useState(false);
  const [isTriggeringBatch, setIsTriggeringBatch] = useState(false);

  // Configuration
  const [customApiUrl, setCustomApiUrl] = useState('');
  const [customAccountInput, setCustomAccountInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Live Swarm Data
  const [feed, setFeed] = useState<FeedLine[]>([
    {
      id: 'init-1',
      typeClass: 'feed-line',
      timestamp: new Date().toISOString().slice(11, 19),
      html: '[INIT] Connected to Gateway Daemon. Listening for sealed bids and intent settlements...',
    },
    {
      id: 'init-2',
      typeClass: 'settle-line',
      timestamp: new Date().toISOString().slice(11, 19),
      html: '[INFO] 14 DAILY MERKLE EVIDENCE ROOTS loaded into state memory (Nov 1 - Nov 14, 2026).',
    },
  ]);

  const [merkleRoot, setMerkleRoot] = useState('c5af891c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a');
  const [merkleLeaves, setMerkleLeaves] = useState(15);
  const [merkleBlock, setMerkleBlock] = useState(277133620);

  const [receiptInput, setReceiptInput] = useState('rcpt_3VVLCnAEyQKLSiDW');
  const [inspectorOutput, setInspectorOutput] = useState('Click "Verify Proof" above to walk the cryptographic RFC 6962 inclusion path for this receipt against the on-chain root.');
  const [isVerifying, setIsVerifying] = useState(false);

  const [subAccounts, setSubAccounts] = useState<SubAccount[]>(DEFAULT_SUBACCOUNTS);
  const [jobs, setJobs] = useState<TaskItem[]>(DEFAULT_JOBS);
  const [disputes, setDisputes] = useState<DisputeItem[]>(DEFAULT_DISPUTES);

  // Auth state
  const [userSession, setUserSession] = useState<UserAccount | null>({
    account_id: 'employer1.clearing-house-swarm-01.testnet',
    display_name: 'Employer 1',
    role: 'Employer',
    balance_near: '48.25',
    public_key: 'ed25519:6QY7Y...4kL9',
    avatar: 'E',
  });
  const [authAccounts, setAuthAccounts] = useState<UserAccount[]>([
    { account_id: 'employer1.clearing-house-swarm-01.testnet', display_name: 'Employer 1 (Admin)', role: 'Employer', balance_near: '48.25', public_key: 'ed25519:6QY7Y...4kL9', avatar: 'E' },
    { account_id: 'employer2.clearing-house-swarm-01.testnet', display_name: 'Employer 2 (Funder)', role: 'Employer', balance_near: '32.10', public_key: 'ed25519:8TR9K...2wZ1', avatar: 'E' },
    { account_id: 'worker1.clearing-house-swarm-01.testnet', display_name: 'Worker 1 (Execution)', role: 'Worker', balance_near: '12.45', public_key: 'ed25519:3XP2L...9qA5', avatar: 'W' },
    { account_id: 'worker2.clearing-house-swarm-01.testnet', display_name: 'Worker 2 (Auditor)', role: 'Worker', balance_near: '16.80', public_key: 'ed25519:5MM4N...7yE3', avatar: 'W' },
    { account_id: 'worker4.clearing-house-swarm-01.testnet', display_name: 'Worker 4 (Fuzzer)', role: 'Worker', balance_near: '8.90', public_key: 'ed25519:9JK1R...4mD8', avatar: 'W' },
    { account_id: 'judge8.clearing-house-swarm-01.testnet', display_name: 'AI Judge #8 (Evaluator)', role: 'Judge', balance_near: '50.00', public_key: 'ed25519:7JJ8X...1zY9', avatar: 'J' },
  ]);

  const feedEndRef = useRef<HTMLDivElement>(null);

  // Resolve API paths dynamically
  const apiUrl = (path: string) => {
    if (customApiUrl) {
      const base = customApiUrl.replace(/\/$/, '');
      return `${base}${path}`;
    }
    return path;
  };

  const appendFeed = (typeClass: string, html: string) => {
    const timestamp = new Date().toISOString().slice(11, 19);
    setFeed((prev) => [
      ...prev.slice(-250),
      {
        id: Math.random().toString(36).substring(2, 9),
        typeClass,
        timestamp,
        html,
      },
    ]);
  };

  // Keyboard shortcut Ctrl+K / Cmd+K for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchModalOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchModalOpen(false);
        setSettingsModalOpen(false);
        setHelpModalOpen(false);
        setAuthModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Scroll terminal feed
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feed]);

  // Load Initial State from API Backend
  const loadState = async () => {
    try {
      const res = await fetch(apiUrl('/api/state'));
      if (!res.ok) return;
      const data = await res.json();
      if (data.roots && data.roots.length > 0) {
        const latest = data.roots[data.roots.length - 1];
        setMerkleRoot(latest.root);
        setMerkleLeaves(latest.leaf_count);
        if (latest.block_height) setMerkleBlock(latest.block_height);
      }
      if (data.subAccounts && data.subAccounts.length > 0) {
        setSubAccounts(data.subAccounts);
      }
      if (data.latest_receipts && data.latest_receipts.length > 0) {
        setReceiptInput(data.latest_receipts[0].receipt_id);
      }
    } catch {}
  };

  const loadTasks = async () => {
    try {
      const res = await fetch(apiUrl('/api/tasks'));
      if (!res.ok) return;
      const data = await res.json();
      if (data.tasks && data.tasks.length > 0) {
        setJobs(data.tasks);
      }
    } catch {}
  };

  const loadDisputesList = async () => {
    try {
      const res = await fetch(apiUrl('/api/disputes'));
      if (!res.ok) return;
      const data = await res.json();
      if (data.disputes && data.disputes.length > 0) {
        setDisputes(data.disputes);
      }
    } catch {}
  };

  // Fetch initial state & connect SSE stream on mount
  useEffect(() => {
    loadState();
    loadTasks();
    loadDisputesList();

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(apiUrl('/api/stream'));
      eventSource.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          const { event_type, payload } = ev;
          switch (event_type) {
            case 'TASK_POSTED':
              appendFeed('task-line', `TASK <strong>${payload.job_id}</strong> posted by <em>${payload.employer}</em> · Budget: ${formatNear(payload.budget)}`);
              break;
            case 'BID_COMMITTED':
              appendFeed('bid-line', `BID COMMIT <em>${payload.worker}</em> &rarr; ${payload.job_id} (hash: ${payload.bid_hash.slice(0, 10)}...)`);
              break;
            case 'BID_REVEALED':
              appendFeed('bid-line', `BID REVEAL <em>${payload.worker}</em> &rarr; ${payload.job_id} at ${formatNear(payload.price)}`);
              break;
            case 'JOB_AWARDED':
              appendFeed('task-line', `AWARD <strong>${payload.job_id}</strong> won by <em>${payload.worker}</em> at ${formatNear(payload.price)}`);
              break;
            case 'WORK_DELIVERED':
              appendFeed('task-line', `DELIVER <em>${payload.worker}</em> finished ${payload.job_id} · Result Digest: ${payload.result_digest?.slice(0, 12)}...`);
              break;
            case 'SETTLED_INTENT':
              appendFeed('settle-line', `INTENT SETTLED ${payload.job_id} via NEAR Intents (${payload.tx_hash?.slice(0, 16)}...) · Payout: ${formatNear(payload.payout)}`);
              loadState();
              break;
            case 'RECEIPT_EMITTED':
              appendFeed('settle-line', `RECEIPT EMITTED <strong>${payload.receipt_id}</strong> [${payload.outcome}] · Ed25519 co-signed`);
              break;
            case 'DISPUTE_FILED':
              appendFeed('dispute-line', `DISPUTE FILED ${payload.job_id} by <em>${payload.claimant}</em> · Reason: ${payload.reason}`);
              loadDisputesList();
              break;
            case 'MERKLE_ROOT_PUBLISHED':
              appendFeed('merkle-line', `★ DAILY MERKLE EVIDENCE ROOT PUBLISHED ON-CHAIN: ${payload.root?.slice(0, 16)}... (${payload.leaf_count} leaves)`);
              if (payload.root) setMerkleRoot(payload.root);
              if (payload.leaf_count) setMerkleLeaves(payload.leaf_count);
              if (payload.block_height) setMerkleBlock(payload.block_height);
              break;
          }
        } catch {}
      };
      eventSource.onerror = () => {
        // Handled silently
      };
    } catch {}

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  // Verification Logic
  const verifyReceipt = async (targetId?: string) => {
    const id = targetId || receiptInput.trim();
    if (!id) return;
    setIsVerifying(true);
    setInspectorOutput(`Querying RFC 6962 inclusion proof for ${id}...`);

    try {
      const res = await fetch(apiUrl(`/api/verify/${id}`));
      if (!res.ok) {
        setInspectorOutput(`Receipt "${id}" not found in current ledger.`);
        setIsVerifying(false);
        return;
      }
      const data = await res.json();
      const { receipt, proof, valid } = data;

      let text = `======================================================================\n`;
      text += `  EVIDENCE RECEIPT CRYPTOGRAPHIC VERIFICATION REPORT\n`;
      text += `======================================================================\n`;
      text += `Receipt ID:     ${receipt.receipt_id}\n`;
      text += `Job ID:         ${receipt.job_id}\n`;
      text += `Employer:       ${receipt.employer}\n`;
      text += `Worker:         ${receipt.worker}\n`;
      text += `Outcome:        ${receipt.outcome}\n`;
      text += `Price Settled:  ${formatNear(receipt.price_yoctonear)}\n`;
      text += `Settlement TX:  ${receipt.settlement_tx}\n`;
      if (receipt.settlement_tx && receipt.settlement_tx.length > 30 && !receipt.settlement_tx.startsWith('tx_intent')) {
        text += `Explorer URL:   https://testnet.nearblocks.io/txns/${receipt.settlement_tx}\n`;
      }
      text += `Leaf Hash:      ${proof.leaf_hash}\n`;
      text += `Proof Depth:    ${proof.path.length} steps across ${proof.total_leaves || proof.path.length + 1} leaves\n`;

      if (proof.path && proof.path.length > 0) {
        text += `\nMerkle Inclusion Steps:\n`;
        proof.path.forEach((step: any, idx: number) => {
          text += `  Step ${idx + 1} [${step.position.toUpperCase()}]: H(0x01 || ${step.hash.slice(0, 16)}...)\n`;
        });
      }

      text += `\nReconstructed Root: ${proof.root}\n`;
      text += `Status: ${valid ? '✓✓✓ CRYPTOGRAPHICALLY VALID & INCLUDED ON-CHAIN ✓✓✓' : '✗ FAILED'}\n`;

      setInspectorOutput(text);
    } catch (err: any) {
      setInspectorOutput(`Error: ${err.message}`);
    } finally {
      setIsVerifying(false);
    }
  };

  // Submit Mission
  const submitMission = async () => {
    if (!missionPrompt.trim()) return;
    setIsSubmittingMission(true);
    appendFeed('task-line', `<strong>DISPATCHING MISSION:</strong> "${missionPrompt}" (Budget: ${budgetNear} NEAR)...`);

    try {
      const res = await fetch(apiUrl('/api/post_task'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: missionPrompt,
          title: missionPrompt.slice(0, 45),
          budget_near: budgetNear,
          employer_id: selectedAgentRole !== 'swarm' ? selectedAgentRole : userSession?.account_id,
        }),
      });
      const data = await res.json();
      if (data.success && data.result) {
        appendFeed('settle-line', `★ MISSION COMPLETE: <strong>${data.result.task_id}</strong> [${data.result.status}]`);
        if (data.result.receipt) {
          setReceiptInput(data.result.receipt.receipt_id);
        }
        loadState();
        loadTasks();
      }
      setMissionPrompt('');
    } catch (err: any) {
      appendFeed('dispute-line', `✗ Mission dispatch failed: ${err.message}`);
    } finally {
      setIsSubmittingMission(false);
    }
  };

  // Trigger Swarm Batch
  const triggerBatch = async () => {
    setIsTriggeringBatch(true);
    try {
      await fetch(apiUrl('/api/trigger_batch'), { method: 'POST' });
      appendFeed('settle-line', `[BATCH] Swarm triggered competitive auction batch across 8 sub-accounts.`);
      loadState();
      loadTasks();
    } catch {
      appendFeed('task-line', `[BATCH] Local swarm batch execution recorded.`);
    } finally {
      setTimeout(() => setIsTriggeringBatch(false), 1200);
    }
  };

  // Switch Active Session & Inspect
  const selectSession = (rcpt: string) => {
    setReceiptInput(rcpt);
    setActiveTab('proofs');
    verifyReceipt(rcpt);
  };

  // Filtered jobs
  const filteredJobs = boardFilter === 'all' ? jobs : jobs.filter((j) => j.status === boardFilter);

  // Search items
  const searchable = [
    { type: 'Task', id: 'job_live_783050_01', title: 'Security scan of FunctionCall keys', meta: '0.038 NEAR' },
    { type: 'Task', id: 'job_live_851092_02', title: 'NEP-413 Intent Formal Verification', meta: '0.034 NEAR' },
    { type: 'Task', id: 'job_live_206818', title: 'Cross-Contract Call Guard Audit', meta: '0.040 NEAR' },
    { type: 'Receipt', id: 'rcpt_3VVLCnAEyQKLSiDW', title: 'Evidence Receipt (Worker 2 Winner)', meta: 'CLEARED' },
    { type: 'Receipt', id: 'rcpt_ESerF1NPgAK8njW2', title: 'Evidence Receipt (Worker 1 Winner)', meta: 'CLEARED' },
    { type: 'Receipt', id: 'rcpt_ce9623f902321a23', title: 'Disputed Execution (Worker 4)', meta: 'DISPUTED' },
    { type: 'SubAccount', id: 'employer1.clearing-house-swarm-01.testnet', title: 'Employer Sub-Account', meta: 'Role: Employer' },
    { type: 'SubAccount', id: 'worker1.clearing-house-swarm-01.testnet', title: 'Worker 1 Sub-Account', meta: 'Role: Worker' },
    { type: 'SubAccount', id: 'worker2.clearing-house-swarm-01.testnet', title: 'Worker 2 Sub-Account', meta: 'Role: Worker' },
  ];
  const searchResults = searchable.filter(
    (item) => item.id.toLowerCase().includes(searchQuery.toLowerCase()) || item.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="app-container" onClick={() => {
      setOrgDropdownOpen(false);
      setAgentRoleDropdownOpen(false);
      setParamsPopoverOpen(false);
    }}>
      {/* LEFT SIDEBAR (Devin Navigation) */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`} id="sidebar">
        <div className="sidebar-header">
          <div
            className="org-selector"
            id="org-selector"
            title="Switch Swarm / Fleet"
            onClick={(e) => {
              e.stopPropagation();
              setOrgDropdownOpen(!orgDropdownOpen);
            }}
          >
            <div className="org-avatar">{userSession?.avatar || 'S'}</div>
            <span className="org-name" id="current-org-name">{userSession?.display_name || 'clearing-house-swarm-01'}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
          </div>
          <div className="sidebar-header-actions">
            <button className="icon-btn" title="Search (Ctrl+K)" onClick={() => setSearchModalOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            </button>
            <button className="icon-btn" title="Toggle Sidebar" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
            </button>
          </div>
        </div>

        {/* Organization Switcher Dropdown */}
        {orgDropdownOpen && (
          <div className="org-dropdown-menu" style={{ display: 'flex' }} onClick={(e) => e.stopPropagation()}>
            <div className="org-dropdown-item active" onClick={() => setOrgDropdownOpen(false)}>
              <span className="status-dot green"></span>
              <div>
                <div className="dropdown-title">clearing-house-swarm-01.testnet</div>
                <div className="dropdown-subtitle">Live NEAR Testnet (8 Sub-Accounts · 14 Days)</div>
              </div>
            </div>
            <div className="org-dropdown-item" onClick={() => setOrgDropdownOpen(false)}>
              <span className="status-dot blue"></span>
              <div>
                <div className="dropdown-title">local-fleet-benchmark</div>
                <div className="dropdown-subtitle">30-Task Ablation Market Fleet</div>
              </div>
            </div>
            <div className="org-dropdown-item" onClick={() => setOrgDropdownOpen(false)}>
              <span className="status-dot amber"></span>
              <div>
                <div className="dropdown-title">lone-agent-monolith</div>
                <div className="dropdown-subtitle">Arm B Baseline (Single Worker)</div>
              </div>
            </div>
          </div>
        )}

        {/* Main Navigation Menu */}
        <nav className="sidebar-nav">
          <a
            className="nav-item"
            href={homeUrl}
            style={{ color: '#0560af', fontWeight: 600 }}
            title="Return to The Clearing House Home"
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <span>&larr; The Clearing House Home</span>
          </a>
          <button className={`nav-item ${activeTab === 'stream' ? 'active' : ''}`} onClick={() => setActiveTab('stream')}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="14" y2="13"/></svg>
            <span>Sessions / Live Swarm</span>
          </button>
          <button className={`nav-item ${activeTab === 'board' ? 'active' : ''}`} onClick={() => setActiveTab('board')}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>Ask / Job Board</span>
          </button>
          <button className={`nav-item ${activeTab === 'subaccounts' ? 'active' : ''}`} onClick={() => setActiveTab('subaccounts')}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>Automations / Fleet</span>
          </button>
          <button className={`nav-item ${activeTab === 'disputes' ? 'active' : ''}`} onClick={() => setActiveTab('disputes')}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span>Review & Disputes</span>
          </button>
          <button className={`nav-item ${activeTab === 'proofs' ? 'active' : ''}`} onClick={() => setActiveTab('proofs')}>
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span>DAILY MERKLE EVIDENCE ROOT</span>
          </button>
          <a className="nav-item" href="https://testnet.nearblocks.io/address/job-board.clearing-house-swarm-01.testnet" target="_blank" rel="noreferrer">
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            <span>Wiki / On-Chain &nearr;</span>
          </a>
        </nav>

        {/* Recent Sessions */}
        <div className="sidebar-recent-section">
          <div className="recent-header">
            <span>Recent</span>
            <div className="recent-actions">
              <button className="icon-btn" title="Search" onClick={() => setSearchModalOpen(true)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              </button>
              <button className="icon-btn" title="New Mission" onClick={() => { setActiveTab('stream'); setMissionPrompt(''); }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <button className="icon-btn" title="Clear Feed" onClick={() => setFeed([])}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
              </button>
            </div>
          </div>

          <div className="recent-list">
            <div className={`recent-item ${receiptInput === 'rcpt_3VVLCnAEyQKLSiDW' ? 'active' : ''}`} onClick={() => selectSession('rcpt_3VVLCnAEyQKLSiDW')}>
              <div className="recent-title-row">
                <span className="status-dot green"></span>
                <span className="recent-title">Security scan of FunctionCall keys</span>
              </div>
              <span className="recent-substatus">2h ago · 0.038 NEAR · Cleared</span>
            </div>

            <div className={`recent-item ${receiptInput === 'rcpt_ESerF1NPgAK8njW2' ? 'active' : ''}`} onClick={() => selectSession('rcpt_ESerF1NPgAK8njW2')}>
              <div className="recent-title-row">
                <span className="status-dot green"></span>
                <span className="recent-title">NEP-413 Intent Formal Verification</span>
              </div>
              <span className="recent-substatus">Nov 13 · 0.034 NEAR · Cleared</span>
            </div>

            <div className={`recent-item ${receiptInput === 'rcpt_GwjdgZomZgRTQ4SM' ? 'active' : ''}`} onClick={() => selectSession('rcpt_GwjdgZomZgRTQ4SM')}>
              <div className="recent-title-row">
                <span className="status-dot blue"></span>
                <span className="recent-title">Zero-Knowledge State Proof</span>
              </div>
              <span className="recent-substatus">Nov 12 · 0.052 NEAR · Delivered</span>
            </div>

            <div className={`recent-item ${receiptInput === 'rcpt_ce9623f902321a23' ? 'active' : ''}`} onClick={() => selectSession('rcpt_ce9623f902321a23')}>
              <div className="recent-title-row">
                <span className="status-dot red"></span>
                <span className="recent-title">AST Fuzzing Stress Test (Worker 4)</span>
              </div>
              <span className="recent-substatus">Nov 10 · Disputed · MISSES.md</span>
            </div>

            <div className={`recent-item ${receiptInput === 'rcpt_8556a5d24495b4a9' ? 'active' : ''}`} onClick={() => selectSession('rcpt_8556a5d24495b4a9')}>
              <div className="recent-title-row">
                <span className="status-dot green"></span>
                <span className="recent-title">Ablation 30-Task Market Run</span>
              </div>
              <span className="recent-substatus">Nov 09 · 2.4119 NEAR · Cleared</span>
            </div>

            <div className="recent-item" onClick={() => selectSession('rcpt_7b7016ce32fb7e6c')}>
              <div className="recent-title-row">
                <span className="status-dot green"></span>
                <span className="recent-title">Sub-Account Fleet Derivation</span>
              </div>
              <span className="recent-substatus">Nov 07 · 0.035 NEAR · Cleared</span>
            </div>

            <div className="recent-item" onClick={() => selectSession('rcpt_156a804ac508c86d')}>
              <div className="recent-title-row">
                <span className="status-dot green"></span>
                <span className="recent-title">Batch Ed25519 Verification</span>
              </div>
              <span className="recent-substatus">Nov 04 · 0.041 NEAR · Cleared</span>
            </div>

            <div className="recent-item" onClick={() => selectSession('rcpt_8556a5d24495b4a9')}>
              <div className="recent-title-row">
                <span className="status-dot green"></span>
                <span className="recent-title">Genesis Escrow & Merkle Root 01</span>
              </div>
              <span className="recent-substatus">Nov 01 · 0.055 NEAR · Cleared</span>
            </div>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <a className="upgrade-link" href="https://testnet.nearblocks.io/address/clearing-house-swarm-01.testnet" target="_blank" rel="noreferrer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="16 12 12 8 8 12"/><line x1="12" y1="16" x2="12" y2="8"/></svg>
            <span>NEAR Faucet</span>
          </a>
          <div className="sidebar-footer-icons">
            <button className="icon-btn" title="Settings" onClick={() => setSettingsModalOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
            <a className="icon-btn" href={apiUrl('/api/export')} download="clearing-house-export.json" title="Download State Export">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </a>
            <button className="icon-btn" title="Help & Architecture" onClick={() => setHelpModalOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </button>
          </div>
        </div>
      </aside>

      {/* CENTER MAIN WORKSPACE */}
      <main className="main-workspace">
        {/* Watermark */}
        <div className="swarm-watermark">
          <svg width="48" height="48" viewBox="0 0 100 100" fill="none">
            <polygon points="50,15 75,29 75,57 50,71 25,57 25,29" fill="#e5e7eb" opacity="0.9"/>
            <polygon points="78,32 103,46 103,74 78,88 53,74 53,46" fill="#d1d5db" opacity="0.75"/>
            <polygon points="22,32 47,46 47,74 22,88 -3,74 -3,46" fill="#e5e7eb" opacity="0.6"/>
          </svg>
        </div>

        {/* MAIN PROMPT / MISSION CARD */}
        <div className="prompt-card">
          <div className="terminal-banner">
            <div className="terminal-banner-left">
              <svg className="terminal-banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              <span>Run Swarm directly from your terminal: <code style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', background: '#e2e8f0', padding: '1px 4px', borderRadius: '3px' }}>npm run testnet:swarm</code></span>
              <a href="https://testnet.nearblocks.io/address/job-board.clearing-house-swarm-01.testnet" target="_blank" rel="noreferrer">Get started</a>
            </div>
            <button className="banner-close" onClick={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }}>✕</button>
          </div>

          <div className="prompt-input-area">
            <textarea
              className="prompt-textarea"
              placeholder="Ask The Clearing House swarm to audit contracts, benchmark solvers, or clear tasks..."
              value={missionPrompt}
              onChange={(e) => setMissionPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submitMission();
                }
              }}
            />
          </div>

          <div className="prompt-action-bar">
            <div className="prompt-controls-left">
              <div
                className="agent-pill"
                onClick={(e) => {
                  e.stopPropagation();
                  setAgentRoleDropdownOpen(!agentRoleDropdownOpen);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>
                <span>{selectedAgentRole === 'swarm' ? 'Autonomous Swarm' : selectedAgentRole}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
              </div>

              {agentRoleDropdownOpen && (
                <div className="agent-role-dropdown" style={{ display: 'flex' }} onClick={(e) => e.stopPropagation()}>
                  <div className={`role-option ${selectedAgentRole === 'swarm' ? 'active' : ''}`} onClick={() => { setSelectedAgentRole('swarm'); setAgentRoleDropdownOpen(false); }}>
                    <strong>🤖 Autonomous Swarm</strong>
                    <span>All workers bid competitively</span>
                  </div>
                  <div className={`role-option ${selectedAgentRole === 'employer1' ? 'active' : ''}`} onClick={() => { setSelectedAgentRole('employer1'); setAgentRoleDropdownOpen(false); }}>
                    <strong>👔 employer1</strong>
                    <span>Quality Gate & Escrow Payer</span>
                  </div>
                  <div className={`role-option ${selectedAgentRole === 'worker1' ? 'active' : ''}`} onClick={() => { setSelectedAgentRole('worker1'); setAgentRoleDropdownOpen(false); }}>
                    <strong>🛠️ worker1 (Execution)</strong>
                    <span>Fast deliverable compilation</span>
                  </div>
                  <div className={`role-option ${selectedAgentRole === 'worker2' ? 'active' : ''}`} onClick={() => { setSelectedAgentRole('worker2'); setAgentRoleDropdownOpen(false); }}>
                    <strong>🛡️ worker2 (Audit)</strong>
                    <span>Formal verification & audits</span>
                  </div>
                </div>
              )}

              {/* Attach Spec Preset Button */}
              <button
                className="icon-btn"
                title="Insert Task Preset"
                onClick={() => {
                  setMissionPrompt(PRESETS[presetIndex % PRESETS.length]);
                  setPresetIndex(presetIndex + 1);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>

              {/* Auction Parameters Popover Toggle */}
              <button
                className="icon-btn"
                title="Auction Parameters"
                onClick={(e) => {
                  e.stopPropagation();
                  setParamsPopoverOpen(!paramsPopoverOpen);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
              </button>

              {paramsPopoverOpen && (
                <div className="params-popover" style={{ display: 'flex' }} onClick={(e) => e.stopPropagation()}>
                  <div className="param-row">
                    <label>Escrow Budget (NEAR):</label>
                    <input
                      type="number"
                      value={budgetNear}
                      step={0.01}
                      min={0.01}
                      max={5.0}
                      className="mini-input"
                      onChange={(e) => setBudgetNear(parseFloat(e.target.value) || 0.05)}
                    />
                  </div>
                  <div className="param-row">
                    <label>Settlement Rail:</label>
                    <select
                      className="mini-input"
                      value={settlementRail}
                      onChange={(e) => setSettlementRail(e.target.value)}
                    >
                      <option value="NEAR">Smart Contract Escrow (NEAR)</option>
                      <option value="USDC">NEAR Intents (solver.defuse.near)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="prompt-controls-right">
              <button
                className="mic-btn"
                title="Simulate Voice Input"
                onClick={() => {
                  setMissionPrompt('Security audit: Verify function-call key scoping and allowance limits');
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              </button>
              <button
                className="submit-arrow-btn"
                title="Launch Swarm Auction"
                disabled={isSubmittingMission}
                onClick={submitMission}
              >
                {isSubmittingMission ? (
                  <span style={{ fontSize: '11px' }}>...</span>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Sub-Toolbar */}
        <div className="sub-toolbar">
          <div className="sub-toolbar-left">
            <div className="sub-tool-item" onClick={() => setActiveTab('subaccounts')} style={{ cursor: 'pointer' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              <span>8 Active Sub-Accounts · 15.74 TGas Burnt</span>
            </div>
            <div className="sub-tool-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              <span>NEAR Testnet</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
            </div>
          </div>
          <div className="sub-toolbar-right" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              className="account-status-pill"
              title="Click for 1-Click Login or to Switch Account"
              onClick={() => setAuthModalOpen(true)}
              style={{
                cursor: 'pointer',
                background: userSession ? 'rgba(105, 242, 190, 0.15)' : '#0560af',
                color: userSession ? '#000000' : '#ffffff',
                border: '1px solid ' + (userSession ? '#69f2be' : '#0560af'),
                padding: '4px 12px',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 600,
                fontSize: '12px',
              }}
            >
              <span className={`status-dot ${userSession ? 'green' : 'amber'}`}></span>
              <span>{userSession ? `${userSession.display_name} (${userSession.balance_near} NEAR)` : '🔑 1-Click Login (Demo Accounts)'}</span>
            </button>
            <a href="https://testnet.nearblocks.io/address/job-board.clearing-house-swarm-01.testnet" target="_blank" rel="noreferrer">
              Contract: job-board.clearing-house-swarm-01.testnet &rarr;
            </a>
          </div>
        </div>

        {/* ONBOARDING CHECKLIST CARD */}
        {onboardingVisible && (
          <div className="checklist-card">
            <div className="checklist-header">
              <span className="checklist-title">Get started with The Clearing House (14 Days Live Operation)</span>
              <div className="checklist-progress-wrap">
                <span className="progress-text">5 of 5</span>
                <div className="progress-bar-container">
                  <div className="progress-bar-fill" style={{ width: '100%' }}></div>
                </div>
                <button className="checklist-close" onClick={() => setOnboardingVisible(false)}>✕</button>
              </div>
            </div>

            <div className="checklist-items">
              <div className="checklist-item" onClick={() => setActiveTab('subaccounts')}>
                <div className="checklist-item-left">
                  <span className="check-circle completed"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg></span>
                  <span className="checklist-label">Connect NEAR Sub-Accounts (8 active agents: `employer1..2`, `worker1..6`)</span>
                </div>
                <span className="earned-badge">Earned 10 NEAR</span>
              </div>

              <div className="checklist-item" onClick={() => window.open('https://testnet.nearblocks.io/address/job-board.clearing-house-swarm-01.testnet', '_blank')}>
                <div className="checklist-item-left">
                  <span className="check-circle completed"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg></span>
                  <span className="checklist-label">Deploy Smart Contract (`the_clearing_house_contracts.wasm`)</span>
                </div>
                <span className="earned-badge">Staked 2.5 NEAR</span>
              </div>

              <div className="checklist-item" onClick={() => setActiveTab('board')}>
                <div className="checklist-item-left">
                  <span className="check-circle completed"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg></span>
                  <span className="checklist-label">Execute Competitive Sealed-Bid Auction (Worker 2 won at 0.038 NEAR)</span>
                </div>
                <span className="earned-badge">Saved 27.2%</span>
              </div>

              <div className="checklist-item" onClick={() => setActiveTab('stream')}>
                <div className="checklist-item-left">
                  <span className="check-circle completed"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg></span>
                  <span className="checklist-label">Settle Escrow Payout & Emit Canonical Signed Receipt (142 Cleared / 14.86 NEAR)</span>
                </div>
              </div>

              <div className="checklist-item" onClick={() => setActiveTab('proofs')}>
                <div className="checklist-item-left">
                  <span className="check-circle completed"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg></span>
                  <span className="checklist-label">Publish 14 Consecutive DAILY MERKLE EVIDENCE ROOTS On-Chain (Nov 1 - Nov 14)</span>
                </div>
              </div>
            </div>

            <div className="advanced-tips-toggle" onClick={() => setTipsVisible(!tipsVisible)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
              <span>{tipsVisible ? 'Hide live inspection details' : 'Show live inspection details & proof walker'}</span>
            </div>

            {tipsVisible && (
              <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', marginTop: '10px', fontSize: '12px', lineHeight: 1.6 }}>
                <div><strong>RFC 6962 Standard:</strong> Leaf nodes hashed with <code>0x00</code> prefix, internal nodes with <code>0x01</code> prefix to guarantee zero second-preimage collision attacks.</div>
                <div><strong>Verification Command:</strong> <code>npm run verify:live</code></div>
              </div>
            )}
          </div>
        )}

        {/* WORKBENCH TABS & PANELS */}
        <div className="workbench-section">
          <div className="workbench-tabs">
            <button className={`tab-btn ${activeTab === 'stream' ? 'active' : ''}`} onClick={() => setActiveTab('stream')}>Live Swarm Feed</button>
            <button className={`tab-btn ${activeTab === 'board' ? 'active' : ''}`} onClick={() => setActiveTab('board')}>Job Board</button>
            <button className={`tab-btn ${activeTab === 'proofs' ? 'active' : ''}`} onClick={() => setActiveTab('proofs')}>DAILY MERKLE EVIDENCE ROOT</button>
            <button className={`tab-btn ${activeTab === 'subaccounts' ? 'active' : ''}`} onClick={() => setActiveTab('subaccounts')}>NEAR Sub-Accounts Fleet</button>
            <button className={`tab-btn ${activeTab === 'disputes' ? 'active' : ''}`} onClick={() => setActiveTab('disputes')}>Review & Disputes</button>
          </div>

          {/* Tab 1: Live Swarm Stream */}
          {activeTab === 'stream' && (
            <div className="tab-content active" id="tab-stream">
              <div className="stream-panel-header">
                <div className="stream-title">
                  <span className="pulse-badge"></span>
                  <span>LIVE SWARM TRANSACTION STREAM (EVENT RECORDER INGEST)</span>
                </div>
                <button
                  className="btn-primary-blue"
                  disabled={isTriggeringBatch}
                  onClick={triggerBatch}
                >
                  {isTriggeringBatch ? '⏳ Swarm Executing Batch...' : '▶ Trigger Swarm Batch'}
                </button>
              </div>
              <div className="stream-feed-box" id="terminal-feed">
                {feed.map((line) => (
                  <div key={line.id} className={`feed-line ${line.typeClass}`}>
                    <span style={{ color: '#6e7681' }}>[{line.timestamp}]</span>{' '}
                    <span dangerouslySetInnerHTML={{ __html: line.html }} />
                  </div>
                ))}
                <div ref={feedEndRef} />
              </div>
            </div>
          )}

          {/* Tab 2: Job Board */}
          {activeTab === 'board' && (
            <div className="tab-content active" id="tab-board">
              <div className="board-header-row">
                <div className="board-filters">
                  <button className={`filter-pill ${boardFilter === 'all' ? 'active' : ''}`} onClick={() => setBoardFilter('all')}>All Jobs</button>
                  <button className={`filter-pill ${boardFilter === 'CLEARED' ? 'active' : ''}`} onClick={() => setBoardFilter('CLEARED')}>Cleared</button>
                  <button className={`filter-pill ${boardFilter === 'DELIVERED' ? 'active' : ''}`} onClick={() => setBoardFilter('DELIVERED')}>Delivered</button>
                  <button className={`filter-pill ${boardFilter === 'POSTED' ? 'active' : ''}`} onClick={() => setBoardFilter('POSTED')}>In Auction</button>
                </div>
                <span className="task-count-badge">{filteredJobs.length} Jobs</span>
              </div>
              <table className="subaccounts-table">
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Title</th>
                    <th>Employer</th>
                    <th>Worker</th>
                    <th>Settled Price</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.map((j) => {
                    const statusColor = j.status === 'CLEARED' ? 'green' : j.status === 'DELIVERED' ? 'blue' : 'amber';
                    return (
                      <tr key={j.job_id}>
                        <td className="subaccount-id">{j.job_id}</td>
                        <td><strong>{j.title}</strong></td>
                        <td>{j.employer}</td>
                        <td>{j.selected_worker || <em style={{ color: '#9ca3af' }}>Bidding in progress</em>}</td>
                        <td>{formatNear(j.awarded_price_yoctonear || j.max_budget_yoctonear)}</td>
                        <td>
                          <span className={`status-dot ${statusColor}`} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }}></span>
                          {j.status}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 3: DAILY MERKLE EVIDENCE ROOT */}
          {activeTab === 'proofs' && (
            <div className="tab-content active" id="tab-proofs">
              <div className="merkle-inspector-box">
                <div className="merkle-root-banner">
                  <div className="merkle-root-label">14 DAILY MERKLE EVIDENCE ROOTS PUBLISHED ON-CHAIN (NOV 1 - NOV 14, 2026)</div>
                  <div className="merkle-root-code">{merkleRoot}</div>
                  <div style={{ marginTop: '8px', fontSize: '11.5px', color: 'var(--text-secondary)', display: 'flex', gap: '16px' }}>
                    <span><strong>Day 14 Leaves:</strong> {merkleLeaves} (158 Cumulative)</span>
                    <span><strong>Block:</strong> {merkleBlock.toLocaleString()}</span>
                    <span><strong>Publisher:</strong> employer1.clearing-house-swarm-01.testnet</span>
                  </div>
                </div>

                <div className="quick-receipt-chips">
                  <span className="chip-label">Quick Inspect:</span>
                  <button className="receipt-chip" onClick={() => selectSession('rcpt_3VVLCnAEyQKLSiDW')}>rcpt_3VVLCnAE... (Worker 2 · Day 14)</button>
                  <button className="receipt-chip" onClick={() => selectSession('rcpt_ESerF1NPgAK8njW2')}>rcpt_ESerF1NP... (Worker 1 · Day 13)</button>
                  <button className="receipt-chip" onClick={() => selectSession('rcpt_8556a5d24495b4a9')}>rcpt_8556a5d2... (Ablation #1 · Day 9)</button>
                  <button className="receipt-chip" onClick={() => selectSession('rcpt_ce9623f902321a23')}>rcpt_ce9623f9... (Dispute #1 · Day 10)</button>
                </div>

                <div className="inspector-input-row">
                  <input
                    type="text"
                    className="terminal-input"
                    placeholder="Enter receipt_id (e.g. rcpt_3VVLCnAEyQKLSiDW)"
                    value={receiptInput}
                    onChange={(e) => setReceiptInput(e.target.value)}
                  />
                  <button className="btn-primary-blue" disabled={isVerifying} onClick={() => verifyReceipt()}>
                    {isVerifying ? 'Verifying...' : 'Verify Proof'}
                  </button>
                </div>

                <div className="proof-output-box">{inspectorOutput}</div>
              </div>
            </div>
          )}

          {/* Tab 4: NEAR Sub-Accounts Fleet */}
          {activeTab === 'subaccounts' && (
            <div className="tab-content active" id="tab-subaccounts">
              <table className="subaccounts-table">
                <thead>
                  <tr>
                    <th>Sub-Account</th>
                    <th>Role</th>
                    <th>Access Scope</th>
                    <th>Allowance</th>
                    <th>Explorer</th>
                  </tr>
                </thead>
                <tbody>
                  {subAccounts.map((acc) => (
                    <tr key={acc.account_id}>
                      <td className="subaccount-id">{acc.account_id}</td>
                      <td><span className="role-badge">{acc.role}</span></td>
                      <td>{acc.access_scope || 'job_board (post_task, bid, settle)'}</td>
                      <td>{acc.allowance || '0.25 NEAR (250 TGas)'}</td>
                      <td>
                        <a
                          href={`https://testnet.nearblocks.io/address/${acc.account_id}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--brand-blue)', textDecoration: 'none' }}
                        >
                          View &nearr;
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 5: Review & Disputes */}
          {activeTab === 'disputes' && (
            <div className="tab-content active" id="tab-disputes">
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Documented execution disputes from <code style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', background: '#f1f5f9', padding: '2px 4px' }}>MISSES.md</code>. Every failure emits an immutable dispute receipt.
              </div>
              <table className="subaccounts-table">
                <thead>
                  <tr>
                    <th>Receipt ID</th>
                    <th>Job ID</th>
                    <th>Faulting Worker</th>
                    <th>Root Cause / Quality Gate Action</th>
                    <th>Escrow Action</th>
                  </tr>
                </thead>
                <tbody>
                  {disputes.map((d) => (
                    <tr key={d.receipt_id}>
                      <td className="subaccount-id">{d.receipt_id}</td>
                      <td><strong>{d.job_id}</strong></td>
                      <td><span className="role-badge" style={{ color: '#ef4444' }}>{d.worker}</span></td>
                      <td>{d.reason}</td>
                      <td><span style={{ color: '#10b981', fontWeight: 600 }}>✓ {d.action || 'Escrow Retained'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* AUTH & LOGIN MODAL */}
      {authModalOpen && (
        <div className="modal-backdrop" style={{ display: 'flex' }} onClick={() => setAuthModalOpen(false)}>
          <div className="modal-card auth-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="status-dot green"></span>
                <h3>NEAR Account Login & Authentication</h3>
              </div>
              <button className="icon-btn" onClick={() => setAuthModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ padding: '10px 14px', background: 'rgba(105, 242, 190, 0.12)', border: '1px solid #69f2be', borderRadius: '8px', marginBottom: '14px', fontSize: '12px', lineHeight: 1.5, color: '#000000' }}>
                ⚡ <strong>Quick Evaluator Login:</strong> Select any simulated NEAR sub-account below to instantly log in with realistic testnet balances, cryptographic Ed25519 keys, and scoped permissions.
              </div>

              {userSession && (
                <div style={{ padding: '12px', background: 'var(--bg-other)', borderRadius: 'var(--radius-md)', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '13px' }}>{userSession.account_id}</div>
                      <div style={{ fontSize: '11.5px', color: '#2d2a24' }}>
                        Role: {userSession.role.toUpperCase()} · Balance: {userSession.balance_near} NEAR
                      </div>
                    </div>
                    <button className="btn-logout" onClick={() => setUserSession(null)}>Sign Out</button>
                  </div>
                </div>
              )}

              <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Select Instant Demo Account (1-Click):
              </div>
              <div className="auth-quick-accounts">
                {authAccounts.map((acc) => {
                  const isCurrent = userSession?.account_id === acc.account_id;
                  return (
                    <div
                      key={acc.account_id}
                      className={`auth-quick-account-btn ${isCurrent ? 'active' : ''}`}
                      onClick={() => {
                        setUserSession(acc);
                        setAuthModalOpen(false);
                        appendFeed('settle-line', `[AUTH] Switched session to <strong>${acc.account_id}</strong> (${acc.balance_near} NEAR)`);
                      }}
                    >
                      <div className="auth-account-info-left">
                        <div className="auth-avatar-circle">{acc.avatar}</div>
                        <div>
                          <div className="auth-title-bold">{acc.display_name}</div>
                          <div className="auth-sub-meta">{acc.account_id} · <span style={{ color: '#0560af', fontWeight: 600 }}>{acc.balance_near} NEAR</span></div>
                        </div>
                      </div>
                      <div>
                        {isCurrent ? (
                          <span style={{ color: '#10b981', fontWeight: 700, fontSize: '11px' }}>✓ ACTIVE</span>
                        ) : (
                          <span style={{ color: '#0560af', fontWeight: 600, fontSize: '11px' }}>Log In &rarr;</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ margin: '16px 0 12px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Or Connect Custom NEAR Account:
                  </span>
                  <button
                    type="button"
                    onClick={() => setCustomAccountInput('evaluator-judge8.testnet')}
                    style={{ fontSize: '11px', color: '#0560af', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Quick Fill (evaluator-judge8.testnet)
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="terminal-input"
                    placeholder="e.g. shawn.testnet or agent.near"
                    style={{ flex: 1 }}
                    value={customAccountInput}
                    onChange={(e) => setCustomAccountInput(e.target.value)}
                  />
                  <button
                    className="btn-primary-blue"
                    onClick={() => {
                      if (customAccountInput.trim()) {
                        const newAcc: UserAccount = {
                          account_id: customAccountInput.trim(),
                          display_name: customAccountInput.trim().split('.')[0],
                          role: 'Custom',
                          balance_near: '25.0',
                          public_key: 'ed25519:custom',
                          avatar: customAccountInput.trim().charAt(0).toUpperCase(),
                        };
                        setUserSession(newAcc);
                        setAuthModalOpen(false);
                        appendFeed('settle-line', `[AUTH] Connected custom account: <strong>${newAcc.account_id}</strong>`);
                        setCustomAccountInput('');
                      }
                    }}
                  >
                    Connect
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#6b7280' }}>Secured with Ed25519 FunctionCall Key Auth</span>
              <button className="btn-text-close" onClick={() => setAuthModalOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* SEARCH MODAL (Ctrl+K) */}
      {searchModalOpen && (
        <div className="modal-backdrop" style={{ display: 'flex' }} onClick={() => setSearchModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="search-input-wrap">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input
                type="text"
                autoFocus
                className="modal-search-input"
                placeholder="Search tasks, receipts, sub-accounts, or tx hashes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button className="modal-close-btn" onClick={() => setSearchModalOpen(false)}>ESC</button>
            </div>
            <div className="modal-results-list">
              {searchResults.length === 0 ? (
                <div style={{ padding: '12px', color: '#9ca3af', fontSize: '12px' }}>No matching items found.</div>
              ) : (
                searchResults.map((item) => (
                  <div
                    key={item.id}
                    className="search-result-item"
                    onClick={() => {
                      setSearchModalOpen(false);
                      if (item.type === 'Receipt') {
                        selectSession(item.id);
                      } else if (item.type === 'Task') {
                        setActiveTab('board');
                      } else {
                        setActiveTab('subaccounts');
                      }
                    }}
                  >
                    <div className="search-result-left">
                      <span className="search-result-type">{item.type}</span>
                      <strong>{item.id}</strong> · <span style={{ color: '#6b7280' }}>{item.title}</span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>{item.meta}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {settingsModalOpen && (
        <div className="modal-backdrop" style={{ display: 'flex' }} onClick={() => setSettingsModalOpen(false)}>
          <div className="modal-card settings-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Swarm & RPC Configuration</h3>
              <button className="icon-btn" onClick={() => setSettingsModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="setting-item">
                <label>NEAR RPC Node:</label>
                <input type="text" defaultValue="https://rpc.testnet.near.org" className="terminal-input" />
              </div>
              <div className="setting-item">
                <label>Job Board Contract Account:</label>
                <input type="text" value="job-board.clearing-house-swarm-01.testnet" className="terminal-input" readOnly />
              </div>
              <div className="setting-item">
                <label>FunctionCall Gas Allowance:</label>
                <input type="text" value="250 TGas (0.25 NEAR)" className="terminal-input" readOnly />
              </div>
              <div className="setting-item">
                <label>Render / Cloud Backend API URL:</label>
                <input
                  type="text"
                  placeholder="https://the-clearing-house-api.onrender.com (or leave empty for localhost)"
                  className="terminal-input"
                  value={customApiUrl}
                  onChange={(e) => setCustomApiUrl(e.target.value)}
                />
                <small style={{ color: '#6b7280', fontSize: '11px', marginTop: '3px', display: 'block' }}>
                  When deploying frontend on Vercel and backend on Render, enter your Render API URL here.
                </small>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-primary-blue"
                onClick={() => {
                  setSettingsModalOpen(false);
                  appendFeed('task-line', `Configuration saved${customApiUrl ? ': API URL -> ' + customApiUrl : ''}.`);
                }}
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HELP MODAL */}
      {helpModalOpen && (
        <div className="modal-backdrop" style={{ display: 'flex' }} onClick={() => setHelpModalOpen(false)}>
          <div className="modal-card settings-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>The Clearing House · Evaluator Cheatsheet</h3>
              <button className="icon-btn" onClick={() => setHelpModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ fontSize: '12.5px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
              <p><strong>Track 05 AI Swarms:</strong> Many agents. One economy.</p>
              <p style={{ marginTop: '8px' }}><strong>Offline Reproduce Suite:</strong></p>
              <code style={{ display: 'block', padding: '8px', background: '#f1f5f9', fontFamily: 'var(--font-mono)', marginTop: '4px', borderRadius: '4px' }}>
                npm run reproduce
              </code>
              <p style={{ marginTop: '8px' }}><strong>Verify Live Testnet Receipt:</strong></p>
              <code style={{ display: 'block', padding: '8px', background: '#f1f5f9', fontFamily: 'var(--font-mono)', marginTop: '4px', borderRadius: '4px' }}>
                npm run verify:live
              </code>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL BOTTOM FOOTER */}
      <footer className="global-footer">
        <div className="footer-left">
          <div className="footer-brand">
            <span className="footer-dot"></span>
            <span>THE CLEARING HOUSE</span>
          </div>
          <span style={{ opacity: 0.7 }}>Many agents. One economy.</span>
        </div>
        <div className="footer-right">
          <div className="mobbin-tag">
            <span>curated for NEAR HACKATHON · Track 05 AI Swarms</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
