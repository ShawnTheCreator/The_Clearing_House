// The Clearing House — Devin-Inspired AI Swarm Workbench Logic

const feedEl = document.getElementById('terminal-feed');
const rootDisplayEl = document.getElementById('merkle-root-display');
const leavesDisplayEl = document.getElementById('merkle-leaves');
const blockDisplayEl = document.getElementById('merkle-block');

const receiptInput = document.getElementById('receipt-input');
const inspectorOutput = document.getElementById('inspector-output');
const verifyBtn = document.getElementById('verify-btn');
const triggerBatchBtn = document.getElementById('trigger-batch-btn');
const submitMissionBtn = document.getElementById('submit-mission-btn');
const missionPromptEl = document.getElementById('mission-prompt');
const subaccountsTbody = document.getElementById('subaccounts-tbody');

// Tab Navigation Logic
function switchTab(tabId) {
  // Update nav-item active states
  document.querySelectorAll('.nav-item').forEach((item) => {
    if (item.getAttribute('data-tab') === tabId) {
      item.classList.add('active');
    } else if (item.getAttribute('data-tab')) {
      item.classList.remove('active');
    }
  });

  // Update workbench tab buttons
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update tab contents
  document.querySelectorAll('.tab-content').forEach((content) => {
    if (content.id === `tab-${tabId}`) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });
}

// Attach click listeners to tabs
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tabId = btn.getAttribute('data-tab');
    if (tabId) switchTab(tabId);
  });
});

document.querySelectorAll('.nav-item[data-tab]').forEach((item) => {
  item.addEventListener('click', () => {
    const tabId = item.getAttribute('data-tab');
    if (tabId) switchTab(tabId);
  });
});

// Recent Sessions Selection
document.querySelectorAll('.recent-item').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.recent-item').forEach((i) => i.classList.remove('active'));
    item.classList.add('active');

    const receiptId = item.getAttribute('data-receipt');
    if (receiptId && receiptInput) {
      receiptInput.value = receiptId;
      switchTab('proofs');
      verifyReceipt(receiptId);
    }
  });
});

// Advanced tips / toggle details
const toggleTipsBtn = document.getElementById('toggle-tips-btn');
if (toggleTipsBtn) {
  toggleTipsBtn.addEventListener('click', () => {
    const section = document.querySelector('.workbench-section');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth' });
    }
  });
}

// Feed Appender
function appendFeed(typeClass, msg) {
  if (!feedEl) return;
  const line = document.createElement('div');
  line.className = `feed-line ${typeClass}`;

  const now = new Date();
  const timestamp = `[${now.toISOString().slice(11, 19)}]`;
  line.innerHTML = `<span style="color:#6e7681">${timestamp}</span> ${msg}`;

  feedEl.appendChild(line);
  feedEl.scrollTop = feedEl.scrollHeight;

  while (feedEl.children.length > 250) {
    feedEl.removeChild(feedEl.firstChild);
  }
}

function formatNear(yoctonear) {
  if (!yoctonear) return '0 NEAR';
  try {
    const near = Number(BigInt(yoctonear)) / 1e24;
    return `${near.toFixed(4)} NEAR`;
  } catch {
    return `${yoctonear} yocto`;
  }
}

