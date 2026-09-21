import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import apiClient from '../../api/client';
import { useLanguage } from '../../Context/LanguageContext';
import { formatUGX } from '../../utils/currency';
import { AlertTriangle, ArrowLeft, Check, XCircle, Info, CheckCircle, Truck, MapPin, Phone, Clock, Loader } from 'lucide-react';
import './OrderDetail.css';

/**
 * Order detail / tracking — UgaMarket — home to home.
 *
 * Server-authoritative integration:
 *  - Order + lifecycle: GET /api/orders/:id (statusHistory, items, payments)
 *  - Fulfillment:        GET /api/orders/:id/delivery
 *  - Payments & balance: GET /api/orders/:id/payment (safe projection,
 *                        server-calculated: commitmentPaid, balancePaid,
 *                        balanceDue, activePayment)
 *  - Pay actions:        POST /api/orders/:id/payment { purpose }
 *  - Cancel:             POST /api/orders/:id/cancel { reason }
 *
 * Payment success is decided ONLY by the backend webhook; in development the
 * deterministic mock provider requires the dev webhook script, so this page
 * polls the payment endpoint while an attempt is PENDING/PROCESSING.
 */

const LIFECYCLE_STEPS = [
  { key: 'ORDER_PLACED', label: 'Order Placed' },
  { key: 'COMMITMENT_PAID', label: 'Commitment Deposit Paid' },
  { key: 'PREPARING', label: 'Preparing Your Order' },
  { key: 'IN_TRANSIT', label: 'In Transit' },
  { key: 'FULFILLED', label: 'Delivered' },
  { key: 'COMPLETED', label: 'Paid & Complete' }
];

function getStepIndex(status) {
  switch (status) {
    case 'PENDING_PAYMENT':
      return 0;
    case 'COMMITMENT_PAID':
    case 'CONFIRMED':
      return 1;
    case 'PREPARING':
    case 'READY_FOR_DELIVERY':
    case 'READY_FOR_PICKUP':
      return 2;
    case 'OUT_FOR_DELIVERY':
      return 3;
    case 'DELIVERED':
    case 'PICKED_UP':
      return 4;
    case 'BALANCE_PAID':
    case 'COMPLETED':
      return 5;
    case 'CANCELLED':
    case 'REFUNDED':
    default:
      return -1;
  }
}

const PAYMENT_STATUS_BADGES = {
  PENDING: { label: 'Pending Verification', type: 'warning' },
  PROCESSING: { label: 'Processing', type: 'warning' },
  SUCCESS: { label: 'Paid', type: 'success' },
  FAILED: { label: 'Failed', type: 'danger' },
  EXPIRED: { label: 'Expired', type: 'danger' },
  CANCELLED: { label: 'Cancelled', type: 'neutral' }
};

const PAYMENT_PURPOSE_LABELS = {
  COMMITMENT: 'Commitment Deposit Payment',
  BALANCE: 'Remaining Balance Payment'
};

// Customer-friendly order status wording (no raw enums in the UI).
const ORDER_STATUS_BADGES = {
  PENDING_PAYMENT: { label: 'Awaiting Deposit', type: 'warning' },
  COMMITMENT_PAID: { label: 'Deposit Paid', type: 'success' },
  CONFIRMED: { label: 'Confirmed', type: 'success' },
  PREPARING: { label: 'Preparing', type: 'info' },
  READY_FOR_DELIVERY: { label: 'Ready for Delivery', type: 'info' },
  READY_FOR_PICKUP: { label: 'Ready for Pickup', type: 'success' },
  OUT_FOR_DELIVERY: { label: 'On the Way', type: 'warning' },
  DELIVERED: { label: 'Delivered', type: 'success' },
  PICKED_UP: { label: 'Picked Up', type: 'success' },
  BALANCE_PAID: { label: 'Balance Paid', type: 'success' },
  COMPLETED: { label: 'Completed', type: 'success' },
  CANCELLED: { label: 'Cancelled', type: 'danger' },
  PAYMENT_FAILED: { label: 'Payment Issue', type: 'danger' },
  REFUNDED: { label: 'Refunded', type: 'neutral' },
  DELIVERY_FAILED: { label: 'Delivery Issue', type: 'danger' }
};

