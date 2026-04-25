// server.js - Express server with Socket.IO for Among Us IRL

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const {
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
} = require('./gameState');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

function isAuthorizedHost(socket) {
  return socket.isHost === true || socket.id === gameState.host.socketId;
}

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  socket.isHost = false;

  socket.on('createSession', (data) => {
    const { name } = data;
    if (!name || name.trim() === '') {
      socket.emit('error', 'Name is required');
      return;
    }

    const session = createSession(name.trim(), socket.id);
    socket.isHost = true;
    socket.join(gameState.sessionCode);
    console.log(`[DEBUG] createSession success: session ${session.code}, host ${name}`);
    socket.emit('sessionCreated', { code: session.code, hostToken: session.hostToken });
    socket.emit('hostState', getGameStateForHost(socket.id));
  });

  socket.on('joinSession', (data) => {
    const { name, code } = data;
    if (!name || !code) {
      socket.emit('error', 'Name and session code are required');
      return;
    }

    const result = joinSession(code, name.trim(), socket.id);
    if (result.success) {
      socket.join(gameState.sessionCode);
      socket.emit('joined', { player: result.player, sessionCode: gameState.sessionCode });
      socket.emit('gameState', getGameStateForPlayer(socket.id));
      io.to(gameState.sessionCode).emit('playersUpdated', { players: getPublicPlayers() });
      if (gameState.host.connected) {
        io.to(gameState.host.socketId).emit('hostState', getGameStateForHost(gameState.host.socketId));
      }
    } else {
      console.log('[DEBUG] joinSession rejected:', result.message);
      socket.emit('error', result.message);
    }
  });

  socket.on('rejoinSession', (data) => {
    const { playerId, code } = data;
    if (!playerId || !code) {
      socket.emit('rejoinFailed', { message: 'Player ID and session code are required' });
      return;
    }

    const result = rejoinSession(code, playerId, socket.id);
    if (result.success) {
      socket.join(gameState.sessionCode);
      socket.emit('rejoined', { player: result.player, sessionCode: gameState.sessionCode });
      socket.emit('gameState', getGameStateForPlayer(socket.id));
      io.to(gameState.sessionCode).emit('playersUpdated', { players: getPublicPlayers() });
      if (gameState.host.connected) {
        io.to(gameState.host.socketId).emit('hostState', getGameStateForHost(gameState.host.socketId));
      }
    } else {
      socket.emit('rejoinFailed', { message: result.message });
    }
  });

  socket.on('hostReconnect', (data) => {
    const { hostToken, code } = data;
    if (!hostToken || !code) {
      socket.emit('hostReconnectFailed', { message: 'Host token and session code are required' });
      return;
    }
    if (code !== gameState.sessionCode) {
      socket.emit('hostReconnectFailed', { message: 'Invalid session code' });
      return;
    }

    const result = hostReconnect(hostToken, socket.id);
    if (result.success) {
      socket.isHost = true;
      socket.join(gameState.sessionCode);
      console.log('[DEBUG] hostReconnect success for host token', hostToken);
      socket.emit('hostReconnected', { sessionCode: gameState.sessionCode });
      socket.emit('hostState', getGameStateForHost(socket.id));
      io.to(gameState.sessionCode).emit('playersUpdated', { players: getPublicPlayers() });
    } else {
      socket.emit('hostReconnectFailed', { message: result.message });
    }
  });

  socket.on('updateSettings', (data) => {
    if (!isAuthorizedHost(socket)) {
      socket.emit('error', 'Only host can update settings');
      return;
    }
    updateSettings(data);
    io.to(gameState.sessionCode).emit('settingsUpdated', gameState.settings);
    io.to(gameState.sessionCode).emit('playersUpdated', { players: getPublicPlayers() });
    io.to(gameState.host.socketId).emit('hostState', getGameStateForHost(gameState.host.socketId));
  });

  socket.on('createTask', (data) => {
    if (!isAuthorizedHost(socket)) {
      socket.emit('error', 'Only host can create tasks');
      return;
    }

    const { title, instructions, completionCode } = data;
    const result = createTask(title, instructions, completionCode);
    if (!result.success) {
      socket.emit('error', result.message);
      return;
    }

    io.to(gameState.host.socketId).emit('hostState', getGameStateForHost(gameState.host.socketId));
  });

  socket.on('editTask', (data) => {
    if (!isAuthorizedHost(socket)) {
      socket.emit('error', 'Only host can edit tasks');
      return;
    }

    const { taskId, title, instructions, completionCode, active } = data;
    const result = editTask(taskId, { title, instructions, completionCode, active });
    if (!result.success) {
      socket.emit('error', result.message);
      return;
    }

    io.to(gameState.host.socketId).emit('hostState', getGameStateForHost(gameState.host.socketId));
  });

  socket.on('deleteTask', (data) => {
    if (!isAuthorizedHost(socket)) {
      socket.emit('error', 'Only host can delete tasks');
      return;
    }

    const { taskId } = data;
    const result = deleteTask(taskId);
    if (!result.success) {
      socket.emit('error', result.message);
      return;
    }

    io.to(gameState.host.socketId).emit('hostState', getGameStateForHost(gameState.host.socketId));
  });

  socket.on('getTaskBank', () => {
    if (!isAuthorizedHost(socket)) {
      socket.emit('error', 'Only host can request the task bank');
      return;
    }
    socket.emit('taskBank', { taskBank: getTaskBank() });
  });

  socket.on('submitTaskCode', (data) => {
    const { taskId, completionCode } = data;
    const player = getPlayerBySocket(socket.id);
    if (!player) {
      socket.emit('error', 'Player not found');
      return;
    }

    const result = submitTaskCode(player.playerId, taskId, completionCode);
    if (!result.success) {
      socket.emit('error', result.message);
      return;
    }

    socket.emit('taskUpdated', { myTasks: result.myTasks, taskProgress: result.taskProgress });
    io.to(gameState.sessionCode).emit('updateGlobalTaskProgress', result.taskProgress);
    if (gameState.host.connected) {
      io.to(gameState.host.socketId).emit('updateHostTaskOverview', getGameStateForHost(gameState.host.socketId));
    }
  });

  socket.on('startGame', () => {
    if (!isAuthorizedHost(socket)) {
      socket.emit('error', 'Only host can start the game');
      return;
    }
    if (startGame()) {
      const progress = getGlobalTaskProgress();
      gameState.players.forEach(p => {
        if (p.connected) {
          io.to(p.socketId).emit('gameStarted', getGameStateForPlayer(p.socketId));
        }
      });
      io.to(gameState.sessionCode).emit('updateGlobalTaskProgress', progress);
      if (gameState.host.connected) {
        io.to(gameState.host.socketId).emit('hostState', getGameStateForHost(gameState.host.socketId));
      }
    } else {
      socket.emit('error', 'Cannot start game');
    }
  });

  socket.on('endGame', () => {
    if (!isAuthorizedHost(socket)) {
      socket.emit('error', 'Only host can end the game');
      return;
    }
    if (endGame()) {
      io.to(gameState.sessionCode).emit('gameEnded', {
        sessionCode: gameState.sessionCode,
        settings: {
          totalPlayers: gameState.settings.totalPlayers,
          imposters: gameState.settings.imposters,
          tasksPerPlayer: gameState.settings.tasksPerPlayer
        },
        players: getPublicPlayers(),
        taskProgress: getGlobalTaskProgress()
      });
      if (gameState.host.connected) {
        io.to(gameState.host.socketId).emit('hostState', getGameStateForHost(gameState.host.socketId));
      }
    } else {
      console.log('[DEBUG] endGame rejected: cannot end game');
      socket.emit('error', 'Cannot end game');
    }
  });

  socket.on('endSession', () => {
    if (!isAuthorizedHost(socket)) {
      socket.emit('error', 'Only host can end the session');
      return;
    }
    const sessionCode = gameState.sessionCode;
    if (!endSession()) {
      console.log('[DEBUG] endSession rejected: cannot end session');
      socket.emit('error', 'Cannot end session');
      return;
    }
    if (sessionCode) {
      io.to(sessionCode).emit('sessionEnded');
      const room = io.sockets.adapter.rooms.get(sessionCode);
      if (room) {
        [...room].forEach(socketId => {
          if (socketId === gameState.host.socketId) return;
          const clientSocket = io.sockets.sockets.get(socketId);
          if (clientSocket) {
            clientSocket.disconnect(true);
          }
        });
      }
    }
    if (gameState.host.connected) {
      io.to(gameState.host.socketId).emit('hostState', getGameStateForHost(gameState.host.socketId));
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    const host = getHostBySocket(socket.id);
    if (host) {
      gameState.host.connected = false;
      io.to(gameState.sessionCode).emit('hostStatus', { connected: false });
      return;
    }

    const player = getPlayerBySocket(socket.id);
    if (player) {
      player.connected = false;
      io.to(gameState.sessionCode).emit('playersUpdated', { players: getPublicPlayers() });
    }
  });
});