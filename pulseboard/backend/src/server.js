import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';

import { initSchema } from './db/index.js';
import { registerSocketHandlers } from './socket/index.js';

import authRoutes from './routes/auth.js';
import workspaceRoutes from './routes/workspaces.js';
import dashboardRoutes from './routes/dashboards.js';
import metricsRoutes from './routes/metrics.js';

initSchema();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN || '*' }
});

app.set('io', io);

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/dashboards', dashboardRoutes);
app.use('/api/metrics', metricsRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: Date.now() }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

registerSocketHandlers(io);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`PulseBoard API + WebSocket server listening on :${PORT}`);
});
