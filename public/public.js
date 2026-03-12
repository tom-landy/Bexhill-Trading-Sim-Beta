const shapesGridEl = document.getElementById('shapesGrid');
const leaderboardBodyEl = document.getElementById('leaderboardBody');
const leaderboardSectionEl = document.getElementById('leaderboardSection');
const teamCardsEl = document.getElementById('teamCards');
const updatedAtEl = document.getElementById('updatedAt');
const pausedOverlayEl = document.getElementById('pausedOverlay');
const openAdminBtn = document.getElementById('openAdminBtn');
const winnerRevealEl = document.getElementById('winnerReveal');
const winnerTextEl = document.getElementById('winnerText');

function formatMoney(value) {
  return `£${Number(value || 0).toLocaleString()}`;
}

function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?';
}

function shapeKey(shape) {
  if (shape.kind) return shape.kind;
  const n = (shape.name || '').toLowerCase();
  if (n.includes('square')) return 'square';
  if (n.includes('semi') && n.includes('circle')) return 'semi_circle';
  if (n.includes('equilateral')) return 'equilateral_triangle';
  if (n.includes('isosceles')) return 'isosceles_triangle';
  if (n.includes('circle')) return 'circle';
  if (n.includes('triangle')) return 'equilateral_triangle';
  return 'square';
}

function shapeSvg(shape) {
  const key = shapeKey(shape);
  const stroke = 'rgba(255,255,255,0.95)';

  if (key === 'circle') {
    return `<svg viewBox="0 0 100 100" class="shape-svg"><circle cx="50" cy="50" r="26" fill="none" stroke="${stroke}" stroke-width="6"/></svg>`;
  }
  if (key === 'equilateral_triangle') {
    return `<svg viewBox="0 0 100 100" class="shape-svg"><polygon points="50,16 80,68 20,68" fill="none" stroke="${stroke}" stroke-width="6"/></svg>`;
  }
  if (key === 'isosceles_triangle') {
    return `<svg viewBox="0 0 100 100" class="shape-svg"><polygon points="50,24 84,74 16,74" fill="none" stroke="${stroke}" stroke-width="6"/></svg>`;
  }
  if (key === 'semi_circle') {
    return `<svg viewBox="0 0 100 100" class="shape-svg"><path d="M20,66 A30,30 0 0 1 80,66" fill="none" stroke="${stroke}" stroke-width="6"/><line x1="20" y1="66" x2="80" y2="66" stroke="${stroke}" stroke-width="6"/></svg>`;
  }
  return `<svg viewBox="0 0 100 100" class="shape-svg"><rect x="24" y="24" width="52" height="52" fill="none" stroke="${stroke}" stroke-width="6"/></svg>`;
}

function shapeImagePath(shape) {
  const key = shapeKey(shape);
  if (key === 'square') return '/images/square.png';
  if (key === 'circle') return '/images/circle.png';
  if (key === 'equilateral_triangle') return '/images/etriangle.png';
  if (key === 'isosceles_triangle') return '/images/itriangle.png';
  if (key === 'semi_circle') return '/images/semi.png';
  return '';
}

function render(state) {
  const { meta, shapes, teams, winner } = state;
  updatedAtEl.textContent = meta.updatedAt ? `Updated ${new Date(meta.updatedAt).toLocaleTimeString()}` : '';
  pausedOverlayEl.classList.toggle('hidden', !meta.paused);

  if (meta.revealWinner && winner) {
    winnerRevealEl.classList.remove('hidden');
    winnerTextEl.textContent = `${winner.name} wins with ${formatMoney(winner.cash)} and ${winner.traded || 0} shapes traded.`;
  } else {
    winnerRevealEl.classList.add('hidden');
    winnerTextEl.textContent = '';
  }
  leaderboardSectionEl.classList.toggle('hidden', !meta.revealWinner);

  shapesGridEl.innerHTML = '';
  shapes.forEach((shape) => {
    const imagePath = shapeImagePath(shape);
    const card = document.createElement('article');
    card.className = 'shape-card';
    card.style.background = shape.color || '#1f6f8b';
    card.innerHTML = `
      <div class="shape-art">
        <img class="shape-image" src="${imagePath}" alt="${shape.name}" onerror="this.style.display='none'; this.nextElementSibling.classList.remove('hidden');" />
        <div class="shape-fallback hidden">${shapeSvg(shape)}</div>
      </div>
      <h3>${shape.name}</h3>
      <div class="price">${formatMoney(shape.price)}</div>
    `;
    shapesGridEl.appendChild(card);
  });

  teamCardsEl.innerHTML = '';
  teams.forEach((team) => {
    const card = document.createElement('article');
    card.className = 'team-card';
    card.style.cursor = 'pointer';
    card.setAttribute('title', `Open ${team.name} portal`);
    card.addEventListener('click', () => {
      window.open(`/team/${team.id}`, '_blank', 'noopener,noreferrer');
    });

    const imageSection = team.flagUrl
      ? `<img class="team-image" src="${team.flagUrl}" alt="${team.name}" onerror="this.style.display='none'; this.nextElementSibling.classList.remove('hidden');" /><div class="team-fallback hidden">${initials(team.name)}</div>`
      : `<div class="team-fallback">${initials(team.name)}</div>`;

    const statsMarkup = meta.revealWinner
      ? `
      <div class="money">${formatMoney(team.cash)}</div>
      <div>Shapes Traded: ${team.traded || 0}</div>
      <div>Accepted: ${team.accepted || 0} | Rejected: ${team.rejected || 0}</div>
    `
      : `<div class="list-sub">Performance hidden until winner reveal</div>`;

    card.innerHTML = `
      ${imageSection}
      <h3>${team.name}</h3>
      ${statsMarkup}
      <div class="list-sub">Tap card to open team portal</div>
    `;

    teamCardsEl.appendChild(card);
  });

  leaderboardBodyEl.innerHTML = '';
  teams.forEach((team) => {
    const row = document.createElement('tr');
    if (team.rank === 1) row.classList.add('top-rank');
    row.innerHTML = `
      <td>#${team.rank}</td>
      <td>${team.name}</td>
      <td>${formatMoney(team.cash)}</td>
      <td>${team.traded || 0}</td>
      <td>${team.accepted || 0}</td>
      <td>${team.rejected || 0}</td>
    `;
    leaderboardBodyEl.appendChild(row);
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

if (openAdminBtn) {
  openAdminBtn.addEventListener('click', async () => {
    const password = window.prompt('Enter admin password');
    if (!password) return;

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      if (!response.ok) {
        throw new Error('Invalid password');
      }

      localStorage.setItem('trading-admin-key-temp', password);
      window.open('/admin', '_blank', 'noopener,noreferrer');
    } catch (error) {
      window.alert(error.message || 'Unable to open admin panel');
    }
  });
}
