const seatingForm = document.getElementById('seatingForm');
const attendeeCountInput = document.getElementById('attendeeCount');
const studentNamesInput = document.getElementById('studentNames');
const seatingStatus = document.getElementById('seatingStatus');
const seatingSummary = document.getElementById('seatingSummary');
const tableGrid = document.getElementById('tableGrid');
const printPlanBtn = document.getElementById('printPlanBtn');
const assignStudentBtn = document.getElementById('assignStudentBtn');
const undoAssignBtn = document.getElementById('undoAssignBtn');
const assignmentDisplay = document.getElementById('assignmentDisplay');
const assignmentSubtext = document.getElementById('assignmentSubtext');
const assignmentPanel = document.getElementById('assignmentPanel');

const STORAGE_KEY = 'seating-plan-state-v1';
const GROUP_LABELS = [
  'Red 1', 'Red 2', 'Red 3', 'Red 4',
  'Blue 1', 'Blue 2', 'Blue 3', 'Blue 4',
  'Green 1', 'Green 2', 'Green 3', 'Green 4'
];

function setStatus(message) {
  seatingStatus.textContent = message;
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildRoster() {
  const attendeeCount = Number(attendeeCountInput.value);
  if (!Number.isFinite(attendeeCount) || attendeeCount < 1) {
    throw new Error('Enter a valid attendee count');
  }

  const enteredNames = studentNamesInput.value
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean);

  if (enteredNames.length > attendeeCount) {
    throw new Error('You entered more student names than the attendee count');
  }

  const roster = [...enteredNames];
  for (let i = enteredNames.length; i < attendeeCount; i += 1) {
    roster.push(`Student ${i + 1}`);
  }

  return roster;
}

function splitIntoTables(students) {
  const maxPerTable = 10;
  const tableCount = Math.max(1, Math.ceil(students.length / maxPerTable));
  const minPerTable = Math.floor(students.length / tableCount);
  const remainder = students.length % tableCount;

  const tables = [];
  let cursor = 0;
  for (let i = 0; i < tableCount; i += 1) {
    const tableSize = minPerTable + (i < remainder ? 1 : 0);
    tables.push(students.slice(cursor, cursor + tableSize));
    cursor += tableSize;
  }

  return tables;
}

function groupLabel(index) {
  return GROUP_LABELS[index] || `Group ${index + 1}`;
}

function groupColorClass(label = '') {
  const color = String(label).split(' ')[0].toLowerCase();
  if (color === 'red' || color === 'blue' || color === 'green') {
    return `seating-assign-${color}`;
  }
  return 'seating-assign-neutral';
}

function buildSeatQueue(tables) {
  const queue = [];
  const maxSeats = Math.max(...tables.map((table) => table.length));

  for (let seatIndex = 0; seatIndex < maxSeats; seatIndex += 1) {
    const activeTables = tables
      .map((table, tableIndex) => ({
        student: table[seatIndex],
        table: tableIndex + 1,
        seat: seatIndex + 1
      }))
      .filter((entry) => entry.student);

    queue.push(...shuffle(activeTables));
  }

  return queue;
}

function readState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function renderSummary(tables, totalStudents) {
  const sizes = tables.map((table) => table.length);
  seatingSummary.innerHTML = `
    <article class="list-item">
      <div class="list-head">
        <strong>Total students</strong>
        <span>${totalStudents}</span>
      </div>
    </article>
    <article class="list-item">
      <div class="list-head">
        <strong>Total groups</strong>
        <span>${tables.length}</span>
      </div>
    </article>
    <article class="list-item">
      <div class="list-head">
        <strong>Group sizes</strong>
        <span>${sizes.join(', ')}</span>
      </div>
    </article>
  `;
}

