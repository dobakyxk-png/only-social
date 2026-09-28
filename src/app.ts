import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { CONFIG } from './config';
import { authRouter } from './modules/auth/auth.controller';
import { usersRouter } from './modules/users/users.controller';
import { locationRouter } from './modules/location/location.controller';
import { friendsRouter } from './modules/friends/friends.controller';
import { chatRouter } from './modules/chat/chat.controller';
import { feedRouter } from './modules/feed/feed.controller';
import { notificationsRouter } from './modules/notifications/notifications.controller';
import { callingRouter } from './modules/calling/calling.controller';
import { moderationRouter } from './modules/moderation/moderation.controller';
import { ridesRouter } from './modules/rides/rides.controller';
import { routingRouter } from './modules/routing/routing.controller';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Phục vụ tệp tải lên tĩnh (ảnh đại diện, ảnh tin nhắn miễn phí)
app.use('/uploads', express.static(CONFIG.UPLOAD_DIR));

// Phục vụ giao diện Web Client (HTML/JS/CSS)
const candidatePaths = [
  path.join(__dirname, 'public'),
  path.join(__dirname, '../public'),
  path.join(__dirname, '../../src/public'),
  path.resolve(process.cwd(), 'src/public'),
  path.resolve(process.cwd(), 'public'),
];
const publicDir = candidatePaths.find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), 'src/public');
app.use(express.static(publicDir));

app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Public client configuration: Mapbox public token is intended for browser use and is restricted by Mapbox URL scopes.
app.get('/api/config/public.js', (_req: Request, res: Response) => {
  const rawToken = String(CONFIG.MAPBOX_ACCESS_TOKEN || '').trim();
  const rawStyle = String(CONFIG.MAPBOX_STYLE || '').trim();
  const mapboxToken = rawToken.startsWith('pk.eyJ') && rawToken.length > 80 ? rawToken : '';
  const mapboxStyle = rawStyle.includes('mapbox://styles/') ? rawStyle : 'mapbox://styles/mapbox/streets-v12';
  res.type('application/javascript').send(`window.ONLY_PUBLIC_CONFIG=${JSON.stringify({ mapboxToken, mapboxStyle })};`);
});

// API Health Check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    app: 'Only Location-Based Social Network',
    version: '1.0.0-mvp',
    timestamp: new Date().toISOString(),
    nd13Compliant: true,
  });
});

// Đăng ký các Module API Router phiên bản v1
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/location', locationRouter);
app.use('/api/v1/friends', friendsRouter);
app.use('/api/v1/chat', chatRouter);
app.use('/api/v1/feed', feedRouter);
app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/v1/calls', callingRouter);
app.use('/api/v1/moderation', moderationRouter);
app.use('/api/v1/rides', ridesRouter);
app.use('/api/v1/routing', routingRouter);

// Fallback error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Lỗi hệ thống nội bộ',
  });
});

export default app;
