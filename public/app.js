// app.js - Client-side Socket.IO and UI logic

const socket = io();

// DOM elements
const createSessionDiv = document.getElementById('create-session');
const joinSessionDiv = document.getElementById('join-session');
const lobbyDiv = document.getElementById('lobby');
const gameDiv = document.getElementById('game');
const errorDiv = document.getElementById('error');

const hostNameInput = document.getElementById('host-name');
const createBtn = document.getElementById('create-btn');
const sessionCodeP = document.getElementById('session-code');

const playerNameInput = document.getElementById('player-name');
const joinCodeInput = document.getElementById('join-code');
const joinBtn = document.getElementById('join-btn');

const lobbyCodeSpan = document.getElementById('lobby-code');
const playersListDiv = document.getElementById('players-list');
const globalProgressLobbyDiv = document.getElementById('global-progress-lobby');
const globalProgressGameDiv = document.getElementById('global-progress-game');
const hostOverviewDiv = document.getElementById('host-overview');
const hostControlsDiv = document.getElementById('host-controls');
const totalPlayersInput = document.getElementById('total-players');
const impostersInput = document.getElementById('imposters');
const tasksPerPlayerInput = document.getElementById('tasks-per-player');
const startGameBtn = document.getElementById('start-game-btn');
const endGameBtn = document.getElementById('end-game-btn');
const endSessionBtn = document.getElementById('end-session-btn');
const taskTitleInput = document.getElementById('task-title');
const taskInstructionsInput = document.getElementById('task-instructions');
const taskCodeInput = document.getElementById('task-code');
const createTaskBtn = document.getElementById('create-task-btn');
const taskBankListDiv = document.getElementById('task-bank-list');

const roleDisplayDiv = document.getElementById('role-display');
const tasksDisplayDiv = document.getElementById('tasks-display');

// State
let currentPlayer = null;
let isHost = false;

function showSection(section) {
  [createSessionDiv, joinSessionDiv, lobbyDiv, gameDiv].forEach(div => div.classList.add('hidden'));
  section.classList.remove('hidden');
}

function showLanding() {
  createSessionDiv.classList.remove('hidden');
  joinSessionDiv.classList.remove('hidden');
  lobbyDiv.classList.add('hidden');
  gameDiv.classList.add('hidden');
  hostControlsDiv.classList.add('hidden');
  hostOverviewDiv.classList.add('hidden');
  globalProgressLobbyDiv.classList.add('hidden');
  globalProgressGameDiv.classList.add('hidden');
}

function showError(message) {
  errorDiv.textContent = message;
  errorDiv.classList.remove('hidden');
  setTimeout(() => errorDiv.classList.add('hidden'), 5000);
}

function clearStoredIdentity() {
  localStorage.removeItem('playerId');
  localStorage.removeItem('hostToken');
  localStorage.removeItem('sessionCode');
  currentPlayer = null;
  isHost = false;
}

function updatePlayersList(players, includeDetails = false) {
  if (!players || players.length === 0) {
    playersListDiv.innerHTML = '<p>No players yet</p>';
    return;
  }
  const items = players.map(p => {
    if (includeDetails) {
      const status = p.connected ? 'connected' : 'disconnected';
      const activeState = p.active ? 'Active' : 'Inactive';
      const role = p.role ? ` (${p.role})` : '';
      return `<li>${p.name}${role} - ${activeState} - ${status}</li>`;
    }
    return `<li>${p.name}</li>`;
  });
  playersListDiv.innerHTML = '<h3>Players:</h3><ul>' + items.join('') + '</ul>';
}

function renderGlobalProgress(progress) {
  if (!progress || typeof progress.completed !== 'number') {
    globalProgressLobbyDiv.classList.add('hidden');
    globalProgressGameDiv.classList.add('hidden');
    return;
  }
  const html = `<p>Global tasks completed: ${progress.completed} / ${progress.total}</p>`;
  globalProgressLobbyDiv.innerHTML = html;
  globalProgressGameDiv.innerHTML = html;
  globalProgressLobbyDiv.classList.remove('hidden');
  globalProgressGameDiv.classList.remove('hidden');
}

