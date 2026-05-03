// server.js - Express server with Socket.IO for Among Us IRL

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const {
  gameState,
  createSession,
  projectorJoin,
  projectorReconnect,
  joinLobby,
  rejoinSession,
  hostReconnect,
  kickPlayer,
  updateSettings,
  createTask, editTask, deleteTask, getTaskBank,
  startGame, endGame, endSession,
  submitTaskCode,
  callMeeting, confirmArrival, startVoting, castVote, tallyVotes, resolveMeeting,
  checkWinCondition,
  getPlayerBySocket, getHostBySocket, getProjectorBySocket,
  getGameStateForPlayer, getGameStateForHost, getGameStateForProjector,
  getPublicPlayers, getGlobalTaskProgress, getVoteStatus, getMeetingInfo
} = require('./gameState');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

let announcements = [];
let votingTimer = null; // server-side timeout for auto-resolve when timer expires

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// ── Helpers ───────────────────────────────────────────────────────────────────

function isAuthorizedHost(socket) {
  return socket.isHost === true || socket.id === gameState.host.socketId;
}
function isAuthorizedProjector(socket) {
  return socket.isProjector === true || socket.id === gameState.projector.socketId;
}

function emitToHost(event, data) {
  if (gameState.host.connected && gameState.host.socketId) {
    io.to(gameState.host.socketId).emit(event, data);
  }
}
function emitToProjector(event, data) {
  if (gameState.projector.connected && gameState.projector.socketId) {
    io.to(gameState.projector.socketId).emit(event, data);
  }
}
function broadcastToRoom(event, data) {
  if (gameState.lobbyName) io.to(gameState.lobbyName).emit(event, data);
}

function clearVotingTimer() {
  if (votingTimer) { clearTimeout(votingTimer); votingTimer = null; }
}

function checkAndHandleWin() {
  const win = checkWinCondition();
  if (!win) return false;
  broadcastToRoom('gameOver', {
    winner: win.winner,
    reason: win.reason,
    players: gameState.players.map(p => ({ name: p.name, role: p.role, alive: p.alive }))
  });
  emitToProjector('gameOver', {
    winner: win.winner,
    reason: win.reason,
    players: gameState.players.map(p => ({ name: p.name, role: p.role, alive: p.alive }))
  });
  return true;
}

// Called when voting timer expires or host forces resolve
function resolveVoting() {
  clearVotingTimer();
  if (gameState.phase !== 'meeting' || gameState.meeting.subPhase !== 'voting') return;

  const resolution = resolveMeeting();
  const players = getPublicPlayers();

  // Broadcast full vote reveal to everyone
  broadcastToRoom('meetingResolved', { ...resolution, players });
  emitToProjector('meetingResolved', { ...resolution, players });
  emitToHost('hostState', getGameStateForHost(gameState.host.socketId));

  checkAndHandleWin();
}

