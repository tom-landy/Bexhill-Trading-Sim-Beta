const teamId = window.location.pathname.split('/').pop();

const teamLoginEl = document.getElementById('teamLogin');
const teamPanelEl = document.getElementById('teamPanel');
const teamLoginForm = document.getElementById('teamLoginForm');
const teamPinInput = document.getElementById('teamPinInput');
const teamLoginError = document.getElementById('teamLoginError');

const teamNameEl = document.getElementById('teamName');
const teamRoundEl = document.getElementById('teamRound');
const teamBalanceEl = document.getElementById('teamBalance');
const teamAssetsEl = document.getElementById('teamAssets');
const teamRequestsList = document.getElementById('teamRequestsList');

const teamTxForm = document.getElementById('teamTxForm');
const teamActionEl = document.getElementById('teamAction');
const teamAmountEl = document.getElementById('teamAmount');
const teamNoteEl = document.getElementById('teamNote');
const teamStatusEl = document.getElementById('teamStatus');
const teamLogoutBtn = document.getElementById('teamLogoutBtn');

let teamPin = sessionStorage.getItem(`team-pin-${teamId}`) || '';
const socket = io();

function formatMoney(value) {
  return `£${Number(value || 0).toLocaleString()}`;
}

function setLoggedIn(loggedIn) {
  teamLoginEl.classList.toggle('hidden', loggedIn);
  teamPanelEl.classList.toggle('hidden', !loggedIn);
}

function renderTeam(team) {
  teamNameEl.textContent = team.name;
  teamRoundEl.textContent = team.meta.roundLabel;
  teamBalanceEl.textContent = formatMoney(team.bankBalance);
  teamAssetsEl.textContent = `Shapes traded: ${team.assets.shapesTraded} | Accepted: ${team.assets.accepted} | Rejected: ${team.assets.rejected}`;
  teamRequestsList.innerHTML = '';
  const requests = Array.isArray(team.requests) ? team.requests : [];
  if (!requests.length) {
    teamRequestsList.innerHTML = '<article class=\"list-item\"><div class=\"list-sub\">No requests yet</div></article>';
    return;
  }

  requests.forEach((request) => {
    const card = document.createElement('article');
    card.className = 'list-item';
    const status = String(request.status || '').toUpperCase();
    card.innerHTML = `
      <div class=\"list-head\">
        <strong>${request.action.toUpperCase()} ${formatMoney(request.amount)}</strong>
        <span>${status}</span>
      </div>
      <div class=\"list-sub\">Requested: ${request.requestedAt ? new Date(request.requestedAt).toLocaleTimeString() : ''}</div>
    `;
    teamRequestsList.appendChild(card);
  });
}

async function login(pin) {
  const response = await fetch('/api/team/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamId, pin })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Login failed');
  }
  return data.team;
}

async function fetchTeamState() {
  const response = await fetch(`/api/team/${teamId}/state`, {
    headers: {
      'x-team-id': teamId,
      'x-team-pin': teamPin
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Unable to load team state');
  }
  return data.team;
}

async function submitTransaction(action, amount, note) {
  const response = await fetch(`/api/team/${teamId}/transaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-team-id': teamId,
      'x-team-pin': teamPin
    },
    body: JSON.stringify({ action, amount, note })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Transaction failed');
  }
  return data.team;
}

teamLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  teamLoginError.textContent = '';
  try {
    const pin = teamPinInput.value.trim();
    const team = await login(pin);
    teamPin = pin;
    sessionStorage.setItem(`team-pin-${teamId}`, pin);
    renderTeam(team);
    setLoggedIn(true);
  } catch (error) {
    teamLoginError.textContent = error.message;
  }
});

teamTxForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const action = teamActionEl.value;
    const amount = Number(teamAmountEl.value);
    const note = teamNoteEl.value;
    const team = await submitTransaction(action, amount, note);
    renderTeam(team);
    teamNoteEl.value = '';
    teamStatusEl.textContent = `${action === 'deposit' ? 'Deposit' : 'Withdrawal'} request submitted for banker approval`;
  } catch (error) {
    teamStatusEl.textContent = error.message;
  }
});

teamLogoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem(`team-pin-${teamId}`);
  window.location.href = '/countries';
});

if (teamPin) {
  fetchTeamState()
    .then((team) => {
      renderTeam(team);
      setLoggedIn(true);
    })
    .catch(() => {
      sessionStorage.removeItem(`team-pin-${teamId}`);
      teamPin = '';
      setLoggedIn(false);
    });
} else {
  setLoggedIn(false);
}

socket.on('team:update', () => {
  if (!teamPin) return;
  fetchTeamState()
    .then((team) => {
      renderTeam(team);
    })
    .catch(() => {});
});
