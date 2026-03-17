const registerForm = document.getElementById('registerForm');
const registerName = document.getElementById('registerName');
const registerImage = document.getElementById('registerImage');
const registerStatus = document.getElementById('registerStatus');
const registeredTeamCard = document.getElementById('registeredTeamCard');
const registerEmpty = document.getElementById('registerEmpty');
const registerTimer = document.getElementById('registerTimer');

const STORAGE_KEY = 'trading-sim-registered-team';
const LOCK_KEY = 'trading-sim-register-lock-until';
const RESET_MARKER_KEY = 'trading-sim-registration-reset-marker';
const LOCK_MS = 2 * 60 * 1000;

function readSavedTeam() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveTeam(team) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(team));
}

function clearTeam() {
  localStorage.removeItem(STORAGE_KEY);
}

function readLockUntil() {
  return Number(localStorage.getItem(LOCK_KEY) || 0);
}

function setLockUntil(timestamp) {
  localStorage.setItem(LOCK_KEY, String(timestamp));
}

function clearLock() {
  localStorage.removeItem(LOCK_KEY);
}

function readResetMarker() {
  return localStorage.getItem(RESET_MARKER_KEY) || '';
}

function saveResetMarker(marker) {
  localStorage.setItem(RESET_MARKER_KEY, marker);
}

function setStatus(message) {
  registerStatus.textContent = message;
}

function maskSecret(secret) {
  const text = String(secret || '');
  if (!text) return 'Not set';
  return '•'.repeat(Math.max(4, text.length));
}

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function updateRegistrationAvailability() {
  const savedTeam = readSavedTeam();
  const lockUntil = readLockUntil();
  const locked = lockUntil > Date.now();
  const disabled = Boolean(savedTeam) || locked;

  Array.from(registerForm.elements).forEach((field) => {
    if (field instanceof HTMLElement) {
      field.toggleAttribute('disabled', disabled);
    }
  });

  if (savedTeam) {
    registerTimer.textContent = 'This device has already registered a team. Delete it below if needed.';
  } else if (locked) {
    registerTimer.textContent = `This device can register again in ${formatRemaining(lockUntil - Date.now())}.`;
  } else {
    registerTimer.textContent = '';
  }
}

async function syncSavedTeamWithServer() {
  try {
    const response = await fetch('/api/state');
    if (!response.ok) return;
    const data = await response.json();
    const serverResetMarker = String(data.meta && data.meta.registrationResetAt || '');
    const localResetMarker = readResetMarker();

    if (serverResetMarker && serverResetMarker !== localResetMarker) {
      clearTeam();
      clearLock();
      saveResetMarker(serverResetMarker);
    }

    const savedTeam = readSavedTeam();
    if (!savedTeam || !savedTeam.id) return;

    const teams = Array.isArray(data.teams) ? data.teams : [];
    const exists = teams.some((team) => team.id === savedTeam.id);

    if (!exists) {
      clearTeam();
      clearLock();
    }
  } catch {
    // Keep local state if the server cannot be reached.
  }
}

function renderSavedTeam() {
  const team = readSavedTeam();
  if (!team) {
    registeredTeamCard.classList.add('hidden');
    registeredTeamCard.innerHTML = '';
    registerEmpty.classList.remove('hidden');
    return;
  }

  registerEmpty.classList.add('hidden');
  registeredTeamCard.classList.remove('hidden');
  registeredTeamCard.innerHTML = `
    <article class="team-card">
      ${team.flagUrl ? `<img class="team-image" src="${team.flagUrl}" alt="${team.name}" />` : `<div class="team-fallback">OK</div>`}
      <h3>${team.name}</h3>
      <div class="list-sub">Team ID: ${team.id}</div>
      <div class="list-sub">PIN: <span id="savedTeamPin" data-visible="false">${maskSecret(team.pin)}</span></div>
      <div class="inline-actions wrap">
        <a class="ghost-button" href="/team/${team.id}">Open Team Portal</a>
        <button id="toggleSavedPin" class="ghost-button" type="button">Show PIN</button>
        <button id="deleteRegisteredTeam" class="danger" type="button">Delete This Team</button>
      </div>
    </article>
  `;

  const toggleButton = document.getElementById('toggleSavedPin');
  const deleteButton = document.getElementById('deleteRegisteredTeam');
  const pinEl = document.getElementById('savedTeamPin');

  if (toggleButton && pinEl) {
    toggleButton.addEventListener('click', () => {
      const showing = pinEl.dataset.visible === 'true';
      pinEl.textContent = showing ? maskSecret(team.pin) : (team.pin || 'Not set');
      pinEl.dataset.visible = showing ? 'false' : 'true';
      toggleButton.textContent = showing ? 'Show PIN' : 'Hide PIN';
    });
  }

  if (deleteButton) {
    deleteButton.addEventListener('click', async () => {
      if (!window.confirm('Delete this team and its uploaded image?')) return;
      try {
        const response = await fetch(`/api/team/${team.id}/self-delete`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'x-team-id': team.id,
            'x-team-pin': team.pin
          }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Delete failed');
        clearTeam();
        renderSavedTeam();
        setStatus('Team deleted');
        updateRegistrationAvailability();
      } catch (error) {
        setStatus(error.message);
      }
    });
  }
}

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('');

  try {
    const formData = new FormData();
    formData.append('name', registerName.value.trim());
    const file = registerImage.files && registerImage.files[0];
    if (file) formData.append('image', file);

    const response = await fetch('/api/public/teams', {
      method: 'POST',
      body: formData
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to create team');

    saveTeam(data.team);
    setLockUntil(Date.now() + LOCK_MS);
    registerForm.reset();
    renderSavedTeam();
    updateRegistrationAvailability();
    setStatus(`Team created. Save the PIN for ${data.team.name}.`);
  } catch (error) {
    setStatus(error.message);
  }
});

syncSavedTeamWithServer().finally(() => {
  renderSavedTeam();
  updateRegistrationAvailability();
  window.setInterval(updateRegistrationAvailability, 1000);
  window.setInterval(syncSavedTeamWithServer, 15000);
});
