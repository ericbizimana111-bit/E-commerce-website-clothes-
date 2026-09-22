import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, MapPin, Package, Truck } from 'lucide-react';
import apiClient from '../../api/client';
import Pagination from '../../Components/ui/Pagination';
import { useLanguage } from '../../Context/LanguageContext';
import { formatUGX } from '../../utils/currency';
import { friendlyError } from '../../utils/errors';
import { orderStatusMeta } from '../../utils/statuses';
import './Orders.css';

const Orders = () => {
  const { t, currentLang, formatDateTime } = useLanguage();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    apiClient
      .get(`/orders?page=${page}&limit=10&lang=${currentLang || 'en'}`)
      .then((res) => {
        if (!mounted) return;
        setOrders(Array.isArray(res?.items) ? res.items : []);
        if (res?.pagination) setPagination(res.pagination);
      })
      .catch((err) => mounted && setError(friendlyError(err, t, 'ordersLoadError')))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
    // `t` changes only with the language, already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLang, page]);

  if (loading) {
    return (
      <div className="panel account-card">
        <div className="um-subview-loading" role="status">
          <div className="um-spinner" />
          <p>{t('loadingOrders')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel account-card">
        <div className="alert alert-error" role="alert" style={{ marginBottom: 0 }}>
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="panel account-card state-block">
        <span className="state-block__icon">
          <Package size={34} strokeWidth={1.4} aria-hidden="true" />
        </span>
        <h2>{t('noOrdersTitle')}</h2>
        <p>{t('noOrdersDesc')}</p>
        <Link to="/catalog" className="btn btn-primary">
          {t('exploreCatalog')}
        </Link>
      </div>
    );
  }

  return (
    <div className="panel account-card">
      <div className="account-card__head">
        <h2>{t('orderHistory')}</h2>
        <span className="badge badge-neutral">{t('ordersCount', { count: pagination.total })}</span>
      </div>

      <ul className="orders">
        {orders.map((order) => {
          const status = orderStatusMeta(order.status, t);
          const home = order.fulfillment?.method === 'HOME_DELIVERY';
          return (
            <li key={order.id} className="order">
              <div className="order__top">
                <div>
                  <strong className="order__no">{order.orderNumber}</strong>
                  <span className="order__date">{formatDateTime(order.createdAt)}</span>
                </div>
                <span className={`badge badge-${status.tone}`}>{status.label}</span>
              </div>

              <dl className="order__cols">
                <div>
                  <dt>{t('fulfillmentCol')}</dt>
                  <dd>
                    {home ? <Truck size={14} aria-hidden="true" /> : <MapPin size={14} aria-hidden="true" />}
                    {home ? t('doorstepDelivery') : t('stationPickup')}
                  </dd>
                </div>
                <div>
                  <dt>{t('commitmentDeposit')}</dt>
                  <dd className="order__deposit">{formatUGX(order.pricing?.commitmentUgx || 0)}</dd>
                </div>
                <div>
                  <dt>{t('totalAmount')}</dt>
                  <dd className="order__total">{formatUGX(order.pricing?.totalUgx || 0)}</dd>
                </div>
                <div className="order__cta">
                  <Link to={`/account/orders/${order.id}`} className="btn btn-secondary btn-sm">
                    {t('viewAndTrack')} <ArrowRight size={15} aria-hidden="true" className="btn__nudge" />
                  </Link>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>

      <Pagination page={page} totalPages={pagination.totalPages} onChange={setPage} />
    </div>
  );
};

export default Orders;
