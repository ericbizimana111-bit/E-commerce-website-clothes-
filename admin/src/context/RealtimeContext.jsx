import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api, { API_BASE } from '../services/api';
import { useAuth } from './AuthContext';
import { useToast } from '../components/feedback/Toast';

/**
 * Live operations feed for the console.
 *
 * - Opens the SSE stream (/api/realtime/stream) with a short-lived ticket and
 *   reconnects with backoff, so staff see new orders, payments, bookings and
 *   customer messages the moment they happen.
 * - Each alert: toast + chime (toggleable) + desktop notification when the
 *   console tab is in the background (permission-based) + unread badges and
 *   a "(3)" prefix in the browser tab title.
 * - Counters are re-synced from the REST API on connect, on focus and every
 *   minute, so a dropped connection never leaves stale badges.
 */
const RealtimeContext = createContext(null);

const SOUND_KEY = 'ugamarket_admin_sound';
const LOUD_TYPES = new Set(['NEW_ORDER', 'PAYMENT_RECEIVED', 'NEW_SERVICE_REQUEST', 'NEW_MESSAGE']);
const TOAST_TYPE = { NEW_ORDER: 'success', PAYMENT_RECEIVED: 'success', BALANCE_PAID: 'success', PAYMENT_FAILED: 'warning', ORDER_CANCELLED: 'warning', SERVICE_REQUEST_CANCELLED: 'warning' };
const BASE_TITLE = typeof document !== 'undefined' ? document.title : 'UgaMarket';

function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.16);
      osc.stop(now + i * 0.16 + 0.4);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {
    /* audio is best-effort */
  }
}

