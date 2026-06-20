import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, LogIn, Film, Users, Clock, LogOut, User, Copy, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { roomApi } from '../services/api';
import { Room } from '../types';
import toast from 'react-hot-toast';
import { parseRoomCode } from '../utils/roomCode';
import { formatDistanceToNow } from 'date-fns';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const res = await roomApi.getMyRooms();
      setRooms(res.data.rooms);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) return;
    setCreating(true);
    try {
      const res = await roomApi.create({ name: roomName.trim() });
      const room = res.data.room;
      const inviteLink = `${window.location.origin}/join/${room.code}`;
      try { await navigator.clipboard.writeText(inviteLink); } catch { /* ignore */ }
      toast.success(`Room ready! Invite link copied — share with friends`);
      navigate(`/room/${room.code}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = parseRoomCode(joinCode);
    if (!code) {
      toast.error('Valid 6-character room code enter karein (ya invite link paste karein)');
      return;
    }
    try {
      await roomApi.getByCode(code);
      navigate(`/room/${code}`);
    } catch {
      toast.error('Room not found');
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
    toast.success('Code copied!');
  };

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="min-h-screen bg-netflix-dark">
      {/* Header */}
      <header className="border-b border-white/5 bg-surface/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-netflix-red rounded flex items-center justify-center">
              <Film className="w-4 h-4 text-white" />
            </div>
            <span className="font-display text-2xl tracking-wider text-white">WATCHTOGETHER</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ backgroundColor: user?.avatarColor || '#E50914' }}
              >
                {user?.avatar ? (
                  <img src={user.avatar} alt={user.name} className="w-full h-full object-cover rounded-full" />
                ) : getInitials(user?.name || 'U')}
              </div>
              <span className="text-sm text-white hidden sm:block">{user?.name}</span>
            </div>
            <button
              onClick={logout}
              className="btn-ghost flex items-center gap-1 text-sm"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:block">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <h2 className="text-3xl font-bold text-white mb-1">
            Welcome back, <span className="text-netflix-red">{user?.name?.split(' ')[0]}</span>
          </h2>
          <p className="text-netflix-gray">Create a room or join one to start watching together</p>
        </motion.div>

        {/* Action cards */}
        <div className="grid sm:grid-cols-2 gap-4 mb-10">
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            onClick={() => setShowCreateModal(true)}
            className="group bg-netflix-red/10 hover:bg-netflix-red/20 border border-netflix-red/30 hover:border-netflix-red/60 rounded-xl p-6 text-left transition-all duration-200"
          >
            <div className="w-12 h-12 bg-netflix-red/20 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Plus className="w-6 h-6 text-netflix-red" />
            </div>
            <h3 className="text-white font-semibold text-lg mb-1">Create Room</h3>
            <p className="text-netflix-gray text-sm">Start a new watch party and invite your friends</p>
          </motion.button>

          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
            onClick={() => setShowJoinModal(true)}
            className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl p-6 text-left transition-all duration-200"
          >
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <LogIn className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-white font-semibold text-lg mb-1">Join Room</h3>
            <p className="text-netflix-gray text-sm">Enter a room code to join your friends</p>
          </motion.button>
        </div>

        {/* Recent rooms */}
        <div>
          <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-netflix-gray" />
            Recent Rooms
          </h3>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="shimmer h-24 rounded-xl" />
              ))}
            </div>
          ) : rooms.length === 0 ? (
            <div className="text-center py-12 text-netflix-gray">
              <Film className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No rooms yet — create one to get started!</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {rooms.map((room, i) => (
                <motion.div
                  key={room._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-surface hover:bg-surface-raised border border-white/5 hover:border-white/10 rounded-xl p-4 transition-all duration-200 group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="text-white font-medium text-sm truncate flex-1">{room.name}</h4>
                    <button
                      onClick={() => copyCode(room.code)}
                      className="ml-2 text-netflix-gray hover:text-white transition-colors flex-shrink-0"
                    >
                      {copiedCode === room.code ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-netflix-gray mb-3">
                    <span className="bg-white/10 px-2 py-0.5 rounded font-mono tracking-wider">{room.code}</span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {room.participants?.length || 0}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-netflix-gray/70">
                      {formatDistanceToNow(new Date(room.createdAt), { addSuffix: true })}
                    </span>
                    <button
                      onClick={() => navigate(`/room/${room.code}`)}
                      className="text-xs text-netflix-red hover:text-red-400 font-medium transition-colors opacity-0 group-hover:opacity-100"
                    >
                      Rejoin →
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Create Room Modal */}
      {showCreateModal && (
        <Modal onClose={() => setShowCreateModal(false)}>
          <h3 className="text-white font-semibold text-lg mb-4">Create a Room</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <input
              type="text"
              value={roomName}
              onChange={e => setRoomName(e.target.value)}
              placeholder="Room name (e.g. Movie Night 🎬)"
              className="input-field"
              required
              autoFocus
              maxLength={100}
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={creating} className="btn-primary flex-1 flex justify-center">
                {creating ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Join Room Modal */}
      {showJoinModal && (
        <Modal onClose={() => setShowJoinModal(false)}>
          <h3 className="text-white font-semibold text-lg mb-4">Join a Room</h3>
          <form onSubmit={handleJoin} className="space-y-4">
            <input
              type="text"
              value={joinCode}
              onChange={e => {
                const parsed = parseRoomCode(e.target.value);
                setJoinCode(parsed || e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
              }}
              placeholder="ABC123 ya invite link"
              className="input-field font-mono tracking-widest text-center text-lg uppercase"
              required
              autoFocus
              maxLength={64}
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowJoinModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" className="btn-primary flex-1">Join</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface border border-white/10 rounded-2xl p-6 w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </div>
  );
}
