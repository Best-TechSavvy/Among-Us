const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TASK_BANK_PATH = path.join(__dirname, 'taskBank.json');

const DEFAULT_TASK_BANK = [
  { taskId: 'task-1', title: 'Fix wiring', instructions: 'Connect the wires in the correct order.', completionCode: 'RED', active: true },
  { taskId: 'task-2', title: 'Swipe card', instructions: 'Swipe your card through the reader at the right speed.', completionCode: 'SWIPE', active: true }
];

function loadTaskBank() {
  try {
    if (!fs.existsSync(TASK_BANK_PATH)) {
      fs.writeFileSync(TASK_BANK_PATH, JSON.stringify(DEFAULT_TASK_BANK, null, 2), 'utf8');
      return JSON.parse(JSON.stringify(DEFAULT_TASK_BANK));
    }
    const data = fs.readFileSync(TASK_BANK_PATH, 'utf8');
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) throw new Error('Invalid task bank file');
    return parsed.map(task => ({ ...task, active: task.active !== false }));
  } catch (err) {
    fs.writeFileSync(TASK_BANK_PATH, JSON.stringify(DEFAULT_TASK_BANK, null, 2), 'utf8');
    return JSON.parse(JSON.stringify(DEFAULT_TASK_BANK));
  }
}

function saveTaskBank() {
  fs.writeFileSync(TASK_BANK_PATH, JSON.stringify(gameState.settings.taskBank, null, 2), 'utf8');
}

const gameState = {
  lobbyName: null,
  sessionCode: null,
  // phases: 'lobby' | 'running' | 'meeting'
  phase: 'lobby',
  host: { token: null, socketId: null, connected: false, name: null },
  projector: { token: null, socketId: null, connected: false },
  players: [],
  settings: {
    totalPlayers: 4,
    imposters: 1,
    tasksPerPlayer: 3,
    votingDuration: 60,
    taskBank: loadTaskBank()
  },
  meeting: {
    // subPhase: null | 'gathering' | 'voting' | 'results'
    subPhase: null,
    calledBy: null,           // playerId or 'projector'
    callerType: null,         // 'player' | 'projector'
    reportedDeadId: null,     // playerId of the reported body
    arrivedPlayerIds: [],     // confirmed arrivals
    votes: {},                // { voterId: targetId | 'skip' }
    votingEndsAt: null,       // ms timestamp
    resolvedResult: null      // stored result for projector display
  }
};

function generateSessionCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken() {
  return crypto.randomBytes(8).toString('hex');
}

function createSession(hostName, socketId) {
  gameState.lobbyName = generateSessionCode();
  gameState.sessionCode = generateToken();
  gameState.phase = 'lobby';
  gameState.host = { token: generateToken(), socketId, connected: true, name: hostName };
  gameState.projector = { token: generateToken(), socketId: null, connected: false };
  gameState.players = [];
  gameState.settings.totalPlayers = 4;
  gameState.meeting = { subPhase: null, calledBy: null, callerType: null, reportedDeadId: null, arrivedPlayerIds: [], votes: {}, votingEndsAt: null, resolvedResult: null };
  return { lobbyName: gameState.lobbyName, hostToken: gameState.host.token, projectorToken: gameState.projector.token };
}

function projectorJoin(projectorToken, socketId) {
  if (!gameState.projector.token) return { success: false, message: 'No active session' };
  if (gameState.projector.token !== projectorToken) return { success: false, message: 'Invalid projector code' };
  gameState.projector.socketId = socketId;
  gameState.projector.connected = true;
  return { success: true };
}

function projectorReconnect(projectorToken, sessionCode, socketId) {
  if (gameState.sessionCode !== sessionCode) return { success: false, message: 'Invalid session code' };
  if (gameState.projector.token !== projectorToken) return { success: false, message: 'Invalid projector token' };
  gameState.projector.socketId = socketId;
  gameState.projector.connected = true;
  return { success: true };
}

function joinLobby(lobbyName, playerName, socketId) {
  if (!gameState.lobbyName) return { success: false, message: 'No active lobby' };
  if (gameState.lobbyName !== lobbyName) return { success: false, message: 'Lobby not found' };
  if (gameState.phase !== 'lobby') return { success: false, message: 'Game already started' };
  if (gameState.players.length >= 10) return { success: false, message: 'Lobby full' };
  if (gameState.players.some(p => p.name === playerName)) return { success: false, message: 'Name already taken' };

  const player = {
    playerId: generateToken(), name: playerName, role: null, alive: true,
    active: true, tasks: [], connected: true, socketId
  };
  gameState.players.push(player);
  gameState.settings.totalPlayers = Math.max(gameState.settings.totalPlayers, gameState.players.length);
  return { success: true, player };
}

