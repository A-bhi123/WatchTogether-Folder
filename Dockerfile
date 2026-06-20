FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
ENV VITE_API_URL=https://watchtogether-folder.onrender.com
ENV VITE_SOCKET_URL=https://watchtogether-folder.onrender.com
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev
COPY backend/ ./backend/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
WORKDIR /app/backend
EXPOSE 5000
CMD ["node", "server.js"]