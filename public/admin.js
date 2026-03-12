const loginPanel = document.getElementById('loginPanel');
const adminPanel = document.getElementById('adminPanel');
const loginForm = document.getElementById('loginForm');
const passwordInput = document.getElementById('passwordInput');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const adminStatus = document.getElementById('adminStatus');

const metaForm = document.getElementById('metaForm');
const titleInput = document.getElementById('titleInput');
const subtitleInput = document.getElementById('subtitleInput');
const announcementInput = document.getElementById('announcementInput');
const pausedInput = document.getElementById('pausedInput');
const roundButtons = document.getElementById('roundButtons');
const activeRoundLabel = document.getElementById('activeRoundLabel');
const prevRoundBtn = document.getElementById('prevRoundBtn');
const nextRoundBtn = document.getElementById('nextRoundBtn');
const roundPricesForm = document.getElementById('roundPricesForm');
const rpSquare = document.getElementById('rp_square');
const rpCircle = document.getElementById('rp_circle');
const rpEquilateral = document.getElementById('rp_equilateral_triangle');
const rpIsosceles = document.getElementById('rp_isosceles_triangle');
const rpSemiCircle = document.getElementById('rp_semi_circle');

const teamForm = document.getElementById('teamForm');
const teamNameInput = document.getElementById('teamNameInput');
const teamFlagInput = document.getElementById('teamFlagInput');
const teamPinInput = document.getElementById('teamPinInput');
const teamImportForm = document.getElementById('teamImportForm');
const teamImportFile = document.getElementById('teamImportFile');
const teamList = document.getElementById('teamList');

const txList = document.getElementById('txList');
const buzzerBtn = document.getElementById('buzzerBtn');
const resumeBtn = document.getElementById('resumeBtn');
const revealWinnerBtn = document.getElementById('revealWinnerBtn');
const hideWinnerBtn = document.getElementById('hideWinnerBtn');
const exportResultsBtn = document.getElementById('exportResultsBtn');
const resetKeepBtn = document.getElementById('resetKeepBtn');
const resetAllBtn = document.getElementById('resetAllBtn');

const socket = io();
let adminKey = sessionStorage.getItem('trading-admin-key') || '';
if (!adminKey) {
  const tempKey = localStorage.getItem('trading-admin-key-temp') || '';
  if (tempKey) {
    adminKey = tempKey;
    sessionStorage.setItem('trading-admin-key', adminKey);
    localStorage.removeItem('trading-admin-key-temp');
  }
}
let latestState = null;
let selectedRound = 1;

function formatMoney(value) {
  return `£${Number(value || 0).toLocaleString()}`;
}

function setStatus(message) {
  adminStatus.textContent = message;
}

function setLoggedIn(value) {
  if (value) {
    loginPanel.classList.add('hidden');
    adminPanel.classList.remove('hidden');
  } else {
    loginPanel.classList.remove('hidden');
    adminPanel.classList.add('hidden');
  }
}

