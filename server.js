const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const multer = require('multer');
const XLSX = require('xlsx');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Alpha1234*';
const BANKER_PASSWORD = process.env.BANKER_PASSWORD || 'Banker1234*';
const DEFAULT_DATA_DIR = path.join(__dirname, 'data');
const DATA_ROOT = process.env.RENDER_DISK_PATH || process.env.DATA_DIR || DEFAULT_DATA_DIR;
const STATE_PATH = process.env.STATE_PATH || path.join(DATA_ROOT, 'state.json');
const DATA_DIR = path.dirname(STATE_PATH);
const upload = multer({ storage: multer.memoryStorage() });

const ALLOWED_SHAPE_KINDS = new Set([
  'square',
  'circle',
  'equilateral_triangle',
  'isosceles_triangle',
  'semi_circle'
]);
const ROUND_SHAPE_ORDER = ['square', 'circle', 'equilateral_triangle', 'isosceles_triangle', 'semi_circle'];

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'images')));

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function generateTeamPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function inferShapeKind(name = '') {
  const normalized = String(name).toLowerCase().replace(/\s+/g, '_');
  if (normalized.includes('square')) return 'square';
  if (normalized.includes('semi') && normalized.includes('circle')) return 'semi_circle';
  if (normalized.includes('equilateral')) return 'equilateral_triangle';
  if (normalized.includes('isosceles')) return 'isosceles_triangle';
  if (normalized.includes('circle')) return 'circle';
  if (normalized.includes('triangle')) return 'equilateral_triangle';
  return 'square';
}

function defaultShapes() {
  return [
    { id: makeId('shape'), name: 'Square', kind: 'square', price: 50, color: '#0b3c5d' },
    { id: makeId('shape'), name: 'Circle', kind: 'circle', price: 70, color: '#328cc1' },
    { id: makeId('shape'), name: 'Equilateral Triangle', kind: 'equilateral_triangle', price: 90, color: '#0f766e' },
    { id: makeId('shape'), name: 'Isosceles Triangle', kind: 'isosceles_triangle', price: 85, color: '#b45309' },
    { id: makeId('shape'), name: 'Semi Circle', kind: 'semi_circle', price: 65, color: '#7c3aed' }
  ];
}

function pricesFromShapes(shapeList = []) {
  const prices = {};
  ROUND_SHAPE_ORDER.forEach((kind) => {
    const shape = shapeList.find((item) => item.kind === kind);
    prices[kind] = shape ? Number(shape.price) : 0;
  });
  return prices;
}

function defaultRoundsFromShapes(shapeList = defaultShapes()) {
  const basePrices = pricesFromShapes(shapeList);
  return Array.from({ length: 5 }, (_, idx) => ({
    round: idx + 1,
    label: `Round ${idx + 1}`,
    prices: { ...basePrices }
  }));
}

function normalizeRound(inputRound = {}, roundNumber, fallbackPrices = {}) {
  const normalizedRound = Number(roundNumber);
  const prices = {};
  ROUND_SHAPE_ORDER.forEach((kind) => {
    const raw = inputRound && inputRound.prices ? inputRound.prices[kind] : undefined;
    const fallback = fallbackPrices[kind] ?? 0;
    const parsed = Number(raw);
    prices[kind] = Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  });
  return {
    round: normalizedRound,
    label: typeof inputRound.label === 'string' && inputRound.label.trim()
      ? inputRound.label.trim()
      : `Round ${normalizedRound}`,
    prices
  };
}

