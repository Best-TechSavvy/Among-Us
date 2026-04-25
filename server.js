// server.js - Express server with Socket.IO for Among Us IRL

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const {
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

let announcements = [];

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
    announcements = [];
    socket.isHost = true;
    socket.join(gameState.lobbyName);
    console.log(`[DEBUG] createSession success: lobby ${session.lobbyName}, host ${name}`);
    socket.emit('sessionCreated', { lobbyName: session.lobbyName, hostToken: session.hostToken, sessionCode: gameState.sessionCode });
    socket.emit('announcementList', { announcements });
    socket.emit('hostState', getGameStateForHost(socket.id));
  });

  socket.on('joinLobby', (data) => {
    const { name, code } = data;
    if (!name || !code) {
      socket.emit('error', 'Name and lobby name are required');
      return;
    }

    const result = joinLobby(code, name.trim(), socket.id);
    if (result.success) {
      socket.join(gameState.lobbyName);
      socket.emit('joined', { player: result.player, lobbyName: gameState.lobbyName, sessionCode: gameState.sessionCode });
      socket.emit('announcementList', { announcements });
      socket.emit('gameState', getGameStateForPlayer(socket.id));
      io.to(gameState.lobbyName).emit('playersUpdated', { players: getPublicPlayers() });
      if (gameState.host.connected) {
        io.to(gameState.host.socketId).emit('hostState', getGameStateForHost(gameState.host.socketId));
      }
    } else {
      console.log('[DEBUG] joinLobby rejected:', result.message);
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
      socket.join(gameState.lobbyName);
      socket.emit('rejoined', { player: result.player, lobbyName: gameState.lobbyName, sessionCode: gameState.sessionCode });
      socket.emit('announcementList', { announcements });
      socket.emit('gameState', getGameStateForPlayer(socket.id));
      io.to(gameState.lobbyName).emit('playersUpdated', { players: getPublicPlayers() });
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
      socket.join(gameState.lobbyName);
      console.log('[DEBUG] hostReconnect success for host token', hostToken);
      socket.emit('hostReconnected', { lobbyName: gameState.lobbyName, sessionCode: gameState.sessionCode });
      socket.emit('announcementList', { announcements });
      socket.emit('hostState', getGameStateForHost(socket.id));
      io.to(gameState.lobbyName).emit('playersUpdated', { players: getPublicPlayers() });
    } else {
      console.log('[DEBUG] hostReconnect failed:', result.message);
      socket.emit('hostReconnectFailed', { message: result.message });
    }
  });

  socket.on('updateSettings', (data) => {
    if (!isAuthorizedHost(socket)) {
      socket.emit('error', 'Only host can update settings');
      return;
    }
    updateSettings(data);
    io.to(gameState.lobbyName).emit('settingsUpdated', gameState.settings);
    io.to(gameState.lobbyName).emit('playersUpdated', { players: getPublicPlayers() });
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

  socket.on('sendAnnouncement', (data) => {
    const { text } = data || {};
    if (!isAuthorizedHost(socket)) {
      console.log('[DEBUG] sendAnnouncement rejected: not host');
      socket.emit('error', 'Only host can send announcements');
      return;
    }
    if (!text || !text.trim()) {
      socket.emit('error', 'Announcement text is required');
      return;
    }

    const announcement = {
      text: text.trim(),
      timestamp: Date.now(),
      senderLabel: 'HOST'
    };
    announcements.push(announcement);
    io.to(gameState.lobbyName).emit('announcementPosted', announcement);
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
    io.to(gameState.lobbyName).emit('updateGlobalTaskProgress', result.taskProgress);
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
      io.to(gameState.lobbyName).emit('updateGlobalTaskProgress', progress);
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
      io.to(gameState.lobbyName).emit('gameEnded', {
        lobbyName: gameState.lobbyName,
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
    const lobbyName = gameState.lobbyName;
    if (!endSession()) {
      console.log('[DEBUG] endSession rejected: cannot end session');
      socket.emit('error', 'Cannot end session');
      return;
    }
    if (lobbyName) {
      io.to(lobbyName).emit('sessionEnded');
      const room = io.sockets.adapter.rooms.get(lobbyName);
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
    announcements = [];
    if (gameState.host.connected) {
      io.to(gameState.host.socketId).emit('hostState', getGameStateForHost(gameState.host.socketId));
    }
  });

  socket.on('kickPlayer', (data) => {
    if (!isAuthorizedHost(socket)) {
      console.log('[DEBUG] kickPlayer rejected: not host');
      socket.emit('error', 'Only host can kick players');
      return;
    }
    const { playerId } = data;
    if (!playerId) {
      socket.emit('error', 'Player ID is required');
      return;
    }

    const player = gameState.players.find(p => p.playerId === playerId);
    if (!player) {
      socket.emit('error', 'Player not found');
      return;
    }

    console.log(`[DEBUG] Kicking player ${player.name} (${playerId})`);
    const result = kickPlayer(playerId);
    if (result.success) {
      const kickedPlayerSocketId = player.socketId;
      const progress = getGlobalTaskProgress();
      
      // Notify kicked player
      if (kickedPlayerSocketId) {
        const kickedSocket = io.sockets.sockets.get(kickedPlayerSocketId);
        if (kickedSocket) {
          kickedSocket.emit('kickedSelf', { message: 'You were removed from the lobby by the host' });
          kickedSocket.leave(gameState.lobbyName);
        }
      }

      // Update all remaining players
      io.to(gameState.lobbyName).emit('playersUpdated', { players: getPublicPlayers() });
      io.to(gameState.lobbyName).emit('updateGlobalTaskProgress', progress);

      // Update host state
      if (gameState.host.connected) {
        io.to(gameState.host.socketId).emit('hostState', getGameStateForHost(gameState.host.socketId));
      }
    } else {
      console.log('[DEBUG] kickPlayer failed:', result.message);
      socket.emit('error', result.message);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    const host = getHostBySocket(socket.id);
    if (host) {
      gameState.host.connected = false;
      io.to(gameState.lobbyName).emit('hostStatus', { connected: false });
      return;
    }

    const player = getPlayerBySocket(socket.id);
    if (player) {
      player.connected = false;
      io.to(gameState.lobbyName).emit('playersUpdated', { players: getPublicPlayers() });
    }
  });
});