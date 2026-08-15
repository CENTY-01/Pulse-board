import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function assertWorkspaceMember(workspaceId, userId) {
  return db.prepare('SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(workspaceId, userId);
}

router.get('/', (req, res) => {
  const { workspaceId } = req.query;
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId query param required' });
  if (!assertWorkspaceMember(workspaceId, req.user.id)) return res.status(403).json({ error: 'Forbidden' });

  const rows = db.prepare('SELECT * FROM dashboards WHERE workspace_id = ? ORDER BY updated_at DESC').all(workspaceId);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { workspaceId, name } = req.body;
  if (!workspaceId || !name) return res.status(400).json({ error: 'workspaceId and name are required' });
  if (!assertWorkspaceMember(workspaceId, req.user.id)) return res.status(403).json({ error: 'Forbidden' });

  const id = uuid();
  const now = Date.now();
  db.prepare(
    'INSERT INTO dashboards (id, workspace_id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, workspaceId, name, req.user.id, now, now);

  res.status(201).json({ id, workspace_id: workspaceId, name, created_by: req.user.id, created_at: now, updated_at: now });
});

router.get('/:id', (req, res) => {
  const dash = db.prepare('SELECT * FROM dashboards WHERE id = ?').get(req.params.id);
  if (!dash) return res.status(404).json({ error: 'Dashboard not found' });
  if (!assertWorkspaceMember(dash.workspace_id, req.user.id)) return res.status(403).json({ error: 'Forbidden' });

  const widgets = db.prepare('SELECT * FROM widgets WHERE dashboard_id = ?').all(req.params.id)
    .map(w => ({ ...w, config: JSON.parse(w.config) }));
  const comments = db.prepare('SELECT c.*, u.display_name, u.color FROM comments c JOIN users u ON u.id = c.user_id WHERE c.dashboard_id = ? ORDER BY c.created_at ASC')
    .all(req.params.id);

  res.json({ ...dash, widgets, comments });
});

router.post('/:id/widgets', (req, res) => {
  const dash = db.prepare('SELECT * FROM dashboards WHERE id = ?').get(req.params.id);
  if (!dash) return res.status(404).json({ error: 'Dashboard not found' });
  if (!assertWorkspaceMember(dash.workspace_id, req.user.id)) return res.status(403).json({ error: 'Forbidden' });

  const { type, x = 0, y = 0, w = 4, h = 3, config = {} } = req.body;
  if (!type) return res.status(400).json({ error: 'type is required' });

  const id = uuid();
  const now = Date.now();
  db.prepare(
    'INSERT INTO widgets (id, dashboard_id, type, x, y, w, h, config, version, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
  ).run(id, req.params.id, type, x, y, w, h, JSON.stringify(config), req.user.id, now);

  db.prepare('UPDATE dashboards SET updated_at = ? WHERE id = ?').run(now, req.params.id);

  const widget = { id, dashboard_id: req.params.id, type, x, y, w, h, config, version: 1, updated_by: req.user.id, updated_at: now };
  req.app.get('io')?.to(`dashboard:${req.params.id}`).emit('widget:created', widget);
  res.status(201).json(widget);
});

export default router;
export { assertWorkspaceMember };
