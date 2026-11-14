// The Clearing House — Fully Functional Devin-Style Swarm Workbench Logic

// Element references
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
const jobsTableBody = document.getElementById('jobs-table-body');
const disputesTbody = document.getElementById('disputes-tbody');
const boardTotalCount = document.getElementById('board-total-count');

// Sidebar toggle
const sidebarEl = document.getElementById('sidebar');
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
if (sidebarToggleBtn && sidebarEl) {
  sidebarToggleBtn.addEventListener('click', () => {
    sidebarEl.classList.toggle('collapsed');
  });
}

// =========================================================================
// DYNAMIC API BASE ROUTING (Supports Vercel -> Render Cross-Deployment)
// =========================================================================
let customApiUrl = localStorage.getItem('ch_custom_api_url') || '';
function apiUrl(path) {
  if (customApiUrl) {
    const base = customApiUrl.replace(/\/$/, '');
    return `${base}${path}`;
  }
  return path;
}

// Update static export link
const exportBtn = document.getElementById('export-btn');
if (exportBtn) {
  exportBtn.href = apiUrl('/api/export');
}

// =========================================================================
// AUTHENTICATION & LOGIN (Managed by C# General Backend)
// =========================================================================
const authModal = document.getElementById('auth-modal');
const closeAuthBtn = document.getElementById('close-auth-btn');
const authDoneBtn = document.getElementById('auth-done-btn');
const globalAuthPill = document.getElementById('global-auth-pill');
const globalAuthLabel = document.getElementById('global-auth-label');
const authQuickAccountsList = document.getElementById('auth-quick-accounts-list');
const customAccountInput = document.getElementById('custom-account-input');
const customLoginBtn = document.getElementById('custom-login-btn');
const authLogoutBtn = document.getElementById('auth-logout-btn');
const authLoggedInBox = document.getElementById('auth-logged-in-box');
const authAccountIdLabel = document.getElementById('auth-account-id-label');
const authRoleBalanceLabel = document.getElementById('auth-role-balance-label');
const orgAvatar = document.querySelector('.org-avatar');

let currentSessionToken = localStorage.getItem('ch_session_token') || null;
let currentUserSession = null;

function openAuthModal() {
  if (!authModal) return;
  authModal.style.display = 'flex';
  loadAuthAccounts();
}

function closeAuthModal() {
  if (!authModal) return;
  authModal.style.display = 'none';
}

if (closeAuthBtn) closeAuthBtn.addEventListener('click', closeAuthModal);
if (authDoneBtn) authDoneBtn.addEventListener('click', closeAuthModal);
if (globalAuthPill) globalAuthPill.addEventListener('click', openAuthModal);

// Organization / User Profile Selector in Sidebar Header
const orgSelector = document.getElementById('org-selector');
const currentOrgName = document.getElementById('current-org-name');

if (orgSelector) {
  orgSelector.addEventListener('click', (e) => {
    e.stopPropagation();
    openAuthModal();
  });
}

function updateAuthUI(user) {
  if (user) {
    if (currentOrgName) currentOrgName.textContent = user.display_name || user.account_id.split('.')[0];
    if (orgAvatar) orgAvatar.textContent = user.avatar || 'U';
    if (globalAuthLabel) globalAuthLabel.textContent = `${user.display_name} (${user.balance_near} NEAR)`;
    if (authLoggedInBox) authLoggedInBox.style.display = 'block';
    if (authAccountIdLabel) authAccountIdLabel.textContent = user.account_id;
    if (authRoleBalanceLabel) {
      authRoleBalanceLabel.textContent = `Role: ${user.role.toUpperCase()} · Balance: ${user.balance_near} NEAR · Public Key: ${user.public_key.slice(0, 20)}...`;
    }
  } else {
    if (currentOrgName) currentOrgName.textContent = 'Sign In';
    if (orgAvatar) orgAvatar.textContent = '?';
    if (globalAuthLabel) globalAuthLabel.textContent = 'Sign In / Connect';
    if (authLoggedInBox) authLoggedInBox.style.display = 'none';
  }
}

