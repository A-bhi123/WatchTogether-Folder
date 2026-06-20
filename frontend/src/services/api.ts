import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wt_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('wt_token');
      localStorage.removeItem('wt_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  register: (data: { name: string; email: string; password: string }) => api.post('/auth/register', data),
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
};

export const roomApi = {
  create: (data: { name: string }) => api.post('/rooms', data),
  getByCode: (code: string) => api.get(`/rooms/${code}`),
  getMyRooms: () => api.get('/rooms/my'),
  close: (code: string) => api.delete(`/rooms/${code}`),
};

export const userApi = {
  updateProfile: (data: { name?: string; avatar?: string | null; avatarColor?: string }) =>
    api.put('/users/profile', data),
};

export default api;
