import test from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Use an isolated throwaway DB for tests
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.DB_PATH = path.join(__dirname, '../../data/test.db');
if (fs.existsSync(process.env.DB_PATH)) fs.unlinkSync(process.env.DB_PATH);

const { db, initSchema } = await import('../db/index.js');
initSchema();

const { default: express } = await import('express');
const { default: authRoutes } = await import('./auth.js');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

function request(app, method, path, body) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      fetch(`http://localhost:${port}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      })
        .then(async (res) => resolve({ status: res.status, body: await res.json() }))
        .finally(() => server.close());
    });
  });
}

test('registers a new user and returns a token', async () => {
  const res = await request(app, 'POST', '/api/auth/register', {
    email: 'test@example.com',
    password: 'password123',
    displayName: 'Test User'
  });
  assert.strictEqual(res.status, 201);
  assert.ok(res.body.token);
  assert.strictEqual(res.body.user.email, 'test@example.com');
});

test('rejects duplicate email registration', async () => {
  const res = await request(app, 'POST', '/api/auth/register', {
    email: 'test@example.com',
    password: 'password123',
    displayName: 'Duplicate'
  });
  assert.strictEqual(res.status, 409);
});

test('rejects login with wrong password', async () => {
  const res = await request(app, 'POST', '/api/auth/login', {
    email: 'test@example.com',
    password: 'wrongpassword'
  });
  assert.strictEqual(res.status, 401);
});

test('logs in with correct credentials', async () => {
  const res = await request(app, 'POST', '/api/auth/login', {
    email: 'test@example.com',
    password: 'password123'
  });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.token);
});

test.after(() => {
  db.close();
  if (fs.existsSync(process.env.DB_PATH)) fs.unlinkSync(process.env.DB_PATH);
});
