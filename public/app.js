// app.js — Among Us IRL client

const socket = io();

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const createSessionDiv   = $('create-session');
const joinSessionDiv     = $('join-session');
const projectorJoinSection = $('projector-join-section');
const lobbyDiv           = $('lobby');
const gameDiv            = $('game');
const meetingDiv         = $('meeting');
const projectorViewDiv   = $('projector-view');
const gameOverDiv        = $('game-over');
const errorDiv           = $('error');

// Landing
const hostNameInput      = $('host-name');
const createBtn          = $('create-btn');
const sessionCodeP       = $('lobby-name-display');
const playerNameInput    = $('player-name');
const joinCodeInput      = $('join-code');
const joinBtn            = $('join-btn');
const projectorTokenInput = $('projector-token-input');
const projectorJoinBtn   = $('projector-join-btn');

// Lobby
const lobbyCodeSpan      = $('lobby-code');
const playersListDiv     = $('players-list');
const globalProgressLobbyDiv = $('global-progress-lobby');
const globalProgressGameDiv  = $('global-progress-game');
const hostOverviewDiv    = $('host-overview');
const hostControlsDiv    = $('host-controls');
const totalPlayersInput  = $('total-players');
const impostersInput     = $('imposters');
const tasksPerPlayerInput = $('tasks-per-player');
const votingDurationInput = $('voting-duration');
const startGameBtn       = $('start-game-btn');
const endGameBtn         = $('end-game-btn');
const endSessionBtn      = $('end-session-btn');
const taskTitleInput     = $('task-title');
const taskInstructionsInput = $('task-instructions');
const taskCodeInput      = $('task-code');
const createTaskBtn      = $('create-task-btn');
const taskBankListDiv    = $('task-bank-list');
const projectorTokenDisplay = $('projector-token-display');
const announcementListDiv     = $('announcement-list');
const announcementListGameDiv = $('announcement-list-game');
const announcementTextInput   = $('announcement-text');
const announcementSendBtn     = $('announcement-send-btn');

// Game
const roleDisplayDiv     = $('role-display');
const aliveStatusDiv     = $('alive-status');
const tasksDisplayDiv    = $('tasks-display');
const reportBtnContainer = $('report-btn-container');
const reportBtn          = $('report-btn');
const hostGameControlsDiv = $('host-game-controls');
const hostGameOverviewDiv = $('host-game-overview');
const endGameBtn2        = $('end-game-btn-2');
const endSessionBtn2     = $('end-session-btn-2');

// Report modal
const reportModal        = $('report-modal');
const reportPlayerList   = $('report-player-list');
const reportCancelBtn    = $('report-cancel-btn');

// Meeting
const meetingHeader      = $('meeting-header');
const gatheringArea      = $('gathering-area');
const confirmArrivalBtn  = $('confirm-arrival-btn');
const gatheringInstruction = $('gathering-instruction');
const arrivalChecklist   = $('arrival-checklist');
const hostStartVotingArea = $('host-start-voting-area');
const startVotingBtn     = $('start-voting-btn');
const votingArea         = $('voting-area');
const votingTimerDisplay = $('voting-timer-display');
const voteGrid           = $('vote-grid');
const voteStatusDisplay  = $('vote-status-display');
const hostForceResolve   = $('host-force-resolve');
const forceResolveBtn    = $('force-resolve-btn');
const meetingResultsDiv  = $('meeting-results');

// Projector
const projHeader         = $('proj-header');
const projPhaseBanner    = $('proj-phase-banner');
const projPlayers        = $('proj-players');
const projProgress       = $('proj-progress');
const projAnnouncementList = $('proj-announcement-list');
const projMeetingBtnContainer = $('proj-meeting-btn-container');
const projCallMeetingBtn = $('proj-call-meeting-btn');
const projMeetingArea    = $('proj-meeting-area');
const projMeetingHeader  = $('proj-meeting-header');
const projArrivalList    = $('proj-arrival-list');
const projVotingTimer    = $('proj-voting-timer');
const projVoteStatus     = $('proj-vote-status');
const projResults        = $('proj-results');

// Game over
const gameOverContent    = $('game-over-content');
const hostGameoverControls = $('host-gameover-controls');
const playAgainBtn       = $('play-again-btn');
const endSessionBtn3     = $('end-session-btn-3');

// ── State ─────────────────────────────────────────────────────────────────────
let currentPlayer   = null;
let isHost          = false;
let isProjector     = false;
let myVote          = null;
let hasArrived      = false;
let clientVotingInterval = null;  // client-side countdown ticker
let projVotingInterval   = null;

// ── Section management ────────────────────────────────────────────────────────
const ALL_SECTIONS = [createSessionDiv, joinSessionDiv, projectorJoinSection,
                      lobbyDiv, gameDiv, meetingDiv, projectorViewDiv, gameOverDiv];

function showSection(...sections) {
  ALL_SECTIONS.forEach(d => d.classList.add('hidden'));
  sections.forEach(s => s && s.classList.remove('hidden'));
}

function showLanding() {
  ALL_SECTIONS.forEach(d => d.classList.add('hidden'));
  createSessionDiv.classList.remove('hidden');
  joinSessionDiv.classList.remove('hidden');
  projectorJoinSection.classList.remove('hidden');
  hostControlsDiv.classList.add('hidden');
  hostOverviewDiv.classList.add('hidden');
  hostGameControlsDiv.classList.add('hidden');
}

