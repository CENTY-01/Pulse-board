import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

export function useDashboardSocket(dashboardId) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [presentUsers, setPresentUsers] = useState([]);
  const [cursors, setCursors] = useState({}); // userId -> {x,y,name}
  const [conflict, setConflict] = useState(null);
  const listenersRef = useRef({});

  useEffect(() => {
    if (!dashboardId) return;
    const token = localStorage.getItem('pb_token');
    const socket = io('/', { auth: { token }, path: '/socket.io' });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('dashboard:join', { dashboardId });
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('presence:sync', (users) => setPresentUsers(users));
    socket.on('presence:join', (u) => setPresentUsers((prev) => [...prev, u]));
    socket.on('presence:leave', ({ userId }) =>
      setPresentUsers((prev) => prev.filter((p) => p.userId !== userId))
    );

    socket.on('cursor:update', ({ userId, name, x, y }) => {
      setCursors((prev) => ({ ...prev, [userId]: { name, x, y, t: Date.now() } }));
    });

    socket.on('widget:conflict', (payload) => setConflict(payload));

    // Generic dispatcher so components can subscribe to specific events
    const forward = (event) => (payload) => {
      listenersRef.current[event]?.forEach((cb) => cb(payload));
    };
    ['widget:created', 'widget:updated', 'widget:deleted', 'comment:added'].forEach((evt) => {
      socket.on(evt, forward(evt));
    });

    return () => {
      socket.emit('dashboard:leave', { dashboardId });
      socket.disconnect();
    };
  }, [dashboardId]);

  const on = useCallback((event, cb) => {
    if (!listenersRef.current[event]) listenersRef.current[event] = [];
    listenersRef.current[event].push(cb);
    return () => {
      listenersRef.current[event] = listenersRef.current[event].filter((f) => f !== cb);
    };
  }, []);

  const emitCursor = useCallback((x, y) => {
    socketRef.current?.emit('cursor:move', { dashboardId, x, y });
  }, [dashboardId]);

  const updateWidget = useCallback((widgetId, patch, baseVersion) => {
    socketRef.current?.emit('widget:update', { dashboardId, widgetId, baseVersion, ...patch });
  }, [dashboardId]);

  const deleteWidget = useCallback((widgetId) => {
    socketRef.current?.emit('widget:delete', { dashboardId, widgetId });
  }, [dashboardId]);

  const addComment = useCallback((body, widgetId = null) => {
    socketRef.current?.emit('comment:add', { dashboardId, widgetId, body });
  }, [dashboardId]);

  return {
    connected, presentUsers, cursors, conflict, setConflict,
    on, emitCursor, updateWidget, deleteWidget, addComment
  };
}
