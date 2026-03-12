const bankerLoginPanel = document.getElementById('bankerLoginPanel');
const bankerPanel = document.getElementById('bankerPanel');
const bankerLoginForm = document.getElementById('bankerLoginForm');
const bankerPasswordInput = document.getElementById('bankerPasswordInput');
const bankerLoginError = document.getElementById('bankerLoginError');

const bankerPendingList = document.getElementById('bankerPendingList');
const bankerRecentList = document.getElementById('bankerRecentList');
const bankerRefreshBtn = document.getElementById('bankerRefreshBtn');
const bankerLogoutBtn = document.getElementById('bankerLogoutBtn');

let bankerKey = sessionStorage.getItem('banker-key') || '';
const socket = io();

function setLoggedIn(loggedIn) {
  bankerLoginPanel.classList.toggle('hidden', loggedIn);
  bankerPanel.classList.toggle('hidden', !loggedIn);
}

function formatMoney(value) {
  return `£${Number(value || 0).toLocaleString()}`;
}

async function fetchBankerState() {
  const response = await fetch('/api/banker/state', {
    headers: { ...(bankerKey ? { 'x-banker-key': bankerKey } : {}) }
  });
  if (response.status === 401) {
    throw new Error('Unauthorized');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Failed to load state');
  return data;
}

function render(state) {
  bankerPendingList.innerHTML = '';
  if (!state.pending.length) {
    bankerPendingList.innerHTML = '<article class="list-item"><div class="list-sub">No pending requests</div></article>';
  }

  state.pending.forEach((request) => {
    const card = document.createElement('article');
    card.className = 'list-item';
    card.innerHTML = `
      <div class="list-head">
        <strong>${request.teamName}</strong>
        <span>${request.action.toUpperCase()} ${formatMoney(request.amount)}</span>
      </div>
      <div class="list-sub">Requested: ${new Date(request.requestedAt).toLocaleTimeString()} ${request.note ? `| Note: ${request.note}` : ''}</div>
      <div class="inline-actions wrap" style="margin-top:8px;">
        <button data-action="approve" data-id="${request.id}" class="success">Approve</button>
        <button data-action="reject" data-id="${request.id}" class="danger">Reject</button>
      </div>
    `;
    bankerPendingList.appendChild(card);
  });

  bankerRecentList.innerHTML = '';
  state.recent.forEach((request) => {
    const card = document.createElement('article');
    card.className = 'list-item';
    card.innerHTML = `
      <div class="list-head">
        <strong>${request.teamName}</strong>
        <span>${request.status.toUpperCase()}</span>
      </div>
      <div class="list-sub">${request.action.toUpperCase()} ${formatMoney(request.amount)} | ${request.decidedAt ? new Date(request.decidedAt).toLocaleTimeString() : ''}</div>
    `;
    bankerRecentList.appendChild(card);
  });
}

async function refresh() {
  const state = await fetchBankerState();
  render(state);
}

bankerLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  bankerLoginError.textContent = '';
  try {
    const candidate = bankerPasswordInput.value.trim();
    const loginResponse = await fetch('/api/banker/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: candidate })
    });
    const loginData = await loginResponse.json().catch(() => ({}));
    if (!loginResponse.ok) {
      throw new Error(loginData.error || 'Invalid password');
    }

    bankerKey = candidate;
    sessionStorage.setItem('banker-key', bankerKey);
    setLoggedIn(true);
    await refresh();
  } catch (error) {
    bankerLoginError.textContent = error.message;
  }
});

bankerPendingList.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.getAttribute('data-action');
  const id = target.getAttribute('data-id');
  if (!action || !id) return;

  try {
    if (action === 'approve') {
      await fetch(`/api/banker/requests/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(bankerKey ? { 'x-banker-key': bankerKey } : {}) }
      }).then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Approve failed');
      });
    }

    if (action === 'reject') {
      const reason = window.prompt('Optional rejection reason', '');
      if (reason === null) return;
      await fetch(`/api/banker/requests/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(bankerKey ? { 'x-banker-key': bankerKey } : {}) },
        body: JSON.stringify({ reason })
      }).then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Reject failed');
      });
    }

    await refresh();
  } catch (error) {
    window.alert(error.message);
  }
});

bankerRefreshBtn.addEventListener('click', () => {
  refresh().catch((error) => window.alert(error.message));
});

bankerLogoutBtn.addEventListener('click', () => {
  bankerKey = '';
  sessionStorage.removeItem('banker-key');
  setLoggedIn(false);
});

if (bankerKey) {
  setLoggedIn(true);
  refresh().catch(() => {
    bankerKey = '';
    sessionStorage.removeItem('banker-key');
    setLoggedIn(false);
  });
} else {
  setLoggedIn(false);
}

socket.on('banker:update', () => {
  if (!bankerKey) return;
  refresh().catch(() => {});
});