function renderTables(state) {
  const counts = {};
  (state.assigned || []).forEach((entry) => {
    counts[entry.table] = (counts[entry.table] || 0) + 1;
  });

  tableGrid.innerHTML = '';

  state.tables.forEach((table, index) => {
    const card = document.createElement('article');
    card.className = 'team-card seating-table-card';
    const label = groupLabel(index);
    const colorClass = `seating-group-${label.split(' ')[0].toLowerCase()}`;
    card.innerHTML = `
      <div class="list-head ${colorClass}">
        <strong>${label}</strong>
        <span>${counts[index + 1] || 0} / ${table.length} assigned</span>
      </div>
      <ol class="seating-student-list">
        ${table.map((student) => {
          const assigned = (state.assigned || []).some((entry) => entry.student === student && entry.table === index + 1);
          return `<li class="${assigned ? 'assigned-seat' : ''}">${student}</li>`;
        }).join('')}
      </ol>
    `;
    tableGrid.appendChild(card);
  });
}

function renderAssignment(state) {
  const last = state.lastAssigned;
  if (!last) {
    assignmentDisplay.textContent = 'Tap below to begin';
    assignmentSubtext.textContent = `${state.remaining.length} students waiting`;
    assignmentPanel.className = 'seating-assignment-panel seating-assign-neutral';
    return;
  }

  const label = groupLabel(last.table - 1);
  assignmentDisplay.textContent = label;
  assignmentSubtext.textContent = `${last.student} -> Seat ${last.seat} • ${state.remaining.length} students left`;
  assignmentPanel.className = `seating-assignment-panel ${groupColorClass(label)}`;
}

function renderState(state) {
  renderSummary(state.tables, state.totalStudents);
  renderTables(state);
  renderAssignment(state);
  setStatus(`Plan ready: ${state.totalStudents} students across ${state.tables.length} groups.`);
}

function generatePlan() {
  const roster = buildRoster();
  const randomized = shuffle(roster);
  const tables = splitIntoTables(randomized);
  const state = {
    totalStudents: roster.length,
    tables,
    remaining: buildSeatQueue(tables),
    assigned: [],
    lastAssigned: null
  };
  saveState(state);
  renderState(state);
}

function assignNextStudent() {
  const state = readState();
  if (!state || !Array.isArray(state.remaining) || !state.remaining.length) {
    assignmentDisplay.textContent = 'All students assigned';
    assignmentSubtext.textContent = 'Reset the plan if attendance changes.';
    assignmentPanel.className = 'seating-assignment-panel seating-assign-neutral';
    setStatus('All available seats have been assigned.');
    return;
  }

  const next = state.remaining.shift();
  state.assigned.push(next);
  state.lastAssigned = next;
  saveState(state);
  renderState(state);
}

function undoLastAssignment() {
  const state = readState();
  if (!state || !Array.isArray(state.assigned) || !state.assigned.length) {
    setStatus('Nothing to undo.');
    return;
  }

  const last = state.assigned.pop();
  state.remaining.unshift(last);
  state.lastAssigned = state.assigned[state.assigned.length - 1] || null;
  saveState(state);
  renderState(state);
}

seatingForm.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    generatePlan();
  } catch (error) {
    setStatus(error.message);
    seatingSummary.innerHTML = '';
    tableGrid.innerHTML = '';
    assignmentDisplay.textContent = 'Tap below to begin';
    assignmentSubtext.textContent = 'No student assigned yet';
    assignmentPanel.className = 'seating-assignment-panel seating-assign-neutral';
  }
});

printPlanBtn.addEventListener('click', () => {
  window.print();
});

assignStudentBtn.addEventListener('click', () => {
  assignNextStudent();
});

undoAssignBtn.addEventListener('click', () => {
  undoLastAssignment();
});

const existingState = readState();
if (existingState && Array.isArray(existingState.tables) && Array.isArray(existingState.remaining)) {
  attendeeCountInput.value = existingState.totalStudents || attendeeCountInput.value;
  renderState(existingState);
} else {
  generatePlan();
}
