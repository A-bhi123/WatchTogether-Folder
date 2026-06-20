const Room = require('../models/Room');
const { authenticateSocket } = require('../middleware/auth');

// In-memory: roomCode -> Map(socketId -> participantInfo)
const roomSockets = new Map();

const participantUserId = (p) => {
  const u = p.user;
  if (u == null) return '';
  return typeof u === 'object' && u._id != null ? u._id.toString() : u.toString();
};

const isRoomParticipant = (room, userId) => {
  const uid = userId.toString();
  if (room.host.toString() === uid) return true;
  return room.participants.some((p) => participantUserId(p) === uid);
};

const normalizeRoomCode = (roomCode) => {
  if (!roomCode) return '';
  return String(roomCode).trim().toUpperCase();
};

const findActiveRoom = (roomCode) =>
  Room.findOne({ code: normalizeRoomCode(roomCode), isActive: true });

const setupSocketHandlers = (io) => {
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`🔌 Connected: ${user.name} (${socket.id})`);

    // ─── JOIN ROOM ───────────────────────────────────────────────
    socket.on('room:join', async ({ roomCode }) => {
      try {
        const code = normalizeRoomCode(roomCode);
        if (!code) return;

        // Always leave previous socket room before re-joining (fixes leave + rejoin)
        if (socket.roomCode) {
          await handleLeave(socket, io, user);
        }

        const room = await findActiveRoom(code)
          .populate('host', 'name avatar avatarColor')
          .populate('participants.user', 'name avatar avatarColor');

        if (!room) { socket.emit('error', { message: 'Room not found' }); return; }

        socket.join(code);
        socket.roomCode = code;
        socket.userId = user._id.toString();

        if (!roomSockets.has(code)) roomSockets.set(code, new Map());
        roomSockets.get(code).set(socket.id, {
          userId: user._id.toString(),
          name: user.name,
          avatar: user.avatar,
          avatarColor: user.avatarColor,
          socketId: socket.id,
          isMuted: false,
          isCameraOff: false,
          isHost: room.host._id.toString() === user._id.toString(),
        });

        // Upsert participant in DB
        const existing = room.participants.find(
          (p) => participantUserId(p) === user._id.toString()
        );
        if (!existing) {
          room.participants.push({ user: user._id, socketId: socket.id, isHost: room.host._id.toString() === user._id.toString() });
        } else {
          existing.socketId = socket.id;
        }
        await room.save();

        const currentParticipants = Array.from(roomSockets.get(code)?.values() || []);

        socket.emit('room:joined', {
          room: room.toObject(),
          participants: currentParticipants,
          videoState: room.videoState,
          isChatEnabled: room.isChatEnabled,
        });

        socket.to(code).emit('participant:joined', {
          userId: user._id.toString(),
          name: user.name,
          avatar: user.avatar,
          avatarColor: user.avatarColor,
          socketId: socket.id,
          isMuted: false,
          isCameraOff: false,
          isHost: room.host._id.toString() === user._id.toString(),
        });

        console.log(`👤 ${user.name} joined ${code}`);
      } catch (err) {
        console.error('room:join error', err);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    socket.on('room:leave', async () => {
      await handleLeave(socket, io, user);
    });

    // ─── VIDEO SYNC (WebRTC stream-based — no file upload) ───────
    // Host selects movie locally → streams via WebRTC
    // These events sync playback state only

    socket.on('video:play', async ({ roomCode, currentTime }) => {
      try {
        const code = normalizeRoomCode(roomCode);
        const room = await Room.findOne({ code });
        if (!room || !isRoomParticipant(room, user._id)) return;
        room.videoState.isPlaying = true;
        room.videoState.currentTime = currentTime;
        room.videoState.lastUpdated = new Date();
        await room.save();
        io.to(code).emit('video:play', { currentTime });
      } catch (err) { console.error(err); }
    });

    socket.on('video:pause', async ({ roomCode, currentTime }) => {
      try {
        const code = normalizeRoomCode(roomCode);
        const room = await Room.findOne({ code });
        if (!room || !isRoomParticipant(room, user._id)) return;
        room.videoState.isPlaying = false;
        room.videoState.currentTime = currentTime;
        room.videoState.lastUpdated = new Date();
        await room.save();
        io.to(code).emit('video:pause', { currentTime });
      } catch (err) { console.error(err); }
    });

    socket.on('video:seek', async ({ roomCode, currentTime }) => {
      try {
        const code = normalizeRoomCode(roomCode);
        const room = await Room.findOne({ code });
        if (!room || !isRoomParticipant(room, user._id)) return;
        room.videoState.currentTime = currentTime;
        room.videoState.lastUpdated = new Date();
        await room.save();
        io.to(code).emit('video:seek', { currentTime });
      } catch (err) { console.error(err); }
    });

    socket.on('video:rate', async ({ roomCode, playbackRate }) => {
      try {
        const code = normalizeRoomCode(roomCode);
        const room = await Room.findOne({ code });
        if (!room || !isRoomParticipant(room, user._id)) return;
        const rate = Math.min(2, Math.max(0.5, Number(playbackRate) || 1));
        room.videoState.playbackRate = rate;
        room.videoState.lastUpdated = new Date();
        await room.save();
        io.to(code).emit('video:rate', { playbackRate: rate });
      } catch (err) { console.error(err); }
    });

    socket.on('video:time-update', async ({ roomCode, currentTime }) => {
      try {
        const code = normalizeRoomCode(roomCode);
        const room = await Room.findOne({ code });
        if (!room || room.host.toString() !== user._id.toString()) return;
        if (!room.videoState.isPlaying) return;
        room.videoState.currentTime = currentTime;
        room.videoState.lastUpdated = new Date();
        await room.save();
        socket.to(code).emit('video:time-update', { currentTime });
      } catch (err) { console.error(err); }
    });

    socket.on('video:movie-selected', async ({ roomCode, movieName }) => {
      try {
        const code = normalizeRoomCode(roomCode);
        const room = await Room.findOne({ code });
        if (!room || room.host.toString() !== user._id.toString()) return;
        room.videoState.hasMovie = true;
        room.videoState.movieName = movieName;
        room.videoState.isPlaying = false;
        room.videoState.currentTime = 0;
        await room.save();
        // Notify all participants that host has a movie ready
        io.to(code).emit('video:movie-ready', { movieName });
      } catch (err) { console.error(err); }
    });

    // Host's video file failed to decode (e.g. unsupported HEVC/H.265 codec)
    // — relay to guests so they don't sit on "connecting stream..." forever.
    socket.on('video:movie-error', ({ roomCode, message }) => {
      const code = normalizeRoomCode(roomCode);
      socket.to(code).emit('video:movie-error', { message });
    });

    socket.on('video:sync-request', async ({ roomCode }) => {
      try {
        const code = normalizeRoomCode(roomCode);
        const room = await Room.findOne({ code });
        if (!room) return;
        let adjustedTime = room.videoState.currentTime;
        if (room.videoState.isPlaying) {
          const elapsed = (Date.now() - new Date(room.videoState.lastUpdated).getTime()) / 1000;
          adjustedTime += elapsed;
        }
        socket.emit('video:sync', {
          isPlaying: room.videoState.isPlaying,
          currentTime: adjustedTime,
          playbackRate: room.videoState.playbackRate ?? 1,
          hasMovie: room.videoState.hasMovie,
          movieName: room.videoState.movieName,
        });
      } catch (err) { console.error(err); }
    });

    // ─── CHAT ─────────────────────────────────────────────────────
    socket.on('chat:message', async ({ roomCode, text }) => {
      try {
        if (!text || !text.trim() || text.length > 500) return;
        const code = normalizeRoomCode(roomCode);
        const room = await Room.findOne({ code });
        if (!room || !room.isChatEnabled) {
          socket.emit('chat:disabled');
          return;
        }
        const message = {
          user: user._id,
          userName: user.name,
          userAvatar: user.avatar,
          userAvatarColor: user.avatarColor,
          text: text.trim(),
          timestamp: new Date(),
        };
        await Room.findOneAndUpdate(
          { code },
          { $push: { messages: { $each: [message], $slice: -200 } } }
        );
        io.to(code).emit('chat:message', { ...message, userId: user._id.toString() });
      } catch (err) { console.error(err); }
    });

    // Host toggles chat
    socket.on('chat:toggle', async ({ roomCode, enabled }) => {
      try {
        const code = normalizeRoomCode(roomCode);
        const room = await Room.findOne({ code });
        if (!room || room.host.toString() !== user._id.toString()) return;
        room.isChatEnabled = enabled;
        await room.save();
        io.to(code).emit('chat:toggled', { enabled, byName: user.name });
      } catch (err) { console.error(err); }
    });

    // ─── WEBRTC SIGNALING ─────────────────────────────────────────
    socket.on('webrtc:offer', ({ targetSocketId, offer }) => {
      io.to(targetSocketId).emit('webrtc:offer', {
        offer,
        fromSocketId: socket.id,
        fromUserId: user._id.toString(),
        fromUserName: user.name,
      });
    });

    socket.on('webrtc:answer', ({ targetSocketId, answer }) => {
      io.to(targetSocketId).emit('webrtc:answer', { answer, fromSocketId: socket.id });
    });

    socket.on('webrtc:ice', ({ targetSocketId, candidate }) => {
      io.to(targetSocketId).emit('webrtc:ice', { candidate, fromSocketId: socket.id });
    });

    // Host announces movie stream ID so guests can identify it in ontrack
    socket.on('webrtc:movie-stream-id', ({ roomCode, streamId }) => {
      const code = normalizeRoomCode(roomCode);
      // Relay to all OTHER participants (guests only)
      socket.to(code).emit('webrtc:movie-stream-id', { streamId });
    });

    // Guest rejoined — ask host to resend movie stream
    socket.on('webrtc:request-movie', ({ roomCode }) => {
      const code = normalizeRoomCode(roomCode);
      const participants = roomSockets.get(code);
      if (!participants) return;
      const hostEntry = Array.from(participants.values()).find((p) => p.isHost);
      if (!hostEntry || hostEntry.socketId === socket.id) return;
      io.to(hostEntry.socketId).emit('webrtc:request-movie', {
        fromSocketId: socket.id,
      });
    });

    // ─── MEDIA STATE ──────────────────────────────────────────────
    socket.on('media:toggle-audio', ({ roomCode, isMuted }) => {
      const code = normalizeRoomCode(roomCode);
      const p = roomSockets.get(code)?.get(socket.id);
      if (p) p.isMuted = isMuted;
      socket.to(code).emit('participant:audio-toggled', {
        socketId: socket.id, userId: user._id.toString(), isMuted,
      });
    });

    socket.on('media:toggle-video', ({ roomCode, isCameraOff }) => {
      const code = normalizeRoomCode(roomCode);
      const p = roomSockets.get(code)?.get(socket.id);
      if (p) p.isCameraOff = isCameraOff;
      socket.to(code).emit('participant:video-toggled', {
        socketId: socket.id, userId: user._id.toString(), isCameraOff,
      });
    });

    // ─── SCREEN SHARE ─────────────────────────────────────────────
    socket.on('screen:share-start', ({ roomCode }) => {
      const code = normalizeRoomCode(roomCode);
      socket.to(code).emit('screen:share-started', {
        socketId: socket.id, userId: user._id.toString(), userName: user.name,
      });
    });

    socket.on('screen:share-stop', ({ roomCode }) => {
      const code = normalizeRoomCode(roomCode);
      socket.to(code).emit('screen:share-stopped', {
        socketId: socket.id, userId: user._id.toString(),
      });
    });

    // ─── DISCONNECT ───────────────────────────────────────────────
    socket.on('disconnect', async () => {
      await handleLeave(socket, io, user);
    });
  });
};

const handleLeave = async (socket, io, user) => {
  try {
    const roomCode = socket.roomCode;
    if (!roomCode) return;

    const code = normalizeRoomCode(roomCode);
    const participants = roomSockets.get(code);
    if (participants) {
      participants.delete(socket.id);
      if (participants.size === 0) roomSockets.delete(code);
    }

    await Room.updateOne({ code }, { $pull: { participants: { user: user._id } } });

    socket.to(code).emit('participant:left', {
      socketId: socket.id,
      userId: user._id.toString(),
      name: user.name,
    });

    socket.leave(code);
    socket.roomCode = null;
    console.log(`👋 ${user.name} left ${code}`);
  } catch (err) {
    console.error('handleLeave error', err);
  }
};

module.exports = { setupSocketHandlers };