function defaultState() {
  return {
    meta: {
      title: 'Global Trading Simulation',
      subtitle: 'Build shapes, trade smart, and grow your country\'s wealth.',
      roundLabel: 'Round 1',
      announcement: 'Welcome to the trading floor.',
      currentRound: 1,
      paused: false,
      buzzerCount: 0,
      revealWinner: false,
      winnerTeamId: '',
      winnerName: '',
      updatedAt: nowIso()
    },
    shapes: defaultShapes(),
    rounds: defaultRoundsFromShapes(defaultShapes()),
    teams: [],
    bankerRequests: [],
    transactions: []
  };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function normalizeTeam(team = {}) {
  const candidatePin = String(team.pin || '').trim();
  return {
    id: team.id || makeId('team'),
    name: typeof team.name === 'string' ? team.name : 'Team',
    flagUrl: typeof team.flagUrl === 'string' ? team.flagUrl : '',
    pin: candidatePin || generateTeamPin(),
    cash: Number.isFinite(Number(team.cash)) ? Number(team.cash) : 0,
    accepted: Number.isFinite(Number(team.accepted)) ? Number(team.accepted) : 0,
    rejected: Number.isFinite(Number(team.rejected)) ? Number(team.rejected) : 0,
    traded: Number.isFinite(Number(team.traded)) ? Number(team.traded) : 0
  };
}

function normalizeShape(shape = {}) {
  const kind = typeof shape.kind === 'string' && ALLOWED_SHAPE_KINDS.has(shape.kind)
    ? shape.kind
    : inferShapeKind(shape.name);

  return {
    id: shape.id || makeId('shape'),
    name: typeof shape.name === 'string' ? shape.name : 'Shape',
    kind,
    price: Number.isFinite(Number(shape.price)) ? Number(shape.price) : 0,
    color: typeof shape.color === 'string' && shape.color.trim() ? shape.color : '#1f6f8b'
  };
}

function parseCsvLine(line = '') {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values.map((value) => value.replace(/^"|"$/g, '').trim());
}

function rowsFromCsvBuffer(buffer) {
  const text = buffer.toString('utf8').replace(/\r/g, '');
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const dataLines = lines.slice(1);
  return dataLines.map((line) => {
    const cols = parseCsvLine(line);
    return headers.reduce((row, header, idx) => {
      row[header] = cols[idx] || '';
      return row;
    }, {});
  });
}

function rowsFromSpreadsheetBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  if (!workbook.SheetNames.length) return [];
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
}

function candidateTeamName(row = {}) {
  return String(
    row.name ||
    row.team ||
    row.team_name ||
    row.country ||
    row.country_name ||
    row.Name ||
    row.Team ||
    row.Country ||
    ''
  ).trim();
}

function candidateFlagUrl(row = {}) {
  return String(
    row.flagUrl ||
    row.flagurl ||
    row.flag_url ||
    row.flag ||
    row.image ||
    row.logo ||
    row.FlagURL ||
    row.Flag ||
    row.Image ||
    ''
  ).trim();
}