async function loadAuthAccounts() {
  if (!authQuickAccountsList) return;
  try {
    const res = await fetch(apiUrl('/api/auth/accounts'));
    if (!res.ok) return;
    const { accounts } = await res.json();

    authQuickAccountsList.innerHTML = '';
    for (const acc of accounts) {
      const isCurrent = currentUserSession && currentUserSession.account_id === acc.account_id;
      const btn = document.createElement('div');
      btn.className = `auth-quick-account-btn ${isCurrent ? 'active' : ''}`;
      btn.innerHTML = `
        <div class="auth-account-info-left">
          <div class="auth-avatar-circle">${acc.avatar || 'U'}</div>
          <div>
            <div class="auth-title-bold">${acc.display_name}</div>
            <div class="auth-sub-meta">${acc.account_id} · <span style="color:#0560af; font-weight:600;">${acc.balance_near} NEAR</span></div>
          </div>
        </div>
        <div>
          ${isCurrent ? '<span style="color:#10b981; font-weight:700; font-size:11px;">✓ ACTIVE</span>' : '<span style="color:#0560af; font-weight:600; font-size:11px;">Switch &rarr;</span>'}
        </div>
      `;
      btn.addEventListener('click', () => {
        loginAs(acc.account_id);
      });
      authQuickAccountsList.appendChild(btn);
    }
  } catch (err) {
    console.error('Failed to load auth accounts:', err);
  }
}

async function loginAs(accountId, notify = true) {
  try {
    const res = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId }),
    });

    if (!res.ok) return;
    const data = await res.json();

    if (data.success && data.token && data.user) {
      currentSessionToken = data.token;
      currentUserSession = data.user;
      localStorage.setItem('ch_session_token', data.token);
      updateAuthUI(data.user);

      if (notify) {
        appendFeed(
          'settle-line',
          `[AUTH] Authenticated as <strong>${data.user.account_id}</strong> (${data.user.balance_near} NEAR) via C# General Backend`
        );
      }
      closeAuthModal();
    }
  } catch (err) {
    console.error('Login failed:', err);
  }
}

async function logoutAuth() {
  if (currentSessionToken) {
    try {
      await fetch(apiUrl('/api/auth/logout'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentSessionToken}` },
      });
    } catch {}
  }

  currentSessionToken = null;
  currentUserSession = null;
  localStorage.removeItem('ch_session_token');
  updateAuthUI(null);
  appendFeed('task-line', '[AUTH] Logged out of active NEAR session.');
  loadAuthAccounts();
}

if (authLogoutBtn) {
  authLogoutBtn.addEventListener('click', logoutAuth);
}

if (customLoginBtn && customAccountInput) {
  customLoginBtn.addEventListener('click', () => {
    const customAcc = customAccountInput.value.trim();
    if (customAcc) {
      loginAs(customAcc, true);
      customAccountInput.value = '';
    }
  });
}

async function checkAuthStatus() {
  if (currentSessionToken) {
    try {
      const res = await fetch(apiUrl('/api/auth/me'), {
        headers: { Authorization: `Bearer ${currentSessionToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          currentUserSession = data.user;
          updateAuthUI(data.user);
          return;
        }
      }
    } catch (err) {
      console.warn('Session verification error:', err);
    }
  }

  // Auto-connect with default Employer account for zero-friction experience
  await loginAs('employer1.clearing-house-swarm-01.testnet', false);
}

// Agent Role Selector Dropdown
const agentSelectorPill = document.getElementById('agent-selector-pill');
const agentRoleDropdown = document.getElementById('agent-role-dropdown');
const selectedAgentLabel = document.getElementById('selected-agent-label');
let currentSelectedAgentRole = 'swarm';