// Initial State Loader
async function loadInitialState() {
  try {
    const res = await fetch('/api/state');
    if (!res.ok) return;
    const data = await res.json();

    if (data.roots && data.roots.length > 0) {
      const latestRoot = data.roots[data.roots.length - 1];
      if (rootDisplayEl) rootDisplayEl.textContent = latestRoot.root;
      if (leavesDisplayEl) leavesDisplayEl.textContent = latestRoot.leaf_count;
      if (blockDisplayEl) blockDisplayEl.textContent = (latestRoot.block_height || 277076322).toLocaleString();
    }

    if (data.subAccounts && subaccountsTbody) {
      subaccountsTbody.innerHTML = '';
      for (const acc of data.subAccounts) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="subaccount-id">${acc.account_id}</td>
          <td><span class="role-badge">${acc.role}</span></td>
          <td>job_board (scoped 250 TGas)</td>
          <td>0.25 NEAR</td>
        `;
        subaccountsTbody.appendChild(tr);
      }
    }

    if (data.latest_receipts && data.latest_receipts.length > 0 && receiptInput) {
      receiptInput.value = data.latest_receipts[0].receipt_id;
    }
  } catch (err) {
    console.error('Failed to load initial state:', err);
  }
}

// SSE Live Stream
function initEventStream() {
  const eventSource = new EventSource('/api/stream');

  eventSource.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      handleServerEvent(event);
    } catch (err) {
      console.error('Failed to parse SSE event:', err);
    }
  };

  eventSource.onerror = () => {
    appendFeed('feed-line', '<span style="color:#8b949e">[STATUS] Reconnecting to Gateway Daemon...</span>');
  };
}

function handleServerEvent(event) {
  const { event_type, payload } = event;

  switch (event_type) {
    case 'TASK_POSTED':
      appendFeed(
        'task-line',
        `TASK <strong>${payload.job_id}</strong> posted by <em>${payload.employer}</em> · Budget: ${formatNear(payload.budget)}`
      );
      break;

    case 'BID_COMMITTED':
      appendFeed(
        'bid-line',
        `BID COMMIT <em>${payload.worker}</em> &rarr; ${payload.job_id} (hash: ${payload.bid_hash.slice(0, 10)}...)`
      );
      break;

    case 'BID_REVEALED':
      appendFeed(
        'bid-line',
        `BID REVEAL <em>${payload.worker}</em> &rarr; ${payload.job_id} at ${formatNear(payload.price)}`
      );
      break;

    case 'JOB_AWARDED':
      appendFeed(
        'task-line',
        `AWARD <strong>${payload.job_id}</strong> won by <em>${payload.worker}</em> at ${formatNear(payload.price)}`
      );
      break;

    case 'WORK_DELIVERED':
      appendFeed(
        'task-line',
        `DELIVER <em>${payload.worker}</em> finished ${payload.job_id} · Result Digest: ${payload.result_digest.slice(0, 12)}...`
      );
      break;

    case 'SETTLED_INTENT':
      appendFeed(
        'settle-line',
        `INTENT SETTLED ${payload.job_id} via NEAR Intents (${payload.tx_hash.slice(0, 16)}...) · Payout: ${formatNear(payload.payout)}`
      );
      loadInitialState();
      break;

    case 'RECEIPT_EMITTED':
      appendFeed(
        'settle-line',
        `RECEIPT EMITTED <strong>${payload.receipt_id}</strong> [${payload.outcome}] · Ed25519 co-signed`
      );
      break;

    case 'DISPUTE_FILED':
      appendFeed(
        'dispute-line',
        `DISPUTE FILED ${payload.job_id} by <em>${payload.claimant}</em> · Reason: ${payload.reason}`
      );
      loadInitialState();
      break;

    case 'MERKLE_ROOT_PUBLISHED':
      appendFeed(
        'merkle-line',
        `★ DAILY MERKLE EVIDENCE ROOT PUBLISHED ON-CHAIN: ${payload.root.slice(0, 16)}... (${payload.leaf_count} leaves)`
      );
      if (rootDisplayEl) rootDisplayEl.textContent = payload.root;
      if (leavesDisplayEl) leavesDisplayEl.textContent = payload.leaf_count;
      if (blockDisplayEl) blockDisplayEl.textContent = (payload.block_height || 277076322).toLocaleString();
      break;
  }
}

// Receipt Proof Verification
async function verifyReceipt(targetReceiptId) {
  const receiptId = targetReceiptId || receiptInput.value.trim();
  if (!receiptId || !inspectorOutput) return;

  inspectorOutput.textContent = `Querying RFC 6962 inclusion proof for ${receiptId}...`;

  try {
    const res = await fetch(`/api/verify/${receiptId}`);
    if (!res.ok) {
      inspectorOutput.textContent = `Receipt "${receiptId}" not found in current ledger.`;
      return;
    }

    const { receipt, proof, valid } = await res.json();
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
      proof.path.forEach((step, idx) => {
        text += `  Step ${idx + 1} [${step.position.toUpperCase()}]: H(0x01 || ${step.hash.slice(0, 16)}...)\n`;
      });
    }

    text += `\nReconstructed Root: ${proof.root}\n`;
    text += `Status: ${valid ? '✓✓✓ CRYPTOGRAPHICALLY VALID & INCLUDED ON-CHAIN ✓✓✓' : '✗ FAILED'}\n`;

    inspectorOutput.textContent = text;
  } catch (err) {
    inspectorOutput.textContent = `Error: ${err.message}`;
  }
}

if (verifyBtn) {
  verifyBtn.addEventListener('click', () => verifyReceipt());
}

// Trigger Batch / Mission Dispatch
async function triggerSwarmBatch() {
  const missionText = missionPromptEl ? missionPromptEl.value.trim() : '';
  if (triggerBatchBtn) {
    triggerBatchBtn.disabled = true;
    triggerBatchBtn.textContent = '⏳ Swarm Executing...';
  }
  if (submitMissionBtn) {
    submitMissionBtn.disabled = true;
  }

  if (missionText) {
    appendFeed('task-line', `<strong>DISPATCHING MISSION:</strong> "${missionText}"`);
    if (missionPromptEl) missionPromptEl.value = '';
  }

  try {
    await fetch('/api/trigger_batch', { method: 'POST' });
  } finally {
    setTimeout(() => {
      if (triggerBatchBtn) {
        triggerBatchBtn.disabled = false;
        triggerBatchBtn.textContent = '▶ Trigger Swarm Batch';
      }
      if (submitMissionBtn) {
        submitMissionBtn.disabled = false;
      }
    }, 1500);
  }
}

if (triggerBatchBtn) {
  triggerBatchBtn.addEventListener('click', triggerSwarmBatch);
}

if (submitMissionBtn) {
  submitMissionBtn.addEventListener('click', triggerSwarmBatch);
}

if (missionPromptEl) {
  missionPromptEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      triggerSwarmBatch();
    }
  });
}

// Boot up
loadInitialState();
initEventStream();
