import { useEffect, useState, useCallback } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.jsx';
import DashboardView from './DashboardView.jsx';

export default function Workspace() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [dashboards, setDashboards] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadWorkspaces = useCallback(async () => {
    const { data } = await api.get('/workspaces');
    setWorkspaces(data);
    if (data.length && !activeWorkspace) setActiveWorkspace(data[0]);
    setLoading(false);
  }, [activeWorkspace]);

  useEffect(() => { loadWorkspaces(); }, []);

  useEffect(() => {
    if (!activeWorkspace) return;
    api.get('/dashboards', { params: { workspaceId: activeWorkspace.id } })
      .then(({ data }) => setDashboards(data));
  }, [activeWorkspace]);

  async function createWorkspace() {
    const name = prompt('Workspace name (e.g. your company):');
    if (!name) return;
    const { data } = await api.post('/workspaces', { name });
    setWorkspaces((prev) => [data, ...prev]);
    setActiveWorkspace(data);
  }

  async function createDashboard() {
    if (!activeWorkspace) return;
    const name = prompt('Dashboard name:');
    if (!name) return;
    const { data } = await api.post('/dashboards', { workspaceId: activeWorkspace.id, name });
    setDashboards((prev) => [data, ...prev]);
    nav(`/dashboard/${data.id}`);
  }

  if (loading) return <div className="empty-state">Loading…</div>;

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="logo" style={{ fontSize: 16 }}><span className="dot" /> PulseBoard</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{user.displayName}</span>
          <div className="avatar" style={{ background: user.color, marginLeft: 0 }}>
            {user.displayName?.[0]?.toUpperCase()}
          </div>
          <button className="btn secondary" onClick={logout}>Sign out</button>
        </div>
      </div>

      <div className="app-body">
        <div className="sidebar">
          <h3>Workspaces</h3>
          {workspaces.map((w) => (
            <div
              key={w.id}
              className={`list-item ${activeWorkspace?.id === w.id ? 'active' : ''}`}
              onClick={() => setActiveWorkspace(w)}
            >
              {w.name}
              <span className="badge">{w.role}</span>
            </div>
          ))}
          <button className="btn secondary" style={{ width: '100%', marginTop: 10 }} onClick={createWorkspace}>
            + New workspace
          </button>

          <h3>Dashboards</h3>
          {dashboards.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>No dashboards yet.</p>
          )}
          {dashboards.map((d) => (
            <div key={d.id} className="list-item" onClick={() => nav(`/dashboard/${d.id}`)}>
              {d.name}
            </div>
          ))}
          <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={createDashboard}>
            + New dashboard
          </button>
        </div>

        <Routes>
          <Route path="/" element={
            <div className="empty-state">
              <h2>Welcome, {user.displayName} 👋</h2>
              <p>Select a dashboard on the left, or create a new one to get started.</p>
            </div>
          } />
          <Route path="/dashboard/:id" element={<DashboardRoute />} />
        </Routes>
      </div>
    </div>
  );
}

function DashboardRoute() {
  const { id } = useParams();
  return <DashboardView dashboardId={id} />;
}
