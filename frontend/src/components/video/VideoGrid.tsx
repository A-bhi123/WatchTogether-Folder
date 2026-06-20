import { useRef, useEffect, useState, useCallback } from 'react';
import { useRoom } from '../../contexts/RoomContext';
import { isSameId } from '../../utils/ids';
import { useAuth } from '../../contexts/AuthContext';
import { MicOff, VideoOff, Crown, Maximize2, X, GripHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TileProps {
  stream: MediaStream | null;
  name: string;
  avatar?: string | null;
  avatarColor: string;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isHost?: boolean;
  isLocal?: boolean;
  onMaximize: () => void;
}

// ── Shared hook: attach stream to video element, handle camera re-enable ──
function useVideoStream(
  videoRef: React.RefObject<HTMLVideoElement>,
  stream: MediaStream | null,
  isCameraOff: boolean | undefined,
  isLocal: boolean
) {
  // Initial attach
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
  }, [stream]);

  // Re-enable fix: when camera turns back ON, force re-attach so browser renders frames
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream || isCameraOff) return;
    // Camera just turned ON — re-attach stream
    video.srcObject = null;
    const raf = requestAnimationFrame(() => {
      if (video) video.srcObject = stream;
    });
    return () => cancelAnimationFrame(raf);
  }, [isCameraOff]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ── Peer tile (small, in strip) ───────────────────────────────────
function VideoTile({ stream, name, avatar, avatarColor, isMuted, isCameraOff, isHost: tileHost, isLocal, onMaximize }: TileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useVideoStream(videoRef, stream, isCameraOff, !!isLocal);

  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const showVideo = !!stream && !isCameraOff;

  return (
    <div
      className="relative rounded-lg overflow-hidden bg-gray-900 border border-white/10 flex-shrink-0 group cursor-pointer"
      style={{ width: 110, height: 74 }}
      onClick={onMaximize}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="w-full h-full object-cover"
        style={{ display: showVideo ? 'block' : 'none' }}
      />
      {!showVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs overflow-hidden"
            style={{ backgroundColor: avatarColor }}>
            {avatar ? <img src={avatar} alt={name} className="w-full h-full object-cover" /> : initials}
          </div>
        </div>
      )}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <Maximize2 className="w-5 h-5 text-white drop-shadow" />
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1 flex items-center justify-between">
        <div className="flex items-center gap-0.5 min-w-0">
          {tileHost && <Crown className="w-2.5 h-2.5 text-yellow-400 flex-shrink-0" />}
          <span className="text-white text-[9px] truncate">{isLocal ? 'You' : name}</span>
        </div>
        <div className="flex gap-0.5 flex-shrink-0">
          {isMuted && <MicOff className="w-2.5 h-2.5 text-red-400" />}
          {isCameraOff && <VideoOff className="w-2.5 h-2.5 text-red-400" />}
        </div>
      </div>
    </div>
  );
}

// ── Draggable self-tile ───────────────────────────────────────────
interface DraggableTileProps {
  stream: MediaStream | null;
  name: string;
  avatar?: string | null;
  avatarColor: string;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isHost?: boolean;
  onMaximize: () => void;
}

