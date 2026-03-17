const registerForm = document.getElementById('registerForm');
const registerName = document.getElementById('registerName');
const registerImage = document.getElementById('registerImage');
const registerStatus = document.getElementById('registerStatus');
const registeredTeamCard = document.getElementById('registeredTeamCard');
const registerEmpty = document.getElementById('registerEmpty');
const registerTimer = document.getElementById('registerTimer');
const flagCanvas = document.getElementById('flagCanvas');
const flagTool = document.getElementById('flagTool');
const flagBackground = document.getElementById('flagBackground');
const flagColor = document.getElementById('flagColor');
const flagBrushSize = document.getElementById('flagBrushSize');
const flagText = document.getElementById('flagText');
const clearFlagBtn = document.getElementById('clearFlagBtn');
const fillBackgroundBtn = document.getElementById('fillBackgroundBtn');

const STORAGE_KEY = 'trading-sim-registered-team';
const LOCK_KEY = 'trading-sim-register-lock-until';
const RESET_MARKER_KEY = 'trading-sim-registration-reset-marker';
const LOCK_MS = 2 * 60 * 1000;
const FLAG_CANVAS_WIDTH = 640;
const FLAG_CANVAS_HEIGHT = 400;

const ctx = flagCanvas.getContext('2d');
let isDrawing = false;
let canvasDirty = false;
let dragPlacement = null;
let canvasSnapshot = null;

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

function markCanvasDirty() {
  canvasDirty = true;
}

function snapshotCanvas() {
  return ctx.getImageData(0, 0, FLAG_CANVAS_WIDTH, FLAG_CANVAS_HEIGHT);
}

function restoreCanvas(snapshot) {
  if (!snapshot) return;
  ctx.putImageData(snapshot, 0, 0);
}

function canvasPosition(event) {
  const rect = flagCanvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * FLAG_CANVAS_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * FLAG_CANVAS_HEIGHT
  };
}

function resetCanvas() {
  ctx.fillStyle = flagBackground.value;
  ctx.fillRect(0, 0, FLAG_CANVAS_WIDTH, FLAG_CANVAS_HEIGHT);
  canvasDirty = false;
  dragPlacement = null;
  canvasSnapshot = null;
}

function drawShape(tool, x, y) {
  const size = Number(flagBrushSize.value) * 4;
  ctx.fillStyle = flagColor.value;
  ctx.strokeStyle = flagColor.value;
  ctx.lineWidth = 4;

  if (tool === 'rectangle') {
    ctx.fillRect(x - size, y - size * 0.6, size * 2, size * 1.2);
    return;
  }

  if (tool === 'circle') {
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (tool === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.lineTo(x - size, y + size);
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (tool === 'text') {
    const value = flagText.value.trim() || 'TEAM';
    ctx.font = `${Math.max(26, size * 1.2)}px "Space Grotesk", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(value, x, y);
  }
}

function beginDrawing(event) {
  const tool = flagTool.value;
  const { x, y } = canvasPosition(event);

  if (tool !== 'draw') {
    dragPlacement = { tool, x, y };
    canvasSnapshot = snapshotCanvas();
    drawShape(tool, x, y);
    flagCanvas.setPointerCapture(event.pointerId);
    return;
  }

  isDrawing = true;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = flagColor.value;
  ctx.lineWidth = Number(flagBrushSize.value);
  flagCanvas.setPointerCapture(event.pointerId);
  markCanvasDirty();
}

function continueDrawing(event) {
  if (flagTool.value !== 'draw' && dragPlacement) {
    const { x, y } = canvasPosition(event);
    dragPlacement.x = x;
    dragPlacement.y = y;
    restoreCanvas(canvasSnapshot);
    drawShape(dragPlacement.tool, x, y);
    return;
  }

  if (!isDrawing || flagTool.value !== 'draw') return;
  const { x, y } = canvasPosition(event);
  ctx.lineTo(x, y);
  ctx.stroke();
}

function endDrawing(event) {
  if (dragPlacement && flagTool.value !== 'draw') {
    restoreCanvas(canvasSnapshot);
    drawShape(dragPlacement.tool, dragPlacement.x, dragPlacement.y);
    markCanvasDirty();
    dragPlacement = null;
    canvasSnapshot = null;
  }

  if (isDrawing && flagTool.value === 'draw') {
    ctx.closePath();
  }
  isDrawing = false;
  if (event && event.pointerId !== undefined) {
    flagCanvas.releasePointerCapture(event.pointerId);
  }
}

function canvasToBlob() {
  return new Promise((resolve) => {
    flagCanvas.toBlob((blob) => resolve(blob), 'image/png');
  });
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
    if (canvasDirty) {
      const blob = await canvasToBlob();
      if (blob) {
        formData.append('image', blob, 'flag-maker.png');
      }
    } else {
      const file = registerImage.files && registerImage.files[0];
      if (file) formData.append('image', file);
    }

    const response = await fetch('/api/public/teams', {
      method: 'POST',
      body: formData
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to create team');

    saveTeam(data.team);
    setLockUntil(Date.now() + LOCK_MS);
    registerForm.reset();
    resetCanvas();
    renderSavedTeam();
    updateRegistrationAvailability();
    setStatus(`Team created. Save the PIN for ${data.team.name}.`);
  } catch (error) {
    setStatus(error.message);
  }
});

flagCanvas.addEventListener('pointerdown', beginDrawing);
flagCanvas.addEventListener('pointermove', continueDrawing);
flagCanvas.addEventListener('pointerup', endDrawing);
flagCanvas.addEventListener('pointerleave', endDrawing);
flagCanvas.addEventListener('pointercancel', endDrawing);

clearFlagBtn.addEventListener('click', () => {
  resetCanvas();
});

fillBackgroundBtn.addEventListener('click', () => {
  ctx.fillStyle = flagBackground.value;
  ctx.fillRect(0, 0, FLAG_CANVAS_WIDTH, FLAG_CANVAS_HEIGHT);
  markCanvasDirty();
});

syncSavedTeamWithServer().finally(() => {
  resetCanvas();
  renderSavedTeam();
  updateRegistrationAvailability();
  window.setInterval(updateRegistrationAvailability, 1000);
  window.setInterval(syncSavedTeamWithServer, 15000);
});
