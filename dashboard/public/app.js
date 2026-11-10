// The Clearing House — Terminal Noir Frontend Logic

const feedEl = document.getElementById('terminal-feed');
const rootDisplayEl = document.getElementById('merkle-root-display');
const leavesDisplayEl = document.getElementById('merkle-leaves');
const blockDisplayEl = document.getElementById('merkle-block');

const statClearedEl = document.getElementById('stat-cleared');
const statDisputesEl = document.getElementById('stat-disputes');
const statSettledEl = document.getElementById('stat-settled');
const statGasEl = document.getElementById('stat-gas');

const agentCountTop = document.getElementById('agent-count-top');
const jobCountTop = document.getElementById('job-count-top');
const nearSettledTop = document.getElementById('near-settled-top');

const subaccountsTbody = document.getElementById('subaccounts-tbody');
const receiptInput = document.getElementById('receipt-input');
const inspectorOutput = document.getElementById('inspector-output');
const verifyBtn = document.getElementById('verify-btn');
const triggerBtn = document.getElementById('trigger-btn');
const clearFeedBtn = document.getElementById('clear-feed-btn');
const clockEl = document.getElementById('clock');

// Clock updater
setInterval(() => {
  const now = new Date();
  clockEl.textContent = now.toTimeString().split(' ')[0] + ' UTC';
}, 1000);

function appendFeed(typeClass, msg) {
  const entry = document.createElement('div');
  entry.className = `feed-entry ${typeClass}`;

  const time = document.createElement('span');
  time.className = 'timestamp';
  const now = new Date();
  time.textContent = `[${now.toISOString().slice(11, 19)}]`;

  const msgSpan = document.createElement('span');
  msgSpan.className = 'msg';
  msgSpan.innerHTML = msg;

  entry.appendChild(time);
  entry.appendChild(msgSpan);
  feedEl.appendChild(entry);

  // Auto-scroll
  feedEl.scrollTop = feedEl.scrollHeight;

  // Limit feed to last 200 items to avoid DOM lag
  while (feedEl.children.length > 250) {
    feedEl.removeChild(feedEl.firstChild);
  }
}

