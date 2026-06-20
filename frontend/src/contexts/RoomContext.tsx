import React, {
  createContext, useContext, useState, useEffect, useLayoutEffect,
  useRef, ReactNode, useCallback,
} from 'react';
import { useAuth } from './AuthContext';
import { getSocket } from '../services/socket';
import { Room, Participant, ChatMessage, VideoState } from '../types';
import toast from 'react-hot-toast';
import { isSameId } from '../utils/ids';
import { normalizeRoomCode } from '../utils/roomCode';
import { saveHostMovie, getHostMovie, clearHostMovie } from '../utils/hostMovieCache';

interface RoomContextType {
  room: Room | null;
  participants: Participant[];
  messages: ChatMessage[];
  videoState: VideoState;
  isChatEnabled: boolean;
  isHost: boolean;
  localStream: MediaStream | null;
  peerStreams: Map<string, MediaStream>;
  screenStream: MediaStream | null;
  movieStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  localMovieUrl: string | null;
  movieName: string | null;
  hasMovie: boolean;
  movieCodecError: string | null;
  joinRoom: (code: string) => void;
  leaveRoom: () => void;
  sendMessage: (text: string) => void;
  toggleChatEnabled: (enabled: boolean) => void;
  emitPlay: (currentTime: number) => void;
  emitPause: (currentTime: number) => void;
  emitSeek: (currentTime: number) => void;
  emitRate: (playbackRate: number) => void;
  requestSync: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
  selectMovie: (file: File) => void;
  initLocalStream: () => Promise<void>;
}

const RoomContext = createContext<RoomContextType | null>(null);

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

// ── Stream labeling convention ──────────────────────────────────
// We use a custom stream ID prefix to identify movie streams
// Host creates movie stream with id starting with "movie:"
// This way guests can reliably detect which stream is the movie
const MOVIE_STREAM_LABEL = 'movie-stream-watchtogether';

