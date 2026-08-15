import { verifyToken } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { v4 as uuid } from 'uuid';

// In-memory presence map: dashboardId -> Map<socketId, presenceInfo>
// This is process-local. A multi-instance deployment would move this to
// Redis (pub/sub or Redis adapter for Socket.IO) — noted in README.
const presence = new Map();

export function registerSocketHandlers(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const payload = token ? verifyToken(token) : null;
    if (!payload) return next(new Error('unauthorized'));
    socket.user = { id: payload.sub, email: payload.email, name: payload.name };
    next();
  });

  io.on('connection', (socket) => {
    let currentDashboard = null;

    socket.on('dashboard:join', ({ dashboardId }) => {
      currentDashboard = dashboardId;
      socket.join(`dashboard:${dashboardId}`);

      if (!presence.has(dashboardId)) presence.set(dashboardId, new Map());
      presence.get(dashboardId).set(socket.id, {
        userId: socket.user.id,
        name: socket.user.name,
        x: 0,
        y: 0
      });

      const others = Array.from(presence.get(dashboardId).values())
        .filter(p => p.userId !== socket.user.id);
      socket.emit('presence:sync', others);

      socket.to(`dashboard:${dashboardId}`).emit('presence:join', {
        userId: socket.user.id,
        name: socket.user.name
      });
    });

    socket.on('dashboard:leave', ({ dashboardId }) => {
      leaveDashboard(socket, dashboardId);
    });

    // Cursor broadcast — high frequency, intentionally not persisted
    socket.on('cursor:move', ({ dashboardId, x, y }) => {
      const room = presence.get(dashboardId);
      if (room?.has(socket.id)) {
        const p = room.get(socket.id);
        p.x = x; p.y = y;
      }
      socket.to(`dashboard:${dashboardId}`).emit('cursor:update', {
        userId: socket.user.id,
        name: socket.user.name,
        x, y
      });
    });

    // Widget update with LWW (last-write-wins) conflict resolution.
    // Client sends the version it based its edit on; if the server's
    // current version is higher, the write is rejected and the client
    // is told to refresh — preventing silent overwrites of newer data.
    socket.on('widget:update', ({ dashboardId, widgetId, config, x, y, w, h, baseVersion }) => {
      const widget = db.prepare('SELECT * FROM widgets WHERE id = ?').get(widgetId);
      if (!widget) return socket.emit('widget:error', { widgetId, error: 'Widget not found' });

      if (baseVersion !== undefined && widget.version > baseVersion) {
        // Conflict: someone else wrote a newer version first
        return socket.emit('widget:conflict', {
          widgetId,
          serverWidget: { ...widget, config: JSON.parse(widget.config) }
        });
      }

      const now = Date.now();
      const nextVersion = widget.version + 1;
      const newConfig = config !== undefined ? JSON.stringify(config) : widget.config;
      const newX = x !== undefined ? x : widget.x;
      const newY = y !== undefined ? y : widget.y;
      const newW = w !== undefined ? w : widget.w;
      const newH = h !== undefined ? h : widget.h;

      db.prepare(
        'UPDATE widgets SET config = ?, x = ?, y = ?, w = ?, h = ?, version = ?, updated_by = ?, updated_at = ? WHERE id = ?'
      ).run(newConfig, newX, newY, newW, newH, nextVersion, socket.user.id, now, widgetId);

      db.prepare(
        'INSERT INTO dashboard_revisions (id, dashboard_id, widget_id, user_id, diff, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(uuid(), dashboardId, widgetId, socket.user.id, JSON.stringify({ config, x, y, w, h }), now);

      db.prepare('UPDATE dashboards SET updated_at = ? WHERE id = ?').run(now, dashboardId);

      const updated = {
        id: widgetId, dashboard_id: dashboardId, config: JSON.parse(newConfig),
        x: newX, y: newY, w: newW, h: newH, version: nextVersion,
        updated_by: socket.user.id, updated_at: now
      };

      io.to(`dashboard:${dashboardId}`).emit('widget:updated', updated);
    });

    socket.on('widget:delete', ({ dashboardId, widgetId }) => {
      db.prepare('DELETE FROM widgets WHERE id = ?').run(widgetId);
      io.to(`dashboard:${dashboardId}`).emit('widget:deleted', { widgetId });
    });

    socket.on('comment:add', ({ dashboardId, widgetId, body }) => {
      const id = uuid();
      const now = Date.now();
      db.prepare(
        'INSERT INTO comments (id, dashboard_id, widget_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(id, dashboardId, widgetId || null, socket.user.id, body, now);

      const comment = {
        id, dashboard_id: dashboardId, widget_id: widgetId || null,
        user_id: socket.user.id, body, created_at: now,
        display_name: socket.user.name
      };
      io.to(`dashboard:${dashboardId}`).emit('comment:added', comment);
    });

    socket.on('disconnect', () => {
      if (currentDashboard) leaveDashboard(socket, currentDashboard);
    });
  });
}

function leaveDashboard(socket, dashboardId) {
  socket.leave(`dashboard:${dashboardId}`);
  const room = presence.get(dashboardId);
  if (room) {
    room.delete(socket.id);
    if (room.size === 0) presence.delete(dashboardId);
  }
  socket.to(`dashboard:${dashboardId}`).emit('presence:leave', { userId: socket.user.id });
}
