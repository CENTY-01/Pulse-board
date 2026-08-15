import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from '../db/index.js';
import { signToken } from '../middleware/auth.js';

const router = Router();

const PALETTE = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6'];

router.post('/register', (req, res) => {
  const { email, password, displayName } = req.body;
  if (!email || !password || !displayName) {
    return res.status(400).json({ error: 'email, password, and displayName are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const id = uuid();
  const hash = bcrypt.hashSync(password, 10);
  const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];

  db.prepare(
    'INSERT INTO users (id, email, password_hash, display_name, color, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, email.toLowerCase(), hash, displayName, color, Date.now());

  const user = { id, email: email.toLowerCase(), display_name: displayName };
  const token = signToken(user);
  res.status(201).json({ token, user: { id, email: user.email, displayName, color } });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signToken(row);
  res.json({
    token,
    user: { id: row.id, email: row.email, displayName: row.display_name, color: row.color }
  });
});

export default router;
