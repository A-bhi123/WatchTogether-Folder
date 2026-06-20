import { Copy, Check, Users, MessageSquare, ArrowLeft, Film, Crown, Link } from 'lucide-react';
import { useState } from 'react';
import { useRoom } from '../../contexts/RoomContext';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import { isSameId } from '../../utils/ids';

type Panel = 'chat' | 'participants' | null;

interface Props {
  onLeave: () => void;
  panel: Panel;
  setPanel: (p: Panel) => void;
}

export default function RoomHeader({ onLeave, panel, setPanel }: Props) {
  const { room, participants } = useRoom();
  const { user } = useAuth();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const isRoomHost = isSameId(room?.host, user?._id);

  const copyCode = () => {
    if (!room) return;
    navigator.clipboard.writeText(room.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    toast.success(`Room code copied: ${room.code}`);
  };

  const copyInviteLink = () => {
    if (!room) return;
    // Full invite link — dosto ko yeh bhejo
    const link = `${window.location.origin}/join/${room.code}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    toast.success('Invite link copied! Share with friends 🎉');
  };

  return (
    <header className="bg-surface border-b border-white/5 px-3 h-14 flex items-center gap-2 flex-shrink-0">
      {/* Leave */}
      <button onClick={onLeave}
        className="flex items-center gap-1.5 text-netflix-gray hover:text-white transition-colors text-sm flex-shrink-0">
        <ArrowLeft className="w-4 h-4" />
        <span className="hidden sm:block">Leave</span>
      </button>

      {/* Room name */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Film className="w-4 h-4 text-netflix-red flex-shrink-0" />
        <span className="text-white font-medium text-sm truncate">{room?.name}</span>
        {isRoomHost && (
          <span className="flex items-center gap-1 text-[10px] text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
            <Crown className="w-2.5 h-2.5" /> Host
          </span>
        )}
      </div>

      {/* Copy room CODE */}
      <button onClick={copyCode}
        title="Copy room code"
        className="flex items-center gap-1.5 text-xs text-netflix-gray hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-lg transition-all flex-shrink-0">
        {copiedCode ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
        <span className="font-mono tracking-wider">{room?.code}</span>
      </button>

      {/* Copy INVITE LINK */}
      <button onClick={copyInviteLink}
        title="Copy invite link for friends"
        className="flex items-center gap-1.5 text-xs text-netflix-gray hover:text-white bg-netflix-red/10 hover:bg-netflix-red/20 border border-netflix-red/20 px-2.5 py-1.5 rounded-lg transition-all flex-shrink-0">
        {copiedLink ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Link className="w-3.5 h-3.5 text-netflix-red" />}
        <span className="hidden sm:block text-netflix-red">Invite</span>
      </button>

      {/* Participants */}
      <button
        onClick={() => setPanel(panel === 'participants' ? null : 'participants')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all flex-shrink-0 ${
          panel === 'participants' ? 'bg-netflix-red/20 text-netflix-red' : 'text-netflix-gray hover:text-white hover:bg-white/10'
        }`}>
        <Users className="w-3.5 h-3.5" />
        <span className="hidden sm:block">People</span>
        {participants.length > 0 && (
          <span className="bg-netflix-red text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
            {participants.length}
          </span>
        )}
      </button>

      {/* Chat */}
      <button
        onClick={() => setPanel(panel === 'chat' ? null : 'chat')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all flex-shrink-0 ${
          panel === 'chat' ? 'bg-netflix-red/20 text-netflix-red' : 'text-netflix-gray hover:text-white hover:bg-white/10'
        }`}>
        <MessageSquare className="w-3.5 h-3.5" />
        <span className="hidden sm:block">Chat</span>
      </button>
    </header>
  );
}
