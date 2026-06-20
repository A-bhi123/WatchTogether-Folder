import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    const token = localStorage.getItem('wt_token');
    socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      autoConnect: true,
    });
  }
  return socket;
};

export const waitForSocket = (timeoutMs = 10000): Promise<void> =>
  new Promise((resolve, reject) => {
    const s = getSocket();
    if (s.connected) {
      resolve();
      return;
    }
    const timer = setTimeout(() => reject(new Error('socket_timeout')), timeoutMs);
    const onConnect = () => {
      clearTimeout(timer);
      s.off('connect', onConnect);
      resolve();
    };
    s.on('connect', onConnect);
    if (!s.active) s.connect();
  });

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const reconnectSocket = () => {
  disconnectSocket();
  return getSocket();
};
