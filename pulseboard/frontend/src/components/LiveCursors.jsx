export default function LiveCursors({ cursors, colorFor }) {
  const now = Date.now();
  return (
    <>
      {Object.entries(cursors).map(([userId, c]) => {
        // Hide stale cursors (user's tab lost focus / stopped moving)
        if (now - c.t > 8000) return null;
        return (
          <div key={userId} className="cursor" style={{ left: c.x, top: c.y }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill={colorFor(userId)}>
              <path d="M4 2 L20 12 L12 13 L9 21 Z" />
            </svg>
            <div className="cursor-label" style={{ background: colorFor(userId) }}>{c.name}</div>
          </div>
        );
      })}
    </>
  );
}
