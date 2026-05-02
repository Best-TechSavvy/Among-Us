// app.js - Client-side Socket.IO and UI logic

const socket = io();

// --- DOM refs ---
const createSessionDiv = document.getElementById('create-session');
const joinSessionDiv = document.getElementById('join-session');
const lobbyDiv = document.getElementById('lobby');
const gameDiv = document.getElementById('game');
const meetingDiv = document.getElementById('meeting');
const gameOverDiv = document.getElementById('game-over');
const errorDiv = document.getElementById('error');

const hostNameInput = document.getElementById('host-name');
const createBtn = document.getElementById('create-btn');
const sessionCodeP = document.getElementById('lobby-name-display');

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

const announcementListDiv = document.getElementById('announcement-list');
const announcementListGameDiv = document.getElementById('announcement-list-game');
const announcementTextInput = document.getElementById('announcement-text');
const announcementSendBtn = document.getElementById('announcement-send-btn');

const roleDisplayDiv = document.getElementById('role-display');
const aliveStatusDiv = document.getElementById('alive-status');
const tasksDisplayDiv = document.getElementById('tasks-display');
const meetingBtnContainer = document.getElementById('meeting-btn-container');
const callMeetingBtn = document.getElementById('call-meeting-btn');
const hostGameControlsDiv = document.getElementById('host-game-controls');
const hostGameOverviewDiv = document.getElementById('host-game-overview');
const forceResolveBtn = document.getElementById('force-resolve-btn');

const meetingHeader = document.getElementById('meeting-header');
const votingArea = document.getElementById('voting-area');
const voteStatusDisplay = document.getElementById('vote-status-display');
const meetingResultsDiv = document.getElementById('meeting-results');
const hostMeetingControls = document.getElementById('host-meeting-controls');
const forceResolveMeetingBtn = document.getElementById('force-resolve-meeting-btn');

const gameOverContent = document.getElementById('game-over-content');
const hostGameoverControls = document.getElementById('host-gameover-controls');
const playAgainBtn = document.getElementById('play-again-btn');
const endSessionBtn3 = document.getElementById('end-session-btn-3');

const endGameBtn2 = document.getElementById('end-game-btn-2');
const endSessionBtn2 = document.getElementById('end-session-btn-2');

// --- State ---
let currentPlayer = null;
let isHost = false;
let myVote = null; // track local vote for UI

// --- Section management ---
const ALL_SECTIONS = [createSessionDiv, joinSessionDiv, lobbyDiv, gameDiv, meetingDiv, gameOverDiv];

function showSection(section) {
  ALL_SECTIONS.forEach(div => div.classList.add('hidden'));
  if (Array.isArray(section)) {
    section.forEach(s => s.classList.remove('hidden'));
  } else {
    section.classList.remove('hidden');
  }
}

function showLanding() {
  ALL_SECTIONS.forEach(div => div.classList.add('hidden'));
  createSessionDiv.classList.remove('hidden');
  joinSessionDiv.classList.remove('hidden');
  // Reset host-specific UI
  hostControlsDiv.classList.add('hidden');
  hostOverviewDiv.classList.add('hidden');
  hostGameControlsDiv.classList.add('hidden');
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
  localStorage.removeItem('lobbyName');
  localStorage.removeItem('sessionCode');
  currentPlayer = null;
  isHost = false;
}

// --- Players list ---
function updatePlayersList(players, includeDetails = false) {
  if (!players || players.length === 0) {
    playersListDiv.innerHTML = '<p>No players yet</p>';
    return;
  }
  const items = players.map(p => {
    const dotClass = !p.connected ? 'dot-disconnected' : (!p.alive ? 'dot-dead' : 'dot-connected');
    let label = p.name;
    if (includeDetails) {
      const tags = [];
      if (p.role) tags.push(`<em>${p.role}</em>`);
      if (!p.alive) tags.push('<span style="color:#888">💀 Dead</span>');
      if (!p.connected) tags.push('<span style="color:#e94560">⚡ Disconnected</span>');
      if (p.completedTasks !== undefined) tags.push(`${p.completedTasks}/${p.totalTasks} tasks`);
      if (p.playerId && isHost) {
        tags.push(`<button data-action="kick" data-player-id="${p.playerId}" style="padding:2px 8px;font-size:0.75em;background:#555;">Kick</button>`);
      }
      if (tags.length) label += ' — ' + tags.join(' ');
    }
    return `<li><span class="player-dot ${dotClass}"></span>${label}</li>`;
  });
  playersListDiv.innerHTML = '<h3>Players (' + players.length + ')</h3><ul>' + items.join('') + '</ul>';
}