function loadState() {
  ensureDataDir();
  if (!fs.existsSync(STATE_PATH)) {
    const initial = defaultState();
    fs.writeFileSync(STATE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    const defaults = defaultState();
    const shapes = Array.isArray(parsed.shapes) ? parsed.shapes.map(normalizeShape) : defaults.shapes;
    const fallbackPrices = pricesFromShapes(shapes);
    const parsedRounds = Array.isArray(parsed.rounds) ? parsed.rounds : [];
    const rounds = Array.from({ length: 5 }, (_, idx) => normalizeRound(parsedRounds[idx], idx + 1, fallbackPrices));
    const currentRoundCandidate = Number(parsed.meta && parsed.meta.currentRound);
    const currentRound = Number.isFinite(currentRoundCandidate) && currentRoundCandidate >= 1 && currentRoundCandidate <= 5
      ? Math.floor(currentRoundCandidate)
      : 1;

    return {
      ...defaults,
      ...parsed,
      meta: {
        ...defaults.meta,
        ...(parsed.meta || {}),
        currentRound,
        roundLabel: `Round ${currentRound}`
      },
      teams: Array.isArray(parsed.teams) ? parsed.teams.map(normalizeTeam) : [],
      shapes,
      rounds,
      bankerRequests: Array.isArray(parsed.bankerRequests) ? parsed.bankerRequests : [],
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : []
    };
  } catch (error) {
    console.error('Failed to read state.json, using defaults:', error.message);
    return defaultState();
  }
}

let state = loadState();

function applyRoundPrices(roundNumber) {
  const numericRound = Number(roundNumber);
  const roundConfig = state.rounds.find((item) => item.round === numericRound);
  if (!roundConfig) return false;

  ROUND_SHAPE_ORDER.forEach((kind) => {
    const shape = state.shapes.find((item) => item.kind === kind);
    if (!shape) return;
    const price = Number(roundConfig.prices[kind]);
    shape.price = Number.isFinite(price) && price >= 0 ? price : shape.price;
  });

  state.meta.currentRound = numericRound;
  state.meta.roundLabel = `Round ${numericRound}`;
  return true;
}

function syncActiveRoundFromShapes() {
  const activeRound = state.rounds.find((item) => item.round === state.meta.currentRound);
  if (!activeRound) return;
  ROUND_SHAPE_ORDER.forEach((kind) => {
    const shape = state.shapes.find((item) => item.kind === kind);
    if (!shape) return;
    activeRound.prices[kind] = Number(shape.price) || 0;
  });
}

applyRoundPrices(state.meta.currentRound || 1);

function saveState() {
  state.meta.updatedAt = nowIso();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function rankTeams(teams) {
  return [...teams]
    .sort((a, b) => {
      if (b.cash !== a.cash) return b.cash - a.cash;
      if ((b.traded || 0) !== (a.traded || 0)) return (b.traded || 0) - (a.traded || 0);
      return a.name.localeCompare(b.name);
    })
    .map((team, index) => ({ ...team, rank: index + 1 }));
}

function stripTeamPin(team) {
  const { pin, ...rest } = team;
  return rest;
}

function publicState() {
  const rankedTeams = rankTeams(state.teams);
  const safeTeams = rankedTeams.map(stripTeamPin);
  const winner = state.meta.revealWinner && rankedTeams.length
    ? {
        id: rankedTeams[0].id,
        name: rankedTeams[0].name,
        cash: rankedTeams[0].cash,
        traded: rankedTeams[0].traded || 0
      }
    : null;

  return {
    meta: state.meta,
    shapes: state.shapes,
    rounds: state.rounds,
    teams: safeTeams,
    winner
  };
}

function adminState() {
  const rankedTeams = rankTeams(state.teams);
  return {
    ...publicState(),
    teams: rankedTeams,
    transactions: [...state.transactions].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 100)
  };
}

function broadcastState() {
  io.emit('state:update', publicState());
  io.emit('admin:update', adminState());
  io.emit('banker:update', { updatedAt: nowIso() });
  io.emit('team:update', { updatedAt: nowIso() });
}

function requireAdmin(req, res, next) {
  const provided = req.header('x-admin-key');
  if (!provided || provided !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function requireBanker(req, res, next) {
  const provided = req.header('x-banker-key');
  if (!provided || provided !== BANKER_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function teamState(team) {
  const requests = state.bankerRequests
    .filter((item) => item.teamId === team.id)
    .sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || '')))
    .slice(0, 20);

  return {
    id: team.id,
    name: team.name,
    flagUrl: team.flagUrl || '',
    bankBalance: team.cash || 0,
    assets: {
      shapesTraded: team.traded || 0,
      accepted: team.accepted || 0,
      rejected: team.rejected || 0
    },
    requests,
    meta: {
      currentRound: state.meta.currentRound,
      roundLabel: state.meta.roundLabel,
      paused: state.meta.paused
    }
  };
}

function requireTeamPin(req, res, next) {
  const teamId = req.params.teamId || req.body.teamId || req.header('x-team-id');
  const pin = String(req.header('x-team-pin') || (req.body && req.body.pin) || '').trim();
  if (!teamId) return res.status(400).json({ error: 'teamId is required' });
  const team = state.teams.find((item) => item.id === teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  if (!pin || pin !== String(team.pin || '')) return res.status(401).json({ error: 'Invalid PIN' });
  req.team = team;
  next();
}

app.get('/health', (req, res) => {
  res.json({ ok: true, updatedAt: state.meta.updatedAt });
});

app.get('/api/state', (req, res) => {
  res.json(publicState());
});

app.post('/api/team/login', (req, res) => {
  const teamId = req.body && req.body.teamId;
  const pin = String((req.body && req.body.pin) || '').trim();
  const team = state.teams.find((item) => item.id === teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  if (!pin || pin !== String(team.pin || '')) {
    return res.status(401).json({ error: 'Invalid PIN' });
  }
  res.json({ ok: true, team: teamState(team) });
});

app.get('/api/team/:teamId/state', requireTeamPin, (req, res) => {
  res.json({ ok: true, team: teamState(req.team) });
});

app.post('/api/team/:teamId/transaction', requireTeamPin, (req, res) => {
  const action = String((req.body && req.body.action) || '').trim().toLowerCase();
  const amount = Number(req.body && req.body.amount);
  const note = typeof (req.body && req.body.note) === 'string' ? req.body.note.trim() : '';

  if (!['deposit', 'withdraw'].includes(action)) {
    return res.status(400).json({ error: 'action must be deposit or withdraw' });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  const signedAmount = action === 'deposit' ? amount : -amount;
  const request = {
    id: makeId('req'),
    teamId: req.team.id,
    teamName: req.team.name,
    action,
    amount,
    note: note || '',
    status: 'pending',
    requestedAt: nowIso(),
    decidedAt: '',
    decidedBy: ''
  };
  state.bankerRequests.push(request);

  state.transactions.push({
    id: makeId('txn'),
    timestamp: nowIso(),
    type: 'team_portal_request_created',
    teamId: req.team.id,
    teamName: req.team.name,
    amount: signedAmount,
    note: note || `Request ${action}`
  });

  saveState();
  broadcastState();
  res.json({ ok: true, request, team: teamState(req.team) });
});

app.post('/api/admin/login', (req, res) => {
  const password = (req.body && req.body.password) || '';
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  res.json({ ok: true });
});

app.post('/api/banker/login', (req, res) => {
  const password = (req.body && req.body.password) || '';
  if (password !== BANKER_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  res.json({ ok: true });
});

app.get('/api/banker/state', requireBanker, (req, res) => {
  const pending = state.bankerRequests
    .filter((item) => item.status === 'pending')
    .sort((a, b) => String(a.requestedAt || '').localeCompare(String(b.requestedAt || '')));

  const recent = state.bankerRequests
    .filter((item) => item.status !== 'pending')
    .sort((a, b) => String(b.decidedAt || '').localeCompare(String(a.decidedAt || '')))
    .slice(0, 50);

  res.json({ ok: true, pending, recent });
});

app.post('/api/banker/requests/:requestId/approve', requireBanker, (req, res) => {
  const request = state.bankerRequests.find((item) => item.id === req.params.requestId);
  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }
  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'Request already processed' });
  }

  const team = state.teams.find((item) => item.id === request.teamId);
  if (!team) {
    return res.status(404).json({ error: 'Team not found' });
  }

  const signedAmount = request.action === 'deposit' ? Number(request.amount) : -Number(request.amount);
  const newBalance = Number(team.cash || 0) + signedAmount;
  if (newBalance < 0) {
    return res.status(400).json({ error: 'Insufficient team balance for withdrawal' });
  }

  team.cash = newBalance;
  request.status = 'approved';
  request.decidedAt = nowIso();
  request.decidedBy = 'banker';

  state.transactions.push({
    id: makeId('txn'),
    timestamp: nowIso(),
    type: request.action === 'deposit' ? 'team_portal_deposit_approved' : 'team_portal_withdraw_approved',
    teamId: team.id,
    teamName: team.name,
    amount: signedAmount,
    note: request.note || ''
  });

  saveState();
  broadcastState();
  res.json({ ok: true, request });
});

app.post('/api/banker/requests/:requestId/reject', requireBanker, (req, res) => {
  const request = state.bankerRequests.find((item) => item.id === req.params.requestId);
  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }
  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'Request already processed' });
  }

  request.status = 'rejected';
  request.decidedAt = nowIso();
  request.decidedBy = 'banker';
  request.rejectionReason = typeof (req.body && req.body.reason) === 'string' ? req.body.reason.trim() : '';

  saveState();
  broadcastState();
  res.json({ ok: true, request });
});