function showError(msg) {
  errorDiv.textContent = msg;
  errorDiv.classList.remove('hidden');
  setTimeout(() => errorDiv.classList.add('hidden'), 5000);
}

function clearStoredIdentity() {
  ['playerId','hostToken','projectorToken','lobbyName','sessionCode'].forEach(k => localStorage.removeItem(k));
  currentPlayer = null; isHost = false; isProjector = false;
}

// ── Utility renderers ─────────────────────────────────────────────────────────

function setLobbyName(code) {
  if (lobbyCodeSpan) lobbyCodeSpan.textContent = code;
  if (sessionCodeP) sessionCodeP.textContent = `Lobby Name: ${code}`;
  localStorage.setItem('lobbyName', code);
}

function applySettings(s) {
  if (totalPlayersInput)  totalPlayersInput.value  = s.totalPlayers;
  if (impostersInput)     impostersInput.value      = s.imposters;
  if (tasksPerPlayerInput) tasksPerPlayerInput.value = s.tasksPerPlayer;
  if (votingDurationInput) votingDurationInput.value = s.votingDuration || 60;
}

function renderProgressBar(progress, container) {
  if (!progress || typeof progress.completed !== 'number') { container.classList.add('hidden'); return; }
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  container.innerHTML = `<div>Tasks: ${progress.completed} / ${progress.total} (${pct}%)</div>
    <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%"></div></div>`;
  container.classList.remove('hidden');
}

function updateAllProgress(progress) {
  renderProgressBar(progress, globalProgressLobbyDiv);
  renderProgressBar(progress, globalProgressGameDiv);
}

function renderPlayersList(players, detailed = false) {
  if (!players || !players.length) { playersListDiv.innerHTML = '<p>No players yet</p>'; return; }
  const items = players.map(p => {
    const dot = !p.connected ? 'dot-disconnected' : (!p.alive ? 'dot-dead' : 'dot-connected');
    let label = `<strong>${p.name}</strong>`;
    if (detailed) {
      if (p.role) label += ` <em style="color:${p.role==='imposter'?'#e94560':'#06d6a0'}">(${p.role})</em>`;
      if (!p.alive) label += ' 💀';
      if (p.totalTasks > 0) label += ` ${p.completedTasks}/${p.totalTasks}`;
      if (!p.connected) label += ' <span style="color:#e94560;font-size:0.8em">⚡</span>';
      if (isHost && p.playerId) label += ` <button data-action="kick" data-player-id="${p.playerId}" style="padding:2px 8px;font-size:0.75em;background:#555;">Kick</button>`;
    }
    return `<li><span class="player-dot ${dot}"></span>${label}</li>`;
  });
  playersListDiv.innerHTML = `<h3>Players (${players.length})</h3><ul>${items.join('')}</ul>`;
}

function renderAnnouncement(msg, container) {
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'announcement-item';
  const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
  el.innerHTML = `<span class="announcement-sender">${msg.senderLabel || 'HOST'}</span><span class="announcement-time">${time}</span><br>${msg.text}`;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function renderAnnouncements(messages) {
  [announcementListDiv, announcementListGameDiv].forEach(c => { if (c) c.innerHTML = ''; });
  if (!Array.isArray(messages)) return;
  messages.forEach(m => { renderAnnouncement(m, announcementListDiv); renderAnnouncement(m, announcementListGameDiv); });
}

function renderTaskBank(taskBank) {
  if (!taskBank || !taskBank.length) { taskBankListDiv.innerHTML = '<p>No tasks yet.</p>'; return; }
  taskBankListDiv.innerHTML = '<ul>' + taskBank.map(t => `
    <li>
      <strong>${t.title}</strong>${!t.active ? ' <em style="color:#888">(inactive)</em>' : ''}
      <div style="font-size:0.85em;color:#aaa;margin:4px 0">${t.instructions}</div>
      <div style="font-size:0.85em;color:#888">Code: <code>${t.completionCode||'(none)'}</code></div>
      <button data-task-action="edit" data-task-id="${t.taskId}" style="background:#0f3460">Edit</button>
      <button data-task-action="delete" data-task-id="${t.taskId}" style="background:#555">Delete</button>
    </li>`).join('') + '</ul>';
}

function renderPlayerTasks(tasks) {
  if (!tasks || !tasks.length) { tasksDisplayDiv.innerHTML = '<p>No tasks assigned.</p>'; return; }
  tasksDisplayDiv.innerHTML = '<h3>Your Tasks</h3>' + tasks.map(t => `
    <div class="task-item ${t.completed ? 'completed' : ''}">
      <h4>${t.title}</h4>
      <p>${t.instructions}</p>
      <p class="task-status ${t.completed ? 'done' : 'pending'}">${t.completed ? '✅ Completed' : '⏳ Pending'}</p>
      ${t.completed ? '' : `<input type="text" id="tc-${t.taskId}" placeholder="Enter code"><button data-task-id="${t.taskId}">Submit</button>`}
    </div>`).join('');
  tasksDisplayDiv.querySelectorAll('button[data-task-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-task-id');
      const inp = $(`tc-${id}`);
      if (!inp || !inp.value.trim()) { showError('Enter the completion code'); return; }
      socket.emit('submitTaskCode', { taskId: id, completionCode: inp.value.trim() });
    });
  });
}