if (agentSelectorPill && agentRoleDropdown) {
  agentSelectorPill.addEventListener('click', (e) => {
    e.stopPropagation();
    agentRoleDropdown.style.display = agentRoleDropdown.style.display === 'none' ? 'flex' : 'none';
  });

  document.querySelectorAll('.role-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.role-option').forEach((o) => o.classList.remove('active'));
      opt.classList.add('active');
      const role = opt.getAttribute('data-role');
      currentSelectedAgentRole = role;
      const title = opt.querySelector('strong').textContent.split(' ')[1];
      selectedAgentLabel.textContent = title;
      agentRoleDropdown.style.display = 'none';
    });
  });
}

// Auction Parameters Popover
const auctionParamsBtn = document.getElementById('auction-params-btn');
const paramsPopover = document.getElementById('params-popover');
if (auctionParamsBtn && paramsPopover) {
  auctionParamsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    paramsPopover.style.display = paramsPopover.style.display === 'none' ? 'flex' : 'none';
  });
}

// Close open popovers when clicking outside
document.addEventListener('click', () => {
  if (orgDropdown) orgDropdown.style.display = 'none';
  if (agentRoleDropdown) agentRoleDropdown.style.display = 'none';
  if (paramsPopover) paramsPopover.style.display = 'none';
});

// Task Spec Preset Button
const attachSpecBtn = document.getElementById('attach-spec-btn');
const samplePresets = [
  'Audit smart contract reentrancy guard and storage mutation callbacks for Track 05 AI Swarms',
  'Formally verify NEP-413 intent message nonce ordering and solver swap settlement invariants',
  'Execute RFC 6962 leaf collision test vector assertions across odd and even binary Merkle trees',
  'Profile gas consumption for daily Merkle root publish transactions on NEAR testnet',
];
let presetIndex = 0;
if (attachSpecBtn && missionPromptEl) {
  attachSpecBtn.addEventListener('click', () => {
    missionPromptEl.value = samplePresets[presetIndex % samplePresets.length];
    presetIndex++;
    missionPromptEl.focus();
  });
}

// Voice Microphone Simulation
const micBtn = document.getElementById('mic-btn');
if (micBtn && missionPromptEl) {
  micBtn.addEventListener('click', () => {
    micBtn.style.color = '#ef4444';
    missionPromptEl.placeholder = 'Listening for speech input...';
    setTimeout(() => {
      missionPromptEl.value = 'Security audit: Verify function-call key scoping and allowance limits';
      micBtn.style.color = '';
      missionPromptEl.placeholder = 'Ask The Clearing House swarm to audit contracts, benchmark solvers, or clear tasks...';
    }, 1000);
  });
}

// Search Modal (Ctrl+K)
const searchModal = document.getElementById('search-modal');
const searchTrigger = document.getElementById('search-modal-trigger');
const closeSearchBtn = document.getElementById('close-search-btn');
const globalSearchInput = document.getElementById('global-search-input');
const searchResultsList = document.getElementById('search-results-list');

function openSearch() {
  if (!searchModal) return;
  searchModal.style.display = 'flex';
  globalSearchInput.focus();
  renderSearchResults('');
}

function closeSearch() {
  if (!searchModal) return;
  searchModal.style.display = 'none';
  globalSearchInput.value = '';
}

if (searchTrigger) searchTrigger.addEventListener('click', openSearch);
if (closeSearchBtn) closeSearchBtn.addEventListener('click', closeSearch);

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    openSearch();
  }
  if (e.key === 'Escape') {
    closeSearch();
    closeSettings();
    closeHelp();
  }
});

let cachedTasks = [];
let cachedReceipts = [];

function renderSearchResults(query) {
  if (!searchResultsList) return;
  const q = query.toLowerCase().trim();
  searchResultsList.innerHTML = '';

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

  const filtered = searchable.filter(
    (item) => item.id.toLowerCase().includes(q) || item.title.toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    searchResultsList.innerHTML = '<div style="padding:12px; color:#9ca3af; font-size:12px;">No matching items found.</div>';
    return;
  }

  for (const item of filtered) {
    const div = document.createElement('div');
    div.className = 'search-result-item';
    div.innerHTML = `
      <div class="search-result-left">
        <span class="search-result-type">${item.type}</span>
        <strong>${item.id}</strong> · <span style="color:#6b7280">${item.title}</span>
      </div>
      <span style="font-size:11px; color:#9ca3af">${item.meta}</span>
    `;
    div.addEventListener('click', () => {
      closeSearch();
      if (item.type === 'Receipt') {
        if (receiptInput) receiptInput.value = item.id;
        switchTab('proofs');
        verifyReceipt(item.id);
      } else if (item.type === 'Task') {
        switchTab('board');
      } else {
        switchTab('subaccounts');
      }
    });
    searchResultsList.appendChild(div);
  }
}