// --- Progress bar ---
function renderGlobalProgress(progress, containerDiv) {
  if (!progress || typeof progress.completed !== 'number') {
    containerDiv.classList.add('hidden');
    return;
  }
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  containerDiv.innerHTML = `
    <div>Tasks: ${progress.completed} / ${progress.total} (${pct}%)</div>
    <div class="progress-bar-track">
      <div class="progress-bar-fill" style="width:${pct}%"></div>
    </div>
  `;
  containerDiv.classList.remove('hidden');
}

function updateAllProgress(progress) {
  renderGlobalProgress(progress, globalProgressLobbyDiv);
  renderGlobalProgress(progress, globalProgressGameDiv);
}

// --- Host overview ---
function updateHostOverview(state) {
  if (!state) return;
  hostOverviewDiv.innerHTML = `
    <h3>Host Overview</h3>
    <p>Lobby: <strong>${state.lobbyName}</strong> &nbsp;|&nbsp; Phase: <strong>${state.phase}</strong></p>
    <h4>Players</h4>
    <ul>
      ${state.players.map(p => `
        <li>
          <span class="player-dot ${p.connected ? (p.alive ? 'dot-connected' : 'dot-dead') : 'dot-disconnected'}"></span>
          <strong>${p.name}</strong>
          ${p.role ? `<em style="color:${p.role === 'imposter' ? '#e94560' : '#06d6a0'}">(${p.role})</em>` : ''}
          ${!p.alive ? '<span style="color:#888">💀</span>' : ''}
          ${p.totalTasks > 0 ? `${p.completedTasks}/${p.totalTasks} tasks` : ''}
          ${!p.connected ? '<span style="color:#e94560;font-size:0.8em">disconnected</span>' : ''}
          <button data-action="kick" data-player-id="${p.playerId}" style="background:#555;">Kick</button>
        </li>
      `).join('')}
    </ul>
    ${state.meeting ? `
    <h4>Meeting in progress</h4>
    <p>Called by: ${state.meeting.calledByName} — ${state.meeting.voteStatus.totalVoted}/${state.meeting.voteStatus.totalVoters} voted</p>
    ` : ''}
  `;
  renderTaskBank(state.taskBank);
}

function updateHostGameOverview(state) {
  if (!state || !hostGameOverviewDiv) return;
  hostGameOverviewDiv.innerHTML = `
    <h4>Player Status</h4>
    <table>
      <tr><th>Name</th><th>Role</th><th>Status</th><th>Tasks</th><th>Connected</th></tr>
      ${state.players.map(p => `
        <tr>
          <td>${p.name}</td>
          <td style="color:${p.role === 'imposter' ? '#e94560' : '#06d6a0'}">${p.role || '—'}</td>
          <td>${p.alive ? '✅ Alive' : '💀 Dead'}</td>
          <td>${p.totalTasks > 0 ? `${p.completedTasks}/${p.totalTasks}` : '—'}</td>
          <td>${p.connected ? '🟢' : '🔴'}</td>
        </tr>
      `).join('')}
    </table>
  `;
}

function renderTaskBank(taskBank) {
  if (!taskBank || taskBank.length === 0) {
    taskBankListDiv.innerHTML = '<p>No tasks in bank yet.</p>';
    return;
  }
  taskBankListDiv.innerHTML = '<ul>' + taskBank.map(t => `
    <li>
      <strong>${t.title}</strong>${!t.active ? ' <em style="color:#888">(inactive)</em>' : ''}
      <div style="font-size:0.85em;color:#aaa;margin:4px 0;">${t.instructions}</div>
      <div style="font-size:0.85em;color:#888;">Code: <code>${t.completionCode || '(none)'}</code></div>
      <button data-task-action="edit" data-task-id="${t.taskId}" style="background:#0f3460;">Edit</button>
      <button data-task-action="delete" data-task-id="${t.taskId}" style="background:#555;">Delete</button>
    </li>
  `).join('') + '</ul>';
}