function updateHostOverview(state) {
  if (!state) return;
  hostOverviewDiv.innerHTML = `
    <h3>Host Overview</h3>
    <p>Lobby: <strong>${state.lobbyName}</strong> | Phase: <strong>${state.phase}</strong>
    | Projector: ${state.projectorConnected ? '🟢 Connected' : '🔴 Not connected'}</p>
    <ul>${state.players.map(p => `
      <li>
        <span class="player-dot ${p.connected?(p.alive?'dot-connected':'dot-dead'):'dot-disconnected'}"></span>
        <strong>${p.name}</strong>
        ${p.role ? `<em style="color:${p.role==='imposter'?'#e94560':'#06d6a0'}">(${p.role})</em>` : ''}
        ${!p.alive ? '💀' : ''}
        ${p.totalTasks > 0 ? `${p.completedTasks}/${p.totalTasks} tasks` : ''}
        <button data-action="kick" data-player-id="${p.playerId}" style="background:#555">Kick</button>
      </li>`).join('')}
    </ul>`;
  if (state.taskBank) renderTaskBank(state.taskBank);
}

function updateHostGameOverview(state) {
  if (!state || !hostGameOverviewDiv) return;
  hostGameOverviewDiv.innerHTML = `<h4>Player Status</h4>
    <table>
      <tr><th>Name</th><th>Role</th><th>Status</th><th>Tasks</th><th>Conn</th></tr>
      ${state.players.map(p => `<tr>
        <td>${p.name}</td>
        <td style="color:${p.role==='imposter'?'#e94560':'#06d6a0'}">${p.role||'—'}</td>
        <td>${p.alive?'✅':'💀'}</td>
        <td>${p.totalTasks>0?`${p.completedTasks}/${p.totalTasks}`:'—'}</td>
        <td>${p.connected?'🟢':'🔴'}</td>
      </tr>`).join('')}
    </table>`;
}

function handleTaskButtonClick(event) {
  const btn = event.target.closest('button[data-task-action]');
  if (!btn) return;
  const action = btn.getAttribute('data-task-action');
  const taskId = btn.getAttribute('data-task-id');
  if (action === 'delete') { socket.emit('deleteTask', { taskId }); return; }
  if (action === 'edit') {
    const title = prompt('New title:'); if (title === null) return;
    const instructions = prompt('New instructions:'); if (instructions === null) return;
    const completionCode = prompt('New code:'); if (completionCode === null) return;
    socket.emit('editTask', { taskId, title, instructions, completionCode });
  }
}

// ── Game view render ──────────────────────────────────────────────────────────

function renderGameView(state) {
  roleDisplayDiv.className = 'role-display ' + (state.myRole === 'imposter' ? 'role-imposter' : 'role-crewmate');
  roleDisplayDiv.innerHTML = `${state.myRole === 'imposter' ? '😈' : '👨‍🚀'} You are: <strong>${(state.myRole||'?').toUpperCase()}</strong>`;

  aliveStatusDiv.className = state.myAlive === false ? 'status-dead' : 'status-alive';
  aliveStatusDiv.textContent = state.myAlive === false ? '💀 You are dead. Observe only.' : '✅ Alive';

  if (state.myRole === 'crewmate') renderPlayerTasks(state.myTasks);
  else tasksDisplayDiv.innerHTML = '<p style="color:#e94560;font-weight:700">You are an Imposter. Eliminate the crewmates!</p>';

  // Report button: only alive players
  if (state.myAlive !== false && state.myRole) reportBtnContainer.classList.remove('hidden');
  else reportBtnContainer.classList.add('hidden');

  updateAllProgress(state.taskProgress);
  renderPlayersList(state.players);
}

// ── Report modal ──────────────────────────────────────────────────────────────

function openReportModal(players) {
  // Only show dead players to report
  const dead = players.filter(p => !p.alive);
  if (!dead.length) { showError('No dead bodies nearby to report'); return; }
  reportPlayerList.innerHTML = dead.map(p =>
    `<button class="report-player-btn" data-player-id="${p.playerId}">💀 ${p.name}</button>`
  ).join('');
  reportPlayerList.querySelectorAll('.report-player-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      socket.emit('reportBody', { reportedPlayerId: btn.getAttribute('data-player-id') });
      reportModal.classList.add('hidden');
    });
  });
  reportModal.classList.remove('hidden');
}

// ── Meeting: gathering phase ──────────────────────────────────────────────────

function showGatheringPhase(data) {
  showSection(meetingDiv);
  hasArrived = false;
  myVote = null;
  stopClientTimer();

  meetingHeader.innerHTML = `
    <h2>🚨 ${data.reportedDeadName ? 'Body Reported!' : 'Emergency Meeting!'}</h2>
    <p>Called by <strong>${data.calledByName}</strong>${data.reportedDeadName ? ` — found <strong>${data.reportedDeadName}</strong>` : ''}</p>`;

  gatheringArea.classList.remove('hidden');
  votingArea.classList.add('hidden');
  meetingResultsDiv.classList.add('hidden');

  confirmArrivalBtn.disabled = false;
  confirmArrivalBtn.textContent = '✅ I\'m Here';

  if (isHost) hostStartVotingArea.classList.remove('hidden');
  else hostStartVotingArea.classList.add('hidden');

  if (isHost || isProjector) hostForceResolve.classList.add('hidden');

  renderArrivalChecklist(data.arrivedPlayerIds || [], data.players);
}