function readSoundPref() {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function RealtimeProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [connected, setConnected] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [recent, setRecent] = useState([]);
  const [soundOn, setSoundOn] = useState(readSoundPref);
  const [desktopPermission, setDesktopPermission] = useState(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  const listenersRef = useRef(new Map());
  const soundRef = useRef(soundOn);

  useEffect(() => {
    soundRef.current = soundOn;
    try {
      localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off');
    } catch {
      /* non-fatal */
    }
  }, [soundOn]);

  const emit = useCallback((event, data) => {
    listenersRef.current.get(event)?.forEach((fn) => {
      try {
        fn(data);
      } catch {
        /* isolate listener errors */
      }
    });
  }, []);

  const subscribe = useCallback((event, handler) => {
    if (!listenersRef.current.has(event)) listenersRef.current.set(event, new Set());
    listenersRef.current.get(event).add(handler);
    return () => listenersRef.current.get(event)?.delete(handler);
  }, []);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    const [list, chat] = await Promise.allSettled([
      api.get('/admin/notifications?limit=10'),
      api.get('/admin/chat/conversations?limit=1'),
    ]);
    if (list.status === 'fulfilled') {
      setRecent(list.value?.data?.items || []);
      setUnreadNotifications(list.value?.data?.unread || 0);
    }
    if (chat.status === 'fulfilled') setUnreadMessages(chat.value?.data?.unreadTotal || 0);
  }, [isAuthenticated]);

  const handleNotification = useCallback(
    (n) => {
      setRecent((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, 15));
      setUnreadNotifications((c) => c + 1);
      if (n.type !== 'NEW_MESSAGE') {
        showToast(`${n.title} — ${n.message}`, { type: TOAST_TYPE[n.type] || 'info', duration: 8000 });
      }
      if (soundRef.current && LOUD_TYPES.has(n.type)) playChime();
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState === 'hidden') {
        try {
          const desktop = new Notification(n.title, { body: n.message, tag: n.id, icon: '/logo.png' });
          desktop.onclick = () => {
            window.focus();
            if (n.linkUrl) window.location.assign(n.linkUrl);
          };
        } catch {
          /* some browsers require a service worker */
        }
      }
      emit('notification', n);
    },
    [emit, showToast],
  );

  useEffect(() => {
    if (!isAuthenticated || typeof window.EventSource === 'undefined') {
      setConnected(false);
      return undefined;
    }
    let source = null;
    let timer = null;
    let attempts = 0;
    let stopped = false;

    const parse = (e) => {
      try {
        return JSON.parse(e.data);
      } catch {
        return null;
      }
    };

    const connect = async () => {
      if (stopped) return;
      try {
        const res = await api.post('/realtime/ticket');
        const ticket = res?.data?.ticket;
        if (!ticket || stopped) throw new Error('no ticket');
        source = new window.EventSource(`${API_BASE}/realtime/stream?ticket=${encodeURIComponent(ticket)}`);
        source.addEventListener('ready', () => {
          attempts = 0;
          setConnected(true);
          refresh();
        });
        source.addEventListener('notification', (e) => {
          const n = parse(e);
          if (n) handleNotification(n);
        });
        source.addEventListener('chat:message', (e) => {
          const data = parse(e);
          if (!data) return;
          if (data.message?.senderType === 'CUSTOMER') setUnreadMessages((c) => c + 1);
          emit('chat:message', data);
        });
        source.addEventListener('chat:read', (e) => {
          const data = parse(e);
          emit('chat:read', data);
          if (data?.by === 'ADMIN') refresh();
        });
        source.onerror = () => {
          setConnected(false);
          source?.close();
          schedule();
        };
      } catch {
        schedule();
      }
    };
    const schedule = () => {
      if (stopped) return;
      attempts += 1;
      clearTimeout(timer);
      timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(attempts, 5)) + Math.random() * 1000);
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      source?.close();
      setConnected(false);
    };
  }, [isAuthenticated, emit, refresh, handleNotification]);

  useEffect(() => {
    if (!isAuthenticated) {
      setRecent([]);
      setUnreadNotifications(0);
      setUnreadMessages(0);
      return undefined;
    }
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    const interval = setInterval(refresh, 60000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [isAuthenticated, refresh]);

  // "(5) UgaMarket Console" while anything is unread.
  useEffect(() => {
    const total = unreadNotifications + unreadMessages;
    document.title = total > 0 ? `(${total > 99 ? '99+' : total}) ${BASE_TITLE}` : BASE_TITLE;
  }, [unreadNotifications, unreadMessages]);

  const markRead = useCallback(async (ids) => {
    if (!ids.length) return;
    setRecent((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, isRead: true } : n)));
    try {
      const res = await api.patch('/admin/notifications/read', { ids });
      setUnreadNotifications(res?.data?.unread ?? 0);
    } catch {
      /* the next refresh reconciles */
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setRecent((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      const res = await api.patch('/admin/notifications/read-all');
      setUnreadNotifications(res?.data?.unread ?? 0);
    } catch {
      /* reconciled on refresh */
    }
  }, []);

  const enableDesktop = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setDesktopPermission(result);
  }, []);

  const value = useMemo(
    () => ({
      connected,
      unreadNotifications,
      unreadMessages,
      recent,
      soundOn,
      setSoundOn,
      desktopPermission,
      enableDesktop,
      subscribe,
      refresh,
      markRead,
      markAllRead,
      setUnreadMessages,
    }),
    [connected, unreadNotifications, unreadMessages, recent, soundOn, desktopPermission, enableDesktop, subscribe, refresh, markRead, markAllRead],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

const FALLBACK = {
  connected: false,
  unreadNotifications: 0,
  unreadMessages: 0,
  recent: [],
  soundOn: false,
  setSoundOn: () => {},
  desktopPermission: 'unsupported',
  enableDesktop: () => {},
  subscribe: () => () => {},
  refresh: () => {},
  markRead: () => {},
  markAllRead: () => {},
  setUnreadMessages: () => {},
};

export function useRealtime() {
  return useContext(RealtimeContext) || FALLBACK;
}

export function useRealtimeEvent(event, handler) {
  const { subscribe } = useRealtime();
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => subscribe(event, (data) => ref.current(data)), [event, subscribe]);
}
