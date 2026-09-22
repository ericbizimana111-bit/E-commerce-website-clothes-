import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, CheckCircle, Clock, Info, Loader, MapPin, Phone, Truck, XCircle } from 'lucide-react';
import apiClient from '../../api/client';
import ConfirmDialog from '../../Components/ui/ConfirmDialog';
import { useLanguage } from '../../Context/LanguageContext';
import { formatUGX } from '../../utils/currency';
import { friendlyError } from '../../utils/errors';
import { deliveryStatusLabel, lifecycleIndex, orderStatusMeta, paymentStatusMeta } from '../../utils/statuses';
import './OrderDetail.css';

/**
 * Order detail / tracking — server-authoritative integration:
 *  - Order + lifecycle: GET /api/orders/:id
 *  - Fulfillment:       GET /api/orders/:id/delivery
 *  - Payments/balance:  GET /api/orders/:id/payment (server-calculated)
 *  - Pay actions:       POST /api/orders/:id/payment { purpose, method }
 *  - Cancel:            POST /api/orders/:id/cancel { reason }
 *
 * Payment success is decided ONLY by the backend webhook, so while an attempt
 * is PENDING/PROCESSING this page polls the payment endpoint.
 */

const LIFECYCLE_KEYS = ['stepOrderPlaced', 'stepCommitmentPaid', 'stepPreparing', 'stepInTransit', 'stepDelivered', 'stepComplete'];

const METHODS = [
  { value: 'MTN_MOBILE_MONEY', labelKey: 'methodMtn' },
  { value: 'AIRTEL_MONEY', labelKey: 'methodAirtel' },
  { value: 'CARD', labelKey: 'methodCard' }
];

/** Payment-method picker shared by the deposit and balance banners. */
const MethodPicker = ({ value, onChange, disabled, t }) => (
  <div className="method">
    <p className="method__label">{t('chooseMethod')}:</p>
    <div className="method__options">
      {METHODS.map(({ value: method, labelKey }) => (
        <button
          key={method}
          type="button"
          className={`method__btn ${value === method ? 'method__btn--active' : ''}`}
          onClick={() => onChange(method)}
          disabled={disabled}
          aria-pressed={value === method}
        >
          {t(labelKey)}
        </button>
      ))}
    </div>
  </div>
);

