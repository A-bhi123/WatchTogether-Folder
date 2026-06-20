const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  socketId: { type: String },
  joinedAt: { type: Date, default: Date.now },
  isHost: { type: Boolean, default: false },
  isMuted: { type: Boolean, default: false },
  isCameraOff: { type: Boolean, default: false },
}, { _id: false });

const videoStateSchema = new mongoose.Schema({
  isPlaying: { type: Boolean, default: false },
  currentTime: { type: Number, default: 0 },
  playbackRate: { type: Number, default: 1 },
  lastUpdated: { type: Date, default: Date.now },
  movieName: { type: String, default: null },
  hasMovie: { type: Boolean, default: false },
}, { _id: false });

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Room name is required'],
    trim: true,
    minlength: 2,
    maxlength: 100,
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
  },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  participants: [participantSchema],
  videoState: { type: videoStateSchema, default: () => ({}) },
  isChatEnabled: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  screenSharer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  messages: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    userAvatar: String,
    userAvatarColor: String,
    text: { type: String, maxlength: 500 },
    timestamp: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

roomSchema.index({ host: 1 });

module.exports = mongoose.model('Room', roomSchema);