function renderArrivalChecklist(arrivedIds, players) {
  if (!players) return;
  const alivePlayers = players.filter(p => p.alive);
  arrivalChecklist.innerHTML = `<h4>Arrival (${arrivedIds.length}/${alivePlayers.length})</h4>` +
    alivePlayers.map(p => {
      const arrived = arrivedIds.includes(p.playerId);
      return `<div class="arrival-item ${arrived ? 'arrived' : 'not-arrived'}">
        <span class="arrival-check">${arrived ? '✅' : '⏳'}</span>
        <span>${p.name}</span>
      </div>`;
    }).join('');
}

// ── Meeting: voting phase ─────────────────────────────────────────────────────

function showVotingPhase(votingEndsAt, players, myCurrentVote) {
  gatheringArea.classList.add('hidden');
  votingArea.classList.remove('hidden');
  meetingResultsDiv.classList.add('hidden');
  myVote = myCurrentVote || null;

  if (isHost) hostForceResolve.classList.remove('hidden');
  else hostForceResolve.classList.add('hidden');

  renderVoteGrid(players);
  startClientTimer(votingEndsAt, votingTimerDisplay);
}

function renderVoteGrid(players) {
  const alive = players.filter(p => p.alive);
  voteGrid.innerHTML = `<div class="vote-grid">
    ${alive.map(p => {
      const isMe = currentPlayer && p.playerId === currentPlayer.playerId;
      const sel = myVote === p.playerId ? 'selected' : '';
      return `<button class="vote-btn ${sel}" data-vote-target="${p.playerId}">${isMe ? '👤 ' : ''}${p.name}</button>`;
    }).join('')}
    <button class="vote-btn skip-btn ${myVote === 'skip' ? 'selected' : ''}" data-vote-target="skip">⏭ Skip</button>
  </div>`;

  if (myVote) {
    voteGrid.querySelectorAll('.vote-btn').forEach(b => b.disabled = true);
  } else {
    voteGrid.querySelectorAll('.vote-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-vote-target');
        myVote = target;
        socket.emit('castVote', { targetId: target });
        voteGrid.querySelectorAll('.vote-btn').forEach(b => { b.disabled = true; b.classList.remove('selected'); });
        btn.classList.add('selected');
      });
    });
  }
}

function renderVoteStatus(voteStatus, players) {
  if (!voteStatus) return;
  const alivePlayers = (players || []).filter(p => p.alive);
  voteStatusDisplay.innerHTML = `Voted: ${voteStatus.totalVoted} / ${voteStatus.totalVoters}`;

  // Projector vote status chips
  if (projVoteStatus && alivePlayers.length) {
    projVoteStatus.innerHTML = alivePlayers.map(p => {
      const voted = voteStatus.votedPlayerIds.includes(p.playerId);
      return `<div class="proj-vote-chip ${voted ? 'voted' : 'not-voted'}">${voted ? '✅' : '⏳'} ${p.name}</div>`;
    }).join('');
  }
}

// ── Client-side countdown timer ───────────────────────────────────────────────

function startClientTimer(endsAt, displayEl) {
  stopClientTimer();
  function tick() {
    const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    displayEl.textContent = remaining + 's';
    if (remaining <= 10) displayEl.classList.add('urgent');
    else displayEl.classList.remove('urgent');
    if (remaining <= 0) stopClientTimer();
  }
  tick();
  clientVotingInterval = setInterval(tick, 500);
}

function stopClientTimer() {
  if (clientVotingInterval) { clearInterval(clientVotingInterval); clientVotingInterval = null; }
  if (projVotingInterval)   { clearInterval(projVotingInterval);   projVotingInterval   = null; }
}

function startProjectorTimer(endsAt) {
  if (projVotingInterval) clearInterval(projVotingInterval);
  function tick() {
    const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    projVotingTimer.textContent = remaining;
    if (remaining <= 10) projVotingTimer.classList.add('urgent');
    else projVotingTimer.classList.remove('urgent');
    if (remaining <= 0) { clearInterval(projVotingInterval); projVotingInterval = null; }
  }
  tick();
  projVotingInterval = setInterval(tick, 500);
}

// ── Meeting results ───────────────────────────────────────────────────────────

