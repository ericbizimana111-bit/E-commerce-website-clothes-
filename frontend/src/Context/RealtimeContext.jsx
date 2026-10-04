import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import apiClient, { API_BASE } from '../api/client';
import { useAuth } from './AuthContext';
import { useToast } from '../Components/Toast/Toast';

/**
 * Live updates for signed-in customers.
 *
 * Opens the server-sent-events stream (/api/realtime/stream) with a
 * short-lived ticket, reconnects with backoff (fetching a fresh ticket each
 * time) and exposes:
 *   - unreadNotifications / unreadMessages counters for the header badges
 *   - subscribe(event, handler) for pages (chat, order tracking...)
 * Pushes are hints: pages re-fetch from the REST API, so a dropped
 * connection never loses data. Counters are also re-synced on focus and
 * every minute as a safety net.
 */
const RealtimeContext = createContext({
  unreadNotifications: 0,
  unreadMessages: 0,
  connected: false,
  subscribe: () => () => {},
  refreshCounts: () => {},
  setUnreadMessages: () => {},
  setUnreadNotifications: () => {}
});

const MAX_BACKOFF_MS = 30000;

export const RealtimeProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const toast = useToast();
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef(new Map());
  const quietRef = useRef({ messages: false });

  const emit = useCallback((event, data) => {
    const set = listenersRef.current.get(event);
    if (set) set.forEach((fn) => {
      try {
        fn(data);
      } catch {
        /* a broken listener must not break the stream */
      }
    });
  }, []);

  const subscribe = useCallback((event, handler) => {
    if (!listenersRef.current.has(event)) listenersRef.current.set(event, new Set());
    listenersRef.current.get(event).add(handler);
    return () => listenersRef.current.get(event)?.delete(handler);
  }, []);

  const refreshCounts = useCallback(async () => {
    if (!isAuthenticated) return;
    const [n, c] = await Promise.allSettled([apiClient.get('/notifications/unread-count'), apiClient.get('/chat/unread-count')]);
    if (n.status === 'fulfilled') setUnreadNotifications(n.value?.data?.unread || 0);
    if (c.status === 'fulfilled') setUnreadMessages(c.value?.data?.unread || 0);
  }, [isAuthenticated]);

  // Stream lifecycle
  useEffect(() => {
    if (!isAuthenticated || typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
      setConnected(false);
      return undefined;
    }
    let source = null;
    let retryTimer = null;
    let attempts = 0;
    let stopped = false;

    const connect = async () => {
      if (stopped) return;
      try {
        const res = await apiClient.post('/realtime/ticket');
        const ticket = res?.data?.ticket;
        if (!ticket || stopped) throw new Error('no ticket');
        source = new window.EventSource(`${API_BASE}/realtime/stream?ticket=${encodeURIComponent(ticket)}`);

        source.addEventListener('ready', () => {
          attempts = 0;
          setConnected(true);
          refreshCounts();
        });
        source.addEventListener('notification', (e) => {
          const data = safeParse(e.data);
          if (!data) return;
          setUnreadNotifications((n) => n + 1);
          if (data.type !== 'NEW_MESSAGE' && toast?.showToast) {
            toast.showToast(`${data.title}: ${data.message}`, { type: 'info', duration: 6000 });
          }
          emit('notification', data);
        });
        source.addEventListener('chat:message', (e) => {
          const data = safeParse(e.data);
          if (!data) return;
          if (data.message?.senderType === 'ADMIN' && !quietRef.current.messages) {
            setUnreadMessages((n) => n + 1);
          }
          emit('chat:message', data);
        });
        ['chat:read', 'service:update', 'order:update'].forEach((name) =>
          source.addEventListener(name, (e) => emit(name, safeParse(e.data)))
        );
        source.onerror = () => {
          setConnected(false);
          source?.close();
          scheduleReconnect();
        };
      } catch {
        scheduleReconnect();
      }
    };

    const scheduleReconnect = () => {
      if (stopped) return;
      attempts += 1;
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(attempts, 5)) + Math.random() * 1000;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, delay);
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      source?.close();
      setConnected(false);
    };
  }, [isAuthenticated, emit, refreshCounts, toast]);

  // Safety-net re-sync
  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadNotifications(0);
      setUnreadMessages(0);
      return undefined;
    }
    refreshCounts();
    const onFocus = () => refreshCounts();
    window.addEventListener('focus', onFocus);
    const timer = setInterval(refreshCounts, 60000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(timer);
    };
  }, [isAuthenticated, refreshCounts]);

  /** The Messages page is open: incoming replies are read immediately. */
  const setMessagesQuiet = useCallback((quiet) => {
    quietRef.current.messages = quiet;
  }, []);

  const value = useMemo(
    () => ({
      unreadNotifications,
      unreadMessages,
      connected,
      subscribe,
      refreshCounts,
      setUnreadMessages,
      setUnreadNotifications,
      setMessagesQuiet
    }),
    [unreadNotifications, unreadMessages, connected, subscribe, refreshCounts, setMessagesQuiet]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
};

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const useRealtime = () => useContext(RealtimeContext);

/** Subscribe a component to a realtime event for its lifetime. */
export function useRealtimeEvent(event, handler) {
  const { subscribe } = useRealtime();
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => subscribe(event, (data) => ref.current(data)), [event, subscribe]);
}