function rejoinSession(sessionCode, playerId, socketId) {
  if (gameState.sessionCode !== sessionCode) return { success: false, message: 'Invalid session code' };
  const player = gameState.players.find(p => p.playerId === playerId);
  if (!player) return { success: false, message: 'Player session not found' };
  player.socketId = socketId;
  player.connected = true;
  return { success: true, player };
}

function hostReconnect(hostToken, socketId) {
  if (gameState.host.token !== hostToken) return { success: false, message: 'Invalid host token' };
  gameState.host.socketId = socketId;
  gameState.host.connected = true;
  return { success: true };
}

function kickPlayer(playerId) {
  const playerIndex = gameState.players.findIndex(p => p.playerId === playerId);
  if (playerIndex === -1) return { success: false, message: 'Player not found' };
  const player = gameState.players[playerIndex];
  gameState.players.splice(playerIndex, 1);
  return { success: true, player };
}

function updateSettings(newSettings) {
  Object.assign(gameState.settings, newSettings);
  if (gameState.settings.totalPlayers < gameState.players.length) {
    gameState.settings.totalPlayers = gameState.players.length;
  }
}

function createTask(title, instructions, completionCode) {
  if (!title || !instructions || !completionCode) return { success: false, message: 'All task fields are required' };
  const task = { taskId: generateToken(), title, instructions, completionCode, active: true };
  gameState.settings.taskBank.push(task);
  saveTaskBank();
  return { success: true, task };
}

function editTask(taskId, { title, instructions, completionCode, active }) {
  const task = gameState.settings.taskBank.find(t => t.taskId === taskId);
  if (!task) return { success: false, message: 'Task not found' };
  if (title !== undefined) task.title = title;
  if (instructions !== undefined) task.instructions = instructions;
  if (completionCode !== undefined) task.completionCode = completionCode;
  if (active !== undefined) task.active = active;
  saveTaskBank();
  return { success: true, task };
}

function deleteTask(taskId) {
  const task = gameState.settings.taskBank.find(t => t.taskId === taskId);
  if (!task) return { success: false, message: 'Task not found' };
  const assigned = gameState.players.some(player => player.tasks.some(t => t.taskId === taskId));
  if (assigned) { task.active = false; saveTaskBank(); return { success: true, inactive: true, task }; }
  gameState.settings.taskBank = gameState.settings.taskBank.filter(t => t.taskId !== taskId);
  saveTaskBank();
  return { success: true, inactive: false };
}

function getTaskBank() {
  return gameState.settings.taskBank.map(t => ({
    taskId: t.taskId, title: t.title, instructions: t.instructions, completionCode: t.completionCode, active: t.active
  }));
}

function submitTaskCode(playerId, taskId, code) {
  const player = gameState.players.find(p => p.playerId === playerId);
  if (!player) return { success: false, message: 'Player not found' };
  if (!player.active || !player.connected) return { success: false, message: 'Only active connected players can submit codes' };
  if (gameState.phase !== 'running') return { success: false, message: 'Game is not running' };
  if (!player.alive) return { success: false, message: 'Dead players cannot complete tasks' };
  const task = player.tasks.find(t => t.taskId === taskId);
  if (!task) return { success: false, message: 'Task does not belong to this player' };
  if (task.completed) return { success: false, message: 'Task is already completed' };
  const bankTask = gameState.settings.taskBank.find(t => t.taskId === taskId);
  if (!bankTask) return { success: false, message: 'Task not found in task bank' };
  if (bankTask.completionCode.toLowerCase() !== code.toLowerCase()) return { success: false, message: 'Incorrect completion code' };
  task.completed = true;
  return {
    success: true,
    myTasks: player.tasks.map(t => ({ taskId: t.taskId, title: t.title, instructions: t.instructions, completed: t.completed })),
    taskProgress: getGlobalTaskProgress()
  };
}

function getGlobalTaskProgress() {
  const allTasks = gameState.players.flatMap(p => p.tasks);
  return { completed: allTasks.filter(t => t.completed).length, total: allTasks.length };
}

// ── MEETING FLOW ──────────────────────────────────────────────────────────────