// --- Player tasks ---
function renderPlayerTasks(tasks) {
  if (!tasks || tasks.length === 0) {
    tasksDisplayDiv.innerHTML = '<p>No tasks assigned.</p>';
    return;
  }
  tasksDisplayDiv.innerHTML = '<h3>Your Tasks</h3>' + tasks.map(task => {
    const done = task.completed;
    return `
      <div class="task-item ${done ? 'completed' : ''}">
        <h4>${task.title}</h4>
        <p>${task.instructions}</p>
        <p class="task-status ${done ? 'done' : 'pending'}">${done ? '✅ Completed' : '⏳ Pending'}</p>
        ${done ? '' : `
          <input type="text" id="task-code-${task.taskId}" placeholder="Enter completion code">
          <button data-task-id="${task.taskId}">Submit</button>
        `}
      </div>
    `;
  }).join('');

  tasksDisplayDiv.querySelectorAll('button[data-task-id]').forEach(button => {
    button.addEventListener('click', () => {
      const taskId = button.getAttribute('data-task-id');
      const input = document.getElementById(`task-code-${taskId}`);
      if (!input) return;
      const completionCode = input.value.trim();
      if (!completionCode) { showError('Please enter the completion code'); return; }
      socket.emit('submitTaskCode', { taskId, completionCode });
    });
  });
}

// --- Announcements ---
function renderAnnouncement(message, containerDiv) {
  if (!containerDiv) return;
  const msgEl = document.createElement('div');
  msgEl.className = 'announcement-item';
  const time = message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : '';
  msgEl.innerHTML = `<span class="announcement-sender">${message.senderLabel || 'HOST'}</span><span class="announcement-time">${time}</span><br><span>${message.text}</span>`;
  containerDiv.appendChild(msgEl);
  containerDiv.scrollTop = containerDiv.scrollHeight;
}

function renderAnnouncements(messages) {
  if (announcementListDiv) announcementListDiv.innerHTML = '';
  if (announcementListGameDiv) announcementListGameDiv.innerHTML = '';
  if (!Array.isArray(messages)) return;
  messages.forEach(msg => {
    renderAnnouncement(msg, announcementListDiv);
    renderAnnouncement(msg, announcementListGameDiv);
  });
}

// --- Helpers ---
function setLobbyName(code) {
  if (lobbyCodeSpan) lobbyCodeSpan.textContent = code;
  if (sessionCodeP) sessionCodeP.textContent = `Lobby Name: ${code}`;
  localStorage.setItem('lobbyName', code);
}

function applySettings(settings) {
  if (totalPlayersInput) totalPlayersInput.value = settings.totalPlayers;
  if (impostersInput) impostersInput.value = settings.imposters;
  if (tasksPerPlayerInput) tasksPerPlayerInput.value = settings.tasksPerPlayer;
}

function updateAnnouncementInputState() {
  if (announcementTextInput) announcementTextInput.disabled = !isHost;
  if (announcementSendBtn) announcementSendBtn.disabled = !isHost;
}

// --- Voting / Meeting ---
function showMeetingScreen(data, isVotingOpen) {
  showSection(meetingDiv);
  myVote = data.myVote || null;

  meetingHeader.innerHTML = `
    <h2>🚨 Emergency Meeting</h2>
    <p>Called by <strong>${data.calledByName}</strong></p>
  `;

  meetingResultsDiv.classList.add('hidden');

  if (isVotingOpen) {
    renderVotingUI(data.players);
  }

  if (data.voteStatus) renderVoteStatus(data.voteStatus);

  // Host controls during meeting
  if (isHost) {
    hostMeetingControls.classList.remove('hidden');
  }
}

