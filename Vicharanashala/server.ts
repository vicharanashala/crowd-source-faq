import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Route Imports
import authRoutes from './src/backend/routes/authRoutes.js';
import faqRoutes from './src/backend/routes/faqRoutes.js';
import chatRoutes from './src/backend/routes/chatRoutes.js';
import userRoutes from './src/backend/routes/userRoutes.js';
import leaderboardRoutes from './src/backend/routes/leaderboardRoutes.js';
import adminRoutes from './src/backend/routes/adminRoutes.js';

dotenv.config();

const isCjs = typeof __dirname !== 'undefined';
const distPath = isCjs
  ? path.join(__dirname, 'dist')
  : path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');

const app = express();
const PORT = process.env.PORT || 5000;

// Security and utility Middlewares
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      mediaSrc: ["'self'", "blob:", "data:"],
    },
  },
}));

app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/user', userRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Serve frontend assets in production
if (process.env.NODE_ENV === 'production' || process.env.SERVE_STATIC === 'true') {
  app.use(express.static(distPath));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('Yaksha AI Server is running. Start Vite dev server for frontend.');
  });
}

app.listen(PORT, () => {
  console.log(`[Yaksha Server] Flowing on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode.`);
});
