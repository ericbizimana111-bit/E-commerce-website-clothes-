import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Package, Phone, Search, Send, Wrench } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../components/feedback/Toast';
import StatusBadge from '../../components/ui/StatusBadge';
import { useRealtime, useRealtimeEvent } from '../../context/RealtimeContext';
import { formatDateTime, formatRelative, formatUGX } from '../../utils/format';
import './MessagesPage.css';

/**
 * Customer support inbox.
 *   GET  /api/admin/chat/conversations           list (+ unreadTotal)
 *   POST /api/admin/chat/conversations {userId}  open/create a thread
 *   GET  /api/admin/chat/conversations/:id       thread + customer context
 *   POST /api/admin/chat/conversations/:id/messages
 *   POST /api/admin/chat/conversations/:id/read
 */
export default function MessagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const { refresh } = useRealtime();
  const [conversations, setConversations] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [activeId, setActiveId] = useState(searchParams.get('c'));
  const [thread, setThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [body, setBody] = useState('');
  const [about, setAbout] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  const loadList = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (search.trim()) params.set('search', search.trim());
      if (unreadOnly) params.set('unread', 'true');
      const res = await api.get(`/admin/chat/conversations?${params}`);
      setConversations(res?.data?.items || []);
    } catch (err) {
      showToast(err.message || 'Unable to load conversations.', { type: 'error' });
    } finally {
      setListLoading(false);
    }
  }, [search, unreadOnly, showToast]);

  useEffect(() => {
    const timer = setTimeout(loadList, 250);
    return () => clearTimeout(timer);
  }, [loadList]);

  // Deep link from an order/customer: ?customer=<userId> opens (or creates) the thread.
  useEffect(() => {
    const customerId = searchParams.get('customer');
    if (!customerId) return;
    api
      .post('/admin/chat/conversations', { userId: customerId })
      .then((res) => {
        const id = res?.data?.conversation?.id;
        if (id) {
          setActiveId(id);
          setSearchParams({ c: id }, { replace: true });
        }
      })
      .catch((err) => showToast(err.message || 'Could not open the conversation.', { type: 'error' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadThread = useCallback(
    async (id) => {
      if (!id) return;
      setThreadLoading(true);
      try {
        const res = await api.get(`/admin/chat/conversations/${id}`);
        setThread(res?.data || null);
        await api.post(`/admin/chat/conversations/${id}/read`);
        setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, adminUnread: 0 } : c)));
        refresh();
      } catch (err) {
        showToast(err.message || 'Unable to load the conversation.', { type: 'error' });
      } finally {
        setThreadLoading(false);
      }
    },
    [refresh, showToast],
  );

  useEffect(() => {
    if (activeId) loadThread(activeId);
  }, [activeId, loadThread]);

  useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [thread?.messages?.length]);

  useRealtimeEvent('chat:message', ({ message, conversation }) => {
    setConversations((prev) => {
      const others = prev.filter((c) => c.id !== conversation.id);
      const isOpen = conversation.id === activeId;
      return [{ ...conversation, adminUnread: isOpen ? 0 : conversation.adminUnread }, ...others];
    });
    if (conversation.id === activeId) {
      setThread((prev) => (prev && !prev.messages.some((m) => m.id === message.id) ? { ...prev, messages: [...prev.messages, message] } : prev));
      if (message.senderType === 'CUSTOMER') {
        api.post(`/admin/chat/conversations/${activeId}/read`).then(refresh).catch(() => {});
      }
    }
  });

  const select = (id) => {
    setActiveId(id);
    setSearchParams({ c: id }, { replace: true });
    setBody('');
    setAbout('');
  };

  const send = async (e) => {
    e?.preventDefault();
    const text = body.trim();
    if (!text || !activeId || sending) return;
    setSending(true);
    const [kind, refId] = about.split(':');
    try {
      const res = await api.post(`/admin/chat/conversations/${activeId}/messages`, {
        body: text,
        ...(kind === 'order' ? { orderId: refId } : {}),
        ...(kind === 'booking' ? { serviceRequestId: refId } : {}),
      });
      const msg = res?.data?.message;
      if (msg) setThread((prev) => (prev && !prev.messages.some((m) => m.id === msg.id) ? { ...prev, messages: [...prev.messages, msg] } : prev));
      setBody('');
      setAbout('');
    } catch (err) {
      showToast(err.message || 'Message not sent.', { type: 'error' });
    } finally {
      setSending(false);
    }
  };

  const customer = thread?.conversation?.customer;
  const ctx = thread?.context || { recentOrders: [], recentBookings: [] };

  return (
    <div className={`inbox ${activeId ? 'inbox--thread' : ''}`}>
      <aside className="inbox__list panel">
        <div className="inbox__list-head">
          <h1>Messages</h1>
          <div className="search-input">
            <Search size={15} className="search-input__icon" aria-hidden="true" />
            <input type="search" placeholder="Search name or phone" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search conversations" />
          </div>
          <label className="toolbar__check">
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> Unread only
          </label>
        </div>
        {listLoading ? (
          <p className="inbox__empty">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="inbox__empty">No conversations yet. Customers can message you from their account.</p>
        ) : (
          <ul>
            {conversations.map((c) => (
              <li key={c.id}>
                <button type="button" className={`convo ${c.id === activeId ? 'convo--active' : ''} ${c.adminUnread > 0 ? 'convo--unread' : ''}`} onClick={() => select(c.id)}>
                  <span className="convo__avatar">{(c.customer?.fullName || '?').charAt(0).toUpperCase()}</span>
                  <span className="convo__body">
                    <span className="convo__top">
                      <strong>{c.customer?.fullName || 'Customer'}</strong>
                      <small>{formatRelative(c.lastMessageAt)}</small>
                    </span>
                    <span className="convo__last">{c.lastMessage}</span>
                  </span>
                  {c.adminUnread > 0 && <span className="convo__count">{c.adminUnread}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="inbox__thread panel">
        {!activeId ? (
          <div className="inbox__placeholder">
            <MessageCircle size={40} strokeWidth={1.4} aria-hidden="true" />
            <p>Select a conversation to read and reply.</p>
          </div>
        ) : threadLoading && !thread ? (
          <p className="inbox__empty">Loading conversation…</p>
        ) : thread ? (
          <>
            <header className="thread__head">
              <button type="button" className="btn btn--ghost btn--sm thread__back" onClick={() => setActiveId(null)}>
                <ArrowLeft size={14} aria-hidden="true" /> Back
              </button>
              <div>
                <strong>{customer?.fullName}</strong>
                <span>
                  {customer?.phone && (
                    <a href={`tel:${customer.phone}`}>
                      <Phone size={12} aria-hidden="true" /> {customer.phone}
                    </a>
                  )}
                  {customer?.email && <> · {customer.email}</>}
                </span>
              </div>
            </header>

            <div className="thread__messages" ref={listRef}>
              {thread.messages.map((m) => (
                <div key={m.id} className={`msg ${m.senderType === 'ADMIN' ? 'msg--staff' : 'msg--customer'}`}>
                  {m.senderType === 'ADMIN' && <span className="msg__name">{m.senderName}</span>}
                  {m.order && (
                    <Link to={`/orders/${m.order.id}`} className="msg__ref">
                      <Package size={11} aria-hidden="true" /> {m.order.orderNumber}
                    </Link>
                  )}
                  {m.serviceRequest && (
                    <Link to={`/service-requests/${m.serviceRequest.id}`} className="msg__ref">
                      <Wrench size={11} aria-hidden="true" /> {m.serviceRequest.requestNumber}
                    </Link>
                  )}
                  <p>{m.body}</p>
                  <time title={formatDateTime(m.createdAt)}>{formatRelative(m.createdAt)}</time>
                </div>
              ))}
              {thread.messages.length === 0 && <p className="inbox__empty">No messages yet — say hello.</p>}
            </div>

            <form className="thread__composer" onSubmit={send}>
              {(ctx.recentOrders.length > 0 || ctx.recentBookings.length > 0) && (
                <select value={about} onChange={(e) => setAbout(e.target.value)} aria-label="Reference">
                  <option value="">No reference</option>
                  {ctx.recentOrders.map((o) => (
                    <option key={o.id} value={`order:${o.id}`}>
                      Order {o.orderNumber}
                    </option>
                  ))}
                  {ctx.recentBookings.map((b) => (
                    <option key={b.id} value={`booking:${b.id}`}>
                      Booking {b.requestNumber}
                    </option>
                  ))}
                </select>
              )}
              <div className="thread__input">
                <textarea
                  rows={2}
                  placeholder="Write a reply… (Enter to send, Shift+Enter for a new line)"
                  value={body}
                  onChange={(e) => setBody(e.target.value.slice(0, 2000))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) send(e);
                  }}
                  aria-label="Reply"
                />
                <button type="submit" className="btn btn--primary" disabled={sending || !body.trim()}>
                  <Send size={15} aria-hidden="true" /> Send
                </button>
              </div>
            </form>
          </>
        ) : null}
      </section>

      {thread && activeId && (
        <aside className="inbox__context panel">
          <h3>Recent orders</h3>
          {ctx.recentOrders.length === 0 ? (
            <p className="text-muted">No orders.</p>
          ) : (
            <ul>
              {ctx.recentOrders.map((o) => (
                <li key={o.id}>
                  <Link to={`/orders/${o.id}`} className="ctx-row">
                    <span className="mono">{o.orderNumber}</span>
                    <StatusBadge status={o.status} />
                    <small>{formatUGX(o.totalAmount)}</small>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <h3>Service bookings</h3>
          {ctx.recentBookings.length === 0 ? (
            <p className="text-muted">No bookings.</p>
          ) : (
            <ul>
              {ctx.recentBookings.map((b) => (
                <li key={b.id}>
                  <Link to={`/service-requests/${b.id}`} className="ctx-row">
                    <span className="mono">{b.requestNumber}</span>
                    <StatusBadge status={b.status} kind="booking" />
                    <small>{b.serviceName}</small>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}
    </div>
  );
}