function showMeetingResults(data) {
  stopClientTimer();
  votingArea.classList.add('hidden');
  gatheringArea.classList.add('hidden');
  meetingResultsDiv.classList.remove('hidden');

  const ejected = data.ejectedPlayer;
  let html = ejected
    ? `<h3>🚀 ${ejected.name} was ejected!</h3>
       <p style="font-weight:800;font-size:1.2em;color:${ejected.role==='imposter'?'#e94560':'#06d6a0'}">
         ${ejected.name} was ${ejected.role==='imposter'?'an Imposter 😈':'NOT an Imposter 😇'}
       </p>`
    : `<h3>No one was ejected (skip or tie)</h3>`;

  if (data.voteReveal && data.voteReveal.length) {
    html += `<ul style="list-style:none;padding:0;margin-top:12px;font-size:0.9em">
      ${data.voteReveal.map(v => `<li style="padding:4px 0;border-bottom:1px solid #1a2a4a">
        <span style="color:#a8dadc;font-weight:700">${v.voterName}</span> → <span style="color:#ffd166">${v.targetName}</span>
      </li>`).join('')}
    </ul>`;
  }
  html += `<p style="color:#888;font-size:0.9em;margin-top:12px">Returning to game in a few seconds…</p>`;
  meetingResultsDiv.innerHTML = html;

  // Auto-return to game after 5s
  setTimeout(() => {
    meetingDiv.classList.add('hidden');
    gameDiv.classList.remove('hidden');
    myVote = null;
  }, 5000);
}

// ── Projector view ────────────────────────────────────────────────────────────

function renderProjectorState(state) {
  if (!state) return;

  projHeader.innerHTML = `<h2>🚀 Among Us IRL</h2><p>Lobby: <strong>${state.lobbyName || '—'}</strong></p>`;

  const phaseLabels = { lobby: '🛸 Lobby', running: '🎮 Game In Progress', meeting: '🚨 Emergency Meeting' };
  const phaseClass  = { lobby: 'phase-lobby', running: 'phase-running', meeting: 'phase-meeting' };
  projPhaseBanner.className = 'proj-phase-banner ' + (phaseClass[state.phase] || '');
  projPhaseBanner.textContent = phaseLabels[state.phase] || state.phase;

  // Player cards
  projPlayers.innerHTML = (state.players || []).map(p => {
    const cls = !p.connected ? 'disconnected' : (!p.alive ? 'dead' : 'alive');
    return `<div class="proj-player-card ${cls}">
      <div class="proj-player-name">${p.name}</div>
      <div class="proj-player-status">${!p.alive ? '💀 Dead' : (p.connected ? '✅' : '⚡ Away')}</div>
    </div>`;
  }).join('');

  renderProgressBar(state.taskProgress, projProgress);

  // Emergency meeting button: only during running phase
  if (state.phase === 'running') {
    projMeetingBtnContainer.classList.remove('hidden');
    projMeetingArea.classList.add('hidden');
    projVotingTimer.textContent = '';
    projResults.innerHTML = '';
    stopClientTimer();
  } else {
    projMeetingBtnContainer.classList.add('hidden');
  }

  // Restore meeting display if we're in meeting phase
  if (state.phase === 'meeting' && state.meeting) {
    renderProjectorMeeting(state.meeting, state.players);
  }
}

function renderProjectorMeeting(meeting, players) {
  projMeetingBtnContainer.classList.add('hidden');
  projMeetingArea.classList.remove('hidden');

  projMeetingHeader.innerHTML = `
    <h2>🚨 ${meeting.reportedDeadName ? 'Body Reported!' : 'Emergency Meeting!'}</h2>
    <p>Called by <strong>${meeting.calledByName}</strong>${meeting.reportedDeadName ? ` — found <strong>${meeting.reportedDeadName}</strong>` : ''}</p>`;

  if (meeting.subPhase === 'gathering') {
    projVotingTimer.textContent = '';
    projResults.innerHTML = '';
    renderProjectorArrivalList(meeting.arrivedPlayerIds, players);
    projVoteStatus.innerHTML = '';
  } else if (meeting.subPhase === 'voting') {
    renderProjectorArrivalList([], []);
    if (meeting.votingEndsAt) startProjectorTimer(meeting.votingEndsAt);
    renderVoteStatus(meeting.voteStatus, players);
  } else if (meeting.subPhase === 'results' && meeting.resolvedResult) {
    stopClientTimer();
    projVotingTimer.textContent = '';
    renderProjectorResults(meeting.resolvedResult, players);
  }
}

function renderProjectorArrivalList(arrivedIds, players) {
  const alive = (players || []).filter(p => p.alive);
  projArrivalList.innerHTML = alive.map(p => {
    const arrived = (arrivedIds || []).includes(p.playerId);
    return `<div class="proj-arrival-chip ${arrived ? 'arrived' : 'waiting'}">${arrived ? '✅' : '⏳'} ${p.name}</div>`;
  }).join('');
}

function renderProjectorResults(resolution, players) {
  const ejected = resolution.ejectedPlayer;
  let html = `<div style="text-align:center;margin-bottom:12px">`;
  html += ejected
    ? `<div style="font-size:1.5em;font-weight:800;color:${ejected.role==='imposter'?'#e94560':'#06d6a0'}">
         🚀 ${ejected.name} ejected! (${ejected.role==='imposter'?'Imposter 😈':'Not Imposter 😇'})
       </div>`
    : `<div style="font-size:1.4em;font-weight:800;color:#ffd166">No one ejected (skip or tie)</div>`;
  html += `</div>`;

  if (resolution.voteReveal && resolution.voteReveal.length) {
    html += `<ul class="proj-vote-reveal">
      ${resolution.voteReveal.map(v =>
        `<li><span class="proj-voter-name">${v.voterName}</span><span>→</span><span class="proj-voted-for">${v.targetName}</span></li>`
      ).join('')}
    </ul>`;
  }
  projResults.innerHTML = html;
  projVoteStatus.innerHTML = '';
  projArrivalList.innerHTML = '';
}

