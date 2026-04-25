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
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid task bank file');
    }
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
  sessionCode: null,
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
  }
};

function generateSessionCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken() {
  return crypto.randomBytes(8).toString('hex');
}

function createSession(hostName, socketId) {
  gameState.sessionCode = generateSessionCode();
  gameState.phase = 'lobby';
  gameState.host = {
    token: generateToken(),
    socketId,
    connected: true,
    name: hostName
  };
  gameState.players = [];
  gameState.settings.totalPlayers = 4;
  return { code: gameState.sessionCode, hostToken: gameState.host.token };
}

function joinSession(sessionCode, playerName, socketId) {
  if (gameState.sessionCode !== sessionCode) {
    return { success: false, message: 'Invalid session code' };
  }
  if (gameState.phase !== 'lobby') {
    return { success: false, message: 'Game already started' };
  }
  if (gameState.players.length >= 10) {
    return { success: false, message: 'Session full' };
  }
  if (gameState.players.some(p => p.name === playerName)) {
    return { success: false, message: 'Name already taken' };
  }

  const player = {
    playerId: generateToken(),
    name: playerName,
    role: null,
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
  if (gameState.sessionCode !== sessionCode) {
    return { success: false, message: 'Invalid session code' };
  }
  const player = gameState.players.find(p => p.playerId === playerId);
  if (!player) {
    return { success: false, message: 'Player session not found' };
  }
  player.socketId = socketId;
  player.connected = true;
  return { success: true, player };
}

function hostReconnect(hostToken, socketId) {
  if (gameState.host.token !== hostToken) {
    return { success: false, message: 'Invalid host token' };
  }
  gameState.host.socketId = socketId;
  gameState.host.connected = true;
  return { success: true };
}

function updateSettings(newSettings) {
  Object.assign(gameState.settings, newSettings);
  if (gameState.settings.totalPlayers < gameState.players.length) {
    gameState.settings.totalPlayers = gameState.players.length;
  }
}

function createTask(title, instructions, completionCode) {
  if (!title || !instructions || !completionCode) {
    return { success: false, message: 'All task fields are required' };
  }
  const task = {
    taskId: generateToken(),
    title,
    instructions,
    completionCode,
    active: true
  };
  gameState.settings.taskBank.push(task);
  saveTaskBank();
  return { success: true, task };
}

function editTask(taskId, { title, instructions, completionCode, active }) {
  const task = gameState.settings.taskBank.find(t => t.taskId === taskId);
  if (!task) {
    return { success: false, message: 'Task not found' };
  }
  if (title !== undefined) task.title = title;
  if (instructions !== undefined) task.instructions = instructions;
  if (completionCode !== undefined) task.completionCode = completionCode;
  if (active !== undefined) task.active = active;
  saveTaskBank();
  return { success: true, task };
}

function deleteTask(taskId) {
  const task = gameState.settings.taskBank.find(t => t.taskId === taskId);
  if (!task) {
    return { success: false, message: 'Task not found' };
  }
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
  if (!player) {
    return { success: false, message: 'Player not found' };
  }
  if (!player.active || !player.connected) {
    return { success: false, message: 'Only active connected players can submit codes' };
  }
  if (gameState.phase !== 'running') {
    return { success: false, message: 'Game is not running' };
  }

  const task = player.tasks.find(t => t.taskId === taskId);
  if (!task) {
    return { success: false, message: 'Task does not belong to this player' };
  }
  if (task.completed) {
    return { success: false, message: 'Task is already completed' };
  }

  const bankTask = gameState.settings.taskBank.find(t => t.taskId === taskId);
  if (!bankTask) {
    return { success: false, message: 'Task not found in task bank' };
  }
  if (bankTask.completionCode !== code) {
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

function startGame() {
  if (gameState.phase !== 'lobby') return false;
  if (gameState.players.length < 2) return false;

  gameState.phase = 'running';

  const numImposters = Math.min(gameState.settings.imposters, gameState.players.length - 1);
  const shuffled = [...gameState.players].sort(() => Math.random() - 0.5);
  shuffled.slice(0, numImposters).forEach(p => p.role = 'imposter');
  shuffled.slice(numImposters).forEach(p => p.role = 'crewmate');

  const crewmates = gameState.players.filter(p => p.active && p.role === 'crewmate');
  crewmates.forEach(player => {
    player.tasks = [];
    const activeTasks = gameState.settings.taskBank.filter(t => t.active);
    if (activeTasks.length === 0) return;
    const availableTasks = [...activeTasks];
    for (let i = 0; i < gameState.settings.tasksPerPlayer; i++) {
      if (availableTasks.length === 0) {
        availableTasks.push(...activeTasks);
      }
      const taskIndex = Math.floor(Math.random() * availableTasks.length);
      const source = availableTasks.splice(taskIndex, 1)[0];
      player.tasks.push({
        taskId: source.taskId,
        title: source.title,
        instructions: source.instructions,
        completed: false
      });
    }
  });

  return true;
}

function endGame() {
  if (!gameState.sessionCode) return false;
  gameState.phase = 'lobby';
  gameState.players.forEach(player => {
    player.role = null;
    player.tasks = [];
  });
  return true;
}

function endSession() {
  if (!gameState.sessionCode) return false;
  gameState.sessionCode = null;
  gameState.phase = 'lobby';
  gameState.host = {
    token: null,
    socketId: null,
    connected: false,
    name: null
  };
  gameState.players = [];
  gameState.settings.totalPlayers = 4;
  return true;
}

function getPlayerBySocket(socketId) {
  return gameState.players.find(p => p.socketId === socketId);
}

function getHostBySocket(socketId) {
  return gameState.host.socketId === socketId ? gameState.host : null;
}

function getPublicPlayers() {
  return gameState.players.map(p => ({
    name: p.name,
    active: p.active,
    connected: p.connected
  }));
}

function getHostPlayers() {
  return gameState.players.map(p => ({
    playerId: p.playerId,
    name: p.name,
    role: p.role,
    completedTasks: p.tasks.filter(t => t.completed).length,
    totalTasks: p.tasks.length,
    active: p.active,
    connected: p.connected
  }));
}

function getGameStateForPlayer(socketId) {
  const player = getPlayerBySocket(socketId);
  if (!player) return null;

  return {
    sessionCode: gameState.sessionCode,
    phase: gameState.phase,
    players: getPublicPlayers(),
    settings: {
      totalPlayers: gameState.settings.totalPlayers,
      imposters: gameState.settings.imposters,
      tasksPerPlayer: gameState.settings.tasksPerPlayer
    },
    myRole: player.role,
    myTasks: player.tasks.map(t => ({
      taskId: t.taskId,
      title: t.title,
      instructions: t.instructions,
      completed: t.completed
    })),
    taskProgress: getGlobalTaskProgress(),
    playerId: player.playerId
  };
}

function getGameStateForHost(socketId) {
  const host = getHostBySocket(socketId);
  if (!host) return null;

  return {
    sessionCode: gameState.sessionCode,
    phase: gameState.phase,
    host: {
      name: host.name,
      connected: host.connected
    },
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
}

module.exports = {
  gameState,
  createSession,
  joinSession,
  rejoinSession,
  hostReconnect,
  updateSettings,
  createTask,
  editTask,
  deleteTask,
  getTaskBank,
  startGame,
  endGame,
  endSession,
  submitTaskCode,
  getPlayerBySocket,
  getHostBySocket,
  getGameStateForPlayer,
  getGameStateForHost,
  getPublicPlayers,
  getGlobalTaskProgress
};