// Step 1: Trigger a meeting
function callMeeting(callerId, callerType, reportedDeadId) {
  if (gameState.phase !== 'running') return { success: false, message: 'Can only call meeting during game' };
  if (callerType === 'player') {
    const caller = gameState.players.find(p => p.playerId === callerId);
    if (!caller) return { success: false, message: 'Player not found' };
    if (!caller.alive) return { success: false, message: 'Dead players cannot report' };
    if (reportedDeadId) {
      const dead = gameState.players.find(p => p.playerId === reportedDeadId);
      if (!dead) return { success: false, message: 'Reported player not found' };
      // No alive check — host controls who is dead via markPlayerDead
    }
  }
  gameState.phase = 'meeting';
  gameState.meeting = {
    subPhase: 'gathering',
    calledBy: callerId,
    callerType,
    reportedDeadId: reportedDeadId || null,
    arrivedPlayerIds: [],
    votes: {},
    votingEndsAt: null,
    resolvedResult: null
  };
  return { success: true };
}

// Step 2: Player confirms arrival
function confirmArrival(playerId) {
  if (gameState.phase !== 'meeting' || gameState.meeting.subPhase !== 'gathering')
    return { success: false, message: 'Not in gathering phase' };
  const player = gameState.players.find(p => p.playerId === playerId);
  if (!player) return { success: false, message: 'Player not found' };
  if (!gameState.meeting.arrivedPlayerIds.includes(playerId)) {
    gameState.meeting.arrivedPlayerIds.push(playerId);
  }
  return { success: true, arrivedPlayerIds: [...gameState.meeting.arrivedPlayerIds] };
}

// Step 3: Host starts voting
function startVoting() {
  if (gameState.phase !== 'meeting' || gameState.meeting.subPhase !== 'gathering')
    return { success: false, message: 'Not in gathering phase' };
  const duration = gameState.settings.votingDuration || 60;
  gameState.meeting.subPhase = 'voting';
  gameState.meeting.votingEndsAt = Date.now() + duration * 1000;
  return { success: true, votingEndsAt: gameState.meeting.votingEndsAt, duration };
}

// Step 4: Cast vote
function castVote(voterPlayerId, targetId) {
  if (gameState.phase !== 'meeting' || gameState.meeting.subPhase !== 'voting')
    return { success: false, message: 'Voting is not open' };
  const voter = gameState.players.find(p => p.playerId === voterPlayerId);
  if (!voter || !voter.alive) return { success: false, message: 'Cannot vote' };
  if (gameState.meeting.votes[voterPlayerId] !== undefined) return { success: false, message: 'Already voted' };
  if (targetId !== 'skip') {
    const target = gameState.players.find(p => p.playerId === targetId);
    if (!target || !target.alive) return { success: false, message: 'Invalid vote target' };
  }
  gameState.meeting.votes[voterPlayerId] = targetId;
  return { success: true };
}

// Step 5: Resolve
function tallyVotes() {
  const alivePlayers = gameState.players.filter(p => p.alive);
  const voteCounts = {};
  Object.values(gameState.meeting.votes).forEach(t => { voteCounts[t] = (voteCounts[t] || 0) + 1; });
  return {
    voteCounts,
    allVoted: alivePlayers.every(p => gameState.meeting.votes[p.playerId] !== undefined),
    totalVoters: alivePlayers.length,
    totalVoted: Object.keys(gameState.meeting.votes).length
  };
}

function resolveMeeting() {
  const { voteCounts } = tallyVotes();
  let maxVotes = 0; let ejected = null; let tie = false;
  Object.entries(voteCounts).forEach(([targetId, count]) => {
    if (targetId === 'skip') return;
    if (count > maxVotes) { maxVotes = count; ejected = targetId; tie = false; }
    else if (count === maxVotes) { tie = true; }
  });
  const skipVotes = voteCounts['skip'] || 0;
  if (skipVotes >= maxVotes || tie) ejected = null;

  let ejectedPlayer = null;
  if (ejected) {
    ejectedPlayer = gameState.players.find(p => p.playerId === ejected);
    if (ejectedPlayer) ejectedPlayer.alive = false;
  }

  const voteReveal = Object.entries(gameState.meeting.votes).map(([voterId, targetId]) => {
    const voter = gameState.players.find(p => p.playerId === voterId);
    const target = targetId === 'skip' ? null : gameState.players.find(p => p.playerId === targetId);
    return { voterName: voter ? voter.name : '?', targetName: targetId === 'skip' ? 'Skip' : (target ? target.name : '?'), targetId };
  });

  const result = {
    ejectedPlayer: ejectedPlayer ? { playerId: ejectedPlayer.playerId, name: ejectedPlayer.name, role: ejectedPlayer.role } : null,
    voteCounts, voteReveal, skipVotes
  };
  gameState.meeting.subPhase = 'results';
  gameState.meeting.resolvedResult = result;
  gameState.phase = 'running';
  return result;
}