function renderVotingUI(players) {
  const alivePlayers = players.filter(p => p.alive);

  votingArea.innerHTML = `<h3>Vote to eject a player (or skip):</h3>
  <div class="vote-grid">
    ${alivePlayers.map(p => {
      // Don't show the current player as a vote option (can't vote yourself in most rulesets)
      const isMe = currentPlayer && p.playerId === currentPlayer.playerId;
      const selected = myVote === p.playerId ? 'selected' : '';
      return `<button class="vote-btn ${selected}" data-vote-target="${p.playerId}" ${isMe ? 'style="border-color:#555;opacity:0.7"' : ''}>${isMe ? '👤 ' : ''}${p.name}</button>`;
    }).join('')}
    <button class="vote-btn skip-btn ${myVote === 'skip' ? 'selected' : ''}" data-vote-target="skip">⏭ Skip</button>
  </div>`;

  if (myVote) {
    votingArea.querySelectorAll('.vote-btn').forEach(btn => btn.disabled = true);
  } else {
    votingArea.querySelectorAll('.vote-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-vote-target');
        myVote = target;
        socket.emit('castVote', { targetId: target });
        // Disable all vote buttons after voting
        votingArea.querySelectorAll('.vote-btn').forEach(b => b.disabled = true);
        votingArea.querySelectorAll('.vote-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }
}

function renderVoteStatus(voteStatus) {
  voteStatusDisplay.textContent = `Votes cast: ${voteStatus.totalVoted} / ${voteStatus.totalVoters}`;
}

function showMeetingResults(data) {
  votingArea.innerHTML = '';
  voteStatusDisplay.textContent = '';
  hostMeetingControls.classList.add('hidden');

  meetingResultsDiv.classList.remove('hidden');
  const ejected = data.ejectedPlayer;

  let resultHTML = '';
  if (ejected) {
    const wasImposter = ejected.role === 'imposter';
    resultHTML = `
      <h3>🚀 ${ejected.name} was ejected!</h3>
      <p style="color:${wasImposter ? '#e94560' : '#06d6a0'};font-weight:700;font-size:1.2em;">
        ${ejected.name} was ${wasImposter ? 'an Imposter 😈' : 'NOT an Imposter 😇'}
      </p>
    `;
  } else {
    resultHTML = `<h3>No one was ejected (skip or tie)</h3>`;
  }

  // Show vote breakdown
  const voteCounts = data.voteCounts || {};
  const voteLines = Object.entries(voteCounts).map(([targetId, count]) => {
    if (targetId === 'skip') return `Skip: ${count} vote(s)`;
    const target = data.players ? data.players.find(p => p.playerId === targetId) : null;
    return `${target ? target.name : 'Unknown'}: ${count} vote(s)`;
  });
  if (voteLines.length) {
    resultHTML += `<p style="font-size:0.85em;color:#aaa;">${voteLines.join(' | ')}</p>`;
  }

  resultHTML += `<p style="color:#888;font-size:0.9em;margin-top:12px;">Returning to game...</p>`;
  meetingResultsDiv.innerHTML = resultHTML;

  // Auto-return to game after 4 seconds
  setTimeout(() => {
    meetingDiv.classList.add('hidden');
    gameDiv.classList.remove('hidden');
    myVote = null;
  }, 4000);
}

function showGameOver(data) {
  showSection(gameOverDiv);
  myVote = null;

  const isCrewWin = data.winner === 'crewmates';
  const winClass = isCrewWin ? 'win-crewmates' : 'win-imposters';
  const winEmoji = isCrewWin ? '🎉' : '😈';
  const winTitle = isCrewWin ? 'Crewmates Win!' : 'Imposters Win!';

  const playerList = (data.players || []).map(p => {
    const roleClass = p.role === 'imposter' ? 'reveal-imposter' : 'reveal-crewmate';
    const deadClass = !p.alive ? 'reveal-dead' : '';
    const deadIcon = !p.alive ? ' 💀' : '';
    return `<li class="${roleClass} ${deadClass}">${p.name}${deadIcon} (${p.role})</li>`;
  }).join('');

  gameOverContent.innerHTML = `
    <div class="${winClass}">
      <h2>${winEmoji} ${winTitle}</h2>
      <p class="game-over-reason">${data.reason}</p>
      <ul class="reveal-list">${playerList}</ul>
    </div>
  `;

  if (isHost) {
    hostGameoverControls.classList.remove('hidden');
  } else {
    hostGameoverControls.classList.add('hidden');
  }
}

// --- Event listeners ---

createBtn.addEventListener('click', () => {
  const name = hostNameInput.value.trim();
  if (!name) { showError('Please enter your name'); return; }
  socket.emit('createSession', { name });
});

joinBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  const code = joinCodeInput.value.trim();
  if (!name || !code) { showError('Please enter name and lobby name'); return; }
  socket.emit('joinLobby', { name, code });
});

