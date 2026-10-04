import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Headset, Package, Send, Wrench } from 'lucide-react';
import apiClient from '../../api/client';
import { useLanguage } from '../../Context/LanguageContext';
import { useRealtime, useRealtimeEvent } from '../../Context/RealtimeContext';
import { friendlyError } from '../../utils/errors';
import './Messages.css';

const MAX_LEN = 2000;

/**
 * Customer <-> UgaMarket support chat.
 *   GET  /api/chat              thread (latest 50, ?before= for older)
 *   POST /api/chat/messages     { body, orderId?, serviceRequestId? }
 *   POST /api/chat/read         clear my unread counter
 * New staff replies arrive live over the realtime stream.
 */
const Messages = () => {
  const { t, formatDateTime } = useLanguage();
  const { setUnreadMessages, setMessagesQuiet } = useRealtime();
  const [searchParams] = useSearchParams();
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState(null);
  const [body, setBody] = useState('');
  const [about, setAbout] = useState(() => {
    const order = searchParams.get('order');
    const booking = searchParams.get('booking');
    return order ? `order:${order}` : booking ? `booking:${booking}` : '';
  });
  const [orders, setOrders] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const stickToBottom = useRef(true);

  const markRead = useCallback(() => {
    apiClient.post('/chat/read').catch(() => {});
    setUnreadMessages(0);
  }, [setUnreadMessages]);

  useEffect(() => {
    setMessagesQuiet(true);
    return () => setMessagesQuiet(false);
  }, [setMessagesQuiet]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [thread, ord, bk] = await Promise.allSettled([apiClient.get('/chat'), apiClient.get('/orders?limit=10'), apiClient.get('/service-requests')]);
        if (!alive) return;
        if (thread.status === 'rejected') throw thread.reason;
        setMessages(thread.value.data.messages || []);
        setHasMore(Boolean(thread.value.data.hasMore));
        setConversationId(thread.value.data.conversation?.id || null);
        if (ord.status === 'fulfilled') setOrders(ord.value?.items || []);
        if (bk.status === 'fulfilled') setBookings(bk.value?.data?.requests || []);
        markRead();
      } catch (err) {
        if (alive) setError(friendlyError(err, t, 'errGeneric'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtimeEvent('chat:message', (data) => {
    const msg = data?.message;
    if (!msg || (conversationId && msg.conversationId !== conversationId)) return;
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    if (msg.senderType === 'ADMIN') markRead();
  });

  // Keep the newest message in view unless the customer scrolled up.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const loadOlder = async () => {
    if (!messages.length) return;
    setLoadingOlder(true);
    stickToBottom.current = false;
    const el = listRef.current;
    const prevHeight = el ? el.scrollHeight : 0;
    try {
      const res = await apiClient.get(`/chat?before=${encodeURIComponent(messages[0].createdAt)}`);
      setMessages((prev) => [...(res.data.messages || []), ...prev]);
      setHasMore(Boolean(res.data.hasMore));
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } catch (err) {
      setError(friendlyError(err, t, 'errGeneric'));
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async (e) => {
    e?.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    const [kind, refId] = about.split(':');
    try {
      const res = await apiClient.post('/chat/messages', {
        body: text,
        ...(kind === 'order' ? { orderId: refId } : {}),
        ...(kind === 'booking' ? { serviceRequestId: refId } : {})
      });
      const msg = res?.data?.message;
      if (msg) {
        setConversationId(msg.conversationId);
        stickToBottom.current = true;
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      }
      setBody('');
      setAbout('');
    } catch (err) {
      setError(friendlyError(err, t, 'errGeneric'));
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) send(e);
  };

  return (
    <div className="panel account-card chat">
      <div className="chat__head">
        <span className="chat__avatar">
          <Headset size={20} aria-hidden="true" />
        </span>
        <div>
          <h2>{t('messagesTitle')}</h2>
          <p>{t('messagesSubtitle')}</p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="chat__list" ref={listRef} onScroll={onScroll} aria-live="polite" aria-busy={loading}>
        {loading ? (
          <div className="um-subview-loading" role="status">
            <div className="um-spinner" />
            <p>{t('loading')}</p>
          </div>
        ) : (
          <>
            {hasMore && (
              <button type="button" className="btn btn-secondary btn-sm chat__older" onClick={loadOlder} disabled={loadingOlder}>
                {loadingOlder ? t('loading') : t('loadOlderMessages')}
              </button>
            )}
            {messages.length === 0 && (
              <div className="chat__empty">
                <Headset size={36} strokeWidth={1.4} aria-hidden="true" />
                <strong>{t('chatEmptyTitle')}</strong>
                <p>{t('chatEmptyDesc')}</p>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`bubble ${m.senderType === 'CUSTOMER' ? 'bubble--me' : 'bubble--them'}`}>
                {m.senderType === 'ADMIN' && <span className="bubble__name">{m.senderName || 'UgaMarket'}</span>}
                {m.order && (
                  <Link to={`/account/orders/${m.order.id}`} className="bubble__ref">
                    <Package size={12} aria-hidden="true" /> {m.order.orderNumber}
                  </Link>
                )}
                {m.serviceRequest && (
                  <Link to={`/account/services/${m.serviceRequest.id}`} className="bubble__ref">
                    <Wrench size={12} aria-hidden="true" /> {m.serviceRequest.requestNumber}
                  </Link>
                )}
                <p>{m.body}</p>
                <time dateTime={m.createdAt}>{formatDateTime(m.createdAt)}</time>
              </div>
            ))}
          </>
        )}
      </div>

      <form className="chat__composer" onSubmit={send}>
        {(orders.length > 0 || bookings.length > 0) && (
          <select className="form-select chat__about" value={about} onChange={(e) => setAbout(e.target.value)} aria-label={t('chatAbout')}>
            <option value="">{t('chatAboutGeneral')}</option>
            {orders.length > 0 && (
              <optgroup label={t('orders')}>
                {orders.map((o) => (
                  <option key={o.id} value={`order:${o.id}`}>
                    {o.orderNumber}
                  </option>
                ))}
              </optgroup>
            )}
            {bookings.length > 0 && (
              <optgroup label={t('myServices')}>
                {bookings.map((b) => (
                  <option key={b.id} value={`booking:${b.id}`}>
                    {b.requestNumber} — {b.service?.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        )}
        <div className="chat__input">
          <textarea
            className="form-textarea"
            rows={2}
            placeholder={t('chatPlaceholder')}
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX_LEN))}
            onKeyDown={onKeyDown}
            aria-label={t('chatPlaceholder')}
          />
          <button type="submit" className="btn btn-primary chat__send" disabled={sending || !body.trim()} aria-label={t('send')}>
            <Send size={18} aria-hidden="true" />
            <span>{t('send')}</span>
          </button>
        </div>
        <span className="input-hint">{t('chatHint')}</span>
      </form>
    </div>
  );
};

export default Messages;
