# PulseBoard

**Real-time collaborative analytics dashboards** — think Figma's live cursors + Datadog's charts. Multiple users build and edit dashboards together in the same room, see each other's cursors, comment inline, and never silently overwrite each other's work.

Built to demonstrate: real-time system design, WebSocket architecture, conflict resolution, multi-tenant auth, and full-stack product thinking — not just CRUD.

## What it does

- **Multi-tenant workspaces** — sign up, create a workspace (like a company/team), invite others
- **Live dashboards** — add metric tiles, time-series charts, and text notes to a shared canvas
- **Real-time sync over WebSockets** — every widget edit, comment, and cursor movement broadcasts instantly to everyone viewing the same dashboard
- **Presence** — see who else is looking at the dashboard right now, with colored avatars and live cursor labels
- **Conflict handling** — widget edits carry a version number. If two people edit the same widget at once, the second write is rejected with a conflict notice instead of silently clobbering the first (see [Conflict resolution](#conflict-resolution) below)
- **Comment threads** — leave comments on a dashboard, visible to everyone in real time

## Architecture

```
┌─────────────┐         WebSocket          ┌──────────────┐
│   React     │ ◄─────────────────────────► │  Node.js /   │
│  (Vite)     │                             │  Express +   │
│             │ ◄────── REST (JSON) ──────► │  Socket.IO   │
└─────────────┘                             └──────┬───────┘
                                                    │
                                              ┌─────▼──────┐
                                              │  SQLite    │
                                              │ (WAL mode) │
                                              └────────────┘
```

- **Frontend:** React 18, Vite, React Router, Recharts for charts, `socket.io-client` for real-time
- **Backend:** Node.js, Express (REST API for auth/CRUD), Socket.IO (real-time widget sync, presence, cursors, comments)
- **Database:** SQLite via `better-sqlite3`, synchronous and fast for this workload; WAL mode enabled for concurrent reads during writes
- **Auth:** JWT, bcrypt-hashed passwords, per-route middleware
- **Deployment:** Dockerized (backend + nginx-served frontend), `docker-compose` for one-command local spin-up, GitHub Actions CI running tests + Docker builds on every push

### Conflict resolution

Each widget carries a `version` integer. When a client edits a widget, it sends the version it based its edit on (`baseVersion`). The server only applies the write if `baseVersion >= current version`; otherwise it rejects the write and pushes the caller the current server state, which the UI surfaces as a dismissible conflict banner.

**This is intentionally a simplified last-write-wins (LWW) strategy, not a full CRDT.** A true CRDT (e.g. field-level LWW-maps or JSON-CRDTs like Yjs/Automerge) would merge divergent concurrent edits at the field level instead of rejecting one side outright. That's the natural next step — noted in [Roadmap](#roadmap) — and would be the right call before this handled truly high-concurrency editing (e.g. 10+ people fighting over one widget).

### Scaling notes

This runs as a single process, which is fine for a demo/portfolio deployment. To take it further:
- **Horizontal scaling:** Socket.IO's in-memory presence map (`socket/index.js`) is process-local. Running multiple backend instances would need the [Redis adapter for Socket.IO](https://socket.io/docs/v4/redis-adapter/) so rooms/broadcasts work across instances.
- **Database:** SQLite is single-writer. At real multi-tenant scale you'd move to Postgres (+ TimescaleDB for the metric time-series table, which is already modeled as append-only points).
- **Rate limiting:** currently only on auth endpoints; a production deployment would rate-limit the WebSocket event handlers too (especially `cursor:move`, which is high-frequency).

## Running it locally

### Option A — Docker (recommended, one command)

```bash
docker compose up --build
```

Then open **http://localhost:8080**. The backend API runs on `:4000` behind the scenes.

### Option B — manual (two terminals)

```bash
# Terminal 1 — backend
cd backend
cp .env.example .env
npm install
npm run dev          # http://localhost:4000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev           # http://localhost:5173
```

Open two browser windows (or one normal + one incognito) at `localhost:5173`, register two different accounts, join the same workspace, and open the same dashboard in both — you'll see live cursors and instant widget sync.

## Running tests

```bash
cd backend
npm test
```

Covers the auth flow (registration, duplicate-email rejection, login, invalid credentials). The widget/socket layer is a natural next target for integration tests — see Roadmap.

## Project structure

```
pulseboard/
├── backend/
│   ├── src/
│   │   ├── db/           # SQLite schema + connection
│   │   ├── middleware/   # JWT auth
│   │   ├── routes/       # REST endpoints (auth, workspaces, dashboards, metrics)
│   │   ├── socket/       # Real-time event handlers (the core of the app)
│   │   └── server.js
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/   # Widget, CommentsPanel, LiveCursors
│   │   ├── hooks/        # useAuth, useDashboardSocket
│   │   ├── pages/        # Login, Register, Workspace, DashboardView
│   │   └── lib/api.js
│   └── Dockerfile
├── docker-compose.yml
└── .github/workflows/ci.yml
```

## Roadmap

- [ ] Field-level CRDT (Yjs/Automerge) instead of whole-widget LWW, for true concurrent editing
- [ ] Drag-to-reposition and resize widgets (currently fixed grid spans)
- [ ] Postgres + TimescaleDB backend for production-scale metric ingestion
- [ ] Redis adapter for multi-instance Socket.IO deployments
- [ ] Role-based permissions enforcement (viewer role currently isn't restricted from editing)
- [ ] Integration tests for the Socket.IO event handlers

## License

MIT — use this however you'd like.
