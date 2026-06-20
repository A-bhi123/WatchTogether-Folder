require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const connectDB = require('./src/utils/db');
const authRoutes = require('./src/routes/auth');
const roomRoutes = require('./src/routes/rooms');
const userRoutes = require('./src/routes/users');
const { setupSocketHandlers } = require('./src/socket/handlers');
const { globalRateLimiter } = require('./src/middleware/rateLimiter');
const errorHandler = require('./src/middleware/errorHandler');

const app = express();
const server = http.createServer(app);

// Render/most cloud hosts run behind a reverse proxy — required for
// correct client IPs (express-rate-limit throws without this).
app.set('trust proxy', 1);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

connectDB();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
      },
    },
  })
);
app.use(compression());
app.use(morgan('dev'));
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api/', globalRateLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/users', userRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));


// ── SERVE REACT FRONTEND (production) ─────────────────
const path = require('path');
const fs = require('fs');
const FRONTEND_BUILD = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(FRONTEND_BUILD)) {
  app.use(express.static(FRONTEND_BUILD));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(FRONTEND_BUILD, 'index.html'));
  });
}

setupSocketHandlers(io);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🎬 WatchTogether Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Client URL: ${CLIENT_URL}\n`);
});