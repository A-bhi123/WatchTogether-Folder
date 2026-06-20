# 🚀 WatchTogether — Deploy Guide

## ⭐ Recommended: Render.com — Single Web Service (Docker)

Yeh app Socket.IO + WebRTC signaling use karta hai, isliye **Vercel use mat karna**
(serverless functions persistent WebSocket connections support nahi karte — har
request thodi der mein hi kat jaati hai). `vercel.json` files isi liye ignore
kar sakte ho, woh is project ke liye nahi banayi gayi thi.

Backend already configured hai ki woh frontend ka build serve kar de
(`server.js` mein `express.static` + catch-all route), to ek hi Render
**Web Service** (Docker runtime) mein dono frontend + backend deploy ho
jaate hain — alag se static site banane ki zaroorat nahi.

### Steps
1. **MongoDB Atlas** banao (neeche "MongoDB Atlas" section dekho), connection string copy karo.
2. Code ko GitHub repo mein push karo (poora `watchtogether_output` folder).
3. [render.com](https://render.com) → **New** → **Web Service** → apna repo connect karo.
4. Settings:
   - **Root Directory:** (khaali chhodo — root pe hi `Dockerfile` hai)
   - **Runtime:** `Docker`
   - **Dockerfile Path:** `Dockerfile`
   - **Instance Type:** Free
5. **Environment Variables** (Render dashboard → Environment):
   ```
   MONGODB_URI = mongodb+srv://...   (Atlas se copy kiya hua)
   JWT_SECRET  = koi_bhi_random_32+_char_string
   JWT_EXPIRES_IN = 7d
   NODE_ENV    = production
   PORT        = 5000
   CLIENT_URL  = https://your-app-name.onrender.com   (deploy ke baad pata chalega — pehle deploy karo, URL milne ke baad isे set karke "Manual Deploy" se redeploy karo)
   ```
   Render khud `PORT` set karta hai apne system se — agar conflict aaye to Render ka value use hoga, koi dikkat nahi.
6. **Deploy** dabao. Pehli baar build 2-4 min lagega (frontend build + backend install dono Docker ke andar hote hain).
7. Build URL milne ke baad (`https://your-app-name.onrender.com`), step 5 mein `CLIENT_URL` ko isi URL se update karo aur **Manual Deploy → Deploy latest commit** karo. Isse Socket.IO/CORS sahi origin allow karega.

Bas itna hi — same domain pe frontend aur backend dono serve honge, to alag se
`VITE_API_URL` / `VITE_SOCKET_URL` set karne ki zaroorat nahi (Dockerfile mein
ye already empty/relative default rakhe gaye hain, jo same-origin requests
bana dete hain).

### Render Free Tier note
Free Web Services kuch der inactivity ke baad "sleep" ho jaate hain aur agli
request par 30-50 sec mein wake hote hain. Pehli baar room join karte waqt
thoda wait lag sakta hai — yeh error nahi hai, normal free-tier behavior hai.

---

## Option 1: Docker (Sabse Aasan — Local ya VPS)

### Requirements: Docker + Docker Compose

```bash
# Clone/extract project
cd wt_local

# Start everything (MongoDB + Backend + Frontend)
docker compose up -d --build

# App chal raha hai: http://localhost:5000
```

---

## Option 2: Render.com (Free Hosting)

### Backend Deploy (Render Web Service)
1. GitHub pe backend folder push karo
2. Render.com → New Web Service
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
4. Environment Variables:
   ```
   MONGODB_URI = mongodb+srv://...  (MongoDB Atlas se)
   JWT_SECRET  = koi_bhi_long_random_string
   CLIENT_URL  = https://your-frontend.onrender.com
   NODE_ENV    = production
   PORT        = 5000
   ```

### Frontend Deploy (Render Static Site)
1. GitHub pe frontend folder push karo
2. Render.com → New Static Site
3. Settings:
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
4. Environment Variables:
   ```
   VITE_API_URL    = https://your-backend.onrender.com
   VITE_SOCKET_URL = https://your-backend.onrender.com
   ```

---

## Option 3: Railway.app

```bash
# Backend
railway new
railway up  # backend folder se

# Environment Variables set karo Railway dashboard mein:
# MONGODB_URI, JWT_SECRET, CLIENT_URL, NODE_ENV=production
```

---

## Option 4: VPS (Ubuntu) — One Script

```bash
# Server pe:
sudo apt update && sudo apt install -y nodejs npm
cd wt_local

# backend/.env banao
cp backend/.env.production backend/.env
nano backend/.env  # MONGODB_URI aur JWT_SECRET fill karo

# frontend .env banao
echo "VITE_API_URL=https://yourdomain.com" > frontend/.env.production
echo "VITE_SOCKET_URL=https://yourdomain.com" >> frontend/.env.production

# Deploy
chmod +x deploy.sh && ./deploy.sh

# PM2 se start
npm install -g pm2
cd backend && pm2 start server.js --name watchtogether
pm2 save && pm2 startup
```

---

## MongoDB Atlas (Free Database)
1. atlas.mongodb.com → Free cluster banao
2. Database Access → User banao
3. Network Access → 0.0.0.0/0 allow karo
4. Connect → Compass/Driver → Connection string copy karo
5. `.env` mein `MONGODB_URI` mein daalo

---

## Production Checklist
- [ ] `JWT_SECRET` change kiya (random 32+ chars)
- [ ] `MONGODB_URI` Atlas URI set kiya
- [ ] `CLIENT_URL` frontend URL set kiya
- [ ] `VITE_API_URL` backend URL set kiya
- [ ] `NODE_ENV=production` set hai