export const RoomProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();

  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [videoState, setVideoState] = useState<VideoState>({
    isPlaying: false, currentTime: 0, playbackRate: 1, hasMovie: false, movieName: null,
  });
  const [isChatEnabled, setIsChatEnabled] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerStreams, setPeerStreams] = useState<Map<string, MediaStream>>(new Map());
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [movieStream, setMovieStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localMovieUrl, setLocalMovieUrl] = useState<string | null>(null);
  const [movieName, setMovieName] = useState<string | null>(null);
  const [hasMovie, setHasMovie] = useState(false);
  const [movieCodecError, setMovieCodecError] = useState<string | null>(null);

  // Refs
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const movieStreamLocalRef = useRef<MediaStream | null>(null);
  const movieBlobUrlRef = useRef<string | null>(null);
  const movieVideoElRef = useRef<HTMLVideoElement | null>(null);
  const roomCodeRef = useRef<string | null>(null);
  const isHostRef = useRef(false);
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);
  // Track which socketIds have already been assigned a movie stream (guest side)
  const movieStreamSourceRef = useRef<string | null>(null);
  // Callback to check pending movie streams when stream ID is announced
  const pendingMovieStreamCheckRef = useRef<(() => void) | null>(null);
  // Known movie WebRTC stream ID announced by host via socket
  const knownMovieStreamIdRef = useRef<string | null>(null);

  const isHost = room ? isSameId(room.host, user?._id) : false;
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  // ── STOP LOCAL CAMERA STREAM ─────────────────────────────────
  const stopLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  // ── STOP PEERS (WebRTC + screen — camera handled separately) ─
  const stopPeers = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;

    peerConnections.current.forEach(pc => pc.close());
    peerConnections.current.clear();
  }, []);

  const stopMovieCapture = useCallback(() => {
    movieStreamLocalRef.current?.getTracks().forEach(t => t.stop());
    movieStreamLocalRef.current = null;

    if (movieVideoElRef.current) {
      movieVideoElRef.current.pause();
      if (movieVideoElRef.current.parentNode) {
        movieVideoElRef.current.parentNode.removeChild(movieVideoElRef.current);
      }
      movieVideoElRef.current.src = '';
      movieVideoElRef.current = null;
    }

    if (movieBlobUrlRef.current) {
      URL.revokeObjectURL(movieBlobUrlRef.current);
      movieBlobUrlRef.current = null;
    }
    clearHostMovie();
  }, []);

  const stopEverything = useCallback(() => {
    stopLocalStream();
    stopPeers();
    stopMovieCapture();
  }, [stopLocalStream, stopPeers, stopMovieCapture]);

  // ── RENEGOTIATE with a specific peer (host calls after adding tracks) ─
  const renegotiateWithPeer = useCallback((socketId: string, retries = 0) => {
    const pc = peerConnections.current.get(socketId);
    if (!pc || pc.signalingState === 'closed') return;

    // If already negotiating, wait and retry
    if (pc.signalingState !== 'stable') {
      if (retries < 5) {
        setTimeout(() => renegotiateWithPeer(socketId, retries + 1), 300);
      }
      return;
    }

    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => {
        const localDesc = pc.localDescription;
        if (localDesc) {
          getSocket().emit('webrtc:offer', { targetSocketId: socketId, offer: localDesc });
        }
      })
      .catch(err => {
        console.error('renegotiate error:', err);
        if (retries < 3) setTimeout(() => renegotiateWithPeer(socketId, retries + 1), 500);
      });
  }, []);

  // ── ADD MOVIE STREAM TO ALL EXISTING PEERS (host only) ────────
  // ── SET HIGH BITRATE on a sender (must be called AFTER negotiation) ──
  const applyHighBitrate = useCallback((pc: RTCPeerConnection) => {
    pc.getSenders().forEach(sender => {
      if (!sender.track) return;
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) return;
      let changed = false;
      if (sender.track.kind === 'video' && (params.encodings[0].maxBitrate ?? 0) < 20_000_000) {
        params.encodings[0].maxBitrate = 20_000_000; // 20 Mbps
        params.encodings[0].maxFramerate = 60;
        changed = true;
      }
      if (sender.track.kind === 'audio' && (params.encodings[0].maxBitrate ?? 0) < 510_000) {
        params.encodings[0].maxBitrate = 510_000; // 510 kbps
        changed = true;
      }
      if (changed) sender.setParameters(params).catch(() => {});
    });
  }, []);

  const addMovieStreamToPeers = useCallback((stream: MediaStream) => {
    // Tell all guests which stream ID is the movie (so they can identify it in ontrack)
    if (roomCodeRef.current) {
      getSocket().emit('webrtc:movie-stream-id', {
        roomCode: roomCodeRef.current,
        streamId: stream.id,
      });
    }

    peerConnections.current.forEach((pc, socketId) => {
      if (pc.signalingState === 'closed') return;

      let tracksAdded = false;
      stream.getTracks().forEach(track => {
        const alreadyAdded = pc.getSenders().find(s => s.track?.id === track.id);
        if (!alreadyAdded) {
          pc.addTrack(track, stream);
          tracksAdded = true;
        }
      });

      if (tracksAdded) {
        renegotiateWithPeer(socketId);
      }
    });
  }, [renegotiateWithPeer, applyHighBitrate]);

  // ── CREATE PEER CONNECTION ────────────────────────────────────
  const createPeerConnection = useCallback((socketId: string): RTCPeerConnection => {
    // Close existing if any
    const existing = peerConnections.current.get(socketId);
    if (existing) {
      existing.close();
      peerConnections.current.delete(socketId);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current.set(socketId, pc);

    // Add webcam/mic tracks
    localStreamRef.current?.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current!);
    });

    // Add movie stream tracks if host already has a movie loaded
    if (isHostRef.current && movieStreamLocalRef.current) {
      const mStream = movieStreamLocalRef.current;
      mStream.getTracks().forEach(track => {
        pc.addTrack(track, mStream);
      });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        getSocket().emit('webrtc:ice', { targetSocketId: socketId, candidate: e.candidate });
      }
    };

    // ── TRACK RECEPTION (guest side) ─────────────────────────
    // Strategy: host sends TWO streams:
    //   stream[0] = webcam  (has audio + video from getUserMedia)
    //   stream[1] = movie   (has audio + video from captureStream)
    //
    // We differentiate by counting streams per peer.
    // The FIRST distinct streamId = webcam, SECOND distinct streamId = movie.
    const receivedStreamIds = new Set<string>();
    const pendingStreams = new Map<string, MediaStream>(); // streamId -> stream (waiting for ID announcement)
    let hasWebcamStream = false;

    // Called when we learn the movie stream ID — check if it already arrived in ontrack
    const checkPendingMovieStream = () => {
      const knownId = knownMovieStreamIdRef.current;
      if (!knownId) return;
      // Check ALL received streams — both pending and already-classified ones
      for (const [streamId, stream] of pendingStreams.entries()) {
        if (streamId === knownId) {
          pendingStreams.delete(streamId);
          console.log('🎬 Movie stream matched from pending:', streamId);
          setMovieStream(stream);
          setHasMovie(true);
          movieStreamSourceRef.current = socketId;
          toast.success('🎬 Movie stream connected!');
          return;
        }
      }
    };
    // Store globally so the socket handler can call it when stream ID arrives
    (pc as any).__checkPendingMovie = checkPendingMovieStream;
    pendingMovieStreamCheckRef.current = checkPendingMovieStream;

    pc.ontrack = (e) => {
      if (!e.streams || e.streams.length === 0) return;
      if (isHostRef.current) return;

      e.streams.forEach(stream => {
        if (receivedStreamIds.has(stream.id)) return;
        receivedStreamIds.add(stream.id);

        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length === 0) return;

        // Primary: host already announced this stream's ID
        if (knownMovieStreamIdRef.current === stream.id) {
          console.log('🎬 Movie stream identified by ID:', stream.id);
          setMovieStream(stream);
          setHasMovie(true);
          movieStreamSourceRef.current = socketId;
          toast.success('🎬 Movie stream connected!');
          return;
        }

        // Store in pending for race condition resolution
        pendingStreams.set(stream.id, stream);

        // First video stream = webcam (peer camera)
        if (!hasWebcamStream) {
          hasWebcamStream = true;
          setPeerStreams(prev => new Map(prev).set(socketId, stream));
          return;
        }

        // Second distinct video stream = almost certainly movie
        console.log('🎬 Movie stream (by order):', stream.id);
        setMovieStream(stream);
        setHasMovie(true);
        movieStreamSourceRef.current = socketId;
        pendingStreams.delete(stream.id);
        toast.success('🎬 Movie stream connected!');
      });
    };

    pc.onconnectionstatechange = () => {
      console.log(`Peer ${socketId} state: ${pc.connectionState}`);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        peerConnections.current.delete(socketId);
        setPeerStreams(prev => { const m = new Map(prev); m.delete(socketId); return m; });
        if (movieStreamSourceRef.current === socketId) {
          setMovieStream(null);
          setHasMovie(false);
          movieStreamSourceRef.current = null;
    knownMovieStreamIdRef.current = null;
        }
      }
    };

    return pc;
  }, []);

  // ── INIT LOCAL STREAM ─────────────────────────────────────────
  const initLocalStream = useCallback(async () => {
    // If we already have a live stream with active tracks, reuse it (avoid double-acquire)
    const existing = localStreamRef.current;
    if (existing && existing.getTracks().some(t => t.readyState === 'live')) {
      setLocalStream(existing);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      setLocalStream(stream);
      localStreamRef.current = stream;
    } catch {
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
        setLocalStream(audioOnly);
        localStreamRef.current = audioOnly;
        toast('Camera unavailable, mic only', { icon: '🎤' });
      } catch {
        const empty = new MediaStream();
        setLocalStream(empty);
        localStreamRef.current = empty;
      }
    }
  }, []);

  // ── SOCKET EVENTS (useLayoutEffect = listeners before RoomPage join) ─
  useLayoutEffect(() => {
    const socket = getSocket();

    socket.on('room:joined', ({ room: r, participants: ps, videoState: vs, isChatEnabled: ce }) => {
      setRoom(r);
      setParticipants(ps);
      setVideoState(vs);
      setIsChatEnabled(ce ?? true);
      if (r.messages) setMessages(r.messages);
      if (vs?.hasMovie) setHasMovie(true);
      if (vs?.movieName) setMovieName(vs.movieName);

      const joinedAsHost = isSameId(r.host, userRef.current?._id);
      isHostRef.current = joinedAsHost;

      // Joiner initiates WebRTC to everyone already in the room
      ps.forEach((p: Participant) => {
        if (p.socketId !== socket.id) {
          const pc = createPeerConnection(p.socketId);
          pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
            .then(offer => {
              pc.setLocalDescription(offer);
              socket.emit('webrtc:offer', { targetSocketId: p.socketId, offer });
            }).catch(console.error);
        }
      });

      // Guest rejoin: ask host to resend movie WebRTC stream (retry if needed)
      if (!joinedAsHost && vs?.hasMovie) {
        const requestMovie = () => {
          if (!movieStreamSourceRef.current && roomCodeRef.current) {
            socket.emit('webrtc:request-movie', { roomCode: roomCodeRef.current });
          }
        };
        setTimeout(requestMovie, 1000);
        setTimeout(requestMovie, 3000);
        setTimeout(requestMovie, 6000);
        setTimeout(requestMovie, 10000);
      }
    });

    socket.on('participant:joined', (p: Participant) => {
      setParticipants(prev => prev.find(x => x.socketId === p.socketId) ? prev : [...prev, p]);
      toast(`${p.name} joined`, { icon: '👋', duration: 2000 });

      // If host has a movie loaded, push it to the new participant after WebRTC stabilizes
      if (isHostRef.current && p.socketId !== socket.id && movieStreamLocalRef.current) {
        const pushMovieToParticipant = (attempt = 1) => {
          const stream = movieStreamLocalRef.current;
          if (!stream) return;
          let pc = peerConnections.current.get(p.socketId);
          if (!pc) pc = createPeerConnection(p.socketId);
          // Only renegotiate if connection is usable
          if (pc.signalingState === 'closed') return;
          let added = false;
          stream.getTracks().forEach(track => {
            const exists = pc!.getSenders().some(s => s.track?.id === track.id);
            if (!exists) { pc!.addTrack(track, stream); added = true; }
          });
          if (added) renegotiateWithPeer(p.socketId);
          // Retry a couple of times to handle race conditions
          if (attempt < 3) setTimeout(() => pushMovieToParticipant(attempt + 1), 1500 * attempt);
        };
        setTimeout(() => pushMovieToParticipant(1), 600);
      }
    });

    socket.on('webrtc:movie-stream-id', ({ streamId }: { streamId: string }) => {
      // Host told us which stream ID is the movie
      knownMovieStreamIdRef.current = streamId;
      // Check if this stream already arrived in ontrack (out-of-order case)
      peerConnections.current.forEach((_, peerSocketId) => {
        // Trigger pending check — each peer connection has its own checkPendingMovieStream closure
        // We handle this via a global event instead
      });
      // Re-check peerStreams: if any received stream matches, promote it to movie
      // We need to broadcast to all peer connections' pending maps — use a global ref instead
      pendingMovieStreamCheckRef.current?.();
    });

    socket.on('webrtc:request-movie', ({ fromSocketId }: { fromSocketId: string }) => {
      if (!isHostRef.current || !movieStreamLocalRef.current) return;
      const stream = movieStreamLocalRef.current;

      // Re-announce stream ID so guest can identify it
      if (roomCodeRef.current) {
        getSocket().emit('webrtc:movie-stream-id', {
          roomCode: roomCodeRef.current,
          streamId: stream.id,
        });
      }

      let pc = peerConnections.current.get(fromSocketId);
      if (!pc || pc.signalingState === 'closed') {
        pc = createPeerConnection(fromSocketId);
        // New connection: send offer first, then movie tracks
        pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
          .then(offer => {
            pc!.setLocalDescription(offer);
            getSocket().emit('webrtc:offer', { targetSocketId: fromSocketId, offer });
          }).catch(console.error);
      }

      let tracksAdded = false;
      stream.getTracks().forEach(track => {
        const exists = pc!.getSenders().some(s => s.track?.id === track.id);
        if (!exists) { pc!.addTrack(track, stream); tracksAdded = true; }
      });
      if (tracksAdded) renegotiateWithPeer(fromSocketId);
    });

    socket.on('participant:left', ({ socketId, name }: { socketId: string; name: string }) => {
      setParticipants(prev => prev.filter(p => p.socketId !== socketId));
      setPeerStreams(prev => { const m = new Map(prev); m.delete(socketId); return m; });
      const pc = peerConnections.current.get(socketId);
      if (pc) { pc.close(); peerConnections.current.delete(socketId); }
      toast(`${name} left`, { icon: '👋', duration: 2000 });
    });

    socket.on('webrtc:offer', async ({ offer, fromSocketId }) => {
      const pc = createPeerConnection(fromSocketId);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc:answer', { targetSocketId: fromSocketId, answer });
    });

    socket.on('webrtc:answer', async ({ answer, fromSocketId }) => {
      const pc = peerConnections.current.get(fromSocketId);
      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(console.error);
        // Apply high bitrate NOW — encodings are populated after negotiation
        if (isHostRef.current) {
          setTimeout(() => applyHighBitrate(pc), 200);
        }
      }
    });

    socket.on('webrtc:ice', async ({ candidate, fromSocketId }) => {
      const pc = peerConnections.current.get(fromSocketId);
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.warn);
      }
    });

    socket.on('video:play', ({ currentTime }: { currentTime: number }) => {
      setVideoState(prev => ({ ...prev, isPlaying: true, currentTime }));
    });
    socket.on('video:pause', ({ currentTime }: { currentTime: number }) => {
      setVideoState(prev => ({ ...prev, isPlaying: false, currentTime }));
    });
    socket.on('video:seek', ({ currentTime }: { currentTime: number }) => {
      setVideoState(prev => ({ ...prev, currentTime }));
    });
    socket.on('video:rate', ({ playbackRate }: { playbackRate: number }) => {
      setVideoState(prev => ({ ...prev, playbackRate }));
    });
    socket.on('video:time-update', ({ currentTime }: { currentTime: number }) => {
      setVideoState(prev => (prev.isPlaying ? { ...prev, currentTime } : prev));
    });
    socket.on('video:sync', ({ isPlaying, currentTime, playbackRate, hasMovie: hm, movieName: mn }: any) => {
      setVideoState(prev => ({
        ...prev, isPlaying, currentTime,
        playbackRate: playbackRate ?? prev.playbackRate ?? 1,
        hasMovie: hm, movieName: mn,
      }));
      if (hm) setHasMovie(true);
    });
    socket.on('video:movie-ready', ({ movieName: mn }: { movieName: string }) => {
      setVideoState(prev => ({ ...prev, hasMovie: true, movieName: mn }));
      if (!isHostRef.current) toast(`🎬 Host loaded: ${mn} — connecting stream...`);
    });

    socket.on('video:movie-error', ({ message }: { message: string }) => {
      if (!isHostRef.current) {
        setMovieCodecError(message);
        toast.error(message, { duration: 6000 });
      }
    });

    socket.on('chat:message', (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
    });
    socket.on('chat:toggled', ({ enabled, byName }: { enabled: boolean; byName: string }) => {
      setIsChatEnabled(enabled);
      toast(enabled ? `💬 Chat enabled by ${byName}` : `🔇 Chat disabled by ${byName}`);
    });
    socket.on('chat:disabled', () => toast.error('Chat is disabled by the host'));

    socket.on('participant:audio-toggled', ({ socketId, isMuted: m }: any) => {
      setParticipants(prev => prev.map(p => p.socketId === socketId ? { ...p, isMuted: m } : p));
    });
    socket.on('participant:video-toggled', ({ socketId, isCameraOff: c }: any) => {
      setParticipants(prev => prev.map(p => p.socketId === socketId ? { ...p, isCameraOff: c } : p));
    });
    socket.on('screen:share-started', ({ userName }: any) => {
      toast(`🖥️ ${userName} started screen sharing`);
    });
    socket.on('error', ({ message }: { message: string }) => toast.error(message));

    return () => {
      [
        'room:joined', 'participant:joined', 'participant:left',
        'webrtc:offer', 'webrtc:answer', 'webrtc:ice', 'webrtc:request-movie', 'webrtc:movie-stream-id',
        'video:play', 'video:pause', 'video:seek', 'video:rate', 'video:time-update',
        'video:sync', 'video:movie-ready', 'video:movie-error',
        'chat:message', 'chat:toggled', 'chat:disabled',
        'participant:audio-toggled', 'participant:video-toggled',
        'screen:share-started', 'error',
      ].forEach(ev => socket.off(ev));
    };
  }, [createPeerConnection, renegotiateWithPeer, applyHighBitrate]);

  // ── ACTIONS ───────────────────────────────────────────────────
  const joinRoom = useCallback((code: string) => {
    const normalized = normalizeRoomCode(code);
    if (!normalized || normalized.length !== 6) return;

    const socket = getSocket();
    roomCodeRef.current = normalized;

    const emitJoin = () => socket.emit('room:join', { roomCode: normalized });

    const runJoin = () => {
      socket.emit('room:leave');
      setTimeout(emitJoin, 80);
    };

    if (socket.connected) {
      runJoin();
    } else {
      socket.once('connect', runJoin);
      if (!socket.active) socket.connect();
    }
  }, []);

  const leaveRoom = useCallback(() => {
    const code = roomCodeRef.current;
    const wasHost = isHostRef.current;

    if (code) getSocket().emit('room:leave');

    if (wasHost && movieBlobUrlRef.current) {
      saveHostMovie(code!, movieBlobUrlRef.current, movieName || 'Movie');
      stopLocalStream();
      stopPeers();
    } else {
      stopEverything();
    }

    setRoom(null);
    setParticipants([]);
    setMessages([]);
    setPeerStreams(new Map());
    setLocalStream(null);
    setScreenStream(null);
    setMovieStream(null);
    setVideoState({ isPlaying: false, currentTime: 0, playbackRate: 1, hasMovie: false, movieName: null });
    setLocalMovieUrl(null);
    setMovieName(null);
    setHasMovie(false);
    setIsScreenSharing(false);
    setIsMuted(false);
    setIsCameraOff(false);
    roomCodeRef.current = null;
    movieStreamSourceRef.current = null;
  }, [stopEverything, stopLocalStream, stopPeers, movieName]);

  useEffect(() => () => stopPeers(), [stopPeers]); // camera kept alive until explicit leaveRoom

  const sendMessage = useCallback((text: string) => {
    if (!roomCodeRef.current) return;
    getSocket().emit('chat:message', { roomCode: roomCodeRef.current, text });
  }, []);

  const toggleChatEnabled = useCallback((enabled: boolean) => {
    if (!roomCodeRef.current) return;
    getSocket().emit('chat:toggle', { roomCode: roomCodeRef.current, enabled });
  }, []);

  const emitPlay = useCallback((currentTime: number) => {
    if (!roomCodeRef.current) return;
    getSocket().emit('video:play', { roomCode: roomCodeRef.current, currentTime });
  }, []);

  const emitPause = useCallback((currentTime: number) => {
    if (!roomCodeRef.current) return;
    getSocket().emit('video:pause', { roomCode: roomCodeRef.current, currentTime });
  }, []);

  const emitSeek = useCallback((currentTime: number) => {
    if (!roomCodeRef.current) return;
    getSocket().emit('video:seek', { roomCode: roomCodeRef.current, currentTime });
  }, []);

  const emitRate = useCallback((playbackRate: number) => {
    if (!roomCodeRef.current) return;
    getSocket().emit('video:rate', { roomCode: roomCodeRef.current, playbackRate });
  }, []);

  const requestSync = useCallback(() => {
    if (!roomCodeRef.current) return;
    getSocket().emit('video:sync-request', { roomCode: roomCodeRef.current });
  }, []);

  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
    if (roomCodeRef.current) {
      getSocket().emit('media:toggle-audio', { roomCode: roomCodeRef.current, isMuted: newMuted });
    }
  }, [isMuted]);

  const toggleCamera = useCallback(() => {
    const newOff = !isCameraOff;
    setIsCameraOff(newOff);
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !newOff; });
    if (roomCodeRef.current) {
      getSocket().emit('media:toggle-video', { roomCode: roomCodeRef.current, isCameraOff: newOff });
    }
  }, [isCameraOff]);

  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      setScreenStream(stream);
      screenStreamRef.current = stream;
      setIsScreenSharing(true);
      const videoTrack = stream.getVideoTracks()[0];
      peerConnections.current.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
      });
      if (roomCodeRef.current) getSocket().emit('screen:share-start', { roomCode: roomCodeRef.current });
      videoTrack.onended = stopScreenShare;
    } catch {
      toast.error('Could not start screen sharing');
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    setIsScreenSharing(false);
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      peerConnections.current.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
      });
    }
    if (roomCodeRef.current) getSocket().emit('screen:share-stop', { roomCode: roomCodeRef.current });
  }, []);

  // ── HOST MOVIE BROADCAST (select file or restore after rejoin) ─
  const startHostMovieBroadcast = useCallback((url: string, name: string) => {
    if (movieVideoElRef.current?.parentNode) {
      movieVideoElRef.current.pause();
      movieVideoElRef.current.parentNode.removeChild(movieVideoElRef.current);
    }

    movieBlobUrlRef.current = url;
    setLocalMovieUrl(url);
    setMovieName(name);
    setHasMovie(true);
    setVideoState(prev => ({
      ...prev, hasMovie: true, movieName: name,
      isPlaying: false, currentTime: 0,
    }));

    if (roomCodeRef.current) {
      saveHostMovie(roomCodeRef.current, url, name);
    }

    setMovieCodecError(null);

    const hiddenVideo = document.createElement('video');
    hiddenVideo.src = url;
    hiddenVideo.muted = true;
    hiddenVideo.playsInline = true;
    hiddenVideo.preload = 'auto';
    // IMPORTANT: captureStream() captures at the element's rendered resolution.
    // Keeping it at 1×1px means the stream sent to guests is essentially 1px — no quality.
    // We position it off-screen at full HD size so captureStream gets real pixels.
    hiddenVideo.style.position = 'fixed';
    hiddenVideo.style.top = '-9999px';
    hiddenVideo.style.left = '-9999px';
    hiddenVideo.style.pointerEvents = 'none';
    hiddenVideo.style.opacity = '0';
    document.body.appendChild(hiddenVideo);
    movieVideoElRef.current = hiddenVideo;

    // ── CODEC SUPPORT CHECK ─────────────────────────────────────
    // Many builds of Chrome/Chromium have NO native HEVC/H.265 decoder.
    // If the file uses an unsupported codec (common for "HEVC x265 10Bit"
    // releases), the <video> element never gets real frames — it loads
    // metadata/duration fine, but videoWidth/videoHeight stay 0 and
    // captureStream() produces a black stream. We detect that here and
    // surface a clear message instead of silently sending a black screen.
    const reportCodecError = (msg: string) => {
      console.error('🎬 Movie playback error:', msg);
      setMovieCodecError(msg);
      toast.error(msg, { duration: 6000 });
      if (roomCodeRef.current) {
        getSocket().emit('video:movie-error', { roomCode: roomCodeRef.current, message: msg });
      }
    };

    hiddenVideo.onerror = () => {
      reportCodecError(
        `"${name}" is browser mein play nahi ho payi. Iska codec (jaise HEVC/H.265) is browser mein supported nahi hai. Video ko H.264 (MP4) mein convert karke try karein.`
      );
    };

    const tryCapture = () => {
      try {
        // No framerate argument — let browser use the video's native fps (better quality)
        // @ts-ignore
        const capturedStream: MediaStream = hiddenVideo.captureStream
          ? hiddenVideo.captureStream()
          // @ts-ignore
          : hiddenVideo.mozCaptureStream?.() ?? null;

        if (!capturedStream) {
          toast.error('Your browser does not support movie streaming');
          return;
        }

        const waitForTracks = () => {
          if (capturedStream.getVideoTracks().length === 0) {
            setTimeout(waitForTracks, 200);
            return;
          }
          movieStreamLocalRef.current?.getTracks().forEach(t => t.stop());
          movieStreamLocalRef.current = capturedStream;
          addMovieStreamToPeers(capturedStream);
        };
        waitForTracks();
      } catch (err) {
        console.error('captureStream error:', err);
        toast.error('Could not capture movie stream');
      }
    };

    hiddenVideo.onloadedmetadata = () => {
      // If metadata loaded but the decoder produced NO frame dimensions,
      // the container (MKV/MP4) parsed fine but the video codec inside
      // (commonly HEVC/H.265, 10-bit) has NO browser decoder. This is the
      // exact "metadata OK, picture black" failure mode.
      if (hiddenVideo.videoWidth === 0 || hiddenVideo.videoHeight === 0) {
        reportCodecError(
          `"${name}" ka video codec is browser mein decode nahi ho raha (likely HEVC/H.265/10-bit). Audio chal sakta hai par video black rahega. Fix: video ko H.264 (AVC) MP4 mein convert karein (e.g. HandBrake/VLC se "Fast 1080p30" preset), phir wahi file select karein.`
        );
        return;
      }

      // Match the hidden element's size to the movie's ACTUAL resolution
      // (capped at 1080p for bandwidth) so captureStream() produces a
      // stream at the real video quality — Full HD stays Full HD,
      // a 480p MP4 stays 480p, instead of being forced to a fixed size.
      const vw = hiddenVideo.videoWidth;
      const vh = hiddenVideo.videoHeight;
      const MAX_DIM = 1920;
      let w = vw, h = vh;
      if (w > MAX_DIM || h > MAX_DIM) {
        const scale = Math.min(MAX_DIM / w, MAX_DIM / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      hiddenVideo.style.width = `${w}px`;
      hiddenVideo.style.height = `${h}px`;

      hiddenVideo.play().then(() => {
        hiddenVideo.pause();
        hiddenVideo.currentTime = videoState.currentTime || 0;
        tryCapture();
      }).catch(() => tryCapture());
    };
    hiddenVideo.load();
  }, [addMovieStreamToPeers, videoState.currentTime]);

  const selectMovie = useCallback((file: File) => {
    // ── Stop old movie stream before starting new one ──
    if (movieStreamLocalRef.current) {
      movieStreamLocalRef.current.getTracks().forEach(t => t.stop());
      movieStreamLocalRef.current = null;
    }
    // Remove old hidden video element
    if (movieVideoElRef.current) {
      movieVideoElRef.current.pause();
      if (movieVideoElRef.current.parentNode) {
        movieVideoElRef.current.parentNode.removeChild(movieVideoElRef.current);
      }
      movieVideoElRef.current = null;
    }
    // Revoke old blob URL
    if (movieBlobUrlRef.current && movieBlobUrlRef.current !== getHostMovie(roomCodeRef.current || '')?.blobUrl) {
      URL.revokeObjectURL(movieBlobUrlRef.current);
    }

    // Reset state so VideoPlayer shows new movie
    setLocalMovieUrl(null);
    setMovieStream(null);
    setMovieCodecError(null);

    const url = URL.createObjectURL(file);
    if (roomCodeRef.current) {
      getSocket().emit('video:movie-selected', {
        roomCode: roomCodeRef.current,
        movieName: file.name,
      });
      // Reset video state for new movie
      getSocket().emit('video:seek', { roomCode: roomCodeRef.current, currentTime: 0 });
    }

    // Small delay so state resets before new broadcast begins
    setTimeout(() => {
      startHostMovieBroadcast(url, file.name);
      toast.success(`🎬 "${file.name}" — streaming to all participants`);
    }, 100);
  }, [startHostMovieBroadcast]);

  // Restore host movie after leave + rejoin
  useEffect(() => {
    if (!room || !isHost || localMovieUrl) return;
    const cached = getHostMovie(room.code);
    if (!cached || !videoState.hasMovie) return;
    startHostMovieBroadcast(cached.blobUrl, cached.movieName);
    toast('Movie restored — streaming resumed', { icon: '🎬' });
  }, [room, isHost, localMovieUrl, videoState.hasMovie, startHostMovieBroadcast]);

  // ── Sync hidden video (WebRTC source) with shared videoState ───
  useEffect(() => {
    if (!isHostRef.current) return;
    const hiddenVid = movieVideoElRef.current;
    if (!hiddenVid) return;

    const rate = videoState.playbackRate ?? 1;
    if (hiddenVid.playbackRate !== rate) hiddenVid.playbackRate = rate;

    const diff = Math.abs(hiddenVid.currentTime - videoState.currentTime);
    if (diff > 0.35) hiddenVid.currentTime = videoState.currentTime;

    if (videoState.isPlaying && hiddenVid.paused) {
      hiddenVid.play().catch(() => {});
    } else if (!videoState.isPlaying && !hiddenVid.paused) {
      hiddenVid.pause();
    }
  }, [videoState.isPlaying, videoState.currentTime, videoState.playbackRate]);

  // Host broadcasts actual playback position while playing
  useEffect(() => {
    if (!isHostRef.current || !videoState.isPlaying || !roomCodeRef.current) return;
    const interval = setInterval(() => {
      const t = movieVideoElRef.current?.currentTime;
      if (t == null || !roomCodeRef.current) return;
      getSocket().emit('video:time-update', {
        roomCode: roomCodeRef.current,
        currentTime: t,
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [videoState.isPlaying]);

  return (
    <RoomContext.Provider value={{
      room, participants, messages, videoState, isChatEnabled, isHost,
      localStream, peerStreams, screenStream, movieStream,
      isMuted, isCameraOff, isScreenSharing,
      localMovieUrl, movieName, hasMovie, movieCodecError,
      joinRoom, leaveRoom, sendMessage, toggleChatEnabled,
      emitPlay, emitPause, emitSeek, emitRate, requestSync,
      toggleMute, toggleCamera, startScreenShare, stopScreenShare,
      selectMovie, initLocalStream,
    }}>
      {children}
    </RoomContext.Provider>
  );
};

export const useRoom = () => {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoom must be used within RoomProvider');
  return ctx;
};
