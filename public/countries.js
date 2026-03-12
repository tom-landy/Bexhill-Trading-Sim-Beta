const countriesRoundEl = document.getElementById('countriesRound');
const countriesGridEl = document.getElementById('countriesGrid');

function initials(name) {
  return String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?';
}

function render(state) {
  countriesRoundEl.textContent = state.meta && state.meta.roundLabel ? state.meta.roundLabel : 'Round';
  const teams = Array.isArray(state.teams) ? state.teams : [];

  countriesGridEl.innerHTML = '';
  teams.forEach((team) => {
    const card = document.createElement('article');
    card.className = 'team-card countries-team-card';
    card.setAttribute('role', 'button');
    card.tabIndex = 0;

    const imageSection = team.flagUrl
      ? `<img class="team-image" src="${team.flagUrl}" alt="${team.name}" onerror="this.style.display='none'; this.nextElementSibling.classList.remove('hidden');" /><div class="team-fallback hidden">${initials(team.name)}</div>`
      : `<div class="team-fallback">${initials(team.name)}</div>`;

    card.innerHTML = `
      ${imageSection}
      <h3>${team.name}</h3>
      <button class="ghost-button" type="button">Open Portal</button>
    `;

    const openTeam = () => {
      window.location.href = `/team/${team.id}`;
    };

    card.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.tagName.toLowerCase() === 'button') {
        openTeam();
      } else if (target instanceof HTMLElement && target.closest('.countries-team-card')) {
        openTeam();
      }
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openTeam();
      }
    });

    countriesGridEl.appendChild(card);
  });
}

async function fetchState() {
  const response = await fetch('/api/state');
  if (!response.ok) return;
  const state = await response.json();
  render(state);
}

fetchState();

const socket = io();
socket.on('state:update', render);