function showGameOver(data) {
  stopClientTimer();
  showSection(gameOverDiv);
  myVote = null;
  const crew = data.winner === 'crewmates';
  gameOverContent.innerHTML = `
    <div class="${crew ? 'win-crewmates' : 'win-imposters'}">
      <div class="win-title">${crew ? '🎉 Crewmates Win!' : '😈 Imposters Win!'}</div>
      <p class="game-over-reason">${data.reason}</p>
      <ul class="reveal-list">
        ${(data.players||[]).map(p => `
          <li class="${p.role==='imposter'?'reveal-imposter':'reveal-crewmate'} ${!p.alive?'reveal-dead':''}">
            ${p.name}${!p.alive?' 💀':''} (${p.role})
          </li>`).join('')}
      </ul>
    </div>`;
  if (isHost) hostGameoverControls.classList.remove('hidden');
  else hostGameoverControls.classList.add('hidden');
}

// ── Event listeners ───────────────────────────────────────────────────────────

createBtn.addEventListener('click', () => {
  const name = hostNameInput.value.trim();
  if (!name) { showError('Enter your name'); return; }
  socket.emit('createSession', { name });
});

joinBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  const code = joinCodeInput.value.trim();
  if (!name || !code) { showError('Enter name and lobby name'); return; }
  socket.emit('joinLobby', { name, code });
});

projectorJoinBtn.addEventListener('click', () => {
  const token = projectorTokenInput.value.trim();
  if (!token) { showError('Enter the projector code'); return; }
  socket.emit('projectorJoin', { projectorToken: token });
});

startGameBtn.addEventListener('click', () => socket.emit('startGame'));
endGameBtn.addEventListener('click',  () => { if (isHost) socket.emit('endGame'); });
endSessionBtn.addEventListener('click', () => { if (isHost) socket.emit('endSession'); });
if (endGameBtn2)   endGameBtn2.addEventListener('click',   () => { if (isHost) socket.emit('endGame'); });
if (endSessionBtn2) endSessionBtn2.addEventListener('click', () => { if (isHost) socket.emit('endSession'); });
if (playAgainBtn)   playAgainBtn.addEventListener('click',   () => socket.emit('endGame'));
if (endSessionBtn3) endSessionBtn3.addEventListener('click', () => { if (isHost) socket.emit('endSession'); });

createTaskBtn.addEventListener('click', () => {
  const title = taskTitleInput.value.trim();
  const instructions = taskInstructionsInput.value.trim();
  const completionCode = taskCodeInput.value.trim();
  if (!title || !instructions || !completionCode) { showError('All task fields required'); return; }
  socket.emit('createTask', { title, instructions, completionCode });
  taskTitleInput.value = ''; taskInstructionsInput.value = ''; taskCodeInput.value = '';
});

announcementSendBtn.addEventListener('click', () => {
  const text = announcementTextInput.value.trim();
  if (!text) { showError('Announcement cannot be empty'); return; }
  socket.emit('sendAnnouncement', { text });
  announcementTextInput.value = '';
});

[totalPlayersInput, impostersInput, tasksPerPlayerInput, votingDurationInput].forEach(inp => {
  if (inp) inp.addEventListener('change', () => {
    if (!isHost) return;
    socket.emit('updateSettings', {
      totalPlayers:    parseInt(totalPlayersInput.value, 10),
      imposters:       parseInt(impostersInput.value, 10),
      tasksPerPlayer:  parseInt(tasksPerPlayerInput.value, 10),
      votingDuration:  parseInt(votingDurationInput.value, 10)
    });
  });
});

// Delegation: kick + task buttons
hostOverviewDiv.addEventListener('click', e => {
  const kick = e.target.closest('button[data-action="kick"]');
  if (kick) { socket.emit('kickPlayer', { playerId: kick.getAttribute('data-player-id') }); return; }
  handleTaskButtonClick(e);
});
taskBankListDiv.addEventListener('click', handleTaskButtonClick);
playersListDiv.addEventListener('click', e => {
  const kick = e.target.closest('button[data-action="kick"]');
  if (kick) socket.emit('kickPlayer', { playerId: kick.getAttribute('data-player-id') });
});

// Report body
reportBtn.addEventListener('click', () => {
  // Get latest player list from DOM state
  socket.emit('getPlayers'); // we'll open modal on response — handled via stored state
  openReportModal(window._lastPlayers || []);
});
reportCancelBtn.addEventListener('click', () => reportModal.classList.add('hidden'));

// Arrival confirmation
confirmArrivalBtn.addEventListener('click', () => {
  confirmArrivalBtn.disabled = true;
  confirmArrivalBtn.textContent = '✅ Confirmed!';
  hasArrived = true;
  socket.emit('confirmArrival');
});

// Host starts voting
if (startVotingBtn) startVotingBtn.addEventListener('click', () => socket.emit('startVoting'));
if (forceResolveBtn) forceResolveBtn.addEventListener('click', () => socket.emit('forceResolveVoting'));

// Projector emergency meeting
if (projCallMeetingBtn) projCallMeetingBtn.addEventListener('click', () => socket.emit('projectorCallMeeting'));