// Host marks a player as dead (physical elimination in real life)
function markPlayerDead(playerId) {
  const player = gameState.players.find(p => p.playerId === playerId);
  if (!player) return { success: false, message: 'Player not found' };
  if (!player.alive) return { success: false, message: 'Player is already dead' };
  player.alive = false;
  return { success: true, player };
}

// ── WIN CONDITIONS ────────────────────────────────────────────────────────────
function checkWinCondition() {
  if (gameState.phase !== 'running') return null;
  const alive = gameState.players.filter(p => p.alive);
  const aliveImposters = alive.filter(p => p.role === 'imposter');
  const aliveCrewmates = alive.filter(p => p.role === 'crewmate');
  if (aliveImposters.length > 0 && aliveImposters.length >= aliveCrewmates.length)
    return { winner: 'imposters', reason: 'Imposters outnumber crewmates' };
  if (aliveImposters.length === 0 && gameState.players.some(p => p.role === 'imposter'))
    return { winner: 'crewmates', reason: 'All imposters ejected' };
  const { completed, total } = getGlobalTaskProgress();
  if (total > 0 && completed === total) return { winner: 'crewmates', reason: 'All tasks completed' };
  return null;
}

// ── GAME LIFECYCLE ────────────────────────────────────────────────────────────
function startGame() {
  if (gameState.phase !== 'lobby' || gameState.players.length < 2) return false;
  gameState.phase = 'running';
  gameState.meeting = { subPhase: null, calledBy: null, callerType: null, reportedDeadId: null, arrivedPlayerIds: [], votes: {}, votingEndsAt: null, resolvedResult: null };
  const numImposters = Math.min(gameState.settings.imposters, gameState.players.length - 1);
  const shuffled = [...gameState.players].sort(() => Math.random() - 0.5);
  shuffled.slice(0, numImposters).forEach(p => { p.role = 'imposter'; p.alive = true; });
  shuffled.slice(numImposters).forEach(p => { p.role = 'crewmate'; p.alive = true; });
  gameState.players.filter(p => p.active && p.role === 'crewmate').forEach(player => {
    player.tasks = [];
    const activeTasks = gameState.settings.taskBank.filter(t => t.active);
    if (!activeTasks.length) return;
    const pool = [...activeTasks];
    for (let i = 0; i < gameState.settings.tasksPerPlayer; i++) {
      if (!pool.length) pool.push(...activeTasks);
      const src = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      player.tasks.push({ taskId: src.taskId, title: src.title, instructions: src.instructions, completed: false });
    }
  });
  return true;
}

function endGame() {
  if (!gameState.sessionCode) return false;
  gameState.phase = 'lobby';
  gameState.meeting = { subPhase: null, calledBy: null, callerType: null, reportedDeadId: null, arrivedPlayerIds: [], votes: {}, votingEndsAt: null, resolvedResult: null };
  gameState.players.forEach(p => { p.role = null; p.alive = true; p.tasks = []; });
  return true;
}

function endSession() {
  if (!gameState.sessionCode) return false;
  const prev = gameState.lobbyName;
  gameState.lobbyName = null; gameState.sessionCode = null; gameState.phase = 'lobby';
  gameState.host = { token: null, socketId: null, connected: false, name: null };
  gameState.projector = { token: null, socketId: null, connected: false };
  gameState.players = []; gameState.settings.totalPlayers = 4;
  gameState.meeting = { subPhase: null, calledBy: null, callerType: null, reportedDeadId: null, arrivedPlayerIds: [], votes: {}, votingEndsAt: null, resolvedResult: null };
  return prev;
}

// ── STATE GETTERS ─────────────────────────────────────────────────────────────
function getPlayerBySocket(socketId) { return gameState.players.find(p => p.socketId === socketId); }
function getHostBySocket(socketId) { return gameState.host.socketId === socketId ? gameState.host : null; }
function getProjectorBySocket(socketId) { return gameState.projector.socketId === socketId ? gameState.projector : null; }