startGameBtn.addEventListener('click', () => socket.emit('startGame'));

endGameBtn.addEventListener('click', () => {
  if (!isHost) { showError('Only host can end the game'); return; }
  socket.emit('endGame');
});
if (endGameBtn2) endGameBtn2.addEventListener('click', () => {
  if (!isHost) return;
  socket.emit('endGame');
});

endSessionBtn.addEventListener('click', () => {
  if (!isHost) { showError('Only host can end the session'); return; }
  socket.emit('endSession');
});
if (endSessionBtn2) endSessionBtn2.addEventListener('click', () => {
  if (!isHost) return;
  socket.emit('endSession');
});
if (endSessionBtn3) endSessionBtn3.addEventListener('click', () => {
  if (!isHost) return;
  socket.emit('endSession');
});

if (playAgainBtn) playAgainBtn.addEventListener('click', () => socket.emit('endGame'));

createTaskBtn.addEventListener('click', () => {
  if (!isHost) { showError('Only host can create tasks'); return; }
  const title = taskTitleInput.value.trim();
  const instructions = taskInstructionsInput.value.trim();
  const completionCode = taskCodeInput.value.trim();
  if (!title || !instructions || !completionCode) { showError('All task fields are required'); return; }
  socket.emit('createTask', { title, instructions, completionCode });
  taskTitleInput.value = '';
  taskInstructionsInput.value = '';
  taskCodeInput.value = '';
});

if (announcementSendBtn) {
  announcementSendBtn.addEventListener('click', () => {
    if (!isHost) return;
    const text = announcementTextInput.value.trim();
    if (!text) { showError('Announcement cannot be empty'); return; }
    socket.emit('sendAnnouncement', { text });
    announcementTextInput.value = '';
  });
}

if (callMeetingBtn) {
  callMeetingBtn.addEventListener('click', () => {
    socket.emit('callMeeting');
  });
}

if (forceResolveBtn) {
  forceResolveBtn.addEventListener('click', () => socket.emit('forceResolveVoting'));
}
if (forceResolveMeetingBtn) {
  forceResolveMeetingBtn.addEventListener('click', () => socket.emit('forceResolveVoting'));
}

// Host overview delegation (kick, edit task, delete task)
hostOverviewDiv.addEventListener('click', (event) => {
  const kickBtn = event.target.closest('button[data-action="kick"]');
  if (kickBtn) {
    const playerId = kickBtn.getAttribute('data-player-id');
    if (playerId) socket.emit('kickPlayer', { playerId });
    return;
  }
  handleTaskButtonClick(event);
});

taskBankListDiv.addEventListener('click', handleTaskButtonClick);

playersListDiv.addEventListener('click', (event) => {
  const kickBtn = event.target.closest('button[data-action="kick"]');
  if (kickBtn) {
    const playerId = kickBtn.getAttribute('data-player-id');
    if (playerId) socket.emit('kickPlayer', { playerId });
  }
});

function handleTaskButtonClick(event) {
  const button = event.target.closest('button[data-task-action]');
  if (!button) return;
  const action = button.getAttribute('data-task-action');
  const taskId = button.getAttribute('data-task-id');
  if (!action || !taskId) return;

  if (action === 'delete') {
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
    socket.emit('editTask', { taskId, title, instructions, completionCode });
  }
}