app.get('/api/admin/state', requireAdmin, (req, res) => {
  res.json(adminState());
});

app.get('/api/admin/export/results.xlsx', requireAdmin, (req, res) => {
  const ranked = rankTeams(state.teams);
  const teamsSheet = ranked.map((team) => ({
    Rank: team.rank,
    Team: team.name,
    Cash: team.cash,
    ShapesTraded: team.traded || 0,
    Accepted: team.accepted || 0,
    Rejected: team.rejected || 0
  }));

  const txSheet = [...state.transactions].map((txn) => ({
    Timestamp: txn.timestamp || '',
    Type: txn.type || '',
    Team: txn.teamName || '',
    Shape: txn.shapeName || '',
    QuantityAccepted: txn.quantityAccepted ?? '',
    QuantityRejected: txn.quantityRejected ?? '',
    QuantityTraded: txn.quantityTraded ?? '',
    UnitPrice: txn.unitPrice ?? '',
    Total: txn.total ?? '',
    Note: txn.note || ''
  }));

  const roundsSheet = (state.rounds || []).map((round) => ({
    Round: round.round,
    Label: round.label,
    Square: round.prices && round.prices.square,
    Circle: round.prices && round.prices.circle,
    EquilateralTriangle: round.prices && round.prices.equilateral_triangle,
    IsoscelesTriangle: round.prices && round.prices.isosceles_triangle,
    SemiCircle: round.prices && round.prices.semi_circle
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(teamsSheet), 'Teams');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(txSheet), 'Transactions');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(roundsSheet), 'Rounds');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=\"trading-sim-results-${new Date().toISOString().slice(0, 10)}.xlsx\"`);
  res.send(buffer);
});