if (globalSearchInput) {
  globalSearchInput.addEventListener('input', (e) => {
    renderSearchResults(e.target.value);
  });
}

// Settings Modal
const settingsModal = document.getElementById('settings-modal');
const settingsBtn = document.getElementById('settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingApiUrl = document.getElementById('setting-api-url');

function openSettings() {
  if (settingsModal) settingsModal.style.display = 'flex';
  if (settingApiUrl) settingApiUrl.value = customApiUrl;
}
function closeSettings() {
  if (settingsModal) settingsModal.style.display = 'none';
}

if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettings);
if (saveSettingsBtn) {
  saveSettingsBtn.addEventListener('click', () => {
    if (settingApiUrl) {
      customApiUrl = settingApiUrl.value.trim();
      if (customApiUrl) {
        localStorage.setItem('ch_custom_api_url', customApiUrl);
      } else {
        localStorage.removeItem('ch_custom_api_url');
      }
      if (exportBtn) exportBtn.href = apiUrl('/api/export');
    }
    closeSettings();
    appendFeed('task-line', `Configuration saved${customApiUrl ? ': API URL -> ' + customApiUrl : ''}.`);
    loadInitialState();
  });
}

// Help Modal
const helpModal = document.getElementById('help-modal');
const helpBtn = document.getElementById('help-btn');
const closeHelpBtn = document.getElementById('close-help-btn');

function openHelp() {
  if (helpModal) helpModal.style.display = 'flex';
}
function closeHelp() {
  if (helpModal) helpModal.style.display = 'none';
}

if (helpBtn) helpBtn.addEventListener('click', openHelp);
if (closeHelpBtn) closeHelpBtn.addEventListener('click', closeHelp);

// Quick Receipt Chips
document.querySelectorAll('.receipt-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const rcpt = chip.getAttribute('data-rcpt');
    if (rcpt && receiptInput) {
      receiptInput.value = rcpt;
      verifyReceipt(rcpt);
    }
  });
});

