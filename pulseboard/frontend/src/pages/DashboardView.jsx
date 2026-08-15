import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useDashboardSocket } from '../hooks/useDashboardSocket.js';
import Widget from '../components/Widget.jsx';
import CommentsPanel from '../components/CommentsPanel.jsx';
import LiveCursors from '../components/LiveCursors.jsx';

const AVATAR_COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#ef4444'];
function colorFor(userId) {
  let hash = 0;
  for (const ch of userId) hash = ch.charCodeAt(0) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function DashboardView({ dashboardId }) {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [widgets, setWidgets] = useState([]);
  const [comments, setComments] = useState([]);
  const containerRef = useRef(null);

  const {
    connected, presentUsers, cursors, conflict, setConflict,
    on, emitCursor, updateWidget, deleteWidget, addComment
  } = useDashboardSocket(dashboardId);

  useEffect(() => {
    api.get(`/dashboards/${dashboardId}`).then(({ data }) => {
      setDashboard(data);
      setWidgets(data.widgets);
      setComments(data.comments);
    });
  }, [dashboardId]);

  useEffect(() => {
    const offCreated = on('widget:created', (w) => setWidgets((prev) => [...prev, w]));
    const offUpdated = on('widget:updated', (w) =>
      setWidgets((prev) => prev.map((x) => (x.id === w.id ? { ...x, ...w } : x)))
    );
    const offDeleted = on('widget:deleted', ({ widgetId }) =>
      setWidgets((prev) => prev.filter((w) => w.id !== widgetId))
    );
    const offComment = on('comment:added', (c) => setComments((prev) => [...prev, c]));
    return () => { offCreated(); offUpdated(); offDeleted(); offComment(); };
  }, [on]);

  const handleMouseMove = useCallback((e) => {
    emitCursor(e.clientX, e.clientY);
  }, [emitCursor]);

  async function addWidget(type) {
    const defaults = {
      metric: { title: 'New Metric', value: 0, delta: '+0%' },
      chart: { title: 'New Chart', metric: 'active_users' },
      text: { title: 'Notes', body: 'Click to edit…' }
    };
    const { data } = await api.post(`/dashboards/${dashboardId}/widgets`, {
      type, config: defaults[type] || {}
    });
    // Server also broadcasts via socket, but we add locally for instant feedback
    setWidgets((prev) => (prev.find((w) => w.id === data.id) ? prev : [...prev, data]));
  }

  if (!dashboard) return <div className="empty-state">Loading dashboard…</div>;

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }} onMouseMove={handleMouseMove}>
      <div className="main-area" ref={containerRef}>
        <div className="toolbar">
          <h2 style={{ margin: 0, marginRight: 12 }}>{dashboard.name}</h2>
          <span className="badge">{connected ? '🟢 live' : '🔴 reconnecting…'}</span>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="presence-stack">
              <div className="avatar" style={{ background: colorFor(user.id) }} title={user.displayName}>
                {user.displayName[0].toUpperCase()}
              </div>
              {presentUsers.map((p) => (
                <div key={p.userId} className="avatar" style={{ background: colorFor(p.userId) }} title={p.name}>
                  {p.name[0].toUpperCase()}
                </div>
              ))}
            </div>
            <button className="btn secondary" onClick={() => addWidget('metric')}>+ Metric</button>
            <button className="btn secondary" onClick={() => addWidget('chart')}>+ Chart</button>
            <button className="btn secondary" onClick={() => addWidget('text')}>+ Note</button>
          </div>
        </div>

        {conflict && (
          <div className="conflict-banner">
            ⚠️ Someone else updated "{conflict.widgetId}" while you were editing. Your local view has been refreshed to the latest version.
            <button
              className="btn secondary"
              style={{ marginLeft: 12, padding: '4px 10px' }}
              onClick={() => {
                setWidgets((prev) => prev.map((w) => (w.id === conflict.widgetId ? conflict.serverWidget : w)));
                setConflict(null);
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {widgets.length === 0 ? (
          <div className="empty-state">
            <p>This dashboard is empty. Add a widget to get started.</p>
          </div>
        ) : (
          <div className="dashboard-grid">
            {widgets.map((w) => (
              <Widget
                key={w.id}
                widget={w}
                workspaceId={dashboard.workspace_id}
                onUpdate={(patch) => updateWidget(w.id, patch, w.version)}
                onDelete={() => deleteWidget(w.id)}
              />
            ))}
          </div>
        )}
      </div>

      <CommentsPanel comments={comments} onAdd={(body) => addComment(body)} />

      <LiveCursors cursors={cursors} colorFor={colorFor} />
    </div>
  );
}