function DraggableSelfTile({ stream, name, avatar, avatarColor, isMuted, isCameraOff, isHost: tileHost, onMaximize }: DraggableTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useVideoStream(videoRef, stream, isCameraOff, true);

  const tileRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const wasDragged = useRef(false);
  const [pos, setPos] = useState({ x: window.innerWidth - 160, y: window.innerHeight - 110 });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    isDragging.current = true;
    wasDragged.current = false;
    const tile = tileRef.current;
    if (!tile) return;
    const rect = tile.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    tile.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    wasDragged.current = true;
    const newX = e.clientX - dragOffset.current.x;
    const newY = e.clientY - dragOffset.current.y;
    setPos({
      x: Math.max(8, Math.min(window.innerWidth - 148, newX)),
      y: Math.max(8, Math.min(window.innerHeight - 102, newY)),
    });
  }, []);

  const onPointerUp = useCallback(() => {
    if (!wasDragged.current) onMaximize();
    isDragging.current = false;
    wasDragged.current = false;
  }, [onMaximize]);

  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const showVideo = !!stream && !isCameraOff;

  return (
    <div
      ref={tileRef}
      className="fixed z-40 rounded-xl overflow-hidden shadow-2xl border border-white/20 bg-gray-900 cursor-grab active:cursor-grabbing select-none group"
      style={{ width: 140, height: 94, left: pos.x, top: pos.y, touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="absolute top-1 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-60 transition-opacity pointer-events-none">
        <GripHorizontal className="w-4 h-4 text-white" />
      </div>

      {/* Video always in DOM — hidden via style when cam off (keeps element alive for re-enable) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{ opacity: showVideo ? 1 : 0, position: 'absolute', inset: 0 }}
      />

      {/* Avatar overlay when cam off */}
      <div
        className="absolute inset-0 flex items-center justify-center transition-opacity duration-200"
        style={{ opacity: showVideo ? 0 : 1, pointerEvents: 'none' }}
      >
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm overflow-hidden"
          style={{ backgroundColor: avatarColor }}>
          {avatar ? <img src={avatar} alt={name} className="w-full h-full object-cover" /> : initials}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1 flex items-center justify-between z-10">
        <div className="flex items-center gap-1 min-w-0">
          {tileHost && <Crown className="w-2.5 h-2.5 text-yellow-400 flex-shrink-0" />}
          <span className="text-white text-[9px] truncate">You</span>
        </div>
        <div className="flex gap-0.5 flex-shrink-0">
          {isMuted && <MicOff className="w-2.5 h-2.5 text-red-400" />}
          {isCameraOff && <VideoOff className="w-2.5 h-2.5 text-red-400" />}
        </div>
      </div>
    </div>
  );
}

// ── Peer strip ────────────────────────────────────────────────────
function PeerStrip({ tiles }: { tiles: TileProps[] }) {
  if (tiles.length === 0) return null;
  return (
    <div className="fixed z-30 bottom-4 left-4 flex gap-2 overflow-x-auto max-w-[55vw]">
      {tiles.map((tile, i) => <VideoTile key={i} {...tile} />)}
    </div>
  );
}

// ── Maximized overlay ─────────────────────────────────────────────
interface MaximizedProps {
  stream: MediaStream | null;
  name: string;
  avatar?: string | null;
  avatarColor: string;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isHost?: boolean;
  isLocal?: boolean;
  onClose: () => void;
}

function MaximizedTile({ stream, name, avatar, avatarColor, isMuted, isCameraOff, isHost: tileHost, isLocal, onClose }: MaximizedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useVideoStream(videoRef, stream, isCameraOff, !!isLocal);

  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.85, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="relative rounded-2xl overflow-hidden bg-gray-900 shadow-2xl border border-white/10"
        style={{ width: '70vw', maxWidth: 900, aspectRatio: '16/9' }}
        onClick={e => e.stopPropagation()}
      >
        <video ref={videoRef} autoPlay playsInline muted={isLocal}
          className="w-full h-full object-cover"
          style={{ opacity: (!isCameraOff && stream) ? 1 : 0 }} />
        {(!stream || isCameraOff) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-24 h-24 rounded-full flex items-center justify-center text-white font-bold text-3xl overflow-hidden"
              style={{ backgroundColor: avatarColor }}>
              {avatar ? <img src={avatar} alt={name} className="w-full h-full object-cover" /> : initials}
            </div>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-5 py-4 flex items-center gap-3">
          {tileHost && <Crown className="w-4 h-4 text-yellow-400" />}
          <span className="text-white font-semibold text-lg">{isLocal ? 'You' : name}</span>
          {isMuted && <span className="flex items-center gap-1 text-xs text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full"><MicOff className="w-3 h-3" /> Muted</span>}
          {isCameraOff && <span className="flex items-center gap-1 text-xs text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full"><VideoOff className="w-3 h-3" /> Camera off</span>}
        </div>
        <button onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </motion.div>
      <p className="absolute bottom-6 text-white/40 text-xs">Click outside or press Esc to close</p>
    </motion.div>
  );
}

// ── Main export ───────────────────────────────────────────────────
export default function VideoGrid() {
  const { localStream, peerStreams, participants, room, isHost, isMuted, isCameraOff } = useRoom();
  const { user } = useAuth();

  const [maximized, setMaximized] = useState<MaximizedProps | null>(null);

  const peerTiles: TileProps[] = [];
  participants.forEach(p => {
    if (p.userId === user?._id) return;
    const pStream = peerStreams.get(p.socketId) || null;
    const pIsHost = isSameId(p.userId, room?.host);
    peerTiles.push({
      stream: pStream, name: p.name, avatar: p.avatar, avatarColor: p.avatarColor,
      isMuted: p.isMuted, isCameraOff: p.isCameraOff, isHost: pIsHost, isLocal: false,
      onMaximize: () => setMaximized({
        stream: pStream, name: p.name, avatar: p.avatar, avatarColor: p.avatarColor,
        isMuted: p.isMuted, isCameraOff: p.isCameraOff, isHost: pIsHost, isLocal: false,
        onClose: () => setMaximized(null),
      }),
    });
  });

  return (
    <>
      <PeerStrip tiles={peerTiles} />

      {user && (
        <DraggableSelfTile
          stream={localStream}
          name={user.name}
          avatar={user.avatar}
          avatarColor={user.avatarColor}
          isMuted={isMuted}
          isCameraOff={isCameraOff}
          isHost={isHost}
          onMaximize={() => setMaximized({
            stream: localStream, name: user.name, avatar: user.avatar,
            avatarColor: user.avatarColor, isMuted, isCameraOff, isHost, isLocal: true,
            onClose: () => setMaximized(null),
          })}
        />
      )}

      <AnimatePresence>
        {maximized && <MaximizedTile {...maximized} />}
      </AnimatePresence>
    </>
  );
}
