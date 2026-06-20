import { useRoom } from '../../contexts/RoomContext';
import { isSameId } from '../../utils/ids';
import { useAuth } from '../../contexts/AuthContext';
import { Mic, MicOff, Video, VideoOff, Crown } from 'lucide-react';

function Avatar({ name, avatar, color, size = 8 }: { name: string; avatar?: string | null; color: string; size?: number }) {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const sizeClass = `w-${size} h-${size}`;
  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 overflow-hidden`}
      style={{ backgroundColor: color }}
    >
      {avatar ? <img src={avatar} alt={name} className="w-full h-full object-cover" /> : initials}
    </div>
  );
}

export default function ParticipantList() {
  const { participants, room } = useRoom();
  const { user } = useAuth();

  return (
    <div className="h-full flex flex-col bg-surface">
      <div className="p-4 border-b border-white/5">
        <h3 className="text-white font-semibold text-sm">
          Participants ({participants.length})
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {participants.length === 0 ? (
          <div className="text-center py-8 text-netflix-gray text-sm">
            No participants yet
          </div>
        ) : (
          participants.map((p) => {
            const isCurrentUser = p.userId === user?._id;
            const isRoomHost = isSameId(p.userId, room?.host);

            return (
              <div
                key={p.socketId}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                  isCurrentUser ? 'bg-white/10' : 'hover:bg-white/5'
                }`}
              >
                <div className="relative">
                  <Avatar name={p.name} avatar={p.avatar} color={p.avatarColor} size={8} />
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border border-surface" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white text-sm font-medium truncate">
                      {p.name}
                      {isCurrentUser && <span className="text-netflix-gray"> (you)</span>}
                    </span>
                    {isRoomHost && (
                      <Crown className="w-3 h-3 text-yellow-400 flex-shrink-0" />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {p.isMuted ? (
                    <MicOff className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <Mic className="w-3.5 h-3.5 text-green-400" />
                  )}
                  {p.isCameraOff ? (
                    <VideoOff className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <Video className="w-3.5 h-3.5 text-green-400" />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
