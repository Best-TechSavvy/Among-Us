const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TASK_BANK_PATH = path.join(__dirname, 'taskBank.json');

const DEFAULT_TASK_BANK = [
  {
    taskId: 'task-1',
    title: 'Fix wiring',
    instructions: 'Connect the wires in the correct order.',
    completionCode: 'RED',
    active: true
  },
  {
    taskId: 'task-2',
    title: 'Swipe card',
    instructions: 'Swipe your card through the reader at the right speed.',
    completionCode: 'SWIPE',
    active: true
  }
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
  // phases: 'lobby' | 'running' | 'meeting' | 'ended'
  phase: 'lobby',
  host: {
    token: null,
    socketId: null,
    connected: false,
    name: null
  },
  players: [],
  settings: {
    totalPlayers: 4,
    imposters: 1,
    tasksPerPlayer: 3,
    taskBank: loadTaskBank()
  },
  // voting state
  meeting: {
    calledBy: null,       // playerId
    votes: {},            // { voterId: targetId | 'skip' }
    phase: null           // null | 'voting' | 'results'
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
  gameState.host = {
    token: generateToken(),
    socketId,
    connected: true,
    name: hostName
  };
  gameState.players = [];
  gameState.settings.totalPlayers = 4;
  gameState.meeting = { calledBy: null, votes: {}, phase: null };
  return { lobbyName: gameState.lobbyName, hostToken: gameState.host.token };
}

function joinLobby(lobbyName, playerName, socketId) {
  if (!gameState.lobbyName) return { success: false, message: 'No active lobby' };
  if (gameState.lobbyName !== lobbyName) return { success: false, message: 'Lobby not found' };
  if (gameState.phase !== 'lobby') return { success: false, message: 'Game already started' };
  if (gameState.players.length >= 10) return { success: false, message: 'Lobby full' };
  if (gameState.players.some(p => p.name === playerName)) return { success: false, message: 'Name already taken' };

  const player = {
    playerId: generateToken(),
    name: playerName,
    role: null,
    alive: true,
    active: true,
    tasks: [],
    connected: true,
    socketId
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
  if (assigned) {
    task.active = false;
    saveTaskBank();
    return { success: true, inactive: true, task };
  }
  gameState.settings.taskBank = gameState.settings.taskBank.filter(t => t.taskId !== taskId);
  saveTaskBank();
  return { success: true, inactive: false };
}

function getTaskBank() {
  return gameState.settings.taskBank.map(t => ({
    taskId: t.taskId,
    title: t.title,
    instructions: t.instructions,
    completionCode: t.completionCode,
    active: t.active
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

  // Case-insensitive comparison
  if (bankTask.completionCode.toLowerCase() !== code.toLowerCase()) {
    return { success: false, message: 'Incorrect completion code' };
  }

  task.completed = true;
  return {
    success: true,
    myTasks: player.tasks.map(t => ({
      taskId: t.taskId,
      title: t.title,
      instructions: t.instructions,
      completed: t.completed
    })),
    taskProgress: getGlobalTaskProgress()
  };
}

function getGlobalTaskProgress() {
  const allTasks = gameState.players.flatMap(p => p.tasks);
  const total = allTasks.length;
  const completed = allTasks.filter(t => t.completed).length;
  return { completed, total };
}

// --- VOTING / MEETING ---

function callMeeting(callerPlayerId) {
  if (gameState.phase !== 'running') return { success: false, message: 'Can only call meeting during game' };
  const caller = gameState.players.find(p => p.playerId === callerPlayerId);
  if (!caller) return { success: false, message: 'Player not found' };
  if (!caller.alive) return { success: false, message: 'Dead players cannot call meetings' };

  gameState.phase = 'meeting';
  gameState.meeting = {
    calledBy: callerPlayerId,
    votes: {},
    phase: 'voting'
  };
  return { success: true };
}

function castVote(voterPlayerId, targetId) {
  if (gameState.phase !== 'meeting') return { success: false, message: 'No active meeting' };
  if (gameState.meeting.phase !== 'voting') return { success: false, message: 'Voting is not open' };

  const voter = gameState.players.find(p => p.playerId === voterPlayerId);
  if (!voter) return { success: false, message: 'Voter not found' };
  if (!voter.alive) return { success: false, message: 'Dead players cannot vote' };
  if (gameState.meeting.votes[voterPlayerId] !== undefined) return { success: false, message: 'Already voted' };

  // targetId can be a playerId or 'skip'
  if (targetId !== 'skip') {
    const target = gameState.players.find(p => p.playerId === targetId);
    if (!target || !target.alive) return { success: false, message: 'Invalid vote target' };
  }

  gameState.meeting.votes[voterPlayerId] = targetId;
  return { success: true };
}

function tallyVotes() {
  const alivePlayers = gameState.players.filter(p => p.alive);
  const allVoted = alivePlayers.every(p => gameState.meeting.votes[p.playerId] !== undefined);

  const voteCounts = {};
  Object.values(gameState.meeting.votes).forEach(targetId => {
    voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
  });

  return { voteCounts, allVoted, totalVoters: alivePlayers.length, totalVoted: Object.keys(gameState.meeting.votes).length };
}

function resolveMeeting() {
  const { voteCounts } = tallyVotes();

  // Find who got the most votes
  let maxVotes = 0;
  let ejected = null;
  let tie = false;

  Object.entries(voteCounts).forEach(([targetId, count]) => {
    if (targetId === 'skip') return;
    if (count > maxVotes) {
      maxVotes = count;
      ejected = targetId;
      tie = false;
    } else if (count === maxVotes) {
      tie = true;
    }
  });

  const skipVotes = voteCounts['skip'] || 0;
  if (skipVotes >= maxVotes) {
    ejected = null; // skip wins or tie
  }
  if (tie) ejected = null;

  let ejectedPlayer = null;
  if (ejected) {
    ejectedPlayer = gameState.players.find(p => p.playerId === ejected);
    if (ejectedPlayer) {
      ejectedPlayer.alive = false;
    }
  }

  gameState.meeting.phase = 'results';
  gameState.phase = 'running';

  return {
    ejectedPlayer: ejectedPlayer ? {
      playerId: ejectedPlayer.playerId,
      name: ejectedPlayer.name,
      role: ejectedPlayer.role
    } : null,
    voteCounts,
    skipVotes
  };
}

// --- WIN CONDITIONS ---

function checkWinCondition() {
  if (gameState.phase !== 'running') return null;

  const alivePlayers = gameState.players.filter(p => p.alive);
  const aliveImposters = alivePlayers.filter(p => p.role === 'imposter');
  const aliveCrewmates = alivePlayers.filter(p => p.role === 'crewmate');

  // Imposters win if they equal or outnumber crewmates
  if (aliveImposters.length >= aliveCrewmates.length) {
    return { winner: 'imposters', reason: 'Imposters outnumber crewmates' };
  }

  // Imposters win if all eliminated
  if (aliveImposters.length === 0 && gameState.players.filter(p => p.role === 'imposter').length > 0) {
    return { winner: 'crewmates', reason: 'All imposters ejected' };
  }

  // Crewmates win if all tasks done
  const { completed, total } = getGlobalTaskProgress();
  if (total > 0 && completed === total) {
    return { winner: 'crewmates', reason: 'All tasks completed' };
  }

  return null;
}

function startGame() {
  if (gameState.phase !== 'lobby') return false;
  if (gameState.players.length < 2) return false;

  gameState.phase = 'running';
  gameState.meeting = { calledBy: null, votes: {}, phase: null };

  const numImposters = Math.min(gameState.settings.imposters, gameState.players.length - 1);
  const shuffled = [...gameState.players].sort(() => Math.random() - 0.5);
  shuffled.slice(0, numImposters).forEach(p => { p.role = 'imposter'; p.alive = true; });
  shuffled.slice(numImposters).forEach(p => { p.role = 'crewmate'; p.alive = true; });

  const crewmates = gameState.players.filter(p => p.active && p.role === 'crewmate');
  crewmates.forEach(player => {
    player.tasks = [];
    const activeTasks = gameState.settings.taskBank.filter(t => t.active);
    if (activeTasks.length === 0) return;
    const availableTasks = [...activeTasks];
    for (let i = 0; i < gameState.settings.tasksPerPlayer; i++) {
      if (availableTasks.length === 0) availableTasks.push(...activeTasks);
      const taskIndex = Math.floor(Math.random() * availableTasks.length);
      const source = availableTasks.splice(taskIndex, 1)[0];
      player.tasks.push({ taskId: source.taskId, title: source.title, instructions: source.instructions, completed: false });
    }
  });

  return true;
}

function endGame() {
  if (!gameState.sessionCode) return false;
  gameState.phase = 'lobby';
  gameState.meeting = { calledBy: null, votes: {}, phase: null };
  gameState.players.forEach(player => {
    player.role = null;
    player.alive = true;
    player.tasks = [];
  });
  return true;
}

function endSession() {
  if (!gameState.sessionCode) return false;
  const prevLobbyName = gameState.lobbyName;
  gameState.lobbyName = null;
  gameState.sessionCode = null;
  gameState.phase = 'lobby';
  gameState.host = { token: null, socketId: null, connected: false, name: null };
  gameState.players = [];
  gameState.settings.totalPlayers = 4;
  gameState.meeting = { calledBy: null, votes: {}, phase: null };
  return prevLobbyName;
}

function getPlayerBySocket(socketId) {
  return gameState.players.find(p => p.socketId === socketId);
}

function getHostBySocket(socketId) {
  return gameState.host.socketId === socketId ? gameState.host : null;
}

function getPublicPlayers() {
  return gameState.players.map(p => ({
    playerId: p.playerId,
    name: p.name,
    active: p.active,
    alive: p.alive,
    connected: p.connected
  }));
}

function getHostPlayers() {
  return gameState.players.map(p => ({
    playerId: p.playerId,
    name: p.name,
    role: p.role,
    alive: p.alive,
    completedTasks: p.tasks.filter(t => t.completed).length,
    totalTasks: p.tasks.length,
    active: p.active,
    connected: p.connected
  }));
}

function getVoteStatus() {
  const alivePlayers = gameState.players.filter(p => p.alive);
  return {
    totalVoters: alivePlayers.length,
    totalVoted: Object.keys(gameState.meeting.votes).length,
    // Only reveal who voted, not who they voted for
    votedPlayerIds: Object.keys(gameState.meeting.votes)
  };
}

function getGameStateForPlayer(socketId) {
  const player = getPlayerBySocket(socketId);
  if (!player) return null;

  const state = {
    sessionCode: gameState.sessionCode,
    phase: gameState.phase,
    players: getPublicPlayers(),
    settings: {
      totalPlayers: gameState.settings.totalPlayers,
      imposters: gameState.settings.imposters,
      tasksPerPlayer: gameState.settings.tasksPerPlayer
    },
    myRole: player.role,
    myAlive: player.alive,
    myTasks: player.tasks.map(t => ({
      taskId: t.taskId,
      title: t.title,
      instructions: t.instructions,
      completed: t.completed
    })),
    taskProgress: getGlobalTaskProgress(),
    playerId: player.playerId
  };

  if (gameState.phase === 'meeting') {
    state.meeting = {
      calledByName: (() => {
        const caller = gameState.players.find(p => p.playerId === gameState.meeting.calledBy);
        return caller ? caller.name : 'Unknown';
      })(),
      votingPhase: gameState.meeting.phase,
      myVote: gameState.meeting.votes[player.playerId] || null,
      voteStatus: getVoteStatus()
    };
  }

  return state;
}

function getGameStateForHost(socketId) {
  const host = getHostBySocket(socketId);
  if (!host) return null;

  const state = {
    lobbyName: gameState.lobbyName,
    sessionCode: gameState.sessionCode,
    phase: gameState.phase,
    host: { name: host.name, connected: host.connected },
    players: getHostPlayers(),
    settings: {
      totalPlayers: gameState.settings.totalPlayers,
      imposters: gameState.settings.imposters,
      tasksPerPlayer: gameState.settings.tasksPerPlayer
    },
    taskBank: gameState.settings.taskBank.map(t => ({
      taskId: t.taskId,
      title: t.title,
      instructions: t.instructions,
      completionCode: t.completionCode,
      active: t.active
    })),
    taskProgress: getGlobalTaskProgress()
  };

  if (gameState.phase === 'meeting') {
    state.meeting = {
      calledByName: (() => {
        const caller = gameState.players.find(p => p.playerId === gameState.meeting.calledBy);
        return caller ? caller.name : 'Unknown';
      })(),
      votingPhase: gameState.meeting.phase,
      votes: gameState.meeting.votes,
      voteStatus: getVoteStatus()
    };
  }

  return state;
}

module.exports = {
  gameState,
  createSession,
  joinLobby,
  rejoinSession,
  hostReconnect,
  kickPlayer,
  updateSettings,
  createTask,
  editTask,
  deleteTask,
  getTaskBank,
  startGame,
  endGame,
  endSession,
  submitTaskCode,
  callMeeting,
  castVote,
  tallyVotes,
  resolveMeeting,
  checkWinCondition,
  getPlayerBySocket,
  getHostBySocket,
  getGameStateForPlayer,
  getGameStateForHost,
  getPublicPlayers,
  getGlobalTaskProgress,
  getVoteStatus
};