[totalPlayersInput, impostersInput, tasksPerPlayerInput].forEach(input => {
  if (input) input.addEventListener('change', () => {
    if (isHost) {
      socket.emit('updateSettings', {
        totalPlayers: parseInt(totalPlayersInput.value, 10),
        imposters: parseInt(impostersInput.value, 10),
        tasksPerPlayer: parseInt(tasksPerPlayerInput.value, 10)
      });
    }
  });
});

// --- Socket events ---

socket.on('sessionCreated', (data) => {
  localStorage.setItem('hostToken', data.hostToken);
  localStorage.setItem('sessionCode', data.sessionCode);
  setLobbyName(data.lobbyName);
  currentPlayer = { role: 'host' };
  isHost = true;
  showSection(lobbyDiv);
  hostControlsDiv.classList.remove('hidden');
  hostOverviewDiv.classList.remove('hidden');
  updateAnnouncementInputState();
  socket.emit('getTaskBank');
});

socket.on('joined', (data) => {
  localStorage.setItem('playerId', data.player.playerId);
  localStorage.setItem('lobbyName', data.lobbyName);
  localStorage.setItem('sessionCode', data.sessionCode);
  currentPlayer = data.player;
  isHost = false;
  showSection(lobbyDiv);
  hostControlsDiv.classList.add('hidden');
  hostOverviewDiv.classList.add('hidden');
  updateAnnouncementInputState();
});

socket.on('rejoined', (data) => {
  localStorage.setItem('playerId', data.player.playerId);
  localStorage.setItem('lobbyName', data.lobbyName);
  localStorage.setItem('sessionCode', data.sessionCode);
  currentPlayer = data.player;
  isHost = false;
  showSection(lobbyDiv);
  hostControlsDiv.classList.add('hidden');
  updateAnnouncementInputState();
});

socket.on('hostReconnected', (data) => {
  localStorage.setItem('sessionCode', data.sessionCode);
  setLobbyName(data.lobbyName);
  currentPlayer = { role: 'host' };
  isHost = true;
  showSection(lobbyDiv);
  hostControlsDiv.classList.remove('hidden');
  hostOverviewDiv.classList.remove('hidden');
  updateAnnouncementInputState();
  socket.emit('getTaskBank');
});

socket.on('gameState', (state) => {
  if (state.phase === 'lobby') {
    showSection(lobbyDiv);
    updatePlayersList(state.players);
    applySettings(state.settings);
    updateAllProgress(state.taskProgress);
    if (isHost) {
      hostControlsDiv.classList.remove('hidden');
      hostOverviewDiv.classList.remove('hidden');
    }
  } else if (state.phase === 'running') {
    showSection(gameDiv);
    renderGameView(state);
  } else if (state.phase === 'meeting') {
    showMeetingScreen({
      calledByName: state.meeting ? state.meeting.calledByName : '?',
      players: state.players,
      myVote: state.meeting ? state.meeting.myVote : null,
      voteStatus: state.meeting ? state.meeting.voteStatus : null
    }, true);
  }
});

socket.on('hostState', (state) => {
  if (!state) return;
  setLobbyName(state.lobbyName);
  applySettings(state.settings);
  updateAllProgress(state.taskProgress);
  updateHostOverview(state);

  if (state.phase === 'lobby') {
    showSection(lobbyDiv);
    updatePlayersList(state.players, true);
    hostOverviewDiv.classList.remove('hidden');
    hostControlsDiv.classList.remove('hidden');
    hostGameControlsDiv.classList.add('hidden');
  } else if (state.phase === 'running') {
    showSection(gameDiv);
    updatePlayersList(state.players, true);
    hostGameControlsDiv.classList.remove('hidden');
    updateHostGameOverview(state);
    if (forceResolveBtn) forceResolveBtn.classList.add('hidden');
  } else if (state.phase === 'meeting') {
    // Host stays in game view but sees meeting controls
    hostGameControlsDiv.classList.remove('hidden');
    if (forceResolveBtn) forceResolveBtn.classList.remove('hidden');
    updateHostGameOverview(state);
  }
});

socket.on('gameStarted', (state) => {
  showSection(gameDiv);
  renderGameView(state);
  if (isHost) {
    hostGameControlsDiv.classList.remove('hidden');
  }
});

