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

function broadcastToAll(event, data) {
  io.to(gameState.lobbyName).emit(event, data);
}

function emitToHost(event, data) {
  if (gameState.host.connected && gameState.host.socketId) {
    io.to(gameState.host.socketId).emit(event, data);
  }
}

function checkAndHandleWin() {
  const win = checkWinCondition();
  if (win) {
    broadcastToAll('gameOver', {
      winner: win.winner,
      reason: win.reason,
      players: gameState.players.map(p => ({
        name: p.name,
        role: p.role,
        alive: p.alive
      }))
    });
    return true;
  }
  return false;
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
    socket.emit('sessionCreated', {
      lobbyName: session.lobbyName,
      hostToken: session.hostToken,
      sessionCode: gameState.sessionCode
    });
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
      socket.emit('joined', {
        player: result.player,
        lobbyName: gameState.lobbyName,
        sessionCode: gameState.sessionCode
      });
      socket.emit('announcementList', { announcements });
      socket.emit('gameState', getGameStateForPlayer(socket.id));
      broadcastToAll('playersUpdated', { players: getPublicPlayers() });
      emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
    } else {
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
      socket.emit('rejoined', {
        player: result.player,
        lobbyName: gameState.lobbyName,
        sessionCode: gameState.sessionCode
      });
      socket.emit('announcementList', { announcements });
      socket.emit('gameState', getGameStateForPlayer(socket.id));
      broadcastToAll('playersUpdated', { players: getPublicPlayers() });
      emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
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
      socket.emit('hostReconnected', {
        lobbyName: gameState.lobbyName,
        sessionCode: gameState.sessionCode
      });
      socket.emit('announcementList', { announcements });
      socket.emit('hostState', getGameStateForHost(socket.id));
      broadcastToAll('playersUpdated', { players: getPublicPlayers() });
    } else {
      socket.emit('hostReconnectFailed', { message: result.message });
    }
  });

  socket.on('updateSettings', (data) => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can update settings'); return; }
    updateSettings(data);
    broadcastToAll('settingsUpdated', gameState.settings);
    broadcastToAll('playersUpdated', { players: getPublicPlayers() });
    emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
  });

  socket.on('createTask', (data) => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can create tasks'); return; }
    const { title, instructions, completionCode } = data;
    const result = createTask(title, instructions, completionCode);
    if (!result.success) { socket.emit('error', result.message); return; }
    emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
  });

  socket.on('editTask', (data) => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can edit tasks'); return; }
    const { taskId, title, instructions, completionCode, active } = data;
    const result = editTask(taskId, { title, instructions, completionCode, active });
    if (!result.success) { socket.emit('error', result.message); return; }
    emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
  });

  socket.on('deleteTask', (data) => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can delete tasks'); return; }
    const { taskId } = data;
    const result = deleteTask(taskId);
    if (!result.success) { socket.emit('error', result.message); return; }
    emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
  });

  socket.on('getTaskBank', () => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can request the task bank'); return; }
    socket.emit('taskBank', { taskBank: getTaskBank() });
  });

  socket.on('sendAnnouncement', (data) => {
    const { text } = data || {};
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can send announcements'); return; }
    if (!text || !text.trim()) { socket.emit('error', 'Announcement text is required'); return; }
    const announcement = { text: text.trim(), timestamp: Date.now(), senderLabel: 'HOST' };
    announcements.push(announcement);
    broadcastToAll('announcementPosted', announcement);
  });

  socket.on('submitTaskCode', (data) => {
    const { taskId, completionCode } = data;
    const player = getPlayerBySocket(socket.id);
    if (!player) { socket.emit('error', 'Player not found'); return; }

    const result = submitTaskCode(player.playerId, taskId, completionCode);
    if (!result.success) { socket.emit('error', result.message); return; }

    socket.emit('taskUpdated', { myTasks: result.myTasks, taskProgress: result.taskProgress });
    broadcastToAll('updateGlobalTaskProgress', result.taskProgress);
    emitToHost('updateHostTaskOverview', getGameStateForHost(gameState.host.socketId));

    // Check if crewmates win by task completion
    checkAndHandleWin();
  });

  // --- MEETING / VOTING ---

  socket.on('callMeeting', () => {
    const player = getPlayerBySocket(socket.id);
    if (!player) { socket.emit('error', 'Player not found'); return; }

    const result = callMeeting(player.playerId);
    if (!result.success) { socket.emit('error', result.message); return; }

    const callerName = player.name;
    // Send each player their personalized game state (includes meeting info)
    gameState.players.forEach(p => {
      if (p.connected) {
        io.to(p.socketId).emit('meetingCalled', {
          calledByName: callerName,
          players: getPublicPlayers(),
          myVote: null,
          voteStatus: getVoteStatus()
        });
      }
    });
    emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
  });

  socket.on('castVote', (data) => {
    const { targetId } = data;
    const player = getPlayerBySocket(socket.id);
    if (!player) { socket.emit('error', 'Player not found'); return; }

    const result = castVote(player.playerId, targetId);
    if (!result.success) { socket.emit('error', result.message); return; }

    // Acknowledge to voter
    socket.emit('voteCast', { targetId });

    // Update everyone's vote status (not who voted for whom, just counts)
    const voteStatus = getVoteStatus();
    broadcastToAll('voteStatusUpdated', voteStatus);
    emitToHost('hostState', getGameStateForHost(gameState.host.socketId));

    // Auto-resolve when everyone has voted
    const { allVoted } = tallyVotes();
    if (allVoted) {
      resolveVoting();
    }
  });

  socket.on('forceResolveVoting', () => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can force resolve voting'); return; }
    if (gameState.phase !== 'meeting') { socket.emit('error', 'No active meeting'); return; }
    resolveVoting();
  });

  function resolveVoting() {
    const resolution = resolveMeeting();

    broadcastToAll('meetingResolved', {
      ejectedPlayer: resolution.ejectedPlayer,
      voteCounts: resolution.voteCounts,
      skipVotes: resolution.skipVotes,
      players: getPublicPlayers()
    });

    emitToHost('hostState', getGameStateForHost(gameState.host.socketId));

    // Check win condition after ejection
    checkAndHandleWin();
  }

  // --- GAME LIFECYCLE ---

  socket.on('startGame', () => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can start the game'); return; }
    if (startGame()) {
      const progress = getGlobalTaskProgress();
      gameState.players.forEach(p => {
        if (p.connected) {
          io.to(p.socketId).emit('gameStarted', getGameStateForPlayer(p.socketId));
        }
      });
      broadcastToAll('updateGlobalTaskProgress', progress);
      emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
    } else {
      socket.emit('error', 'Cannot start game (need at least 2 players)');
    }
  });

  socket.on('endGame', () => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can end the game'); return; }
    if (endGame()) {
      broadcastToAll('gameEnded', {
        lobbyName: gameState.lobbyName,
        settings: gameState.settings,
        players: getPublicPlayers(),
        taskProgress: getGlobalTaskProgress()
      });
      emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
    } else {
      socket.emit('error', 'Cannot end game');
    }
  });

  socket.on('endSession', () => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can end the session'); return; }
    const lobbyName = gameState.lobbyName;
    // Capture host socket before clearing state
    const hostSocketId = gameState.host.socketId;
    const prevLobbyName = endSession();
    if (!prevLobbyName) {
      socket.emit('error', 'Cannot end session');
      return;
    }
    announcements = [];
    if (lobbyName) {
      io.to(lobbyName).emit('sessionEnded');
      // Disconnect all non-host sockets in the room
      const room = io.sockets.adapter.rooms.get(lobbyName);
      if (room) {
        [...room].forEach(socketId => {
          if (socketId === hostSocketId) return;
          const clientSocket = io.sockets.sockets.get(socketId);
          if (clientSocket) clientSocket.disconnect(true);
        });
      }
    }
  });

  socket.on('kickPlayer', (data) => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can kick players'); return; }
    const { playerId } = data;
    if (!playerId) { socket.emit('error', 'Player ID is required'); return; }

    const player = gameState.players.find(p => p.playerId === playerId);
    if (!player) { socket.emit('error', 'Player not found'); return; }

    const kickedSocketId = player.socketId;
    const result = kickPlayer(playerId);
    if (result.success) {
      if (kickedSocketId) {
        const kickedSocket = io.sockets.sockets.get(kickedSocketId);
        if (kickedSocket) {
          kickedSocket.emit('kickedSelf', { message: 'You were removed from the lobby by the host' });
          kickedSocket.leave(gameState.lobbyName);
          kickedSocket.disconnect(true); // FIX: actually disconnect them
        }
      }
      broadcastToAll('playersUpdated', { players: getPublicPlayers() });
      broadcastToAll('updateGlobalTaskProgress', getGlobalTaskProgress());
      emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
    } else {
      socket.emit('error', result.message);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    const host = getHostBySocket(socket.id);
    if (host) {
      gameState.host.connected = false;
      if (gameState.lobbyName) {
        broadcastToAll('hostStatus', { connected: false });
      }
      return;
    }
    const player = getPlayerBySocket(socket.id);
    if (player) {
      player.connected = false;
      if (gameState.lobbyName) {
        broadcastToAll('playersUpdated', { players: getPublicPlayers() });
        emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
      }
    }
  });
});
