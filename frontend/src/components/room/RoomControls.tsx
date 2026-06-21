import { useState } from 'react';
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  MessageSquare, MessageSquareOff, PhoneOff, Menu, X, Crown
} from 'lucide-react';
import { useRoom } from '../../contexts/RoomContext';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  isChatVisible: boolean;
  onToggleChatVisible: () => void;
  onLeave: () => void;
}

export default function RoomControls({ isChatVisible, onToggleChatVisible, onLeave }: Props) {
  const {
    isMuted, isCameraOff, isScreenSharing, isHost, isChatEnabled,
    toggleMute, toggleCamera, startScreenShare, stopScreenShare,
    toggleChatEnabled,
  } = useRoom();

  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <div className="absolute bottom-5 right-5 z-40" data-no-tap>
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              className="absolute bottom-16 right-0 flex flex-col gap-2 items-end"
            >
              <MenuItem
                onClick={() => { toggleMute(); closeMenu(); }}
                icon={isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                label={isMuted ? 'Unmute' : 'Mute'}
                color={isMuted ? 'bg-red-600/90' : 'bg-white/15'}
              />
              <MenuItem
                onClick={() => { toggleCamera(); closeMenu(); }}
                icon={isCameraOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                label={isCameraOff ? 'Camera On' : 'Camera Off'}
                color={isCameraOff ? 'bg-red-600/90' : 'bg-white/15'}
              />
              <MenuItem
                onClick={() => { isScreenSharing ? stopScreenShare() : startScreenShare(); closeMenu(); }}
                icon={isScreenSharing ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                label={isScreenSharing ? 'Stop Share' : 'Screen Share'}
                color={isScreenSharing ? 'bg-blue-600/90' : 'bg-white/15'}
              />
              <MenuItem
                onClick={() => { onToggleChatVisible(); closeMenu(); }}
                icon={isChatVisible ? <MessageSquareOff className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                label={isChatVisible ? 'Hide Chat' : 'Open Chat'}
                color={isChatVisible ? 'bg-yellow-600/90' : 'bg-white/15'}
              />
              {isHost && (
                <MenuItem
                  onClick={() => { toggleChatEnabled(!isChatEnabled); closeMenu(); }}
                  icon={<Crown className="w-4 h-4" />}
                  label={isChatEnabled ? 'Disable Chat' : 'Enable Chat'}
                  color={isChatEnabled ? 'bg-green-600/90' : 'bg-orange-600/90'}
                />
              )}
              <div className="w-full h-px bg-white/10 my-1" />
              <MenuItem
                onClick={() => { closeMenu(); onLeave(); }}
                icon={<PhoneOff className="w-4 h-4" />}
                label="Leave Room"
                color="bg-red-600"
              />
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setMenuOpen(prev => !prev)}
          className={`w-12 h-12 rounded-full flex items-center justify-center shadow-2xl border transition-all duration-200 active:scale-95 backdrop-blur-sm ${menuOpen ? 'bg-white/20 border-white/30' : 'bg-black/60 border-white/20'} text-white`}
        >
          <AnimatePresence mode="wait">
            {menuOpen
              ? <motion.div key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}><X className="w-5 h-5" /></motion.div>
              : <motion.div key="menu" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}><Menu className="w-5 h-5" /></motion.div>
            }
          </AnimatePresence>
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-30"
            onClick={closeMenu}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function MenuItem({ onClick, icon, label, color }: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 pl-4 pr-4 py-2.5 rounded-2xl border border-white/10 text-white text-sm font-medium shadow-xl backdrop-blur-sm transition-all active:scale-95 whitespace-nowrap ${color}`}
    >
      {icon}
      {label}
    </button>
  );
}