function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-UG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return String(value);
  }
}

const OrderDetail = () => {
  const { id } = useParams();
  const { currentLang } = useLanguage();

  const [order, setOrder] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const pollTimerRef = useRef(null);

  const fetchOrderDetails = useCallback(async () => {
    try {
      const [orderRes, delivRes, payRes] = await Promise.allSettled([
        apiClient.get(`/orders/${id}?lang=${currentLang || 'en'}`),
        apiClient.get(`/orders/${id}/delivery`),
        apiClient.get(`/orders/${id}/payment`)
      ]);

      if (orderRes.status === 'fulfilled' && orderRes.value?.data?.order) {
        // GET /api/orders/:id -> { data: { order } }
        setOrder(orderRes.value.data.order);
      } else {
        throw new Error(orderRes.status === 'rejected' ? orderRes.reason?.message : 'Order not found');
      }

      if (delivRes.status === 'fulfilled' && delivRes.value?.data?.delivery) {
        setDelivery(delivRes.value.data.delivery);
      } else {
        setDelivery(null);
      }

      // GET /api/orders/:id/payment -> { data: { pricing, payments, activePayment, ... } }
      if (payRes.status === 'fulfilled' && payRes.value?.data?.pricing) {
        setPaymentInfo(payRes.value.data);
      } else {
        setPaymentInfo(null);
      }
    } catch (err) {
      console.error('Failed to load order', err);
      setErrorMessage(err.message || 'Could not load order details');
    }
  }, [id, currentLang]);

  // Initial load + reload whenever the language changes
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setErrorMessage(null);
    fetchOrderDetails().finally(() => {
      if (isMounted) setLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, [fetchOrderDetails]);

  // Payment outcome polling: the webhook (server-side) decides success, so
  // while an attempt is PENDING/PROCESSING we poll the payment endpoint.
  const activePayment = paymentInfo?.activePayment || null;
  useEffect(() => {
    if (!activePayment) {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }
    pollTimerRef.current = setTimeout(() => {
      fetchOrderDetails();
    }, 4000);
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [activePayment, fetchOrderDetails]);

  // Payment Handler
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
        const msg = res.message || 'Payment initiated successfully';
        setActionMessage(
          `${msg}. Reference: ${payment?.transactionRef || 'Pending'}. Status: ${payment?.status || 'Processing'}`
        );
        // Flutterwave hosted checkout (mobile money confirmation page / card
        // payment link): redirect the customer. The webhook delivers the
        // outcome; card payments also redirect back via /api/payments/return.
        const checkoutUrl = res.data?.checkoutUrl;
        if (checkoutUrl) {
          window.location.href = checkoutUrl;
          return;
        }
        await fetchOrderDetails();
      }
    } catch (err) {
      setErrorMessage(err.message || 'Payment initiation failed');
    } finally {
      setActionLoading(false);
      setPaymentMethod(null);
    }
  };

  // Order Cancellation Handler (server gates which statuses are cancellable)
  const handleCancelOrder = async () => {
    if (!window.confirm('Are you sure you want to cancel this order?')) return;
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const res = await apiClient.post(`/orders/${id}/cancel`, {
        reason: 'Customer requested cancellation from account'
      });
      if (res?.success) {
        setActionMessage('Order successfully cancelled.');
        await fetchOrderDetails();
      }
    } catch (err) {
      setErrorMessage(err.message || 'Could not cancel order');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="card um-subview-card">
        <div className="um-subview-loading">
          <div className="um-spinner" />
          <p>Loading order lifecycle details...</p>
        </div>
      </div>
    );
  }

  if (errorMessage && !order) {
    return (
      <div className="card um-subview-card">
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={16} strokeWidth={1.75} />
          <span>{errorMessage}</span>
        </div>
        <Link to="/account/orders" className="btn btn-secondary" style={{ width: 'fit-content', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <ArrowLeft size={14} strokeWidth={1.75} /> Back to Orders
        </Link>
      </div>
    );
  }

  const currentStep = getStepIndex(order.status);
  const statusBadge = ORDER_STATUS_BADGES[order.status] || { label: order.status, type: 'neutral' };
  const isCancelled = order.status === 'CANCELLED' || order.status === 'REFUNDED' || order.status === 'DELIVERY_FAILED';
  const isHomeDelivery = order.fulfillment?.method === 'HOME_DELIVERY';

  // Payment eligibility strictly mirrors backend rules:
  //  - commitment: order still PENDING_PAYMENT
  //  - balance: fulfillment complete (DELIVERED for home, PICKED_UP for pickup)
  const canPayCommitment = order.status === 'PENDING_PAYMENT';
  const canPayBalance = order.status === 'DELIVERED' || order.status === 'PICKED_UP';
  const canCancel = ['PENDING_PAYMENT', 'COMMITMENT_PAID', 'CONFIRMED'].includes(order.status);

  // Server-authoritative financials from GET /orders/:id/payment
  const fin = paymentInfo?.pricing || null;
  const commitmentPaidUgx = fin?.commitmentPaidUgx ?? 0;
  const balancePaidUgx = fin?.balancePaidUgx ?? 0;
  const balanceDueUgx = fin?.remainingBalanceUgx ?? null;
  const paymentHistory = paymentInfo?.payments || [];

  const commitmentStatus = paymentInfo?.commitmentPaymentStatus || 'UNPAID';
  const balanceStatus = paymentInfo?.balancePaymentStatus || 'UNPAID';

  const balanceBeforeFulfillment = !canPayBalance && !isCancelled && balanceDueUgx !== null && balanceDueUgx > 0;

  return (
    <div className="card um-subview-card um-order-detail-view">
      {/* Header */}
      <div className="um-order-detail-header">
        <div>
          <Link to="/account/orders" className="um-back-link" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <ArrowLeft size={14} strokeWidth={1.75} /> Back to All Orders
          </Link>
          <div className="um-order-title-wrap">
            <h2>Order {order.orderNumber}</h2>
            <span className={`badge badge-${statusBadge.type}`}>
              {statusBadge.label}
            </span>
          </div>
          <span className="um-order-timestamp">
            Placed on {formatDateTime(order.createdAt)}
          </span>
        </div>

        {canCancel && (
          <button
            type="button"
            onClick={handleCancelOrder}
            disabled={actionLoading}
            className="btn btn-danger btn-sm"
          >
            Cancel Order
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
          <AlertTriangle size={16} strokeWidth={1.75} />
          <span>{errorMessage}</span>
        </div>
      )}

      {activePayment && (
        <div className="alert alert-info" role="status" style={{ background: '#EFF6FF', borderColor: '#BFDBFE', color: '#1E3A8A' }}>
          <Loader size={16} strokeWidth={1.75} />
          <span>
            A payment of {formatUGX(activePayment.amountUgx)} ({activePayment.purpose === 'BALANCE' ? 'balance' : 'commitment'}) is awaiting provider verification.
            This page updates automatically once the UgaMarket server confirms it.
          </span>
        </div>
      )}

      {/* Lifecycle Progress Stepper — labels adapt to home delivery vs pickup */}
      {!isCancelled ? (
        <div className="um-stepper-box card">
          <h4 className="um-stepper-title">Fulfillment Progress</h4>
          <div className="um-lifecycle-stepper">
            {LIFECYCLE_STEPS.map((step, idx) => {
              const isPassed = currentStep >= idx;
              const isCurrent = currentStep === idx;
              return (
                <div
                  key={step.key}
                  className={`um-lifecycle-step ${isPassed ? 'um-step--completed' : ''} ${isCurrent ? 'um-step--active' : ''}`}
                >
                  <div className="um-step-marker">
                    {isPassed && !isCurrent ? <Check size={14} strokeWidth={2.5} /> : idx + 1}
                  </div>
                  <span className="um-step-label">
                    {!isHomeDelivery && step.key === 'IN_TRANSIT'
                      ? 'Ready for Collection'
                      : !isHomeDelivery && step.key === 'FULFILLED'
                        ? 'Picked Up'
                        : step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="alert alert-error" role="alert">
          <XCircle size={16} strokeWidth={1.75} />
          <span>This order was cancelled. If you believe this is a mistake, please contact UgaMarket support.</span>
        </div>
      )}

      {/* Action Banners */}
      {canPayCommitment && (
        <div className="um-action-banner card">
          <div>
            <strong>Action Required: Pay Commitment Deposit</strong>
            <p>
              Please pay <strong>{formatUGX(order.pricing?.commitmentUgx)}</strong> to confirm your order so our farmers can start preparing your fresh produce.
            </p>
            <div className="um-method-select">
              <p className="um-method-label">Choose payment method:</p>
              <div className="um-method-options">
                <button
                  type="button"
                  className={`um-method-btn${paymentMethod === 'MTN_MOBILE_MONEY' ? ' um-method-btn--active' : ''}`}
                  onClick={() => setPaymentMethod('MTN_MOBILE_MONEY')}
                  disabled={actionLoading}
                  aria-pressed={paymentMethod === 'MTN_MOBILE_MONEY'}
                >
                  MTN Mobile Money
                </button>
                <button
                  type="button"
                  className={`um-method-btn${paymentMethod === 'AIRTEL_MONEY' ? ' um-method-btn--active' : ''}`}
                  onClick={() => setPaymentMethod('AIRTEL_MONEY')}
                  disabled={actionLoading}
                  aria-pressed={paymentMethod === 'AIRTEL_MONEY'}
                >
                  Airtel Money
                </button>
                <button
                  type="button"
                  className={`um-method-btn${paymentMethod === 'CARD' ? ' um-method-btn--active' : ''}`}
                  onClick={() => setPaymentMethod('CARD')}
                  disabled={actionLoading}
                  aria-pressed={paymentMethod === 'CARD'}
                >
                  Card / Visa / MasterCard
                </button>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleInitiatePayment('COMMITMENT')}
            disabled={actionLoading || !!activePayment || !paymentMethod}
            className="btn btn-primary btn-lg"
          >
            {actionLoading ? 'Initiating...' : `Pay Deposit (${formatUGX(order.pricing?.commitmentUgx)})`}
          </button>
        </div>
      )}

      {canPayBalance && !paymentInfo?.isFullyPaid && (
        <div className="um-action-banner card um-balance-action-banner">
          <div>
            <strong>Produce Received: Complete Your Balance</strong>
            <p>
              Your produce has been {isHomeDelivery ? 'delivered' : 'ready for pickup and collected'}! After verifying quality, pay the remaining balance of{' '}
              <strong>{balanceDueUgx !== null ? formatUGX(balanceDueUgx) : formatUGX(order.pricing?.remainingBalanceUgx)}</strong>.
            </p>
            <div className="um-method-select">
              <p className="um-method-label">Choose payment method:</p>
              <div className="um-method-options">
                <button
                  type="button"
                  className={`um-method-btn${paymentMethod === 'MTN_MOBILE_MONEY' ? ' um-method-btn--active' : ''}`}
                  onClick={() => setPaymentMethod('MTN_MOBILE_MONEY')}
                  disabled={actionLoading}
                  aria-pressed={paymentMethod === 'MTN_MOBILE_MONEY'}
                >
                  MTN Mobile Money
                </button>
                <button
                  type="button"
                  className={`um-method-btn${paymentMethod === 'AIRTEL_MONEY' ? ' um-method-btn--active' : ''}`}
                  onClick={() => setPaymentMethod('AIRTEL_MONEY')}
                  disabled={actionLoading}
                  aria-pressed={paymentMethod === 'AIRTEL_MONEY'}
                >
                  Airtel Money
                </button>
                <button
                  type="button"
                  className={`um-method-btn${paymentMethod === 'CARD' ? ' um-method-btn--active' : ''}`}
                  onClick={() => setPaymentMethod('CARD')}
                  disabled={actionLoading}
                  aria-pressed={paymentMethod === 'CARD'}
                >
                  Card / Visa / MasterCard
                </button>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleInitiatePayment('BALANCE')}
            disabled={actionLoading || !!activePayment || !paymentMethod}
            className="btn btn-accent btn-lg"
          >
            {actionLoading
              ? 'Processing...'
              : `Pay Balance (${balanceDueUgx !== null ? formatUGX(balanceDueUgx) : formatUGX(order.pricing?.remainingBalanceUgx)})`}
          </button>
        </div>
      )}

      {balanceBeforeFulfillment && (
        <div className="alert alert-info" role="status" style={{ background: '#F8FAFC', borderColor: 'var(--border)', color: 'var(--slate)' }}>
          <Info size={16} strokeWidth={1.75} />
          <span>
            Your remaining balance of <strong>{formatUGX(balanceDueUgx)}</strong> becomes payable once your order is{' '}
            {isHomeDelivery ? 'delivered' : 'picked up'}.
          </span>
        </div>
      )}

      {paymentInfo?.isFullyPaid && order.status !== 'COMPLETED' && (
        <div className="alert alert-success" role="status">
          <Check size={16} strokeWidth={2} />
          <span>All payments complete — the UgaMarket server is finalizing your order.</span>
        </div>
      )}

      {order.status === 'COMPLETED' && (
        <div className="alert alert-success" role="status">
          <CheckCircle size={16} strokeWidth={1.75} />
          <span>This order is complete. Thank you for shopping with UgaMarket — home to home!</span>
        </div>
      )}

      {/* Order Items Table */}
      <div className="um-order-items-box card">
        <h4>Order Line Items</h4>
        <div className="um-order-items-table">
          <div className="um-order-table-head">
            <span>Product</span>
            <span>Unit Price</span>
            <span>Quantity</span>
            <span>Line Total</span>
          </div>
          <div className="um-order-table-rows">
            {order.items?.map((it) => (
              <div key={it.id} className="um-order-table-row">
                <div>
                  <strong>{it.productName}</strong>
                  {it.unit && <small className="um-it-unit">Per {it.unit}</small>}
                </div>
                <span>{formatUGX(it.unitPriceUgx)}</span>
                <span>{it.quantity}</span>
                <strong>{formatUGX(it.lineTotalUgx)}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Financial Breakdown Card — server-authoritative, always shows the two-stage payment model */}
      <div className="um-order-info-grid">
        {/* Fulfillment Card */}
        <div className="um-info-card card">
          <h4>Fulfillment Details</h4>
          {isHomeDelivery ? (
            <div className="um-fulfillment-info">
              <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><Truck size={13} strokeWidth={1.75} /> Home Delivery</span>
              {order.fulfillment.address ? (
                <div className="um-addr-box">
                  <strong>{order.fulfillment.address.title || 'Delivery Address'}</strong>
                  <p>
                    {order.fulfillment.address.streetAddress}
                    {order.fulfillment.address.division ? `, ${order.fulfillment.address.division}` : ''}
                    {order.fulfillment.address.district ? `, ${order.fulfillment.address.district}` : ''}
                  </p>
                </div>
              ) : (
                <p>Address details are stored with your order.</p>
              )}
            </div>
          ) : (
            <div className="um-fulfillment-info">
              <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><MapPin size={13} strokeWidth={1.75} /> Pickup Station</span>
              {order.fulfillment?.station ? (
                <div className="um-station-info-box">
                  <strong>{order.fulfillment.station.name}</strong>
                  <p>
                    {order.fulfillment.station.addressText}
                    {order.fulfillment.station.district ? `, ${order.fulfillment.station.district}` : ''}
                  </p>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Clock size={13} strokeWidth={1.75} /> {order.fulfillment.station.operatingHours || 'Contact station for hours'}</span>
                  {order.fulfillment.station.contactPhone && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Phone size={13} strokeWidth={1.75} /> {order.fulfillment.station.contactPhone}</span>
                  )}
                </div>
              ) : (
                <p>Pickup station details are stored with your order.</p>
              )}
            </div>
          )}

          {delivery && (
            <div className="um-delivery-tracking-box">
              <h5>Delivery Tracking</h5>
              <div className="um-tracking-item">
                <span>Dispatch Status:</span>
                <strong>{delivery.status}</strong>
              </div>
              {delivery.scheduledAt && (
                <div className="um-tracking-item">
                  <span>Scheduled:</span>
                  <strong>{formatDateTime(delivery.scheduledAt)}</strong>
                </div>
              )}
              {delivery.startedAt && (
                <div className="um-tracking-item">
                  <span>Dispatched:</span>
                  <strong>{formatDateTime(delivery.startedAt)}</strong>
                </div>
              )}
              {delivery.completedAt && (
                <div className="um-tracking-item">
                  <span>Completed:</span>
                  <strong>{formatDateTime(delivery.completedAt)}</strong>
                </div>
              )}
              {delivery.failureMessage && (
                <div className="um-tracking-item">
                  <span>Issue:</span>
                  <strong>{delivery.failureMessage}</strong>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Financial Breakdown Card — server-authoritative */}
        <div className="um-info-card card">
          <h4>Payment &amp; Financial Summary</h4>
          <div className="um-financial-rows">
            <div className="um-fin-row">
              <span>Items Subtotal</span>
              <span>{formatUGX(order.pricing?.itemsSubtotalUgx || 0)}</span>
            </div>
            <div className="um-fin-row">
              <span>Delivery / Station Fee</span>
              <span>{formatUGX(order.pricing?.deliveryFeeUgx || 0)}</span>
            </div>
            <div className="um-fin-row um-fin-row--bold">
              <span>Total Order Value</span>
              <strong>{formatUGX(order.pricing?.totalUgx || 0)}</strong>
            </div>

            <div className="um-fin-divider" />

            <div className="um-fin-row">
              <span>Commitment Paid</span>
              <span className={commitmentPaidUgx > 0 ? 'um-fin-paid' : ''}>{formatUGX(commitmentPaidUgx)}</span>
            </div>
            <div className="um-fin-row">
              <span>Balance Paid</span>
              <span className={balancePaidUgx > 0 ? 'um-fin-paid' : ''}>{formatUGX(balancePaidUgx)}</span>
            </div>
            <div className="um-fin-row um-fin-row--bold">
              <span>Remaining Balance</span>
              <strong>{balanceDueUgx !== null ? formatUGX(balanceDueUgx) : formatUGX(order.pricing?.remainingBalanceUgx || 0)}</strong>
            </div>

            <div className="um-fin-divider" />

            <div className="um-payment-stage">
              <div>
                <strong>Commitment Deposit</strong>
                <small>{formatUGX(order.pricing?.commitmentUgx || 0)}</small>
              </div>
              {commitmentStatus === 'SUCCESS' ? (
                <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><Check size={12} strokeWidth={2.5} /> Paid</span>
              ) : PAYMENT_STATUS_BADGES[commitmentStatus] ? (
                <span className={`badge badge-${PAYMENT_STATUS_BADGES[commitmentStatus].type}`}>
                  {PAYMENT_STATUS_BADGES[commitmentStatus].label}
                </span>
              ) : (
                <span className="badge badge-warning">Unpaid</span>
              )}
            </div>

            <div className="um-payment-stage">
              <div>
                <strong>Remaining Balance</strong>
                <small>{formatUGX(order.pricing?.remainingBalanceUgx || 0)}</small>
              </div>
              {balanceStatus === 'SUCCESS' || balanceStatus === 'NOT_REQUIRED' ? (
                <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><Check size={12} strokeWidth={2.5} /> {balanceStatus === 'NOT_REQUIRED' ? 'Nothing Due' : 'Paid'}</span>
              ) : PAYMENT_STATUS_BADGES[balanceStatus] ? (
                <span className={`badge badge-${PAYMENT_STATUS_BADGES[balanceStatus].type}`}>
                  {PAYMENT_STATUS_BADGES[balanceStatus].label}
                </span>
              ) : (
                <span className="badge badge-neutral">Pay at Fulfillment</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Payment History — GET /api/orders/:id/payment (safe projection only) */}
      {paymentHistory.length > 0 && (
        <div className="um-order-items-box card">
          <h4>Payment History</h4>
          <div className="um-order-items-table">
            <div className="um-order-table-head">
              <span>Purpose</span>
              <span>Amount</span>
              <span>Status</span>
              <span>Date</span>
            </div>
            <div className="um-order-table-rows">
              {paymentHistory.map((p) => {
                const badge = PAYMENT_STATUS_BADGES[p.status] || { label: p.status, type: 'neutral' };
                return (
                  <div key={p.id} className="um-order-table-row">
                    <div>
                      <strong>{PAYMENT_PURPOSE_LABELS[p.purpose] || p.paymentType || p.purpose}</strong>
                      <small className="um-it-unit">
                        {p.provider} • Ref {p.transactionRef}
                      </small>
                    </div>
                    <span>{formatUGX(p.amountUgx)}</span>
                    <span className={`badge badge-${badge.type}`}>{badge.label}</span>
                    <span>{formatDateTime(p.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderDetail;
