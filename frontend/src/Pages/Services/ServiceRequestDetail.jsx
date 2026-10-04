import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CalendarDays, Check, CheckCircle, Landmark, MapPin, MessageCircle, Phone, UserRound, Wallet } from 'lucide-react';
import apiClient from '../../api/client';
import ConfirmDialog from '../../Components/ui/ConfirmDialog';
import { useLanguage } from '../../Context/LanguageContext';
import { useRealtimeEvent } from '../../Context/RealtimeContext';
import { formatUGX } from '../../utils/currency';
import { friendlyError } from '../../utils/errors';
import { iconFor } from '../../utils/categoryIcons';
import { formatAddressLine } from '../../utils/useLocations';
import { BOOKING_TONES } from './MyServiceRequests';
import { priceLabel } from './Services';
import './Services.css';

const FLOW = ['PENDING', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'];
const CANCELLABLE = ['PENDING', 'CONFIRMED', 'ASSIGNED'];

/** One booking: GET /api/service-requests/:id, POST .../cancel */
const ServiceRequestDetail = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t, currentLang, formatDateTime } = useLanguage();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get(`/service-requests/${id}?lang=${currentLang}`);
      setRequest(res?.data?.request || null);
    } catch (err) {
      setError(friendlyError(err, t, 'errGeneric'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, currentLang]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeEvent('service:update', (data) => data?.id === id && load());

  const cancel = async () => {
    setBusy(true);
    try {
      const res = await apiClient.post(`/service-requests/${id}/cancel`, { reason: 'Cancelled by customer from account' });
      setRequest(res?.data?.request || request);
    } catch (err) {
      setError(friendlyError(err, t, 'errGeneric'));
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  };

  if (loading) {
    return (
      <div className="panel account-card">
        <div className="um-subview-loading" role="status">
          <div className="um-spinner" />
          <p>{t('loading')}</p>
        </div>
      </div>
    );
  }
  if (!request) {
    return (
      <div className="panel account-card">
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error || t('errGeneric')}</span>
        </div>
        <Link to="/account/services" className="btn btn-secondary">
          <ArrowLeft size={15} aria-hidden="true" /> {t('myServices')}
        </Link>
      </div>
    );
  }

  const Icon = iconFor(request.service?.icon);
  const cancelled = request.status === 'CANCELLED';
  const stepIndex = FLOW.indexOf(request.status);

  return (
    <div className="panel account-card sr">
      <Link to="/account/services" className="svc-book__back">
        <ArrowLeft size={15} aria-hidden="true" /> {t('myServices')}
      </Link>

      <div className="sr__head">
        <span className="svc-card__icon svc-card__icon--lg">
          <Icon size={28} aria-hidden="true" />
        </span>
        <div>
          <h2>{request.service?.name}</h2>
          <p className="od__placed">
            {request.requestNumber} · {t('bookedOn', { date: formatDateTime(request.createdAt) })}
          </p>
        </div>
        <span className={`badge badge-${BOOKING_TONES[request.status] || 'neutral'}`}>{t(`booking_${request.status}`)}</span>
      </div>

      {searchParams.get('booked') === '1' && request.status === 'PENDING' && (
        <div className="alert alert-success" role="status">
          <CheckCircle size={16} aria-hidden="true" />
          <span>{t('bookingReceivedBanner')}</span>
        </div>
      )}
      {error && (
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {!cancelled ? (
        <ol className="timeline">
          {FLOW.map((s, i) => (
            <li key={s} className={`timeline__step ${stepIndex >= i ? 'timeline__step--done' : ''} ${stepIndex === i ? 'timeline__step--current' : ''}`}>
              <span className="timeline__marker">{stepIndex > i ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : i + 1}</span>
              <span className="timeline__label">{t(`booking_${s}`)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            {t('bookingCancelled')}
            {request.cancelReason ? ` — ${request.cancelReason}` : ''}
          </span>
        </div>
      )}

      <div className="sr__grid">
        <section className="od__card sr__card">
          <h3>{t('visitDetails')}</h3>
          <p className="sr__line">
            <CalendarDays size={15} aria-hidden="true" />
            {request.scheduledAt
              ? t('scheduledFor', { date: formatDateTime(request.scheduledAt) })
              : `${request.preferredDate} · ${t(`slot${request.preferredSlot}`)} (${request.preferredSlotLabel})`}
          </p>
          <p className="sr__line">
            <MapPin size={15} aria-hidden="true" /> {formatAddressLine(request.address)}
          </p>
          {request.address?.landmark && (
            <p className="sr__line">
              <Landmark size={15} aria-hidden="true" /> {request.address.landmark}
            </p>
          )}
          <p className="sr__line">
            <Phone size={15} aria-hidden="true" /> {request.contactPhone}
          </p>
          <h4>{t('yourRequest')}</h4>
          <p className="sr__desc">{request.description}</p>
        </section>

        <section className="od__card sr__card">
          <h3>{t('technician')}</h3>
          {request.provider ? (
            <div className="sr__tech">
              <span className="chat__avatar">
                <UserRound size={18} aria-hidden="true" />
              </span>
              <div>
                <strong>{request.provider.fullName}</strong>
                <a href={`tel:${request.provider.phone}`} className="sr__call">
                  <Phone size={14} aria-hidden="true" /> {request.provider.phone}
                </a>
              </div>
            </div>
          ) : (
            <p className="od__muted">{t('technicianPending')}</p>
          )}

          <h3 style={{ marginTop: 18 }}>{t('priceLabel')}</h3>
          <dl className="od__fin">
            <div>
              <dt>{t('advertisedPrice')}</dt>
              <dd>{priceLabel({ priceType: request.priceType, priceFromUgx: request.priceFromUgx }, t)}</dd>
            </div>
            <div className="od__fin-strong">
              <dt>{t('agreedPrice')}</dt>
              <dd>{request.quotedPriceUgx != null ? formatUGX(request.quotedPriceUgx) : t('toBeConfirmed')}</dd>
            </div>
            <div>
              <dt>
                <Wallet size={14} aria-hidden="true" /> {t('paymentLabel')}
              </dt>
              <dd>
                {request.paymentStatus === 'PAID' ? (
                  <span className="badge badge-success">
                    {t('paidBadge')} · {request.paymentMethod === 'AIRTEL_MONEY' ? 'Airtel Money' : 'MTN MoMo'}
                  </span>
                ) : (
                  <span className="badge badge-neutral">{t('payAfterJob')}</span>
                )}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {request.events?.length > 0 && (
        <section className="od__block">
          <h3>{t('activity')}</h3>
          <ol className="sr__events">
            {request.events.map((e) => (
              <li key={e.id}>
                <strong>{t(`booking_${e.to}`)}</strong>
                {e.note && <span> — {e.note}</span>}
                <time dateTime={e.createdAt}>{formatDateTime(e.createdAt)}</time>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="sr__actions">
        <button type="button" className="btn btn-secondary" onClick={() => navigate(`/account/messages?booking=${request.id}`)}>
          <MessageCircle size={16} aria-hidden="true" /> {t('messageAboutBooking')}
        </button>
        {CANCELLABLE.includes(request.status) && (
          <button type="button" className="btn btn-secondary od__cancel" onClick={() => setConfirmCancel(true)} disabled={busy}>
            {t('cancelBooking')}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title={t('cancelBookingTitle')}
        message={t('cancelBookingMessage')}
        confirmLabel={t('cancelBooking')}
        cancelLabel={t('keepBooking')}
        danger
        busy={busy}
        onConfirm={cancel}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
};

export default ServiceRequestDetail;
