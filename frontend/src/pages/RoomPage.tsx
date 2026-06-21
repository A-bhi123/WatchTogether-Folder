import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRoom } from '../contexts/RoomContext';
import { roomApi } from '../services/api';
import VideoPlayer from '../components/room/VideoPlayer';
import VideoGrid from '../components/video/VideoGrid';
import ChatPanel from '../components/chat/ChatPanel';
import ParticipantList from '../components/room/ParticipantList';
import RoomControls from '../components/room/RoomControls';
import RoomHeader from '../components/room/RoomHeader';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { parseRoomCode } from '../utils/roomCode';
import { waitForSocket } from '../services/socket';

type Panel = 'chat' | 'participants' | null;

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { room, joinRoom, leaveRoom, initLocalStream, requestSync } = useRoom();
  const [loading, setLoading] = useState(true);
  const [activePanel, setActivePanel] = useState<Panel>('null');
  const [isChatVisible, setIsChatVisible] = useState(false);
  const joinedCodeRef = useRef<string | null>(null);

  const [showHeader, setShowHeader] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [showVideoControls, setShowVideoControls] = useState(false);

  const headerTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const videoCtrlTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastTapTimeRef = useRef<number>(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const roomCode = parseRoomCode(code || '');

  useEffect(() => { setLoading(true); }, [roomCode]);

  useEffect(() => {
    if (!roomCode) { toast.error('Invalid room code'); navigate('/'); return; }
    let cancelled = false;
    const init = async () => {
      try {
        await roomApi.getByCode(roomCode);
        await initLocalStream();
        await waitForSocket();
        if (cancelled) return;
        joinedCodeRef.current = roomCode;
        joinRoom(roomCode);
      } catch (err: unknown) {
        if (cancelled) return;
        if (err instanceof Error && err.message === 'socket_timeout') {
          toast.error('Server se connect nahi ho paya — backend start karein');
        } else {
          toast.error('Room not found');
        }
        navigate('/');
      }
    };
    init();
    return () => {
      cancelled = true;
      if (joinedCodeRef.current) { leaveRoom(); joinedCodeRef.current = null; }
    };
  }, [roomCode]);

  useEffect(() => {
    if (room && roomCode && room.code?.toUpperCase() === roomCode) setLoading(false);
  }, [room, roomCode]);

  useEffect(() => {
    if (!loading || !roomCode) return;
    const t = setTimeout(() => {
      if (!room) { toast.error('Room join timeout'); navigate('/'); }
    }, 15000);
    return () => clearTimeout(t);
  }, [loading, room, roomCode, navigate]);

  useEffect(() => {
    if (!loading && room) {
      const t = setTimeout(() => requestSync(), 500);
      return () => clearTimeout(t);
    }
  }, [loading, room, requestSync]);

  // Auto-show header for 3s on load
  useEffect(() => {
    if (!loading) {
      setShowHeader(true);
      headerTimerRef.current = setTimeout(() => setShowHeader(false), 3000);
    }
    return () => clearTimeout(headerTimerRef.current);
  }, [loading]);

  // ── ONLY listen for taps on the video area (not buttons/inputs/panels) ──
  // We attach this ONLY to the video wrapper div, not the whole page
  const handleVideoAreaTap = useCallback((e: React.MouseEvent) => {
    // Only fire if click came directly from the video wrapper or video element
    const target = e.target as HTMLElement;
    const tag = target.tagName.toLowerCase();
    // Allow through: video element, the wrapper div itself
    // Block: buttons, inputs, anything with data-no-tap
    if (
      tag === 'button' ||
      tag === 'input' ||
      tag === 'select' ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('[data-no-tap]')
    ) return;

    const now = Date.now();
    const diff = now - lastTapTimeRef.current;

    if (diff < 300 && diff > 0) {
      // DOUBLE TAP → bottom controls
      clearTimeout(singleTapTimerRef.current);
      lastTapTimeRef.current = 0;

      setShowControls(true);
      clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = setTimeout(() => setShowControls(false), 4000);

      setShowHeader(true);
      clearTimeout(headerTimerRef.current);
      headerTimerRef.current = setTimeout(() => setShowHeader(false), 4000);
    } else {
      lastTapTimeRef.current = now;
      singleTapTimerRef.current = setTimeout(() => {
        lastTapTimeRef.current = 0;
        // SINGLE TAP → video controls (play/pause/seek)
        setShowVideoControls(prev => {
          // Toggle: if already visible, keep visible and reset timer
          clearTimeout(videoCtrlTimerRef.current);
          videoCtrlTimerRef.current = setTimeout(() => setShowVideoControls(false), 4000);
          return true;
        });
      }, 300);
    }
  }, []);

  useEffect(() => () => {
    clearTimeout(headerTimerRef.current);
    clearTimeout(controlsTimerRef.current);
    clearTimeout(videoCtrlTimerRef.current);
    clearTimeout(singleTapTimerRef.current);
  }, []);

  const handleToggleChatVisible = () => {
    const newVisible = !isChatVisible;
    setIsChatVisible(newVisible);
    if (newVisible && activePanel !== 'chat') setActivePanel('chat');
    if (!newVisible && activePanel === 'chat') setActivePanel(null);
  };

  const handleLeave = () => {
    joinedCodeRef.current = null;
    leaveRoom();
    navigate('/');
  };

  if (loading) return <LoadingSpinner fullScreen message="Joining room..." />;

  return (
    <div className="h-screen bg-netflix-dark flex flex-col overflow-hidden relative">

      {/* ── TOP HEADER — overlay, auto-hide ── */}
      <AnimatePresence>
        {showHeader && (
          <motion.div
            data-no-tap
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-0 left-0 right-0 z-30"
          >
            <RoomHeader
              onLeave={handleLeave}
              panel={activePanel}
              setPanel={(p) => {
                setActivePanel(p);
                if (p === 'chat') setIsChatVisible(true);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MAIN AREA ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Video column */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">

          {/* Video area — tap handler ONLY here */}
          <div
            className="flex-1 overflow-hidden bg-black relative cursor-pointer"
            onClick={handleVideoAreaTap}
            onTouchEnd={handleVideoAreaTap}
          >
            <VideoPlayer showControls={showVideoControls} />
          </div>

          {/* BOTTOM CONTROLS — double-tap overlay */}
          <AnimatePresence>
            {showControls && (
              <motion.div
                data-no-tap
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ duration: 0.2 }}
                className="absolute bottom-0 left-0 right-0 z-30"
              >
                <RoomControls
                  isChatVisible={isChatVisible}
                  onToggleChatVisible={handleToggleChatVisible}
                    onLeave={handleLeave}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Side panel */}
        <AnimatePresence>
          {activePanel && (
            <motion.div
              data-no-tap
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex-shrink-0 border-l border-white/5 overflow-hidden"
              style={{ width: 300 }}
            >
              {activePanel === 'chat' ? <ChatPanel /> : <ParticipantList />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating cameras — fixed position, outside layout */}
      <VideoGrid />
    </div>
  );
}