const OrderDetail = () => {
  const { id } = useParams();
  const { currentLang, t, formatDateTime } = useLanguage();

  const [order, setOrder] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const pollTimerRef = useRef(null);

  const fetchOrderDetails = useCallback(async () => {
    try {
      const [orderRes, delivRes, payRes] = await Promise.allSettled([
        apiClient.get(`/orders/${id}?lang=${currentLang || 'en'}`),
        apiClient.get(`/orders/${id}/delivery`),
        apiClient.get(`/orders/${id}/payment`)
      ]);

      if (orderRes.status === 'fulfilled' && orderRes.value?.data?.order) {
        setOrder(orderRes.value.data.order);
      } else {
        throw orderRes.status === 'rejected' ? orderRes.reason : new Error(t('orderLoadError'));
      }

      setDelivery(delivRes.status === 'fulfilled' && delivRes.value?.data?.delivery ? delivRes.value.data.delivery : null);
      setPaymentInfo(payRes.status === 'fulfilled' && payRes.value?.data?.pricing ? payRes.value.data : null);
    } catch (err) {
      setErrorMessage(friendlyError(err, t, 'orderLoadError'));
    }
    // `t` follows currentLang, which is already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, currentLang]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErrorMessage(null);
    fetchOrderDetails().finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [fetchOrderDetails]);

  // Poll while a provider attempt is in flight (the webhook settles it).
  const activePayment = paymentInfo?.activePayment || null;
  useEffect(() => {
    if (!activePayment) return undefined;
    pollTimerRef.current = setTimeout(fetchOrderDetails, 4000);
    return () => clearTimeout(pollTimerRef.current);
  }, [activePayment, fetchOrderDetails]);

  const handleInitiatePayment = async (purpose) => {
    setActionLoading(true);
    setActionMessage(null);
    setErrorMessage(null);
    try {
      const res = await apiClient.post(`/orders/${id}/payment`, {
        purpose,
        ...(paymentMethod ? { method: paymentMethod } : {}),
        language: currentLang || 'en'
      });

      if (res?.success) {
        const payment = res.data?.payment;
        setActionMessage(
          t('paymentRefStatus', {
            msg: res.message || t('paymentInitiated'),
            ref: payment?.transactionRef || t('pendingWord'),
            status: payment?.status ? paymentStatusMeta(payment.status, t).label : t('processing')
          })
        );
        // Provider-hosted checkout (mobile-money confirmation / card page).
        const checkoutUrl = res.data?.checkoutUrl;
        if (checkoutUrl) {
          window.location.href = checkoutUrl;
          return;
        }
        await fetchOrderDetails();
      }
    } catch (err) {
      setErrorMessage(friendlyError(err, t, 'paymentFailedMsg'));
    } finally {
      setActionLoading(false);
      setPaymentMethod(null);
    }
  };

  const handleCancelOrder = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await apiClient.post(`/orders/${id}/cancel`, { reason: 'Customer requested cancellation from account' });
      if (res?.success) {
        setActionMessage(t('orderCancelledOk'));
        await fetchOrderDetails();
      }
    } catch (err) {
      setErrorMessage(friendlyError(err, t, 'cancelFailed'));
    } finally {
      setActionLoading(false);
      setConfirmCancel(false);
    }
  };

  if (loading) {
    return (
      <div className="panel account-card">
        <div className="um-subview-loading" role="status">
          <div className="um-spinner" />
          <p>{t('loadingOrder')}</p>
        </div>
      </div>
    );
  }

  if (errorMessage && !order) {
    return (
      <div className="panel account-card">
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
        <Link to="/account/orders" className="btn btn-secondary">
          <ArrowLeft size={15} aria-hidden="true" /> {t('backToOrders')}
        </Link>
      </div>
    );
  }

  const currentStep = lifecycleIndex(order.status);
  const statusBadge = orderStatusMeta(order.status, t);
  const isCancelled = ['CANCELLED', 'REFUNDED', 'DELIVERY_FAILED'].includes(order.status);
  const isHome = order.fulfillment?.method === 'HOME_DELIVERY';

  // Payment eligibility mirrors backend rules.
  const canPayCommitment = order.status === 'PENDING_PAYMENT';
  const canPayBalance = order.status === 'DELIVERED' || order.status === 'PICKED_UP';
  const canCancel = ['PENDING_PAYMENT', 'COMMITMENT_PAID', 'CONFIRMED'].includes(order.status);

  const fin = paymentInfo?.pricing || null;
  const commitmentPaid = fin?.commitmentPaidUgx ?? 0;
  const balancePaid = fin?.balancePaidUgx ?? 0;
  const balanceDue = fin?.remainingBalanceUgx ?? null;
  const balanceDisplay = balanceDue !== null ? balanceDue : order.pricing?.remainingBalanceUgx;
  const paymentHistory = paymentInfo?.payments || [];
  const commitmentStatus = paymentInfo?.commitmentPaymentStatus || 'UNPAID';
  const balanceStatus = paymentInfo?.balancePaymentStatus || 'UNPAID';
  const balanceBeforeFulfillment = !canPayBalance && !isCancelled && balanceDue !== null && balanceDue > 0;

  const stepLabel = (idx) => {
    if (!isHome && idx === 3) return t('stepReadyCollection');
    if (!isHome && idx === 4) return t('stepPickedUp');
    return t(LIFECYCLE_KEYS[idx]);
  };

  const stageBadge = (status, paidLabel) => {
    if (status === 'SUCCESS' || status === 'NOT_REQUIRED') {
      return (
        <span className="badge badge-success">
          <Check size={12} strokeWidth={3} aria-hidden="true" /> {status === 'NOT_REQUIRED' ? t('nothingDue') : paidLabel}
        </span>
      );
    }
    const meta = ['PENDING', 'PROCESSING', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(status) ? paymentStatusMeta(status, t) : null;
    return meta ? <span className={`badge badge-${meta.tone}`}>{meta.label}</span> : null;
  };

  return (
    <div className="panel account-card od">
      <div className="od__head">
        <div>
          <Link to="/account/orders" className="od__back">
            <ArrowLeft size={15} aria-hidden="true" /> {t('backToOrders')}
          </Link>
          <div className="od__title">
            <h2>{t('orderNumberTitle', { number: order.orderNumber })}</h2>
            <span className={`badge badge-${statusBadge.tone}`}>{statusBadge.label}</span>
          </div>
          <span className="od__placed">{t('placedOn', { date: formatDateTime(order.createdAt) })}</span>
        </div>

        {canCancel && (
          <button type="button" onClick={() => setConfirmCancel(true)} disabled={actionLoading} className="btn btn-secondary btn-sm od__cancel">
            {t('cancelOrder')}
          </button>
        )}
      </div>

      {actionMessage && (
        <div className="alert alert-success" role="status">
          <span>{actionMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}
      {activePayment && (
        <div className="alert alert-info" role="status">
          <Loader size={16} aria-hidden="true" className="od__spin" />
          <span>
            {t('paymentAwaiting', {
              purpose: activePayment.purpose === 'BALANCE' ? t('purposeBalance') : t('purposeCommitment'),
              amount: formatUGX(activePayment.amountUgx)
            })}
          </span>
        </div>
      )}

      {/* Lifecycle */}
      {!isCancelled ? (
        <section className="od__block" aria-label={t('fulfillmentProgress')}>
          <h3>{t('fulfillmentProgress')}</h3>
          <ol className="timeline">
            {LIFECYCLE_KEYS.map((key, idx) => {
              const passed = currentStep >= idx;
              const current = currentStep === idx;
              return (
                <li key={key} className={`timeline__step ${passed ? 'timeline__step--done' : ''} ${current ? 'timeline__step--current' : ''}`} aria-current={current ? 'step' : undefined}>
                  <span className="timeline__marker">{passed && !current ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : idx + 1}</span>
                  <span className="timeline__label">{stepLabel(idx)}</span>
                </li>
              );
            })}
          </ol>
        </section>
      ) : (
        <div className="alert alert-error" role="alert">
          <XCircle size={16} aria-hidden="true" />
          <span>{t('orderWasCancelled')}</span>
        </div>
      )}

      {/* Payment actions */}
      {canPayCommitment && (
        <section className="od__action">
          <div>
            <strong>{t('actionPayDeposit')}</strong>
            <p>{t('actionPayDepositDesc', { amount: formatUGX(order.pricing?.commitmentUgx) })}</p>
            <MethodPicker value={paymentMethod} onChange={setPaymentMethod} disabled={actionLoading} t={t} />
          </div>
          <button type="button" onClick={() => handleInitiatePayment('COMMITMENT')} disabled={actionLoading || !!activePayment || !paymentMethod} className="btn btn-primary btn-lg">
            {actionLoading ? t('initiating') : t('payDeposit', { amount: formatUGX(order.pricing?.commitmentUgx) })}
          </button>
        </section>
      )}

      {canPayBalance && !paymentInfo?.isFullyPaid && (
        <section className="od__action od__action--balance">
          <div>
            <strong>{t('actionPayBalance')}</strong>
            <p>{t(isHome ? 'actionPayBalanceHome' : 'actionPayBalancePickup', { amount: formatUGX(balanceDisplay) })}</p>
            <MethodPicker value={paymentMethod} onChange={setPaymentMethod} disabled={actionLoading} t={t} />
          </div>
          <button type="button" onClick={() => handleInitiatePayment('BALANCE')} disabled={actionLoading || !!activePayment || !paymentMethod} className="btn btn-accent btn-lg">
            {actionLoading ? t('processing') : t('payBalance', { amount: formatUGX(balanceDisplay) })}
          </button>
        </section>
      )}

      {balanceBeforeFulfillment && (
        <div className="alert alert-info" role="status">
          <Info size={16} aria-hidden="true" />
          <span>{t('balanceLater', { amount: formatUGX(balanceDue), state: isHome ? t('stateDelivered') : t('statePickedUp') })}</span>
        </div>
      )}

      {paymentInfo?.isFullyPaid && order.status !== 'COMPLETED' && (
        <div className="alert alert-success" role="status">
          <Check size={16} aria-hidden="true" />
          <span>{t('allPaid')}</span>
        </div>
      )}
      {order.status === 'COMPLETED' && (
        <div className="alert alert-success" role="status">
          <CheckCircle size={16} aria-hidden="true" />
          <span>{t('orderComplete')}</span>
        </div>
      )}

      {/* Line items */}
      <section className="od__block">
        <h3>{t('lineItems')}</h3>
        <div className="od__table">
          <div className="od__thead" aria-hidden="true">
            <span>{t('colProduct')}</span>
            <span>{t('unitPrice')}</span>
            <span>{t('colQuantity')}</span>
            <span>{t('lineTotal')}</span>
          </div>
          <ul>
            {order.items?.map((it) => (
              <li key={it.id} className="od__trow">
                <div>
                  <strong>{it.productName}</strong>
                  {it.unit && <small>{t('unitPer', { unit: it.unit })}</small>}
                </div>
                <span data-label={t('unitPrice')}>{formatUGX(it.unitPriceUgx)}</span>
                <span data-label={t('colQuantity')}>×{it.quantity}</span>
                <strong data-label={t('lineTotal')}>{formatUGX(it.lineTotalUgx)}</strong>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="od__cols">
        {/* Fulfillment */}
        <section className="od__block od__card">
          <h3>{t('fulfillmentDetails')}</h3>
          {isHome ? (
            <>
              <span className="badge badge-info">
                <Truck size={13} aria-hidden="true" /> {t('homeDelivery')}
              </span>
              {order.fulfillment?.address ? (
                <div className="od__addr">
                  <strong>{order.fulfillment.address.title || t('deliveryAddress')}</strong>
                  <p>
                    {order.fulfillment.address.streetAddress}
                    {order.fulfillment.address.division ? `, ${order.fulfillment.address.division}` : ''}
                    {order.fulfillment.address.district ? `, ${order.fulfillment.address.district}` : ''}
                  </p>
                </div>
              ) : (
                <p className="od__muted">{t('addressStored')}</p>
              )}
            </>
          ) : (
            <>
              <span className="badge badge-success">
                <MapPin size={13} aria-hidden="true" /> {t('pickupStation')}
              </span>
              {order.fulfillment?.station ? (
                <div className="od__addr">
                  <strong>{order.fulfillment.station.name}</strong>
                  <p>
                    {order.fulfillment.station.addressText}
                    {order.fulfillment.station.district ? `, ${order.fulfillment.station.district}` : ''}
                  </p>
                  <span>
                    <Clock size={13} aria-hidden="true" /> {order.fulfillment.station.operatingHours || t('contactForHours')}
                  </span>
                  {order.fulfillment.station.contactPhone && (
                    <span>
                      <Phone size={13} aria-hidden="true" /> {order.fulfillment.station.contactPhone}
                    </span>
                  )}
                </div>
              ) : (
                <p className="od__muted">{t('stationStored')}</p>
              )}
            </>
          )}

          {delivery && (
            <div className="od__tracking">
              <h4>{t('deliveryTracking')}</h4>
              <dl>
                <div>
                  <dt>{t('dispatchStatus')}</dt>
                  <dd>{deliveryStatusLabel(delivery.status, t)}</dd>
                </div>
                {delivery.scheduledAt && (
                  <div>
                    <dt>{t('scheduled')}</dt>
                    <dd>{formatDateTime(delivery.scheduledAt)}</dd>
                  </div>
                )}
                {delivery.startedAt && (
                  <div>
                    <dt>{t('dispatched')}</dt>
                    <dd>{formatDateTime(delivery.startedAt)}</dd>
                  </div>
                )}
                {delivery.completedAt && (
                  <div>
                    <dt>{t('completedAt')}</dt>
                    <dd>{formatDateTime(delivery.completedAt)}</dd>
                  </div>
                )}
                {delivery.failureMessage && (
                  <div>
                    <dt>{t('issue')}</dt>
                    <dd>{delivery.failureMessage}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </section>

        {/* Money */}
        <section className="od__block od__card">
          <h3>{t('paymentSummary')}</h3>
          <dl className="od__fin">
            <div>
              <dt>{t('itemsSubtotal')}</dt>
              <dd>{formatUGX(order.pricing?.itemsSubtotalUgx || 0)}</dd>
            </div>
            <div>
              <dt>{t('deliveryStationFee')}</dt>
              <dd>{formatUGX(order.pricing?.deliveryFeeUgx || 0)}</dd>
            </div>
            <div className="od__fin-strong">
              <dt>{t('totalOrderValue')}</dt>
              <dd>{formatUGX(order.pricing?.totalUgx || 0)}</dd>
            </div>
            <div className="od__fin-rule">
              <dt>{t('commitmentPaid')}</dt>
              <dd className={commitmentPaid > 0 ? 'od__paid' : ''}>{formatUGX(commitmentPaid)}</dd>
            </div>
            <div>
              <dt>{t('balancePaid')}</dt>
              <dd className={balancePaid > 0 ? 'od__paid' : ''}>{formatUGX(balancePaid)}</dd>
            </div>
            <div className="od__fin-strong">
              <dt>{t('balancePayable')}</dt>
              <dd>{formatUGX(balanceDue !== null ? balanceDue : order.pricing?.remainingBalanceUgx || 0)}</dd>
            </div>
          </dl>

          <div className="od__stages">
            <div>
              <span>
                <strong>{t('commitmentDeposit')}</strong>
                <small>{formatUGX(order.pricing?.commitmentUgx || 0)}</small>
              </span>
              {stageBadge(commitmentStatus, t('paidBadge')) || <span className="badge badge-warning">{t('unpaidBadge')}</span>}
            </div>
            <div>
              <span>
                <strong>{t('balancePayable')}</strong>
                <small>{formatUGX(order.pricing?.remainingBalanceUgx || 0)}</small>
              </span>
              {stageBadge(balanceStatus, t('paidBadge')) || <span className="badge badge-neutral">{t('payAtFulfillmentBadge')}</span>}
            </div>
          </div>
        </section>
      </div>

      {paymentHistory.length > 0 && (
        <section className="od__block">
          <h3>{t('paymentHistory')}</h3>
          <div className="od__table">
            <div className="od__thead" aria-hidden="true">
              <span>{t('colPurpose')}</span>
              <span>{t('colAmount')}</span>
              <span>{t('colStatus')}</span>
              <span>{t('colDate')}</span>
            </div>
            <ul>
              {paymentHistory.map((p) => {
                const meta = paymentStatusMeta(p.status, t);
                return (
                  <li key={p.id} className="od__trow">
                    <div>
                      <strong>{p.purpose === 'BALANCE' ? t('purposeBalanceLabel') : p.purpose === 'COMMITMENT' ? t('purposeCommitmentLabel') : p.paymentType || p.purpose}</strong>
                      <small>
                        {p.provider} • {t('refLabel', { ref: p.transactionRef })}
                      </small>
                    </div>
                    <span data-label={t('colAmount')}>{formatUGX(p.amountUgx)}</span>
                    <span data-label={t('colStatus')}>
                      <span className={`badge badge-${meta.tone}`}>{meta.label}</span>
                    </span>
                    <span data-label={t('colDate')}>{formatDateTime(p.createdAt)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={confirmCancel}
        title={t('cancelOrderTitle')}
        message={t('cancelOrderMessage')}
        confirmLabel={t('cancelOrder')}
        cancelLabel={t('keepOrder')}
        danger
        busy={actionLoading}
        onConfirm={handleCancelOrder}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
};

export default OrderDetail;