// ── Socket events ─────────────────────────────────────────────────────────────

socket.on('sessionCreated', (data) => {
  localStorage.setItem('hostToken', data.hostToken);
  localStorage.setItem('sessionCode', data.sessionCode);
  localStorage.setItem('projectorToken', data.projectorToken);
  setLobbyName(data.lobbyName);
  currentPlayer = { role: 'host' };
  isHost = true;
  showSection(lobbyDiv);
  hostControlsDiv.classList.remove('hidden');
  hostOverviewDiv.classList.remove('hidden');
  // Show projector code for host to share
  projectorTokenDisplay.innerHTML = `📽 Projector Code: <code>${data.projectorToken}</code>`;
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
});

socket.on('rejoined', (data) => {
  localStorage.setItem('playerId', data.player.playerId);
  localStorage.setItem('lobbyName', data.lobbyName);
  localStorage.setItem('sessionCode', data.sessionCode);
  currentPlayer = data.player;
  isHost = false;
  showSection(lobbyDiv);
  hostControlsDiv.classList.add('hidden');
});

socket.on('hostReconnected', (data) => {
  localStorage.setItem('sessionCode', data.sessionCode);
  setLobbyName(data.lobbyName);
  currentPlayer = { role: 'host' };
  isHost = true;
  showSection(lobbyDiv);
  hostControlsDiv.classList.remove('hidden');
  hostOverviewDiv.classList.remove('hidden');
  socket.emit('getTaskBank');
});

socket.on('projectorJoined', (data) => {
  localStorage.setItem('projectorToken', data.projectorToken || projectorTokenInput.value.trim());
  localStorage.setItem('sessionCode', data.sessionCode);
  isProjector = true;
  showSection(projectorViewDiv);
});

socket.on('projectorState', (state) => {
  if (!isProjector) return;
  renderProjectorState(state);
});

socket.on('projectorJoinFailed', (data) => {
  showError(data.message);
});

socket.on('gameState', (state) => {
  window._lastPlayers = state.players;
  applySettings(state.settings);
  if (state.phase === 'lobby') {
    showSection(lobbyDiv);
    renderPlayersList(state.players);
    updateAllProgress(state.taskProgress);
    if (isHost) { hostControlsDiv.classList.remove('hidden'); hostOverviewDiv.classList.remove('hidden'); }
  } else if (state.phase === 'running') {
    showSection(gameDiv);
    renderGameView(state);
    if (isHost) hostGameControlsDiv.classList.remove('hidden');
  } else if (state.phase === 'meeting' && state.meeting) {
    if (state.meeting.subPhase === 'gathering') {
      showGatheringPhase({ calledByName: state.meeting.calledByName, callerType: state.meeting.callerType, reportedDeadName: state.meeting.reportedDeadName, arrivedPlayerIds: state.meeting.arrivedPlayerIds, players: state.players });
      if (state.meeting.myVote) myVote = state.meeting.myVote;
    } else if (state.meeting.subPhase === 'voting') {
      showSection(meetingDiv);
      gatheringArea.classList.add('hidden');
      votingArea.classList.remove('hidden');
      showVotingPhase(state.meeting.votingEndsAt, state.players, state.meeting.myVote);
      renderVoteStatus(state.meeting.voteStatus, state.players);
    }
  }
});

socket.on('hostState', (state) => {
  if (!state) return;
  setLobbyName(state.lobbyName);
  applySettings(state.settings);
  updateAllProgress(state.taskProgress);
  updateHostOverview(state);
  if (projectorTokenDisplay && state.projectorToken) {
    projectorTokenDisplay.innerHTML = `📽 Projector Code: <code>${state.projectorToken}</code> | ${state.projectorConnected ? '🟢 Connected' : '🔴 Not connected'}`;
  }

  if (state.phase === 'lobby') {
    showSection(lobbyDiv);
    renderPlayersList(state.players, true);
    hostControlsDiv.classList.remove('hidden');
    hostOverviewDiv.classList.remove('hidden');
    hostGameControlsDiv.classList.add('hidden');
  } else if (state.phase === 'running') {
    showSection(gameDiv);
    renderPlayersList(state.players, true);
    hostGameControlsDiv.classList.remove('hidden');
    updateHostGameOverview(state);
  } else if (state.phase === 'meeting') {
    showSection(gameDiv);
    hostGameControlsDiv.classList.remove('hidden');
    updateHostGameOverview(state);
    // Keep meeting controls accessible from game view for host
    if (state.meeting && state.meeting.subPhase === 'voting') {
      if (hostForceResolve) hostForceResolve.classList.remove('hidden');
    }
  }
});

socket.on('taskBank', (data) => renderTaskBank(data.taskBank));

socket.on('gameStarted', (state) => {
  window._lastPlayers = state.players;
  showSection(gameDiv);
  renderGameView(state);
  if (isHost) hostGameControlsDiv.classList.remove('hidden');
});

socket.on('playersUpdated', (data) => {
  window._lastPlayers = data.players;
  renderPlayersList(data.players, isHost);
});

socket.on('settingsUpdated', (s) => applySettings(s));

socket.on('taskUpdated', (data) => {
  renderPlayerTasks(data.myTasks);
  updateAllProgress(data.taskProgress);
});

