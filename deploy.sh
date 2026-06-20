#!/bin/bash
# ═══════════════════════════════════════════════════════
#  WatchTogether — One-Click Deploy Script
#  Supports: Render, Railway, VPS (Ubuntu/Debian)
# ═══════════════════════════════════════════════════════

set -e
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🎬 WatchTogether Deploy Script${NC}"
echo "========================================"

# Check Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ Node.js not found. Install Node.js 18+ first.${NC}"
  exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo -e "${RED}❌ Node.js 18+ required. Current: $(node -v)${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Node.js $(node -v) found${NC}"

# ── BACKEND ────────────────────────────────────────────
echo ""
echo -e "${YELLOW}📦 Setting up Backend...${NC}"
cd backend
npm install --omit=dev
echo -e "${GREEN}✅ Backend dependencies installed${NC}"

if [ ! -f .env ]; then
  echo -e "${RED}⚠️  backend/.env not found!${NC}"
  echo "Copy .env.production to .env and fill in your values:"
  echo "  cp .env.production .env"
  echo "  nano .env  (set MONGODB_URI, JWT_SECRET, CLIENT_URL)"
  exit 1
fi
echo -e "${GREEN}✅ Backend .env found${NC}"
cd ..

# ── FRONTEND ───────────────────────────────────────────
echo ""
echo -e "${YELLOW}🎨 Building Frontend...${NC}"
cd frontend
npm install

if [ ! -f .env.production ] && [ ! -f .env ]; then
  echo -e "${RED}⚠️  frontend/.env.production not found!${NC}"
  echo "Create frontend/.env.production:"
  echo "  VITE_API_URL=https://your-backend-domain.com"
  echo "  VITE_SOCKET_URL=https://your-backend-domain.com"
  exit 1
fi

npm run build
echo -e "${GREEN}✅ Frontend built → frontend/dist/${NC}"
cd ..

# ── SERVE FRONTEND FROM BACKEND ────────────────────────
echo ""
echo -e "${YELLOW}🔗 Configuring Backend to serve Frontend...${NC}"

# Add static file serving to backend if not already present
if ! grep -q "express.static" backend/server.js; then
  cat >> backend/server.js << 'SERVER_PATCH'

// ── SERVE REACT FRONTEND (production) ─────────────────
const path = require('path');
const FRONTEND_BUILD = path.join(__dirname, '../frontend/dist');
if (require('fs').existsSync(FRONTEND_BUILD)) {
  app.use(express.static(FRONTEND_BUILD));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
      res.sendFile(path.join(FRONTEND_BUILD, 'index.html'));
    }
  });
  console.log('✅ Serving frontend from', FRONTEND_BUILD);
}
SERVER_PATCH
  echo -e "${GREEN}✅ Backend configured to serve frontend${NC}"
else
  echo -e "${GREEN}✅ Static serving already configured${NC}"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Deploy Ready!${NC}"
echo ""
echo "Start production server:"
echo -e "  ${YELLOW}cd backend && node server.js${NC}"
echo ""
echo "Or with PM2 (recommended for VPS):"
echo -e "  ${YELLOW}npm install -g pm2${NC}"
echo -e "  ${YELLOW}cd backend && pm2 start server.js --name watchtogether${NC}"
echo -e "  ${YELLOW}pm2 save && pm2 startup${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