app.put('/api/admin/meta', requireAdmin, (req, res) => {
  const { title, subtitle, roundLabel, announcement, paused } = req.body || {};
  state.meta = {
    ...state.meta,
    ...(typeof title === 'string' ? { title: title.trim() || state.meta.title } : {}),
    ...(typeof subtitle === 'string' ? { subtitle: subtitle.trim() } : {}),
    ...(typeof roundLabel === 'string' ? { roundLabel: roundLabel.trim() } : {}),
    ...(typeof announcement === 'string' ? { announcement: announcement.trim() } : {}),
    ...(typeof paused === 'boolean' ? { paused } : {})
  };
  saveState();
  broadcastState();
  res.json({ ok: true, meta: state.meta });
});

app.put('/api/admin/rounds/:roundNumber/prices', requireAdmin, (req, res) => {
  const roundNumber = Number(req.params.roundNumber);
  if (!Number.isFinite(roundNumber) || roundNumber < 1 || roundNumber > 5) {
    return res.status(400).json({ error: 'roundNumber must be between 1 and 5' });
  }

  const roundConfig = state.rounds.find((item) => item.round === roundNumber);
  if (!roundConfig) {
    return res.status(404).json({ error: 'Round not found' });
  }

  const inputPrices = (req.body && req.body.prices) || {};
  ROUND_SHAPE_ORDER.forEach((kind) => {
    if (inputPrices[kind] === undefined) return;
    const parsed = Number(inputPrices[kind]);
    if (Number.isFinite(parsed) && parsed >= 0) {
      roundConfig.prices[kind] = parsed;
    }
  });

  if (state.meta.currentRound === roundNumber) {
    applyRoundPrices(roundNumber);
  }

  saveState();
  broadcastState();
  res.json({ ok: true, round: roundConfig });
});

app.post('/api/admin/rounds/:roundNumber/activate', requireAdmin, (req, res) => {
  const roundNumber = Number(req.params.roundNumber);
  if (!Number.isFinite(roundNumber) || roundNumber < 1 || roundNumber > 5) {
    return res.status(400).json({ error: 'roundNumber must be between 1 and 5' });
  }

  const changed = applyRoundPrices(roundNumber);
  if (!changed) {
    return res.status(404).json({ error: 'Round not found' });
  }

  saveState();
  broadcastState();
  res.json({ ok: true, currentRound: roundNumber });
});