function getPublicPlayers() {
  return gameState.players.map(p => ({ playerId: p.playerId, name: p.name, active: p.active, alive: p.alive, connected: p.connected }));
}
function getHostPlayers() {
  return gameState.players.map(p => ({
    playerId: p.playerId, name: p.name, role: p.role, alive: p.alive,
    completedTasks: p.tasks.filter(t => t.completed).length, totalTasks: p.tasks.length,
    active: p.active, connected: p.connected
  }));
}

function getVoteStatus() {
  const alive = gameState.players.filter(p => p.alive);
  return { totalVoters: alive.length, totalVoted: Object.keys(gameState.meeting.votes).length, votedPlayerIds: Object.keys(gameState.meeting.votes) };
}

function getMeetingInfo() {
  if (gameState.phase !== 'meeting') return null;
  const caller = gameState.players.find(p => p.playerId === gameState.meeting.calledBy);
  const dead = gameState.players.find(p => p.playerId === gameState.meeting.reportedDeadId);
  return {
    subPhase: gameState.meeting.subPhase,
    calledByName: gameState.meeting.callerType === 'projector' ? 'Projector (Emergency)' : (caller ? caller.name : '?'),
    callerType: gameState.meeting.callerType,
    reportedDeadName: dead ? dead.name : null,
    arrivedPlayerIds: [...gameState.meeting.arrivedPlayerIds],
    votingEndsAt: gameState.meeting.votingEndsAt,
    voteStatus: getVoteStatus(),
    resolvedResult: gameState.meeting.resolvedResult
  };
}

function getGameStateForPlayer(socketId) {
  const player = getPlayerBySocket(socketId);
  if (!player) return null;
  const meeting = getMeetingInfo();
  return {
    sessionCode: gameState.sessionCode, phase: gameState.phase,
    players: getPublicPlayers(),
    settings: { totalPlayers: gameState.settings.totalPlayers, imposters: gameState.settings.imposters, tasksPerPlayer: gameState.settings.tasksPerPlayer, votingDuration: gameState.settings.votingDuration },
    myRole: player.role, myAlive: player.alive,
    myTasks: player.tasks.map(t => ({ taskId: t.taskId, title: t.title, instructions: t.instructions, completed: t.completed })),
    taskProgress: getGlobalTaskProgress(), playerId: player.playerId,
    meeting: meeting ? { ...meeting, myVote: gameState.meeting.votes[player.playerId] || null } : null
  };
}

function getGameStateForHost(socketId) {
  const host = getHostBySocket(socketId);
  if (!host) return null;
  const meeting = getMeetingInfo();
  return {
    lobbyName: gameState.lobbyName, sessionCode: gameState.sessionCode,
    projectorToken: gameState.projector.token, projectorConnected: gameState.projector.connected,
    phase: gameState.phase, host: { name: host.name, connected: host.connected },
    players: getHostPlayers(),
    settings: { totalPlayers: gameState.settings.totalPlayers, imposters: gameState.settings.imposters, tasksPerPlayer: gameState.settings.tasksPerPlayer, votingDuration: gameState.settings.votingDuration },
    taskBank: getTaskBank(), taskProgress: getGlobalTaskProgress(),
    meeting: meeting ? { ...meeting, votes: gameState.meeting.votes } : null
  };
}

function getGameStateForProjector() {
  return {
    lobbyName: gameState.lobbyName, phase: gameState.phase,
    players: getPublicPlayers(),
    settings: { totalPlayers: gameState.settings.totalPlayers, imposters: gameState.settings.imposters, tasksPerPlayer: gameState.settings.tasksPerPlayer, votingDuration: gameState.settings.votingDuration },
    taskProgress: getGlobalTaskProgress(),
    meeting: getMeetingInfo()
  };
}

module.exports = {
  gameState, createSession, projectorJoin, projectorReconnect,
  joinLobby, rejoinSession, hostReconnect, kickPlayer, updateSettings,
  createTask, editTask, deleteTask, getTaskBank,
  startGame, endGame, endSession, submitTaskCode,
  markPlayerDead,
  callMeeting, confirmArrival, startVoting, castVote, tallyVotes, resolveMeeting,
  checkWinCondition,
  getPlayerBySocket, getHostBySocket, getProjectorBySocket,
  getGameStateForPlayer, getGameStateForHost, getGameStateForProjector,
  getPublicPlayers, getGlobalTaskProgress, getVoteStatus, getMeetingInfo
};
