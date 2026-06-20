import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { roomApi } from '../services/api';
import { parseRoomCode } from '../utils/roomCode';
import { Film } from 'lucide-react';
import toast from 'react-hot-toast';

export default function JoinRoomPage() {
  const { code: codeParam } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [joinCode, setJoinCode] = useState(() => parseRoomCode(codeParam || '') || '');
  const [loading, setLoading] = useState(false);
  const autoJoinStarted = useRef(false);

  const enterRoom = useCallback(async (raw: string) => {
    const cleanCode = parseRoomCode(raw);
    if (!cleanCode) {
      toast.error('Valid 6-character room code enter karein');
      return;
    }
    setLoading(true);
    try {
      await roomApi.getByCode(cleanCode);
      navigate(`/room/${cleanCode}`, { replace: true });
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Room not found';
      toast.error(msg);
      setLoading(false);
      autoJoinStarted.current = false;
    }
  }, [navigate]);

  // Invite link: /join/ABC123 — seed form, then same path as room code join
  useEffect(() => {
    const fromUrl = parseRoomCode(codeParam || '');
    if (fromUrl) setJoinCode(fromUrl);
  }, [codeParam]);

  useEffect(() => {
    if (!user && codeParam) {
      const parsed = parseRoomCode(codeParam);
      if (parsed) localStorage.setItem('wt_pending_join', parsed);
      navigate('/login');
      return;
    }
    if (codeParam && user && !autoJoinStarted.current) {
      const parsed = parseRoomCode(codeParam);
      if (parsed) {
        autoJoinStarted.current = true;
        enterRoom(parsed);
      }
    }
  }, [codeParam, user, navigate, enterRoom]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    enterRoom(joinCode);
  };

  return (
    <div className="min-h-screen bg-netflix-dark flex items-center justify-center p-4"
      style={{ background: 'radial-gradient(ellipse at 20% 50%, rgba(229,9,20,0.1) 0%, transparent 50%), #141414' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-netflix-red rounded-lg flex items-center justify-center">
              <Film className="w-5 h-5 text-white" />
            </div>
            <span className="font-display text-3xl tracking-wider text-white">WATCHTOGETHER</span>
          </div>
          <p className="text-netflix-gray text-sm">You've been invited to a watch party!</p>
        </div>

        <div className="bg-surface rounded-2xl border border-white/5 p-8 shadow-2xl">
          <h2 className="text-white font-semibold text-xl mb-2 text-center">Join Room</h2>
          <p className="text-netflix-gray text-sm text-center mb-6">
            Room code ya invite link paste karein
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              value={joinCode}
              onChange={e => {
                const parsed = parseRoomCode(e.target.value);
                setJoinCode(parsed || e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
              }}
              placeholder="ABC123"
              className="input-field font-mono tracking-[0.4em] text-center text-2xl uppercase"
              maxLength={64}
              autoFocus
              disabled={loading}
            />

            <div className="flex justify-center gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={`w-2 h-2 rounded-full transition-colors ${
                  i < joinCode.length ? 'bg-netflix-red' : 'bg-white/20'
                }`} />
              ))}
            </div>

            <button
              type="submit"
              disabled={loading || joinCode.length !== 6}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : '🎬 Join Watch Party'}
            </button>
          </form>

          <p className="text-center text-netflix-gray text-xs mt-4">
            Don't have a code?{' '}
            <button onClick={() => navigate('/')} className="text-netflix-red hover:text-red-400 transition-colors">
              Go to Dashboard
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
