export interface User {
  _id: string;
  name: string;
  email: string;
  avatar: string | null;
  avatarColor: string;
}

export interface VideoState {
  isPlaying: boolean;
  currentTime: number;
  playbackRate?: number;
  hasMovie: boolean;
  movieName: string | null;
  lastUpdated?: string;
}

export interface ChatMessage {
  userId: string;
  userName: string;
  userAvatar: string | null;
  userAvatarColor: string;
  text: string;
  timestamp: string | Date;
  _id?: string;
}

export interface Participant {
  userId: string;
  name: string;
  avatar: string | null;
  avatarColor: string;
  socketId: string;
  isMuted: boolean;
  isCameraOff: boolean;
  isHost: boolean;
}

export interface Room {
  _id: string;
  name: string;
  code: string;
  host: User;
  participants: Participant[];
  videoState: VideoState;
  isChatEnabled: boolean;
  isActive: boolean;
  messages: ChatMessage[];
  createdAt: string;
}