app.post('/api/admin/teams', requireAdmin, (req, res) => {
  const { name, flagUrl, pin } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Team name is required' });
  }
  const team = {
    id: makeId('team'),
    name: name.trim(),
    flagUrl: typeof flagUrl === 'string' ? flagUrl.trim() : '',
    pin: String(pin || '').trim() || generateTeamPin(),
    cash: 0,
    accepted: 0,
    rejected: 0,
    traded: 0
  };
  state.teams.push(team);
  saveState();
  broadcastState();
  res.status(201).json({ ok: true, team });
});

app.post('/api/admin/teams/import', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ error: 'Upload a CSV or XLSX file' });
  }

  const fileName = (req.file.originalname || '').toLowerCase();
  const isCsv = fileName.endsWith('.csv');
  const isXlsx = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

  if (!isCsv && !isXlsx) {
    return res.status(400).json({ error: 'File must be .csv, .xls, or .xlsx' });
  }

  let rows = [];
  try {
    rows = isCsv ? rowsFromCsvBuffer(req.file.buffer) : rowsFromSpreadsheetBuffer(req.file.buffer);
  } catch (error) {
    return res.status(400).json({ error: `Unable to read file: ${error.message}` });
  }

  const existing = new Set(state.teams.map((team) => team.name.toLowerCase()));
  const seen = new Set();
  const created = [];
  let skipped = 0;

  rows.forEach((rawRow) => {
    const row = Object.fromEntries(Object.entries(rawRow).map(([k, v]) => [String(k).trim(), v]));
    const name = candidateTeamName(row);
    if (!name) {
      skipped += 1;
      return;
    }
    const key = name.toLowerCase();
    if (existing.has(key) || seen.has(key)) {
      skipped += 1;
      return;
    }

    seen.add(key);
    const team = {
      id: makeId('team'),
      name,
      flagUrl: candidateFlagUrl(row),
      pin: String(row.pin || row.PIN || '').trim() || generateTeamPin(),
      cash: 0,
      accepted: 0,
      rejected: 0,
      traded: 0
    };
    state.teams.push(team);
    created.push(team);
  });

  if (!created.length && rows.length) {
    return res.status(400).json({ error: 'No valid new teams found. Check columns like name/team/country.' });
  }

  saveState();
  broadcastState();
  res.status(201).json({
    ok: true,
    imported: created.length,
    skipped,
    teams: created
  });
});

app.put('/api/admin/teams/:teamId', requireAdmin, (req, res) => {
  const team = state.teams.find((item) => item.id === req.params.teamId);
  if (!team) {
    return res.status(404).json({ error: 'Team not found' });
  }

  const { name, flagUrl, pin } = req.body || {};
  if (typeof name === 'string') {
    const trimmed = name.trim();
    if (trimmed) team.name = trimmed;
  }
  if (typeof flagUrl === 'string') {
    team.flagUrl = flagUrl.trim();
  }
  if (pin !== undefined) {
    const normalizedPin = String(pin).trim();
    if (normalizedPin) {
      team.pin = normalizedPin;
    }
  }

  saveState();
  broadcastState();
  res.json({ ok: true, team });
});

app.post('/api/admin/teams/:teamId/adjust-cash', requireAdmin, (req, res) => {
  const team = state.teams.find((item) => item.id === req.params.teamId);
  if (!team) {
    return res.status(404).json({ error: 'Team not found' });
  }

  const amount = Number(req.body && req.body.amount);
  const reason = typeof (req.body && req.body.reason) === 'string' ? req.body.reason.trim() : 'Manual adjustment';

  if (!Number.isFinite(amount) || amount === 0) {
    return res.status(400).json({ error: 'amount must be a non-zero number' });
  }

  team.cash += amount;
  state.transactions.push({
    id: makeId('txn'),
    timestamp: nowIso(),
    type: 'manual_adjustment',
    teamId: team.id,
    teamName: team.name,
    amount,
    note: reason
  });

  saveState();
  broadcastState();
  res.json({ ok: true, team });
});