// ── Connection ────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  socket.isHost = false;
  socket.isProjector = false;

  // ── Session creation ──────────────────────────────────────────────────────

  socket.on('createSession', (data) => {
    const { name } = data;
    if (!name || !name.trim()) { socket.emit('error', 'Name is required'); return; }
    const session = createSession(name.trim(), socket.id);
    announcements = [];
    clearVotingTimer();
    socket.isHost = true;
    socket.join(gameState.lobbyName);
    socket.emit('sessionCreated', {
      lobbyName: session.lobbyName,
      hostToken: session.hostToken,
      projectorToken: session.projectorToken,
      sessionCode: gameState.sessionCode
    });
    socket.emit('announcementList', { announcements });
    socket.emit('hostState', getGameStateForHost(socket.id));
  });

  // ── Projector join ────────────────────────────────────────────────────────

  socket.on('projectorJoin', (data) => {
    const { projectorToken } = data;
    if (!projectorToken) { socket.emit('projectorJoinFailed', { message: 'Projector token required' }); return; }
    const result = projectorJoin(projectorToken, socket.id);
    if (result.success) {
      socket.isProjector = true;
      socket.join(gameState.lobbyName);
      socket.emit('projectorJoined', { lobbyName: gameState.lobbyName, sessionCode: gameState.sessionCode });
      socket.emit('projectorState', getGameStateForProjector());
      socket.emit('announcementList', { announcements });
      emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
    } else {
      socket.emit('projectorJoinFailed', { message: result.message });
    }
  });

  socket.on('projectorReconnect', (data) => {
    const { projectorToken, sessionCode } = data;
    if (!projectorToken || !sessionCode) { socket.emit('projectorJoinFailed', { message: 'Token and session code required' }); return; }
    const result = projectorReconnect(projectorToken, sessionCode, socket.id);
    if (result.success) {
      socket.isProjector = true;
      socket.join(gameState.lobbyName);
      socket.emit('projectorJoined', { lobbyName: gameState.lobbyName, sessionCode: gameState.sessionCode });
      socket.emit('projectorState', getGameStateForProjector());
      socket.emit('announcementList', { announcements });
    } else {
      socket.emit('projectorJoinFailed', { message: result.message });
    }
  });

  // ── Player join / rejoin ──────────────────────────────────────────────────

  socket.on('joinLobby', (data) => {
    const { name, code } = data;
    if (!name || !code) { socket.emit('error', 'Name and lobby name are required'); return; }
    const result = joinLobby(code, name.trim(), socket.id);
    if (result.success) {
      socket.join(gameState.lobbyName);
      socket.emit('joined', { player: result.player, lobbyName: gameState.lobbyName, sessionCode: gameState.sessionCode });
      socket.emit('announcementList', { announcements });
      socket.emit('gameState', getGameStateForPlayer(socket.id));
      broadcastToRoom('playersUpdated', { players: getPublicPlayers() });
      emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
      emitToProjector('projectorState', getGameStateForProjector());
    } else {
      socket.emit('error', result.message);
    }
  });

  socket.on('rejoinSession', (data) => {
    const { playerId, code } = data;
    if (!playerId || !code) { socket.emit('rejoinFailed', { message: 'Player ID and session code are required' }); return; }
    const result = rejoinSession(code, playerId, socket.id);
    if (result.success) {
      socket.join(gameState.lobbyName);
      socket.emit('rejoined', { player: result.player, lobbyName: gameState.lobbyName, sessionCode: gameState.sessionCode });
      socket.emit('announcementList', { announcements });
      socket.emit('gameState', getGameStateForPlayer(socket.id));
      broadcastToRoom('playersUpdated', { players: getPublicPlayers() });
      emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
      emitToProjector('projectorState', getGameStateForProjector());
    } else {
      socket.emit('rejoinFailed', { message: result.message });
    }
  });

  socket.on('hostReconnect', (data) => {
    const { hostToken, code } = data;
    if (!hostToken || !code) { socket.emit('hostReconnectFailed', { message: 'Host token and session code required' }); return; }
    if (code !== gameState.sessionCode) { socket.emit('hostReconnectFailed', { message: 'Invalid session code' }); return; }
    const result = hostReconnect(hostToken, socket.id);
    if (result.success) {
      socket.isHost = true;
      socket.join(gameState.lobbyName);
      socket.emit('hostReconnected', { lobbyName: gameState.lobbyName, sessionCode: gameState.sessionCode });
      socket.emit('announcementList', { announcements });
      socket.emit('hostState', getGameStateForHost(socket.id));
      broadcastToRoom('playersUpdated', { players: getPublicPlayers() });
    } else {
      socket.emit('hostReconnectFailed', { message: result.message });
    }
  });

  // ── Settings / tasks / announcements ─────────────────────────────────────

  socket.on('updateSettings', (data) => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can update settings'); return; }
    updateSettings(data);
    broadcastToRoom('settingsUpdated', gameState.settings);
    emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
    emitToProjector('projectorState', getGameStateForProjector());
  });

  socket.on('createTask', (data) => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can create tasks'); return; }
    const result = createTask(data.title, data.instructions, data.completionCode);
    if (!result.success) { socket.emit('error', result.message); return; }
    emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
  });

  socket.on('editTask', (data) => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can edit tasks'); return; }
    const result = editTask(data.taskId, { title: data.title, instructions: data.instructions, completionCode: data.completionCode, active: data.active });
    if (!result.success) { socket.emit('error', result.message); return; }
    emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
  });

  socket.on('deleteTask', (data) => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can delete tasks'); return; }
    const result = deleteTask(data.taskId);
    if (!result.success) { socket.emit('error', result.message); return; }
    emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
  });

  socket.on('getTaskBank', () => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can request the task bank'); return; }
    socket.emit('taskBank', { taskBank: getTaskBank() });
  });

  socket.on('sendAnnouncement', (data) => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can send announcements'); return; }
    const text = (data && data.text || '').trim();
    if (!text) { socket.emit('error', 'Announcement text is required'); return; }
    const announcement = { text, timestamp: Date.now(), senderLabel: 'HOST' };
    announcements.push(announcement);
    broadcastToRoom('announcementPosted', announcement);
    emitToProjector('announcementPosted', announcement);
  });

  // ── Task submission ───────────────────────────────────────────────────────

  socket.on('submitTaskCode', (data) => {
    const player = getPlayerBySocket(socket.id);
    if (!player) { socket.emit('error', 'Player not found'); return; }
    const result = submitTaskCode(player.playerId, data.taskId, data.completionCode);
    if (!result.success) { socket.emit('error', result.message); return; }
    socket.emit('taskUpdated', { myTasks: result.myTasks, taskProgress: result.taskProgress });
    broadcastToRoom('updateGlobalTaskProgress', result.taskProgress);
    emitToProjector('projectorState', getGameStateForProjector());
    emitToHost('updateHostTaskOverview', getGameStateForHost(gameState.host.socketId));
    checkAndHandleWin();
  });

  // ── Meeting flow ──────────────────────────────────────────────────────────

  // Player reports a dead body → triggers gathering phase
  socket.on('reportBody', (data) => {
    const player = getPlayerBySocket(socket.id);
    if (!player) { socket.emit('error', 'Player not found'); return; }
    const { reportedPlayerId } = data;
    const result = callMeeting(player.playerId, 'player', reportedPlayerId);
    if (!result.success) { socket.emit('error', result.message); return; }

    const reportedDead = gameState.players.find(p => p.playerId === reportedPlayerId);
    const meetingPayload = {
      calledByName: player.name,
      callerType: 'player',
      reportedDeadName: reportedDead ? reportedDead.name : null,
      arrivedPlayerIds: [],
      players: getPublicPlayers()
    };
    broadcastToRoom('meetingCalled', meetingPayload);
    emitToProjector('meetingCalled', meetingPayload);
    emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
  });

  // Projector calls emergency meeting (no body)
  socket.on('projectorCallMeeting', () => {
    if (!isAuthorizedProjector(socket)) { socket.emit('error', 'Only projector can call emergency meeting'); return; }
    const result = callMeeting('projector', 'projector', null);
    if (!result.success) { socket.emit('error', result.message); return; }

    const meetingPayload = {
      calledByName: 'Projector (Emergency)',
      callerType: 'projector',
      reportedDeadName: null,
      arrivedPlayerIds: [],
      players: getPublicPlayers()
    };
    broadcastToRoom('meetingCalled', meetingPayload);
    emitToProjector('meetingCalled', meetingPayload);
    emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
  });

  // Player confirms arrival at meeting table
  socket.on('confirmArrival', () => {
    const player = getPlayerBySocket(socket.id);
    if (!player) { socket.emit('error', 'Player not found'); return; }
    const result = confirmArrival(player.playerId);
    if (!result.success) { socket.emit('error', result.message); return; }

    broadcastToRoom('arrivalUpdated', { arrivedPlayerIds: result.arrivedPlayerIds, players: getPublicPlayers() });
    emitToProjector('arrivalUpdated', { arrivedPlayerIds: result.arrivedPlayerIds, players: getPublicPlayers() });
    emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
  });

  // Host starts voting (opens timer)
  socket.on('startVoting', () => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can start voting'); return; }
    const result = startVoting();
    if (!result.success) { socket.emit('error', result.message); return; }

    broadcastToRoom('votingStarted', { votingEndsAt: result.votingEndsAt, duration: result.duration });
    emitToProjector('votingStarted', { votingEndsAt: result.votingEndsAt, duration: result.duration });
    emitToHost('hostState', getGameStateForHost(gameState.host.socketId));

    // Auto-resolve when timer expires
    clearVotingTimer();
    votingTimer = setTimeout(() => resolveVoting(), result.duration * 1000);
  });

  // Player casts vote
  socket.on('castVote', (data) => {
    const player = getPlayerBySocket(socket.id);
    if (!player) { socket.emit('error', 'Player not found'); return; }
    const result = castVote(player.playerId, data.targetId);
    if (!result.success) { socket.emit('error', result.message); return; }

    socket.emit('voteCast', { targetId: data.targetId });

    // Broadcast who has/hasn't voted (not who for whom)
    const voteStatus = getVoteStatus();
    broadcastToRoom('voteStatusUpdated', voteStatus);
    emitToProjector('voteStatusUpdated', voteStatus);
    emitToHost('hostState', getGameStateForHost(gameState.host.socketId));

    // Auto-resolve if everyone has voted
    const { allVoted } = tallyVotes();
    if (allVoted) resolveVoting();
  });

  // Host can force-resolve early
  socket.on('forceResolveVoting', () => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can force resolve'); return; }
    if (gameState.phase !== 'meeting' || gameState.meeting.subPhase !== 'voting') {
      socket.emit('error', 'No active voting session'); return;
    }
    resolveVoting();
  });

  // ── Game lifecycle ────────────────────────────────────────────────────────

  socket.on('startGame', () => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can start the game'); return; }
    if (!startGame()) { socket.emit('error', 'Cannot start game (need at least 2 players)'); return; }
    const progress = getGlobalTaskProgress();
    gameState.players.forEach(p => {
      if (p.connected) io.to(p.socketId).emit('gameStarted', getGameStateForPlayer(p.socketId));
    });
    broadcastToRoom('updateGlobalTaskProgress', progress);
    emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
    emitToProjector('projectorState', getGameStateForProjector());
  });

  socket.on('endGame', () => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can end the game'); return; }
    clearVotingTimer();
    if (!endGame()) { socket.emit('error', 'Cannot end game'); return; }
    broadcastToRoom('gameEnded', { players: getPublicPlayers(), taskProgress: getGlobalTaskProgress() });
    emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
    emitToProjector('projectorState', getGameStateForProjector());
  });

  socket.on('endSession', () => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can end the session'); return; }
    const lobbyName = gameState.lobbyName;
    const hostSocketId = gameState.host.socketId;
    clearVotingTimer();
    const prev = endSession();
    if (!prev) { socket.emit('error', 'Cannot end session'); return; }
    announcements = [];
    if (lobbyName) {
      io.to(lobbyName).emit('sessionEnded');
      const room = io.sockets.adapter.rooms.get(lobbyName);
      if (room) {
        [...room].forEach(sid => {
          if (sid === hostSocketId) return;
          const s = io.sockets.sockets.get(sid);
          if (s) s.disconnect(true);
        });
      }
    }
  });

  socket.on('kickPlayer', (data) => {
    if (!isAuthorizedHost(socket)) { socket.emit('error', 'Only host can kick players'); return; }
    const { playerId } = data;
    const player = gameState.players.find(p => p.playerId === playerId);
    if (!player) { socket.emit('error', 'Player not found'); return; }
    const kickedSocketId = player.socketId;
    const result = kickPlayer(playerId);
    if (!result.success) { socket.emit('error', result.message); return; }
    if (kickedSocketId) {
      const ks = io.sockets.sockets.get(kickedSocketId);
      if (ks) { ks.emit('kickedSelf', { message: 'You were removed from the lobby by the host' }); ks.leave(gameState.lobbyName); ks.disconnect(true); }
    }
    broadcastToRoom('playersUpdated', { players: getPublicPlayers() });
    emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
    emitToProjector('projectorState', getGameStateForProjector());
  });

  // ── Disconnect ────────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    if (getHostBySocket(socket.id)) {
      gameState.host.connected = false;
      broadcastToRoom('hostStatus', { connected: false });
      return;
    }
    if (getProjectorBySocket(socket.id)) {
      gameState.projector.connected = false;
      emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
      return;
    }
    const player = getPlayerBySocket(socket.id);
    if (player) {
      player.connected = false;
      broadcastToRoom('playersUpdated', { players: getPublicPlayers() });
      emitToProjector('projectorState', getGameStateForProjector());
      emitToHost('hostState', getGameStateForHost(gameState.host.socketId));
    }
  });
});