async function loadInitialState() {
  try {
    const res = await fetch('/api/state');
    const data = await res.json();

    updateMetrics(data.stats);

    if (data.roots && data.roots.length > 0) {
      const latestRoot = data.roots[data.roots.length - 1];
      rootDisplayEl.textContent = latestRoot.root;
      leavesDisplayEl.textContent = latestRoot.leaf_count;
      blockDisplayEl.textContent = latestRoot.block_height.toLocaleString();
    }

    if (data.subAccounts) {
      subaccountsTbody.innerHTML = '';
      for (const acc of data.subAccounts) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="highlight">${acc.account_id}</td>
          <td>${acc.role}</td>
          <td>job_board (scoped 250 TGas)</td>
        `;
        subaccountsTbody.appendChild(tr);
      }
    }

    if (data.latest_receipts && data.latest_receipts.length > 0) {
      receiptInput.value = data.latest_receipts[0].receipt_id;
    }
  } catch (err) {
    console.error('Failed to load initial state:', err);
  }
}

function updateMetrics(stats) {
  if (!stats) return;
  statClearedEl.textContent = stats.total_jobs_cleared;
  statDisputesEl.textContent = stats.total_jobs_disputed;
  statSettledEl.textContent = stats.total_near_settled;
  statGasEl.textContent = (stats.total_gas_burnt_tgas || 0).toFixed(1);

  if (agentCountTop) agentCountTop.textContent = stats.active_agents_count || 8;
  if (jobCountTop) jobCountTop.textContent = stats.total_jobs_cleared || 0;
  if (nearSettledTop) nearSettledTop.textContent = stats.total_near_settled || '0.00';
}

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
    appendFeed('system-line', '<span style="color:#888">[WARN] Live stream reconnecting...</span>');
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
        `BID COMMIT <em>${payload.worker}</em> → ${payload.job_id} (hash: ${payload.bid_hash.slice(0, 8)}...)`
      );
      break;

    case 'BID_REVEALED':
      appendFeed(
        'bid-line',
        `BID REVEAL <em>${payload.worker}</em> → ${payload.job_id} · Price: ${formatNear(payload.price)}`
      );
      break;

    case 'JOB_AWARDED':
      appendFeed(
        'award-line',
        `AWARD <strong>${payload.employer}</strong> → <em>${payload.worker}</em> for ${payload.job_id} · ${formatNear(payload.price)}`
      );
      break;

    case 'WORK_DELIVERED':
      appendFeed(
        'deliver-line',
        `DELIVER <em>${payload.worker}</em> completed ${payload.job_id} · Result Digest: ${payload.result_digest.slice(0, 12)}...`
      );
      break;

    case 'SETTLED_INTENT':
      appendFeed(
        'settle-line',
        `INTENT SETTLED ${payload.job_id} via NEAR Intents (${payload.tx_hash.slice(0, 16)}...) · Payout: ${formatNear(payload.payout)} [${payload.rate}]`
      );
      // Reload stats after settlement
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
        `★ DAILY MERKLE ROOT PUBLISHED ON-CHAIN: ${payload.root.slice(0, 16)}... (${payload.leaf_count} leaves)`
      );
      rootDisplayEl.textContent = payload.root;
      leavesDisplayEl.textContent = payload.leaf_count;
      blockDisplayEl.textContent = payload.block_height.toLocaleString();
      break;
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

// Verification button handler
verifyBtn.addEventListener('click', async () => {
  const receiptId = receiptInput.value.trim();
  if (!receiptId) return;

  inspectorOutput.textContent = `Querying on-chain proof for ${receiptId}...`;

  try {
    const res = await fetch(`/api/verify/${receiptId}`);
    if (!res.ok) {
      inspectorOutput.textContent = `Receipt not found on-chain.`;
      return;
    }

    const { receipt, proof, valid } = await res.json();
    let text = `RECEIPT VERIFICATION REPORT\n`;
    text += `Receipt ID:     ${receipt.receipt_id}\n`;
    text += `Job ID:         ${receipt.job_id}\n`;
    text += `Parties:        ${receipt.employer} ↔ ${receipt.worker}\n`;
    text += `Outcome:        ${receipt.outcome}\n`;
    text += `Price Settled:  ${formatNear(receipt.price_yoctonear)}\n`;
    text += `Settlement TX:  ${receipt.settlement_tx}\n`;
    if (receipt.settlement_tx && receipt.settlement_tx.length > 30 && !receipt.settlement_tx.startsWith('tx_intent')) {
      text += `Explorer:       https://testnet.nearblocks.io/txns/${receipt.settlement_tx}\n`;
    }
    text += `Leaf Hash:      ${proof.leaf_hash}\n`;
    text += `Proof Depth:    ${proof.path.length} steps\n`;
    text += `Computed Root:  ${proof.root}\n`;
    text += `\nVerification Status: ${valid ? '✓✓✓ CRYPTOGRAPHICALLY VALID & INCLUDED ON-CHAIN ✓✓✓' : '✗ FAILED'}\n`;

    inspectorOutput.textContent = text;
  } catch (err) {
    inspectorOutput.textContent = `Error: ${err.message}`;
  }
});

// Trigger Live Batch button
triggerBtn.addEventListener('click', async () => {
  triggerBtn.disabled = true;
  triggerBtn.textContent = '⏳ RUNNING SWARM...';
  try {
    await fetch('/api/trigger_batch', { method: 'POST' });
  } finally {
    setTimeout(() => {
      triggerBtn.disabled = false;
      triggerBtn.textContent = '▶ TRIGGER LIVE BATCH';
    }, 1500);
  }
});

// Clear feed button
clearFeedBtn.addEventListener('click', () => {
  feedEl.innerHTML = '';
});

// Initialize on boot
loadInitialState();
initEventStream();
