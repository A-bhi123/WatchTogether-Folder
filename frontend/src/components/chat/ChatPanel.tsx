import { useState, useRef, useEffect } from 'react';
import { Send, SmilePlus } from 'lucide-react';
import { useRoom } from '../../contexts/RoomContext';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatMessage } from '../../types';

const REACTIONS = ['😂', '❤️', '👏', '🔥', '😮', '👍', '😢', '🎉'];

function Avatar({ name, avatar, color }: { name: string; avatar?: string | null; color: string }) {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 overflow-hidden"
      style={{ backgroundColor: color }}>
      {avatar ? <img src={avatar} alt={name} className="w-full h-full object-cover" /> : initials}
    </div>
  );
}

function Bubble({ msg, isOwn }: { msg: ChatMessage; isOwn: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isOwn && <Avatar name={msg.userName} avatar={msg.userAvatar} color={msg.userAvatarColor} />}
      <div className={`max-w-[76%] flex flex-col gap-0.5 ${isOwn ? 'items-end' : 'items-start'}`}>
        {!isOwn && <span className="text-[10px] text-netflix-gray px-1">{msg.userName}</span>}
        <div className={`px-3 py-2 rounded-2xl text-sm break-words leading-snug ${
          isOwn ? 'bg-netflix-red text-white rounded-tr-sm' : 'bg-surface-overlay text-white rounded-tl-sm'
        }`}>
          {msg.text}
        </div>
        <span className="text-[10px] text-netflix-gray/60 px-1">
          {format(new Date(msg.timestamp), 'HH:mm')}
        </span>
      </div>
    </motion.div>
  );
}

export default function ChatPanel() {
  const { messages, sendMessage, isChatEnabled, isHost } = useRoom();
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [showReact, setShowReact] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !isChatEnabled) return;
    sendMessage(text.trim());
    setText('');
    inputRef.current?.focus();
  };

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between flex-shrink-0">
        <h3 className="text-white font-semibold text-sm">Live Chat</h3>
        <div className={`text-xs px-2 py-0.5 rounded-full ${isChatEnabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          {isChatEnabled ? 'Active' : 'Disabled'}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-10 text-netflix-gray text-xs">
            <p className="text-2xl mb-2">💬</p>
            <p>No messages yet — say hello!</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <Bubble key={i} msg={msg} isOwn={msg.userId === user?._id} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reaction row */}
      <AnimatePresence>
        {showReact && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="px-3 py-2 border-t border-white/5 flex gap-2 flex-wrap">
            {REACTIONS.map(e => (
              <button key={e} onClick={() => { sendMessage(e); setShowReact(false); }}
                className="text-xl hover:scale-125 transition-transform">{e}</button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Disabled notice */}
      {!isChatEnabled && (
        <div className="mx-3 mb-2 px-3 py-2 bg-red-900/30 border border-red-500/30 rounded-lg text-xs text-red-400 text-center">
          Chat has been disabled by the room owner.
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-white/5 flex-shrink-0">
        <form onSubmit={handleSend} className="flex gap-2 items-center">
          <button type="button" onClick={() => setShowReact(!showReact)}
            disabled={!isChatEnabled}
            className={`flex-shrink-0 transition-colors disabled:opacity-40 ${showReact ? 'text-netflix-red' : 'text-netflix-gray hover:text-white'}`}>
            <SmilePlus className="w-5 h-5" />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={isChatEnabled ? 'Say something...' : 'Chat is disabled'}
            disabled={!isChatEnabled}
            maxLength={500}
            className="flex-1 bg-surface-overlay text-white placeholder-netflix-gray text-sm px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-netflix-red/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          />
          <button type="submit" disabled={!text.trim() || !isChatEnabled}
            className="w-8 h-8 bg-netflix-red hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-95">
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
        </form>
      </div>
    </div>
  );
}