async function api(path, method = 'GET', body) {
  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(adminKey ? { 'x-admin-key': adminKey } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  if (response.status === 401) {
    adminKey = '';
    sessionStorage.removeItem('trading-admin-key');
    setLoggedIn(false);
    throw new Error('Unauthorized');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function render(state) {
  latestState = state;
  titleInput.value = state.meta.title || '';
  subtitleInput.value = state.meta.subtitle || '';
  announcementInput.value = state.meta.announcement || '';
  pausedInput.checked = Boolean(state.meta.paused);
  selectedRound = Number(state.meta.currentRound || selectedRound || 1);
  activeRoundLabel.textContent = `Round ${selectedRound}`;

  const selectedRoundData = (state.rounds || []).find((round) => round.round === selectedRound);
  if (selectedRoundData) {
    rpSquare.value = selectedRoundData.prices.square ?? 0;
    rpCircle.value = selectedRoundData.prices.circle ?? 0;
    rpEquilateral.value = selectedRoundData.prices.equilateral_triangle ?? 0;
    rpIsosceles.value = selectedRoundData.prices.isosceles_triangle ?? 0;
    rpSemiCircle.value = selectedRoundData.prices.semi_circle ?? 0;
  }

  roundButtons.innerHTML = Array.from({ length: 5 }, (_, idx) => {
    const roundNum = idx + 1;
    const activeClass = roundNum === selectedRound ? 'active' : '';
    return `<button type="button" class="round-btn ${activeClass}" data-round="${roundNum}">Round ${roundNum}</button>`;
  }).join('');

  teamList.innerHTML = '';
  state.teams.forEach((team) => {
    const row = document.createElement('article');
    row.className = 'list-item';
    row.innerHTML = `
      <div class="list-head">
        <strong>${team.name}</strong>
        <span>${formatMoney(team.cash)}</span>
      </div>
      <div class="list-sub">PIN: ${team.pin || 'Not set'}</div>
      <div class="inline-actions wrap" style="margin-top:8px;">
        <input data-team-cash-input="${team.id}" type="number" min="0" step="1" value="10" style="max-width:120px;" />
        <button data-action="add-cash" data-id="${team.id}">Add Cash</button>
        <button data-action="edit-team" data-id="${team.id}" class="ghost-button">Edit</button>
        <button data-action="delete-team" data-id="${team.id}" class="danger">Delete</button>
      </div>
    `;
    teamList.appendChild(row);
  });

  txList.innerHTML = '';
  state.transactions.forEach((txn) => {
    const row = document.createElement('article');
    row.className = 'list-item';

    let text = '';
    if (txn.type === 'sale') {
      text = `${txn.teamName} sold ${txn.quantityAccepted} ${txn.shapeName} (rejected ${txn.quantityRejected}) for ${formatMoney(txn.total)}`;
    } else if (txn.type === 'manual_adjustment') {
      text = `${txn.teamName} adjusted by ${formatMoney(txn.amount)} (${txn.note || 'manual'})`;
    } else {
      text = txn.note || txn.type;
    }

    row.innerHTML = `
      <div class="list-head">
        <strong>${txn.type}</strong>
        <span>${new Date(txn.timestamp).toLocaleTimeString()}</span>
      </div>
      <div class="list-sub">${text}</div>
    `;
    txList.appendChild(row);
  });
}

teamList.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.getAttribute('data-action');
  const id = target.getAttribute('data-id');
  if (!action || !id) return;

  try {
    if (action === 'edit-team') {
      const current = latestState.teams.find((team) => team.id === id);
      if (!current) return;
      const name = window.prompt('Team name', current.name);
      if (name === null) return;
      const flagUrl = window.prompt('Image URL (optional)', current.flagUrl || '');
      if (flagUrl === null) return;
      const pin = window.prompt('Team PIN', current.pin || '');
      if (pin === null) return;
      await api(`/api/admin/teams/${id}`, 'PUT', { name, flagUrl, pin });
      setStatus('Team updated');
    }

    if (action === 'add-cash') {
      const input = teamList.querySelector(`[data-team-cash-input="${id}"]`);
      const amount = Number(input && input.value);
      if (!Number.isFinite(amount) || amount <= 0) {
        setStatus('Enter a valid positive cash amount');
        return;
      }
      await api(`/api/admin/teams/${id}/adjust-cash`, 'POST', { amount, reason: 'Round cash add' });
      setStatus('Cash adjusted');
    }

    if (action === 'delete-team') {
      if (!window.confirm('Delete this team and all related transactions?')) return;
      await api(`/api/admin/teams/${id}`, 'DELETE');
      setStatus('Team deleted');
    }
  } catch (error) {
    setStatus(error.message);
  }
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  try {
    const candidate = passwordInput.value.trim();
    await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: candidate })
    }).then(async (response) => {
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Invalid password');
      }
    });

    adminKey = candidate;
    sessionStorage.setItem('trading-admin-key', adminKey);
    setLoggedIn(true);
    await refreshAdminState();
  } catch (error) {
    loginError.textContent = error.message;
  }
});

logoutBtn.addEventListener('click', () => {
  adminKey = '';
  sessionStorage.removeItem('trading-admin-key');
  setLoggedIn(false);
});

metaForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/admin/meta', 'PUT', {
      title: titleInput.value,
      subtitle: subtitleInput.value,
      announcement: announcementInput.value,
      paused: pausedInput.checked
    });
    setStatus('Settings saved');
  } catch (error) {
    setStatus(error.message);
  }
});

roundButtons.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const roundAttr = target.getAttribute('data-round');
  if (!roundAttr) return;
  const roundNumber = Number(roundAttr);
  if (!Number.isFinite(roundNumber)) return;

  try {
    await api(`/api/admin/rounds/${roundNumber}/activate`, 'POST');
    selectedRound = roundNumber;
    setStatus(`Switched to Round ${roundNumber}`);
  } catch (error) {
    setStatus(error.message);
  }
});

prevRoundBtn.addEventListener('click', async () => {
  const nextRound = Math.max(1, selectedRound - 1);
  if (nextRound === selectedRound) return;
  try {
    await api(`/api/admin/rounds/${nextRound}/activate`, 'POST');
    selectedRound = nextRound;
    setStatus(`Switched to Round ${nextRound}`);
  } catch (error) {
    setStatus(error.message);
  }
});