// Tab Navigation Logic
function switchTab(tabId) {
  document.querySelectorAll('.nav-item').forEach((item) => {
    if (item.getAttribute('data-tab') === tabId) {
      item.classList.add('active');
    } else if (item.getAttribute('data-tab')) {
      item.classList.remove('active');
    }
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  document.querySelectorAll('.tab-content').forEach((content) => {
    if (content.id === `tab-${tabId}`) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });

  if (tabId === 'board') loadJobBoard();
  if (tabId === 'disputes') loadDisputes();
  if (tabId === 'subaccounts') loadSubAccounts();
}

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

// New Mission Button
const newSessionBtn = document.getElementById('new-session-btn');
if (newSessionBtn && missionPromptEl) {
  newSessionBtn.addEventListener('click', () => {
    switchTab('stream');
    missionPromptEl.value = '';
    missionPromptEl.focus();
  });
}

// Clear Feed Button
const clearFeedBtn = document.getElementById('clear-feed-btn');
if (clearFeedBtn && feedEl) {
  clearFeedBtn.addEventListener('click', () => {
    feedEl.innerHTML = '<div class="feed-line">[CLEAR] Feed cleared. Listening for next event...</div>';
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

// Load Initial State
async function loadInitialState() {
  try {
    const res = await fetch(apiUrl('/api/state'));
    if (!res.ok) return;
    const data = await res.json();

    if (data.roots && data.roots.length > 0) {
      const latestRoot = data.roots[data.roots.length - 1];
      if (rootDisplayEl) rootDisplayEl.textContent = latestRoot.root;
      if (leavesDisplayEl) leavesDisplayEl.textContent = latestRoot.leaf_count;
      if (blockDisplayEl) blockDisplayEl.textContent = (latestRoot.block_height || 277076322).toLocaleString();
    }

    if (data.subAccounts && subaccountsTbody) {
      renderSubAccounts(data.subAccounts);
    }

    if (data.latest_receipts && data.latest_receipts.length > 0 && receiptInput) {
      receiptInput.value = data.latest_receipts[0].receipt_id;
    }
  } catch (err) {
    console.error('Failed to load initial state:', err);
  }
}

// Sub-Accounts Renderer
function renderSubAccounts(accounts) {
  if (!subaccountsTbody) return;
  subaccountsTbody.innerHTML = '';
  for (const acc of accounts) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="subaccount-id">${acc.account_id}</td>
      <td><span class="role-badge">${acc.role}</span></td>
      <td>job_board (post_task, bid, settle)</td>
      <td>0.25 NEAR (250 TGas)</td>
      <td><a href="https://testnet.nearblocks.io/address/${acc.account_id}" target="_blank" style="color:var(--brand-blue); text-decoration:none;">View &nearr;</a></td>
    `;
    subaccountsTbody.appendChild(tr);
  }
}

async function loadSubAccounts() {
  try {
    const res = await fetch(apiUrl('/api/state'));
    const data = await res.json();
    if (data.subAccounts) renderSubAccounts(data.subAccounts);
  } catch (err) {
    console.error(err);
  }
}

// Job Board Loader
async function loadJobBoard(statusFilter = 'all') {
  if (!jobsTableBody) return;
  try {
    const res = await fetch(apiUrl('/api/tasks'));
    const data = await res.json();
    let tasks = data.tasks || [];

    // Fallback tasks if daemon is fresh
    if (tasks.length === 0) {
      tasks = [
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
      ];
    }

    if (statusFilter !== 'all') {
      tasks = tasks.filter((t) => t.status === statusFilter);
    }

    if (boardTotalCount) boardTotalCount.textContent = `${tasks.length} Jobs`;

    jobsTableBody.innerHTML = '';
    for (const t of tasks) {
      const tr = document.createElement('tr');
      const statusColor = t.status === 'CLEARED' ? 'green' : t.status === 'DELIVERED' ? 'blue' : 'amber';
      tr.innerHTML = `
        <td class="subaccount-id">${t.job_id}</td>
        <td><strong>${t.title || 'Subtask'}</strong></td>
        <td>${t.employer || 'employer1'}</td>
        <td>${t.selected_worker || '<em style="color:#9ca3af">Bidding in progress</em>'}</td>
        <td>${formatNear(t.awarded_price_yoctonear || t.max_budget_yoctonear)}</td>
        <td><span class="status-dot ${statusColor}" style="display:inline-block; vertical-align:middle; margin-right:4px;"></span>${t.status}</td>
      `;
      jobsTableBody.appendChild(tr);
    }
  } catch (err) {
    console.error('Failed to load job board:', err);
  }
}

// Filter pills on Job Board
document.querySelectorAll('.filter-pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    const filter = pill.getAttribute('data-filter');
    loadJobBoard(filter);
  });
});

// Disputes Loader
async function loadDisputes() {
  if (!disputesTbody) return;
  try {
    const res = await fetch(apiUrl('/api/disputes'));
    const data = await res.json();
    const disputes = data.disputes || [];

    disputesTbody.innerHTML = '';
    for (const d of disputes) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="subaccount-id">${d.receipt_id}</td>
        <td><strong>${d.job_id}</strong></td>
        <td><span class="role-badge" style="color:#ef4444">${d.worker}</span></td>
        <td>${d.reason}</td>
        <td><span style="color:#10b981; font-weight:600;">✓ Escrow Retained</span></td>
      `;
      disputesTbody.appendChild(tr);
    }
  } catch (err) {
    console.error('Failed to load disputes:', err);
  }
}

// SSE Live Stream Listener
function initEventStream() {
  const eventSource = new EventSource(apiUrl('/api/stream'));

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
  const receiptId = targetReceiptId || (receiptInput ? receiptInput.value.trim() : '');
  if (!receiptId || !inspectorOutput) return;

  inspectorOutput.textContent = `Querying RFC 6962 inclusion proof for ${receiptId}...`;

  try {
    const res = await fetch(apiUrl(`/api/verify/${receiptId}`));
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

// Interactive Custom Mission Dispatch
async function triggerMissionDispatch() {
  const prompt = missionPromptEl ? missionPromptEl.value.trim() : '';
  if (!prompt) {
    if (missionPromptEl) {
      missionPromptEl.placeholder = 'Please enter a task description first (or click + to insert a preset)...';
      missionPromptEl.focus();
    }
    return;
  }

  const budgetInput = document.getElementById('budget-input');
  const budgetNear = budgetInput ? parseFloat(budgetInput.value) || 0.05 : 0.05;

  if (submitMissionBtn) {
    submitMissionBtn.disabled = true;
    submitMissionBtn.innerHTML = '<span style="font-size:11px">...</span>';
  }

  appendFeed('task-line', `<strong>DISPATCHING MISSION:</strong> "${prompt}" (Budget: ${budgetNear} NEAR)...`);
  if (missionPromptEl) missionPromptEl.value = '';

  try {
    const authHeaders = {
      'Content-Type': 'application/json',
      ...(currentSessionToken ? { Authorization: `Bearer ${currentSessionToken}` } : {}),
    };

    const res = await fetch(apiUrl('/api/post_task'), {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        prompt,
        title: prompt.slice(0, 45),
        budget_near: budgetNear,
        employer_id: currentSelectedAgentRole !== 'swarm' ? currentSelectedAgentRole : (currentUserSession?.account_id || undefined),
      }),
    });

    const data = await res.json();
    if (data.success && data.result) {
      appendFeed(
        'settle-line',
        `★ MISSION COMPLETE: <strong>${data.result.task_id}</strong> [${data.result.status}]`
      );
      if (data.result.receipt && receiptInput) {
        receiptInput.value = data.result.receipt.receipt_id;
      }
      loadInitialState();
    }
  } catch (err) {
    console.error('Mission failed:', err);
    appendFeed('dispute-line', `✗ Mission dispatch failed: ${err.message}`);
  } finally {
    if (submitMissionBtn) {
      submitMissionBtn.disabled = false;
      submitMissionBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="19" x2="12" y2="5"></line>
          <polyline points="5 12 12 5 19 12"></polyline>
        </svg>
      `;
    }
  }
}

if (submitMissionBtn) {
  submitMissionBtn.addEventListener('click', triggerMissionDispatch);
}

if (missionPromptEl) {
  missionPromptEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      triggerMissionDispatch();
    }
  });
}

// Trigger Batch Button
if (triggerBatchBtn) {
  triggerBatchBtn.addEventListener('click', async () => {
    triggerBatchBtn.disabled = true;
    triggerBatchBtn.textContent = '⏳ Swarm Executing Batch...';
    try {
      await fetch(apiUrl('/api/trigger_batch'), { method: 'POST' });
    } finally {
      setTimeout(() => {
        triggerBatchBtn.disabled = false;
        triggerBatchBtn.textContent = '▶ Trigger Swarm Batch';
      }, 1500);
    }
  });
}

// Checklist Step Interactivity
document.querySelectorAll('.checklist-item').forEach((item, index) => {
  item.style.cursor = 'pointer';
  item.addEventListener('click', () => {
    const steps = [
      () => switchTab('subaccounts'),
      () => window.open('https://testnet.nearblocks.io/address/job-board.clearing-house-swarm-01.testnet', '_blank'),
      () => switchTab('board'),
      () => switchTab('stream'),
      () => switchTab('proofs'),
    ];
    if (steps[index]) steps[index]();
  });
});

// Boot up
checkAuthStatus();
loadInitialState();
initEventStream();
