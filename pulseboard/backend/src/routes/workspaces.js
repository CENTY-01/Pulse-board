import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Math.random().toString(36).slice(2, 6);
}

// List workspaces the current user belongs to
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT w.*, wm.role FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = ?
    ORDER BY w.created_at DESC
  `).all(req.user.id);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const id = uuid();
  const now = Date.now();
  const slug = slugify(name);

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO workspaces (id, name, slug, owner_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, name, slug, req.user.id, now);
    db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .run(id, req.user.id, 'owner', now);
  });
  tx();

  res.status(201).json({ id, name, slug, owner_id: req.user.id, created_at: now, role: 'owner' });
});

// Invite / join by workspace id (simplified — real product would use invite tokens)
router.post('/:id/join', (req, res) => {
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(req.params.id);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

  const existing = db.prepare('SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (existing) return res.json({ message: 'Already a member', role: existing.role });

  db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
    .run(req.params.id, req.user.id, 'editor', Date.now());

  res.json({ message: 'Joined workspace', role: 'editor' });
});

function assertMember(req, res, next) {
  const member = db.prepare('SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(req.params.id || req.params.workspaceId, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member of this workspace' });
  req.membership = member;
  next();
}

router.get('/:id/members', assertMember, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.display_name, u.email, u.color, wm.role FROM workspace_members wm
    JOIN users u ON u.id = wm.user_id
    WHERE wm.workspace_id = ?
  `).all(req.params.id);
  res.json(rows);
});

export default router;
export { assertMember };