function updateHostOverview(state) {
  if (!state) return;
  console.log('Received hostState update', state);
  hostOverviewDiv.innerHTML = `
    <h3>Host Overview</h3>
    <p>Session: ${state.sessionCode}</p>
    <p>Phase: ${state.phase}</p>
    <p>Settings: ${state.settings.totalPlayers} players, ${state.settings.imposters} imposters, ${state.settings.tasksPerPlayer} tasks each</p>
    <p>Global tasks completed: ${state.taskProgress.completed} / ${state.taskProgress.total}</p>
    <h4>Players</h4>
    <ul>${state.players.map(p => `<li>${p.name} - ${p.role || 'unknown'} - ${p.active ? 'Active' : 'Inactive'} - ${p.connected ? 'connected' : 'disconnected'} - ${p.completedTasks}/${p.totalTasks} tasks</li>`).join('')}</ul>
    <h4>Task Bank</h4>
    <ul>
      ${state.taskBank.map(t => `
        <li>
          <strong>${t.title}</strong>: ${t.instructions}
          <div style="margin-top:5px;font-size:0.9em;color:#666;">
            Code: <code>${t.completionCode || '(none)'}</code>
          </div>
          ${t.active ? '' : '<em>(inactive)</em>'}
          <button data-task-action="edit" data-task-id="${t.taskId}">Edit</button>
          <button data-task-action="delete" data-task-id="${t.taskId}">Delete</button>
        </li>
      `).join('')}
    </ul>
  `;
  renderTaskBank(state.taskBank);
}

function renderTaskBank(taskBank) {
  if (!taskBank || taskBank.length === 0) {
    taskBankListDiv.innerHTML = '<p>No tasks in bank yet.</p>';
    return;
  }
  taskBankListDiv.innerHTML = '<h4>Existing Tasks</h4><ul>' + taskBank.map(t => `
    <li>
      <strong>${t.title}</strong>: ${t.instructions}
      <div style="margin-top:5px;font-size:0.9em;color:#666;">
        Code: <code>${t.completionCode || '(none)'}</code>
      </div>
      ${t.active ? '' : '<em>(inactive)</em>'}
      <button data-task-action="edit" data-task-id="${t.taskId}">Edit</button>
      <button data-task-action="delete" data-task-id="${t.taskId}">Delete</button>
    </li>
  `).join('') + '</ul>';
}

function renderPlayerTasks(tasks) {
  if (!tasks || tasks.length === 0) {
    tasksDisplayDiv.innerHTML = '<p>No tasks assigned yet.</p>';
    return;
  }

  tasksDisplayDiv.innerHTML = '<h3>Your Tasks</h3>' + tasks.map(task => {
    const status = task.completed ? 'Completed' : 'Active';
    const inputDisabled = task.completed ? 'disabled' : '';
    return `
      <div class="task-item">
        <h4>${task.title}</h4>
        <p>${task.instructions}</p>
        <p>Status: ${status}</p>
        ${task.completed ? '' : `<input type="text" id="task-code-${task.taskId}" placeholder="Enter completion code"><button data-task-id="${task.taskId}">Submit</button>`}
      </div>
    `;
  }).join('');

  tasksDisplayDiv.querySelectorAll('button[data-task-id]').forEach(button => {
    button.addEventListener('click', () => {
      const taskId = button.getAttribute('data-task-id');
      const input = document.getElementById(`task-code-${taskId}`);
      if (!input) return;
      const completionCode = input.value.trim();
      if (!completionCode) {
        showError('Please enter the completion code');
        return;
      }
      socket.emit('submitTaskCode', { taskId, completionCode });
    });
  });
}

function setSessionCode(code) {
  lobbyCodeSpan.textContent = code;
  sessionCodeP.textContent = `Session Code: ${code}`;
  localStorage.setItem('sessionCode', code);
}

function applySettings(settings) {
  totalPlayersInput.value = settings.totalPlayers;
  impostersInput.value = settings.imposters;
  tasksPerPlayerInput.value = settings.tasksPerPlayer;
}

createBtn.addEventListener('click', () => {
  const name = hostNameInput.value.trim();
  if (!name) {
    showError('Please enter your name');
    return;
  }
  socket.emit('createSession', { name });
});

joinBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  const code = joinCodeInput.value.trim();
  if (!name || !code) {
    showError('Please enter name and session code');
    return;
  }
  socket.emit('joinSession', { name, code });
});

startGameBtn.addEventListener('click', () => {
  socket.emit('startGame');
});

endGameBtn.addEventListener('click', () => {
  console.log('End Game button clicked');
  if (!isHost) {
    showError('Only host can end the game');
    return;
  }
  socket.emit('endGame');
});

endSessionBtn.addEventListener('click', () => {
  console.log('End Session button clicked');
  if (!isHost) {
    showError('Only host can end the session');
    return;
  }
  socket.emit('endSession');
});

createTaskBtn.addEventListener('click', () => {
  if (!isHost) {
    showError('Only host can create tasks');
    return;
  }
  const title = taskTitleInput.value.trim();
  const instructions = taskInstructionsInput.value.trim();
  const completionCode = taskCodeInput.value.trim();
  if (!title || !instructions || !completionCode) {
    showError('All task fields are required');
    return;
  }
  console.log('Creating task:', title, instructions, completionCode);
  socket.emit('createTask', { title, instructions, completionCode });
  taskTitleInput.value = '';
  taskInstructionsInput.value = '';
  taskCodeInput.value = '';
});

hostOverviewDiv.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-task-action]');
  if (!button) return;
  const action = button.getAttribute('data-task-action');
  const taskId = button.getAttribute('data-task-id');
  if (!action || !taskId) return;

  if (action === 'delete') {
    console.log('Deleting task from host overview:', taskId);
    socket.emit('deleteTask', { taskId });
    return;
  }

  if (action === 'edit') {
    const title = prompt('New task title:');
    if (title === null) return;
    const instructions = prompt('New task instructions:');
    if (instructions === null) return;
    const completionCode = prompt('New completion code:');
    if (completionCode === null) return;
    console.log('Editing task from host overview:', taskId, title, instructions, completionCode);
    socket.emit('editTask', { taskId, title, instructions, completionCode });
  }
});

taskBankListDiv.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-task-action]');
  if (!button) return;
  const action = button.getAttribute('data-task-action');
  const taskId = button.getAttribute('data-task-id');
  if (!action || !taskId) return;

  if (action === 'delete') {
    console.log('Deleting task:', taskId);
    socket.emit('deleteTask', { taskId });
    return;
  }

  if (action === 'edit') {
    const taskInOverride = taskBankListDiv.textContent;
    const title = prompt('New task title:');
    if (title === null) return;
    const instructions = prompt('New task instructions:');
    if (instructions === null) return;
    const completionCode = prompt('New completion code:');
    if (completionCode === null) return;
    console.log('Editing task from task bank:', taskId, title, instructions, completionCode);
    socket.emit('editTask', { taskId, title, instructions, completionCode });
  }
});

[totalPlayersInput, impostersInput, tasksPerPlayerInput].forEach(input => {
  input.addEventListener('change', () => {
    if (isHost) {
      socket.emit('updateSettings', {
        totalPlayers: parseInt(totalPlayersInput.value, 10),
        imposters: parseInt(impostersInput.value, 10),
        tasksPerPlayer: parseInt(tasksPerPlayerInput.value, 10)
      });
    }
  });
});

socket.on('sessionCreated', (data) => {
  localStorage.setItem('hostToken', data.hostToken);
  setSessionCode(data.code);
  currentPlayer = { role: 'host' };
  isHost = true;
  showSection(lobbyDiv);
  hostControlsDiv.classList.remove('hidden');
  hostOverviewDiv.classList.remove('hidden');
  socket.emit('getTaskBank');
});

socket.on('joined', (data) => {
  localStorage.setItem('playerId', data.player.playerId);
  localStorage.setItem('sessionCode', data.sessionCode);
  currentPlayer = data.player;
  isHost = false;
  showSection(lobbyDiv);
  hostControlsDiv.classList.add('hidden');
});

