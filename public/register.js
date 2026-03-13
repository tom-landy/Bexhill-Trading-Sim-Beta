const registerForm = document.getElementById('registerForm');
const registerName = document.getElementById('registerName');
const registerPin = document.getElementById('registerPin');
const registerImage = document.getElementById('registerImage');
const registerStatus = document.getElementById('registerStatus');
const registeredTeamCard = document.getElementById('registeredTeamCard');
const registerEmpty = document.getElementById('registerEmpty');

const STORAGE_KEY = 'trading-sim-registered-team';

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

function setStatus(message) {
  registerStatus.textContent = message;
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
      <div class="list-sub">PIN: ${team.pin}</div>
      <div class="inline-actions wrap">
        <a class="ghost-button" href="/team/${team.id}">Open Team Portal</a>
        <button id="deleteRegisteredTeam" class="danger" type="button">Delete This Team</button>
      </div>
    </article>
  `;

  const deleteButton = document.getElementById('deleteRegisteredTeam');
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
    formData.append('pin', registerPin.value.trim());
    const file = registerImage.files && registerImage.files[0];
    if (file) formData.append('image', file);

    const response = await fetch('/api/public/teams', {
      method: 'POST',
      body: formData
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to create team');

    saveTeam(data.team);
    registerForm.reset();
    renderSavedTeam();
    setStatus(`Team created. Save the PIN for ${data.team.name}.`);
  } catch (error) {
    setStatus(error.message);
  }
});

renderSavedTeam();