app.delete('/api/admin/teams/:teamId', requireAdmin, (req, res) => {
  const index = state.teams.findIndex((item) => item.id === req.params.teamId);
  if (index === -1) {
    return res.status(404).json({ error: 'Team not found' });
  }

  const [removed] = state.teams.splice(index, 1);
  state.transactions = state.transactions.filter((txn) => txn.teamId !== removed.id);

  saveState();
  broadcastState();
  res.json({ ok: true });
});

app.post('/api/admin/shapes', requireAdmin, (req, res) => {
  const { name, price, color, kind } = req.body || {};
  const numericPrice = Number(price);
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Shape name is required' });
  }
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    return res.status(400).json({ error: 'Shape price must be 0 or higher' });
  }

  const normalizedKind = typeof kind === 'string' && ALLOWED_SHAPE_KINDS.has(kind)
    ? kind
    : inferShapeKind(name);

  const shape = {
    id: makeId('shape'),
    name: name.trim(),
    kind: normalizedKind,
    price: numericPrice,
    color: typeof color === 'string' && color.trim() ? color.trim() : '#1f6f8b'
  };

  state.shapes.push(shape);
  syncActiveRoundFromShapes();
  saveState();
  broadcastState();
  res.status(201).json({ ok: true, shape });
});

app.put('/api/admin/shapes/:shapeId', requireAdmin, (req, res) => {
  const shape = state.shapes.find((item) => item.id === req.params.shapeId);
  if (!shape) {
    return res.status(404).json({ error: 'Shape not found' });
  }

  const { name, price, color, kind } = req.body || {};
  if (typeof name === 'string') {
    const trimmed = name.trim();
    if (trimmed) shape.name = trimmed;
  }
  if (price !== undefined) {
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ error: 'Shape price must be 0 or higher' });
    }
    shape.price = numericPrice;
  }
  if (typeof color === 'string' && color.trim()) {
    shape.color = color.trim();
  }
  if (typeof kind === 'string' && ALLOWED_SHAPE_KINDS.has(kind)) {
    shape.kind = kind;
  }
  if (!shape.kind) {
    shape.kind = inferShapeKind(shape.name);
  }

  syncActiveRoundFromShapes();
  saveState();
  broadcastState();
  res.json({ ok: true, shape });
});

app.delete('/api/admin/shapes/:shapeId', requireAdmin, (req, res) => {
  const index = state.shapes.findIndex((item) => item.id === req.params.shapeId);
  if (index === -1) {
    return res.status(404).json({ error: 'Shape not found' });
  }

  state.shapes.splice(index, 1);
  syncActiveRoundFromShapes();
  saveState();
  broadcastState();
  res.json({ ok: true });
});

app.post('/api/admin/transactions', requireAdmin, (req, res) => {
  const { teamId, shapeId, quantityAccepted, quantityRejected, note } = req.body || {};
  const accepted = Number(quantityAccepted || 0);
  const rejected = Number(quantityRejected || 0);

  const team = state.teams.find((item) => item.id === teamId);
  if (!team) {
    return res.status(400).json({ error: 'Valid teamId is required' });
  }

  const shape = state.shapes.find((item) => item.id === shapeId);
  if (!shape) {
    return res.status(400).json({ error: 'Valid shapeId is required' });
  }

  if (!Number.isFinite(accepted) || !Number.isFinite(rejected) || accepted < 0 || rejected < 0) {
    return res.status(400).json({ error: 'Quantities must be 0 or higher' });
  }

  if (accepted === 0 && rejected === 0) {
    return res.status(400).json({ error: 'At least one quantity must be greater than 0' });
  }

  const traded = accepted + rejected;
  const total = accepted * shape.price;
  team.cash += total;
  team.accepted += accepted;
  team.rejected += rejected;
  team.traded = (team.traded || 0) + traded;

  state.transactions.push({
    id: makeId('txn'),
    timestamp: nowIso(),
    type: 'sale',
    teamId: team.id,
    teamName: team.name,
    shapeId: shape.id,
    shapeName: shape.name,
    unitPrice: shape.price,
    quantityAccepted: accepted,
    quantityRejected: rejected,
    quantityTraded: traded,
    total,
    note: typeof note === 'string' ? note.trim() : ''
  });

  saveState();
  broadcastState();
  res.status(201).json({ ok: true, total, team });
});

