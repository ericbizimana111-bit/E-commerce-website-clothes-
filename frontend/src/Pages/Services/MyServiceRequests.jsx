import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarDays, ChevronRight, Wrench } from 'lucide-react';
import apiClient from '../../api/client';
import { useLanguage } from '../../Context/LanguageContext';
import { useRealtimeEvent } from '../../Context/RealtimeContext';
import { friendlyError } from '../../utils/errors';
import { iconFor } from '../../utils/categoryIcons';
import './Services.css';

export const BOOKING_TONES = {
  PENDING: 'warning',
  CONFIRMED: 'info',
  ASSIGNED: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'danger'
};

/** Customer's home-service bookings: GET /api/service-requests */
const MyServiceRequests = () => {
  const { t, currentLang, formatDateTime } = useLanguage();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () =>
    apiClient
      .get(`/service-requests?lang=${currentLang}`)
      .then((res) => setRequests(res?.data?.requests || []))
      .catch((err) => setError(friendlyError(err, t, 'errGeneric')))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLang]);

  useRealtimeEvent('service:update', () => load());

  return (
    <div className="panel account-card">
      <div className="account-card__head">
        <h2>{t('myServices')}</h2>
        <Link to="/services" className="btn btn-primary btn-sm">
          <Wrench size={15} aria-hidden="true" /> {t('bookAService')}
        </Link>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="um-subview-loading" role="status">
          <div className="um-spinner" />
          <p>{t('loading')}</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="state-block">
          <span className="state-block__icon">
            <Wrench size={34} strokeWidth={1.4} aria-hidden="true" />
          </span>
          <p>{t('noBookings')}</p>
          <Link to="/services" className="btn btn-secondary btn-sm">
            {t('browseServices')}
          </Link>
        </div>
      ) : (
        <ul className="bookings">
          {requests.map((r) => {
            const Icon = iconFor(r.service?.icon);
            return (
              <li key={r.id}>
                <Link to={`/account/services/${r.id}`} className="booking">
                  <span className="svc-card__icon">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span className="booking__main">
                    <strong>{r.service?.name}</strong>
                    <small>
                      {r.requestNumber} · {t('bookedOn', { date: formatDateTime(r.createdAt) })}
                    </small>
                    <small>
                      <CalendarDays size={12} aria-hidden="true" /> {r.preferredDate} · {t(`slot${r.preferredSlot}`)}
                    </small>
                  </span>
                  <span className={`badge badge-${BOOKING_TONES[r.status] || 'neutral'}`}>{t(`booking_${r.status}`)}</span>
                  <ChevronRight size={18} aria-hidden="true" className="booking__chev" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default MyServiceRequests;
