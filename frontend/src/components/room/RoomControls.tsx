import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, MessageSquare, MessageSquareOff, PhoneOff } from 'lucide-react';
import { useRoom } from '../../contexts/RoomContext';
import { useNavigate } from 'react-router-dom';

interface Props {
  isChatVisible: boolean;
  onToggleChatVisible: () => void;
}

export default function RoomControls({ isChatVisible, onToggleChatVisible }: Props) {
  const {
    isMuted, isCameraOff, isScreenSharing, isHost, isChatEnabled,
    toggleMute, toggleCamera, startScreenShare, stopScreenShare,
    toggleChatEnabled, leaveRoom,
  } = useRoom();
  const navigate = useNavigate();

  const handleLeave = () => {
    leaveRoom();
    navigate('/');
  };

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-3 flex-wrap"
      style={{
        background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 70%, transparent 100%)',
      }}
    >
      {/* Mic */}
      <Btn
        onClick={toggleMute}
        active={!isMuted}
        activeClass="bg-white/15 border-white/15 text-white hover:bg-white/25"
        inactiveClass="bg-red-900/50 border-red-500/50 text-red-400 hover:bg-red-900/70"
        icon={isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        label={isMuted ? 'Unmute' : 'Mute'}
      />

      {/* Camera */}
      <Btn
        onClick={toggleCamera}
        active={!isCameraOff}
        activeClass="bg-white/15 border-white/15 text-white hover:bg-white/25"
        inactiveClass="bg-red-900/50 border-red-500/50 text-red-400 hover:bg-red-900/70"
        icon={isCameraOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
        label={isCameraOff ? 'Show cam' : 'Hide cam'}
      />

      {/* Screen share */}
      <Btn
        onClick={isScreenSharing ? stopScreenShare : startScreenShare}
        active={!isScreenSharing}
        activeClass="bg-white/15 border-white/15 text-white hover:bg-white/25"
        inactiveClass="bg-blue-900/50 border-blue-500/50 text-blue-400 hover:bg-blue-900/70"
        icon={isScreenSharing ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
        label={isScreenSharing ? 'Stop share' : 'Screen share'}
      />

      {/* Chat visibility toggle */}
      <Btn
        onClick={onToggleChatVisible}
        active={isChatVisible}
        activeClass="bg-white/15 border-white/15 text-white hover:bg-white/25"
        inactiveClass="bg-yellow-900/50 border-yellow-500/50 text-yellow-400 hover:bg-yellow-900/70"
        icon={isChatVisible ? <MessageSquare className="w-4 h-4" /> : <MessageSquareOff className="w-4 h-4" />}
        label={isChatVisible ? 'Hide chat' : 'Show chat'}
      />

      {/* Host: enable/disable chat for everyone */}
      {isHost && (
        <Btn
          onClick={() => toggleChatEnabled(!isChatEnabled)}
          active={isChatEnabled}
          activeClass="bg-green-900/50 border-green-500/50 text-green-400 hover:bg-green-900/70"
          inactiveClass="bg-orange-900/50 border-orange-500/50 text-orange-400 hover:bg-orange-900/70"
          icon={<MessageSquare className="w-4 h-4" />}
          label={isChatEnabled ? 'Disable chat' : 'Enable chat'}
        />
      )}

      {/* Leave */}
      <button
        onClick={handleLeave}
        className="flex flex-col items-center gap-1 px-5 py-2 rounded-xl border bg-red-600/80 hover:bg-red-600 text-white border-red-500/60 transition-all active:scale-95 ml-3 backdrop-blur-sm"
      >
        <PhoneOff className="w-4 h-4" />
        <span className="text-[10px] font-semibold hidden sm:block">Leave</span>
      </button>
    </div>
  );
}

function Btn({ onClick, active, activeClass, inactiveClass, icon, label }: {
  onClick: () => void; active: boolean;
  activeClass: string; inactiveClass: string;
  icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border transition-all duration-200 active:scale-95 backdrop-blur-sm ${active ? activeClass : inactiveClass}`}
    >
      {icon}
      <span className="text-[10px] font-medium hidden sm:block whitespace-nowrap">{label}</span>
    </button>
  );
}
