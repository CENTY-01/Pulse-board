import { useState, useRef, useEffect } from 'react';

export default function CommentsPanel({ comments, onAdd }) {
  const [body, setBody] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  function submit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    onAdd(body.trim());
    setBody('');
  }

  return (
    <div className="comments-panel">
      <h3 style={{ marginTop: 0 }}>Comments</h3>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {comments.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>No comments yet. Say something!</p>
        )}
        {comments.map((c) => (
          <div className="comment" key={c.id}>
            <div className="author" style={{ color: c.color || 'var(--accent)' }}>{c.display_name}</div>
            {c.body}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} style={{ marginTop: 10 }}>
        <textarea
          rows={2}
          placeholder="Leave a comment…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e); }
          }}
        />
        <button className="btn" style={{ width: '100%', marginTop: 8 }} type="submit">Post</button>
      </form>
    </div>
  );
}
