import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { assertWorkspaceMember } from './dashboards.js';

const router = Router();
router.use(requireAuth);

// Returns time series for a metric, generating a realistic-looking synthetic
// series on first request so the dashboard has something to render out of
// the box (a real deployment would ingest from an actual metrics pipeline).
router.get('/', (req, res) => {
  const { workspaceId, metric = 'active_users', hours = 24 } = req.query;
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });
  if (!assertWorkspaceMember(workspaceId, req.user.id)) return res.status(403).json({ error: 'Forbidden' });

  const count = db.prepare('SELECT COUNT(*) as c FROM metric_points WHERE workspace_id = ? AND metric_name = ?')
    .get(workspaceId, metric);

  if (count.c === 0) {
    const now = Date.now();
    const insert = db.prepare('INSERT INTO metric_points (workspace_id, metric_name, value, ts) VALUES (?, ?, ?, ?)');
    const tx = db.transaction(() => {
      let base = 50 + Math.random() * 100;
      for (let i = Number(hours) * 4; i >= 0; i--) {
        base += (Math.random() - 0.5) * 15;
        base = Math.max(5, base);
        insert.run(workspaceId, metric, Math.round(base), now - i * 15 * 60 * 1000);
      }
    });
    tx();
  }

  const points = db.prepare(
    'SELECT value, ts FROM metric_points WHERE workspace_id = ? AND metric_name = ? ORDER BY ts ASC'
  ).all(workspaceId, metric);

  res.json({ metric, points });
});

export default router;