nextRoundBtn.addEventListener('click', async () => {
  const nextRound = Math.min(5, selectedRound + 1);
  if (nextRound === selectedRound) return;
  try {
    await api(`/api/admin/rounds/${nextRound}/activate`, 'POST');
    selectedRound = nextRound;
    setStatus(`Switched to Round ${nextRound}`);
  } catch (error) {
    setStatus(error.message);
  }
});

roundPricesForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api(`/api/admin/rounds/${selectedRound}/prices`, 'PUT', {
      prices: {
        square: Number(rpSquare.value),
        circle: Number(rpCircle.value),
        equilateral_triangle: Number(rpEquilateral.value),
        isosceles_triangle: Number(rpIsosceles.value),
        semi_circle: Number(rpSemiCircle.value)
      }
    });
    setStatus(`Saved prices for Round ${selectedRound}`);
  } catch (error) {
    setStatus(error.message);
  }
});

teamForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/admin/teams', 'POST', {
      name: teamNameInput.value,
      flagUrl: teamFlagInput.value,
      pin: teamPinInput.value
    });
    teamNameInput.value = '';
    teamFlagInput.value = '';
    teamPinInput.value = '';
    setStatus('Team added');
  } catch (error) {
    setStatus(error.message);
  }
});

teamImportForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = teamImportForm.querySelector('button[type="submit"]');
  try {
    const file = teamImportFile.files && teamImportFile.files[0];
    if (!file) {
      setStatus('Select a CSV or spreadsheet file first');
      window.alert('Select a CSV or spreadsheet file first.');
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Uploading...';
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/admin/teams/import', {
      method: 'POST',
      headers: { ...(adminKey ? { 'x-admin-key': adminKey } : {}) },
      body: formData
    });

    if (response.status === 401) {
      adminKey = '';
      sessionStorage.removeItem('trading-admin-key');
      setLoggedIn(false);
      throw new Error('Unauthorized');
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Import failed');

    teamImportForm.reset();
    const message = `Imported ${data.imported} teams${data.skipped ? ` (${data.skipped} skipped)` : ''}`;
    setStatus(message);
    window.alert(message);
  } catch (error) {
    setStatus(error.message);
    window.alert(`Upload failed: ${error.message}`);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Upload Team File';
    }
  }
});

buzzerBtn.addEventListener('click', async () => {
  try {
    const message = window.prompt('Optional buzzer message', 'Buzzer: stop immediately and listen for instructions.');
    if (message === null) return;
    await api('/api/admin/buzzer', 'POST', { message });
    setStatus('Buzzer activated');
  } catch (error) {
    setStatus(error.message);
  }
});

resumeBtn.addEventListener('click', async () => {
  try {
    const message = window.prompt('Resume message', 'Trading resumed. Continue working.');
    if (message === null) return;
    await api('/api/admin/resume', 'POST', { message });
    setStatus('Trading resumed');
  } catch (error) {
    setStatus(error.message);
  }
});

revealWinnerBtn.addEventListener('click', async () => {
  try {
    await api('/api/admin/reveal-winner', 'POST');
    setStatus('Winner reveal is now live');
  } catch (error) {
    setStatus(error.message);
  }
});

hideWinnerBtn.addEventListener('click', async () => {
  try {
    await api('/api/admin/hide-winner', 'POST');
    setStatus('Winner reveal hidden');
  } catch (error) {
    setStatus(error.message);
  }
});

exportResultsBtn.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/admin/export/results.xlsx', {
      method: 'GET',
      headers: { ...(adminKey ? { 'x-admin-key': adminKey } : {}) }
    });

    if (response.status === 401) {
      adminKey = '';
      sessionStorage.removeItem('trading-admin-key');
      setLoggedIn(false);
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Export failed');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trading-sim-results-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    setStatus('Results spreadsheet downloaded');
  } catch (error) {
    setStatus(error.message);
  }
});

resetKeepBtn.addEventListener('click', async () => {
  if (!window.confirm('Reset all scores and history but keep teams and shapes?')) return;
  try {
    await api('/api/admin/reset', 'POST', { keepTeams: true, keepShapes: true });
    setStatus('Scores reset');
  } catch (error) {
    setStatus(error.message);
  }
});

resetAllBtn.addEventListener('click', async () => {
  if (!window.confirm('Reset EVERYTHING? This clears teams, scores, and history.')) return;
  try {
    await api('/api/admin/reset', 'POST', { keepTeams: false, keepShapes: false });
    setStatus('Everything reset');
  } catch (error) {
    setStatus(error.message);
  }
});

async function refreshAdminState() {
  const data = await api('/api/admin/state');
  render(data);
}

socket.on('admin:update', (state) => {
  if (adminKey) render(state);
});

if (adminKey) {
  setLoggedIn(true);
  refreshAdminState().catch(() => setLoggedIn(false));
} else {
  setLoggedIn(false);
}
