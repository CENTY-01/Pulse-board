import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../lib/api.js';

const SPAN = { metric: 3, chart: 6, text: 3 };

export default function Widget({ widget, workspaceId, onUpdate, onDelete }) {
  return (
    <div className="widget" style={{ gridColumn: `span ${SPAN[widget.type] || 4}` }}>
      <div className="widget-header">
        <span className="widget-title">{widget.config.title || widget.type}</span>
        <div className="widget-actions">
          <button onClick={onDelete}>✕</button>
        </div>
      </div>
      {widget.type === 'metric' && <MetricWidget widget={widget} onUpdate={onUpdate} />}
      {widget.type === 'chart' && <ChartWidget widget={widget} workspaceId={workspaceId} />}
      {widget.type === 'text' && <TextWidget widget={widget} onUpdate={onUpdate} />}
    </div>
  );
}

function MetricWidget({ widget, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(widget.config.value ?? 0);

  useEffect(() => setValue(widget.config.value ?? 0), [widget.config.value]);

  function commit() {
    setEditing(false);
    onUpdate({ config: { ...widget.config, value: Number(value) } });
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      {editing ? (
        <input
          autoFocus
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
      ) : (
        <div className="metric-value" onClick={() => setEditing(true)} style={{ cursor: 'text' }}>
          {value}
        </div>
      )}
      <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 6 }}>
        {widget.config.delta || ''} · click value to edit
      </div>
    </div>
  );
}

function ChartWidget({ widget, workspaceId }) {
  const [points, setPoints] = useState([]);

  useEffect(() => {
    api.get('/metrics', { params: { workspaceId, metric: widget.config.metric || 'active_users' } })
      .then(({ data }) => {
        setPoints(data.points.map((p) => ({
          time: new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          value: p.value
        })));
      });
  }, [workspaceId, widget.config.metric]);

  return (
    <div style={{ flex: 1, minHeight: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <XAxis dataKey="time" hide />
          <YAxis width={30} tick={{ fontSize: 10, fill: '#8b91a5' }} />
          <Tooltip
            contentStyle={{ background: '#171b28', border: '1px solid #232838', borderRadius: 8, fontSize: 12 }}
          />
          <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TextWidget({ widget, onUpdate }) {
  const [body, setBody] = useState(widget.config.body || '');

  useEffect(() => setBody(widget.config.body || ''), [widget.config.body]);

  return (
    <textarea
      value={body}
      onChange={(e) => setBody(e.target.value)}
      onBlur={() => onUpdate({ config: { ...widget.config, body } })}
      style={{ flex: 1, resize: 'none', border: 'none', background: 'transparent', padding: 0 }}
    />
  );
}