socket.on('rejoined', (data) => {
  localStorage.setItem('playerId', data.player.playerId);
  localStorage.setItem('sessionCode', data.sessionCode);
  currentPlayer = data.player;
  isHost = false;
  showSection(lobbyDiv);
  hostControlsDiv.classList.add('hidden');
});

socket.on('hostReconnected', (data) => {
  setSessionCode(data.sessionCode);
  currentPlayer = { role: 'host' };
  isHost = true;
  showSection(lobbyDiv);
  hostControlsDiv.classList.remove('hidden');
  hostOverviewDiv.classList.remove('hidden');
  socket.emit('getTaskBank');
});

socket.on('gameState', (state) => {
  console.log('Received gameState', state);
  if (state.phase === 'lobby') {
    showSection(lobbyDiv);
    updatePlayersList(state.players);
    if (isHost) {
      hostControlsDiv.classList.remove('hidden');
      hostOverviewDiv.classList.remove('hidden');
    }
    applySettings(state.settings);
    renderGlobalProgress(state.taskProgress);
  } else if (state.phase === 'running') {
    showSection(gameDiv);
    roleDisplayDiv.innerHTML = `<h3>Your Role: ${state.myRole}</h3>`;
    if (state.myRole === 'crewmate') {
      renderPlayerTasks(state.myTasks);
    } else {
      tasksDisplayDiv.innerHTML = '<p>As imposter, you have no tasks. Sabotage the crew!</p>';
    }
    renderGlobalProgress(state.taskProgress);
  }
});

socket.on('hostState', (state) => {
  console.log('Received hostState', state);
  showSection(lobbyDiv);
  updatePlayersList(state.players, true);
  hostOverviewDiv.classList.remove('hidden');
  hostControlsDiv.classList.remove('hidden');
  setSessionCode(state.sessionCode);
  applySettings(state.settings);
  renderGlobalProgress(state.taskProgress);
  updateHostOverview(state);
});

socket.on('taskBank', (data) => {
  console.log('Received task bank update', data);
  renderTaskBank(data.taskBank);
});

socket.on('gameEnded', (data) => {
  showSection(lobbyDiv);
  updatePlayersList(data.players);
  renderGlobalProgress(data.taskProgress || { completed: 0, total: 0 });
  showError('Game ended. Players returned to lobby.');
});

socket.on('sessionEnded', () => {
  clearStoredIdentity();
  showLanding();
  showError('Session Ended');
});

socket.on('playersUpdated', (data) => {
  updatePlayersList(data.players, isHost);
});

socket.on('settingsUpdated', (settings) => {
  applySettings(settings);
});

socket.on('gameStarted', (state) => {
  showSection(gameDiv);
  roleDisplayDiv.innerHTML = `<h3>Your Role: ${state.myRole}</h3>`;
  if (state.myRole === 'crewmate') {
    renderPlayerTasks(state.myTasks);
  } else {
    tasksDisplayDiv.innerHTML = '<p>As imposter, you have no tasks. Sabotage the crew!</p>';
  }
  renderGlobalProgress(state.taskProgress);
});

socket.on('taskUpdated', (data) => {
  if (data.myTasks) {
    renderPlayerTasks(data.myTasks);
  }
  renderGlobalProgress(data.taskProgress);
});

socket.on('updateGlobalTaskProgress', (progress) => {
  renderGlobalProgress(progress);
});

socket.on('updateHostTaskOverview', (state) => {
  updateHostOverview(state);
});

socket.on('rejoinFailed', (data) => {
  clearStoredIdentity();
  showLanding();
  showError(data.message);
});

socket.on('hostReconnectFailed', (data) => {
  clearStoredIdentity();
  showLanding();
  showError(data.message);
});

socket.on('error', (message) => {
  showError(message);
});

function tryReconnect() {
  const playerId = localStorage.getItem('playerId');
  const hostToken = localStorage.getItem('hostToken');
  const sessionCode = localStorage.getItem('sessionCode');

  if (hostToken && sessionCode) {
    socket.emit('hostReconnect', { hostToken, code: sessionCode });
    return;
  }

  if (playerId && sessionCode) {
    socket.emit('rejoinSession', { playerId, code: sessionCode });
  }
}

showLanding();
tryReconnect();