function renderGameView(state) {
  // Role display
  roleDisplayDiv.className = 'role-display ' + (state.myRole === 'imposter' ? 'role-imposter' : 'role-crewmate');
  const roleEmoji = state.myRole === 'imposter' ? '😈' : '👨‍🚀';
  roleDisplayDiv.innerHTML = `${roleEmoji} You are: <strong>${state.myRole ? state.myRole.toUpperCase() : '?'}</strong>`;

  // Alive status
  if (state.myAlive === false) {
    aliveStatusDiv.className = 'status-dead';
    aliveStatusDiv.textContent = '💀 You are dead. You can observe but not interact.';
  } else {
    aliveStatusDiv.className = 'status-alive';
    aliveStatusDiv.textContent = '✅ Alive';
  }

  // Tasks
  if (state.myRole === 'crewmate') {
    renderPlayerTasks(state.myTasks);
  } else {
    tasksDisplayDiv.innerHTML = '<p style="color:#e94560;font-weight:700;">You are an Imposter. Eliminate the crewmates without being caught!</p>';
  }

  // Meeting button — only alive non-imposters (or you can allow imposters too, game design choice)
  if (state.myAlive !== false && state.myRole) {
    meetingBtnContainer.classList.remove('hidden');
  } else {
    meetingBtnContainer.classList.add('hidden');
  }

  updateAllProgress(state.taskProgress);
  updatePlayersList(state.players);
}

socket.on('meetingCalled', (data) => {
  myVote = data.myVote || null;
  showMeetingScreen(data, true);
});

socket.on('voteCast', (data) => {
  myVote = data.targetId;
  // Disable vote buttons
  votingArea.querySelectorAll('.vote-btn').forEach(btn => {
    btn.disabled = true;
    if (btn.getAttribute('data-vote-target') === data.targetId) btn.classList.add('selected');
    else btn.classList.remove('selected');
  });
});

socket.on('voteStatusUpdated', (voteStatus) => {
  renderVoteStatus(voteStatus);
});

socket.on('meetingResolved', (data) => {
  showMeetingResults(data);
  // Update player list with new alive statuses
  if (data.players) updatePlayersList(data.players);
});

socket.on('gameOver', (data) => {
  showGameOver(data);
});

socket.on('taskBank', (data) => {
  renderTaskBank(data.taskBank);
});

socket.on('announcementList', (data) => {
  renderAnnouncements(data.announcements || []);
});

socket.on('announcementPosted', (message) => {
  renderAnnouncement(message, announcementListDiv);
  renderAnnouncement(message, announcementListGameDiv);
});

socket.on('gameEnded', (data) => {
  // Clear game state
  tasksDisplayDiv.innerHTML = '';
  roleDisplayDiv.innerHTML = '';
  aliveStatusDiv.innerHTML = '';
  meetingBtnContainer.classList.add('hidden');
  hostGameControlsDiv.classList.add('hidden');
  myVote = null;

  showSection(lobbyDiv);
  updatePlayersList(data.players);
  updateAllProgress(data.taskProgress || { completed: 0, total: 0 });

  if (isHost) {
    hostControlsDiv.classList.remove('hidden');
    hostOverviewDiv.classList.remove('hidden');
  }
  showError('Game ended. Players returned to lobby.');
});

socket.on('sessionEnded', () => {
  clearStoredIdentity();
  showLanding();
  renderAnnouncements([]);
  showError('Lobby ended.');
});

socket.on('playersUpdated', (data) => {
  updatePlayersList(data.players, isHost);
});

socket.on('settingsUpdated', (settings) => {
  applySettings(settings);
});

socket.on('taskUpdated', (data) => {
  if (data.myTasks) renderPlayerTasks(data.myTasks);
  updateAllProgress(data.taskProgress);
});

socket.on('updateGlobalTaskProgress', (progress) => {
  updateAllProgress(progress);
});

socket.on('updateHostTaskOverview', (state) => {
  updateHostOverview(state);
  updateHostGameOverview(state);
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

socket.on('kickedSelf', (data) => {
  clearStoredIdentity();
  showLanding();
  showError(data.message);
});

// --- Reconnect on load ---
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
