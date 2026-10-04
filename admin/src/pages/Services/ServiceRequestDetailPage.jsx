import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, ExternalLink, History, Landmark, MapPin, MessageCircle, Phone, RefreshCw, Route, Timer, UserRound, Wallet } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../components/feedback/Toast';
import AdminMap from '../../components/map/AdminMap';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import { DetailSkeleton } from '../../components/ui/loaders';
import { ErrorState } from '../../components/ui/states';
import { useRealtimeEvent } from '../../context/RealtimeContext';
import { directionsUrl, formatDateTime, formatKm, formatMinutes, formatUGX, getBookingStatusMeta } from '../../utils/format';
import './Services.css';

const NEXT = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
};
const PRICE_TYPE = { FIXED: 'Fixed price', HOURLY: 'Per hour', INSPECTION: 'Call-out fee, quote on site' };

/**
 * One home-service booking: customer + verified location + map route,
 * lifecycle actions, technician assignment, quote, schedule and payment.
 */
export default function ServiceRequestDetailPage() {
  const { id } = useParams();
  const { showToast } = useToast();
  const [request, setRequest] = useState(null);
  const [route, setRoute] = useState(null);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null); // 'status' | 'quote' | 'schedule' | 'payment'
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get(`/admin/services/requests/${id}`);
      const r = res?.data?.request;
      setRequest(r);
      if (r?.service?.id) {
        const p = await api.get(`/admin/services/providers?serviceId=${r.service.id}&active=true`).catch(() => null);
        setProviders(p?.data?.providers || []);
      }
    } catch (err) {
      setError(err.message || 'Unable to load booking.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    api
      .get(`/admin/services/requests/${id}/route`)
      .then((res) => setRoute(res?.data?.route || null))
      .catch(() => setRoute(null));
  }, [id, load]);

  useRealtimeEvent('notification', (n) => n.linkUrl === `/service-requests/${id}` && load());

  const update = async (body, success) => {
    setBusy(true);
    try {
      const res = await api.patch(`/admin/services/requests/${id}`, body);
      setRequest(res?.data?.request || request);
      showToast(success, { type: 'success' });
      setDialog(null);
    } catch (err) {
      showToast(err.message || 'Update failed.', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const recordPayment = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/admin/services/requests/${id}/payment`, {
        method: form.method,
        reference: (form.reference || '').trim(),
        ...(form.amountUgx ? { amountUgx: Math.round(Number(form.amountUgx)) } : {}),
      });
      setRequest(res?.data?.request || request);
      showToast('Payment recorded.', { type: 'success' });
      setDialog(null);
    } catch (err) {
      showToast(err.message || 'Could not record payment.', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const advance = (s) => {
    if (s === 'CONFIRMED') {
      setForm({ quotedPriceUgx: request.quotedPriceUgx ?? '' });
      setDialog('confirm');
      return;
    }
    update({ status: s }, `Booking moved to ${getBookingStatusMeta(s).label}.`);
  };

  if (loading) return <DetailSkeleton />;
  if (error || !request) {
    return (
      <div>
        <Link to="/service-requests" className="order-back">
          <ArrowLeft size={14} aria-hidden="true" /> Back to bookings
        </Link>
        <ErrorState message={error || 'Booking not found.'} onRetry={load} />
      </div>
    );
  }

  const a = request.address || {};
  const open = !['COMPLETED', 'CANCELLED'].includes(request.status);
  const next = NEXT[request.status] || [];

  return (
    <div>
      <Link to="/service-requests" className="order-back">
        <ArrowLeft size={14} aria-hidden="true" /> Back to bookings
      </Link>

      <div className="order-detail__header">
        <div>
          <h1 className="mono">{request.requestNumber}</h1>
          <p className="order-detail__meta">
            {request.service?.name} · received {formatDateTime(request.createdAt)}
          </p>
        </div>
        <div className="order-detail__status">
          <StatusBadge status={request.status} kind="booking" />
          <button type="button" className="btn btn--ghost btn--sm" onClick={load}>
            <RefreshCw size={13} aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>

      {open && (
        <div className="panel panel-pad order-transition">
          <h3>Next steps</h3>
          <div className="order-actions">
            {next
              .filter((s) => s !== 'CANCELLED')
              .map((s) => (
                <button
                  key={s}
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={busy}
                  onClick={() => advance(s)}
                >
                  {s === 'CONFIRMED' ? 'Confirm booking' : s === 'IN_PROGRESS' ? 'Technician started' : s === 'COMPLETED' ? 'Mark job completed' : getBookingStatusMeta(s).label}
                </button>
              ))}
            <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={() => { setForm({ quotedPriceUgx: request.quotedPriceUgx ?? '' }); setDialog('quote'); }}>
              <Wallet size={13} aria-hidden="true" /> Set price
            </button>
            <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={() => { setForm({ scheduledAt: request.scheduledAt ? request.scheduledAt.slice(0, 16) : `${request.preferredDate}T09:00` }); setDialog('schedule'); }}>
              <CalendarClock size={13} aria-hidden="true" /> Schedule visit
            </button>
            {next.includes('CANCELLED') && (
              <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={() => { setForm({ note: '' }); setDialog('cancel'); }}>
                Cancel booking
              </button>
            )}
          </div>

          <div className="assign-row">
            <label htmlFor="sr-provider">Technician</label>
            <select
              id="sr-provider"
              value={request.provider?.id || ''}
              disabled={busy}
              onChange={(e) => update({ providerId: e.target.value || null }, e.target.value ? 'Technician assigned and customer notified.' : 'Technician unassigned.')}
            >
              <option value="">— Not assigned —</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} · {p.phone} · {p.activeJobs ?? 0} active job(s)
                </option>
              ))}
            </select>
            {providers.length === 0 && (
              <span className="field-hint">
                No active technician offers this service. <Link to="/technicians">Add one</Link>.
              </span>
            )}
          </div>
        </div>
      )}

      <div className="detail-grid" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="panel panel-pad detail-block">
            <h3>Job location</h3>
            <div className="loc-head">
              <div>
                <strong>{[a.division, a.district].filter(Boolean).join(', ')}</strong>
                <p>{a.formattedAddress || a.streetAddress}</p>
                {a.landmark && (
                  <p className="loc-line">
                    <Landmark size={14} aria-hidden="true" /> {a.landmark}
                  </p>
                )}
                {!a.isVerified && <span className="badge badge--warning">Validated offline — confirm with customer</span>}
              </div>
              {a.latitude != null && (
                <a className="btn btn--secondary btn--sm" href={directionsUrl(a.latitude, a.longitude)} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={13} aria-hidden="true" /> Directions
                </a>
              )}
            </div>
            {route ? (
              <>
                <AdminMap origin={route.origin} destination={route.destination} geometry={route.geometry} height={300} />
                <div className="route-stats">
                  <span>
                    <Route size={14} aria-hidden="true" /> {formatKm(route.distanceKm)} by road
                  </span>
                  <span>
                    <Timer size={14} aria-hidden="true" /> {formatMinutes(route.etaMinutes)}
                  </span>
                  <span className="text-muted">{formatKm(route.straightLineKm)} straight line</span>
                  {route.distanceSource === 'ESTIMATED' && <span className="badge badge--neutral">Estimated</span>}
                </div>
              </>
            ) : (
              <p className="text-muted">Route unavailable.</p>
            )}
          </section>

          <section className="panel panel-pad detail-block">
            <h3>Customer request</h3>
            <p className="sr-desc">{request.description}</p>
            <dl className="kv-list">
              <div className="kv-list__row">
                <dt>Preferred</dt>
                <dd>
                  {request.preferredDate} · {request.preferredSlotLabel}
                </dd>
              </div>
              <div className="kv-list__row">
                <dt>Scheduled</dt>
                <dd>{request.scheduledAt ? formatDateTime(request.scheduledAt) : '—'}</dd>
              </div>
            </dl>
          </section>

          <section className="panel panel-pad detail-block">
            <h3>
              <History size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} /> Activity
            </h3>
            <ol className="history-list">
              {request.events.map((e) => (
                <li key={e.id}>
                  <span className="history-list__change">
                    {e.from && e.from !== e.to ? `${getBookingStatusMeta(e.from).label} → ` : ''}
                    <strong>{getBookingStatusMeta(e.to).label}</strong>
                    {e.note ? ` — ${e.note}` : ''}
                  </span>
                  <span className="history-list__meta">
                    {formatDateTime(e.createdAt)} · {e.adminName || e.actorType.toLowerCase()}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="panel panel-pad detail-block">
            <h3>Customer</h3>
            <dl className="kv-list">
              <div className="kv-list__row">
                <dt>Name</dt>
                <dd>{request.customer?.fullName}</dd>
              </div>
              <div className="kv-list__row">
                <dt>Phone</dt>
                <dd>
                  <a href={`tel:${request.contactPhone}`} className="table-link">
                    <Phone size={12} aria-hidden="true" /> {request.contactPhone}
                  </a>
                </dd>
              </div>
            </dl>
            <Link to={`/messages?customer=${request.customer?.id}`} className="btn btn--secondary btn--sm btn--block" style={{ marginTop: 10 }}>
              <MessageCircle size={14} aria-hidden="true" /> Message customer
            </Link>
          </section>

          <section className="panel panel-pad detail-block">
            <h3>Technician</h3>
            {request.provider ? (
              <div className="tech-card">
                <UserRound size={18} aria-hidden="true" />
                <div>
                  <strong>{request.provider.fullName}</strong>
                  <a href={`tel:${request.provider.phone}`}>{request.provider.phone}</a>
                </div>
              </div>
            ) : (
              <p className="text-muted">Not assigned yet.</p>
            )}
          </section>

          <section className="panel panel-pad detail-block">
            <h3>Price & payment</h3>
            <dl className="kv-list">
              <div className="kv-list__row">
                <dt>Advertised</dt>
                <dd>
                  {formatUGX(request.priceFromUgx)} <small className="text-muted">({PRICE_TYPE[request.priceType]})</small>
                </dd>
              </div>
              <div className="kv-list__row">
                <dt>Agreed price</dt>
                <dd>{request.quotedPriceUgx != null ? formatUGX(request.quotedPriceUgx) : '—'}</dd>
              </div>
              <div className="kv-list__row">
                <dt>Payment</dt>
                <dd>
                  {request.paymentStatus === 'PAID' ? (
                    <span className="badge badge--success">
                      Paid · {request.paymentMethod === 'AIRTEL_MONEY' ? 'Airtel Money' : 'MTN MoMo'}
                    </span>
                  ) : (
                    <span className="badge badge--neutral">Unpaid</span>
                  )}
                </dd>
              </div>
              {request.paymentRef && (
                <div className="kv-list__row">
                  <dt>Reference</dt>
                  <dd className="mono">{request.paymentRef}</dd>
                </div>
              )}
            </dl>
            {request.paymentStatus !== 'PAID' && request.status !== 'CANCELLED' && (
              <button type="button" className="btn btn--primary btn--sm btn--block" style={{ marginTop: 10 }} onClick={() => { setForm({ method: 'MTN_MOMO', reference: '', amountUgx: request.quotedPriceUgx ?? '' }); setDialog('payment'); }}>
                <Wallet size={14} aria-hidden="true" /> Record mobile money payment
              </button>
            )}
          </section>

          <section className="panel panel-pad detail-block">
            <h3>Address details</h3>
            <dl className="kv-list">
              <div className="kv-list__row">
                <dt>Street</dt>
                <dd>{a.streetAddress}</dd>
              </div>
              <div className="kv-list__row">
                <dt>District</dt>
                <dd>
                  {a.district} {a.region ? `(${a.region.toLowerCase()})` : ''}
                </dd>
              </div>
              {a.latitude != null && (
                <div className="kv-list__row">
                  <dt>GPS</dt>
                  <dd className="mono">
                    <MapPin size={11} aria-hidden="true" /> {a.latitude.toFixed(5)}, {a.longitude.toFixed(5)}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      </div>

      <Modal open={dialog === 'confirm' || dialog === 'quote'} title={dialog === 'confirm' ? 'Confirm booking' : 'Set agreed price'} onClose={() => setDialog(null)} busy={busy} width={440}>
        <div className="form-field">
          <label htmlFor="sr-quote">Agreed price (UGX){request.priceType === 'INSPECTION' ? ' — optional until inspected' : ''}</label>
          <input id="sr-quote" type="number" min="0" step="500" value={form.quotedPriceUgx ?? ''} onChange={(e) => setForm({ ...form, quotedPriceUgx: e.target.value })} />
          <span className="field-hint">The customer is notified of the confirmed price.</span>
        </div>
        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={() => setDialog(null)} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() =>
              update(
                {
                  ...(dialog === 'confirm' ? { status: 'CONFIRMED' } : {}),
                  ...(form.quotedPriceUgx !== '' && form.quotedPriceUgx != null ? { quotedPriceUgx: Math.round(Number(form.quotedPriceUgx)) } : {}),
                },
                dialog === 'confirm' ? 'Booking confirmed and customer notified.' : 'Price saved.',
              )
            }
          >
            {dialog === 'confirm' ? 'Confirm booking' : 'Save price'}
          </button>
        </div>
      </Modal>

      <Modal open={dialog === 'schedule'} title="Schedule the visit" onClose={() => setDialog(null)} busy={busy} width={440}>
        <div className="form-field">
          <label htmlFor="sr-when">Visit date & time</label>
          <input id="sr-when" type="datetime-local" value={form.scheduledAt || ''} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
        </div>
        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={() => setDialog(null)} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" disabled={busy || !form.scheduledAt} onClick={() => update({ scheduledAt: new Date(form.scheduledAt).toISOString(), note: `Visit scheduled for ${formatDateTime(form.scheduledAt)}` }, 'Visit scheduled.')}>
            Save schedule
          </button>
        </div>
      </Modal>

      <Modal open={dialog === 'cancel'} title="Cancel this booking?" onClose={() => setDialog(null)} busy={busy} width={440}>
        <div className="form-field">
          <label htmlFor="sr-reason">Reason (shared with the customer)</label>
          <textarea id="sr-reason" rows={3} value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value.slice(0, 500) })} />
        </div>
        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={() => setDialog(null)} disabled={busy}>
            Keep booking
          </button>
          <button type="button" className="btn btn--danger" disabled={busy} onClick={() => update({ status: 'CANCELLED', ...(form.note?.trim() ? { note: form.note.trim() } : {}) }, 'Booking cancelled.')}>
            Cancel booking
          </button>
        </div>
      </Modal>

      <Modal open={dialog === 'payment'} title="Record mobile money payment" onClose={() => setDialog(null)} busy={busy} width={460}>
        <div className="form-field">
          <label>Method</label>
          <div className="method-toggle">
            {[
              ['MTN_MOMO', 'MTN MoMo'],
              ['AIRTEL_MONEY', 'Airtel Money'],
            ].map(([value, label]) => (
              <button key={value} type="button" aria-pressed={form.method === value} className={form.method === value ? 'btn btn--primary btn--sm' : 'btn btn--secondary btn--sm'} onClick={() => setForm({ ...form, method: value })}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="sr-ref" className="required">
            Transaction ID
          </label>
          <input id="sr-ref" type="text" value={form.reference || ''} onChange={(e) => setForm({ ...form, reference: e.target.value.slice(0, 100) })} placeholder="e.g. MP240101.1234.A12345" />
        </div>
        <div className="form-field">
          <label htmlFor="sr-amount">Amount received (UGX)</label>
          <input id="sr-amount" type="number" min="0" value={form.amountUgx ?? ''} onChange={(e) => setForm({ ...form, amountUgx: e.target.value })} />
        </div>
        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={() => setDialog(null)} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" disabled={busy || (form.reference || '').trim().length < 4} onClick={recordPayment}>
            Record payment
          </button>
        </div>
      </Modal>
    </div>
  );
}