socket.on('updateGlobalTaskProgress', (p) => updateAllProgress(p));
socket.on('updateHostTaskOverview', (state) => { updateHostOverview(state); updateHostGameOverview(state); });

socket.on('announcementList', (data) => renderAnnouncements(data.announcements || []));
socket.on('announcementPosted', (msg) => {
  renderAnnouncement(msg, announcementListDiv);
  renderAnnouncement(msg, announcementListGameDiv);
  if (isProjector) renderAnnouncement(msg, projAnnouncementList);
});

// ── Meeting events ────────────────────────────────────────────────────────────

socket.on('meetingCalled', (data) => {
  window._lastPlayers = data.players;
  if (isProjector) {
    renderProjectorMeeting({ subPhase: 'gathering', calledByName: data.calledByName, callerType: data.callerType, reportedDeadName: data.reportedDeadName, arrivedPlayerIds: [] }, data.players);
    projPhaseBanner.textContent = '🚨 Emergency Meeting';
    projPhaseBanner.className = 'proj-phase-banner phase-meeting';
    return;
  }
  if (isHost) return; // host stays in game view, sees meeting via hostState
  showGatheringPhase(data);
});

socket.on('arrivalUpdated', (data) => {
  window._lastPlayers = data.players;
  // Player view
  if (!isProjector && !isHost) renderArrivalChecklist(data.arrivedPlayerIds, data.players);
  // Projector view
  if (isProjector) renderProjectorArrivalList(data.arrivedPlayerIds, data.players);
});

socket.on('votingStarted', (data) => {
  if (isProjector) {
    projArrivalList.innerHTML = '';
    projVoteStatus.innerHTML = '';
    projResults.innerHTML = '';
    startProjectorTimer(data.votingEndsAt);
    return;
  }
  if (isHost) return;
  showVotingPhase(data.votingEndsAt, window._lastPlayers || [], myVote);
});

socket.on('voteStatusUpdated', (voteStatus) => {
  renderVoteStatus(voteStatus, window._lastPlayers || []);
});

socket.on('voteCast', (data) => {
  myVote = data.targetId;
  voteGrid.querySelectorAll('.vote-btn').forEach(btn => {
    btn.disabled = true;
    btn.classList.toggle('selected', btn.getAttribute('data-vote-target') === data.targetId);
  });
});

socket.on('meetingResolved', (data) => {
  window._lastPlayers = data.players;
  stopClientTimer();
  if (isProjector) {
    renderProjectorResults(data, data.players);
    projVotingTimer.textContent = '';
    // Return projector to running state after 6s
    setTimeout(() => {
      projMeetingArea.classList.add('hidden');
      projPhaseBanner.textContent = '🎮 Game In Progress';
      projPhaseBanner.className = 'proj-phase-banner phase-running';
      projMeetingBtnContainer.classList.remove('hidden');
    }, 6000);
    return;
  }
  if (isHost) return;
  showMeetingResults(data);
});

socket.on('gameOver', (data) => {
  stopClientTimer();
  if (isProjector) {
    // Show winner on projector
    const crew = data.winner === 'crewmates';
    projPhaseBanner.textContent = crew ? '🎉 Crewmates Win!' : '😈 Imposters Win!';
    projPhaseBanner.className = `proj-phase-banner ${crew ? 'phase-running' : 'phase-meeting'}`;
    projMeetingArea.classList.add('hidden');
    projMeetingBtnContainer.classList.add('hidden');
    return;
  }
  showGameOver(data);
});

socket.on('gameEnded', (data) => {
  stopClientTimer();
  window._lastPlayers = data.players;
  tasksDisplayDiv.innerHTML = '';
  roleDisplayDiv.innerHTML = '';
  aliveStatusDiv.innerHTML = '';
  reportBtnContainer.classList.add('hidden');
  hostGameControlsDiv.classList.add('hidden');
  myVote = null;

  if (isProjector) return; // projector gets projectorState update
  showSection(lobbyDiv);
  renderPlayersList(data.players);
  updateAllProgress(data.taskProgress || { completed: 0, total: 0 });
  if (isHost) { hostControlsDiv.classList.remove('hidden'); hostOverviewDiv.classList.remove('hidden'); }
  showError('Game ended. Back to lobby.');
});

socket.on('sessionEnded', () => {
  stopClientTimer();
  clearStoredIdentity();
  showLanding();
  renderAnnouncements([]);
  showError('Lobby ended.');
});

socket.on('rejoinFailed', (data) => { clearStoredIdentity(); showLanding(); showError(data.message); });
socket.on('hostReconnectFailed', (data) => { clearStoredIdentity(); showLanding(); showError(data.message); });
socket.on('kickedSelf', (data) => { clearStoredIdentity(); showLanding(); showError(data.message); });
socket.on('error', (msg) => showError(msg));

// ── Auto-reconnect ────────────────────────────────────────────────────────────

function tryReconnect() {
  const projToken   = localStorage.getItem('projectorToken');
  const hostToken   = localStorage.getItem('hostToken');
  const playerId    = localStorage.getItem('playerId');
  const sessionCode = localStorage.getItem('sessionCode');

  if (projToken && sessionCode) {
    socket.emit('projectorReconnect', { projectorToken: projToken, sessionCode });
    return;
  }
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