app.post('/api/admin/buzzer', requireAdmin, (req, res) => {
  const message = typeof (req.body && req.body.message) === 'string' ? req.body.message.trim() : '';
  state.meta.paused = true;
  state.meta.buzzerCount += 1;
  state.meta.announcement = message || `Buzzer #${state.meta.buzzerCount}: Stop and listen for instructions.`;

  state.transactions.push({
    id: makeId('txn'),
    timestamp: nowIso(),
    type: 'buzzer',
    note: state.meta.announcement
  });

  saveState();
  broadcastState();
  res.json({ ok: true, meta: state.meta });
});

app.post('/api/admin/resume', requireAdmin, (req, res) => {
  state.meta.paused = false;
  state.meta.announcement = typeof (req.body && req.body.message) === 'string' ? req.body.message.trim() : 'Trading resumed. Continue building and selling.';

  state.transactions.push({
    id: makeId('txn'),
    timestamp: nowIso(),
    type: 'resume',
    note: state.meta.announcement
  });

  saveState();
  broadcastState();
  res.json({ ok: true, meta: state.meta });
});

app.post('/api/admin/reveal-winner', requireAdmin, (req, res) => {
  const ranked = rankTeams(state.teams);
  if (!ranked.length) {
    return res.status(400).json({ error: 'No teams available to reveal a winner' });
  }

  const winner = ranked[0];
  state.meta.revealWinner = true;
  state.meta.winnerTeamId = winner.id;
  state.meta.winnerName = winner.name;
  state.meta.announcement = `Winner reveal: ${winner.name} with £${winner.cash.toLocaleString()}!`;

  state.transactions.push({
    id: makeId('txn'),
    timestamp: nowIso(),
    type: 'winner_reveal',
    teamId: winner.id,
    teamName: winner.name,
    note: state.meta.announcement
  });

  saveState();
  broadcastState();
  res.json({ ok: true, winner });
});

app.post('/api/admin/hide-winner', requireAdmin, (req, res) => {
  state.meta.revealWinner = false;
  state.meta.winnerTeamId = '';
  state.meta.winnerName = '';

  saveState();
  broadcastState();
  res.json({ ok: true });
});

app.post('/api/admin/reset', requireAdmin, (req, res) => {
  const keepTeams = Boolean(req.body && req.body.keepTeams);
  const keepShapes = Boolean(req.body && req.body.keepShapes);

  const preservedTeams = keepTeams
    ? state.teams.map((team) => ({ ...team, cash: 0, accepted: 0, rejected: 0, traded: 0 }))
    : [];

  const preservedShapes = keepShapes ? [...state.shapes] : defaultShapes();
  const preservedRounds = keepShapes ? state.rounds.map((round) => ({ ...round, prices: { ...round.prices } })) : defaultRoundsFromShapes(preservedShapes);
  const resetRound = keepShapes ? state.meta.currentRound : 1;

  state = {
    ...defaultState(),
    teams: preservedTeams,
    shapes: preservedShapes,
    rounds: preservedRounds,
    transactions: []
  };
  applyRoundPrices(resetRound);

  saveState();
  broadcastState();
  res.json({ ok: true });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/countries', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'countries.html'));
});

app.get('/banker', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'banker.html'));
});

app.get('/team/:teamId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'team.html'));
});

io.on('connection', (socket) => {
  socket.emit('state:update', publicState());
  socket.emit('admin:update', adminState());
});

server.listen(PORT, () => {
  console.log(`Trading sim dashboard listening on port ${PORT}`);
});
