import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import apiClient from '../../api/client';
import { useLanguage } from '../../Context/LanguageContext';
import { formatUGX } from '../../utils/currency';
import './OrderDetail.css';

const LIFECYCLE_STEPS = [
  { key: 'ORDER_PLACED', label: 'Order Placed' },
  { key: 'COMMITMENT_PAID', label: '10% Deposit Paid' },
  { key: 'PREPARING', label: 'Harvesting & Packing' },
  { key: 'IN_TRANSIT', label: 'Quality Check & Transit' },
  { key: 'FULFILLED', label: 'Delivered / Picked Up' },
  { key: 'COMPLETED', label: 'Balance Paid & Complete' }
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

const OrderDetail = () => {
  const { id } = useParams();
  const { currentLang } = useLanguage();

  const [order, setOrder] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const fetchOrderDetails = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [orderRes, delivRes] = await Promise.allSettled([
        apiClient.get(`/orders/${id}?lang=${currentLang || 'en'}`),
        apiClient.get(`/orders/${id}/delivery`)
      ]);

      if (orderRes.status === 'fulfilled' && orderRes.value?.data) {
        setOrder(orderRes.value.data);
      } else {
        throw new Error('Order not found');
      }

      if (delivRes.status === 'fulfilled' && delivRes.value?.data?.delivery) {
        setDelivery(delivRes.value.data.delivery);
      }
    } catch (err) {
      console.error('Failed to load order', err);
      setErrorMessage(err.message || 'Could not load order details');
    } finally {
      setLoading(false);
    }
  }, [id, currentLang]);

  useEffect(() => {
    fetchOrderDetails();
  }, [fetchOrderDetails]);

  // Payment Handler
  const handleInitiatePayment = async (purpose) => {
    setActionLoading(true);
    setActionMessage(null);
    setErrorMessage(null);
    try {
      const res = await apiClient.post(`/orders/${id}/payment`, {
        purpose,
        language: currentLang || 'en'
      });

      if (res?.success) {
        const payment = res.data?.payment;
        const msg = res.message || 'Payment initiated successfully';
        setActionMessage(
          `✓ ${msg}. Reference: ${payment?.transactionRef || 'Pending'}. Status: ${payment?.status || 'Processing'}`
        );
        // Refresh order status
        setTimeout(() => {
          fetchOrderDetails();
        }, 1200);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Payment initiation failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Order Cancellation Handler
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
        fetchOrderDetails();
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
        <div className="alert alert-error">
          <span>⚠️ {errorMessage}</span>
        </div>
        <Link to="/account/orders" className="btn btn-secondary" style={{ width: 'fit-content' }}>
          ← Back to Orders
        </Link>
      </div>
    );
  }

  const currentStep = getStepIndex(order.status);
  const isCancelled = order.status === 'CANCELLED' || order.status === 'REFUNDED';
  const canPayCommitment = order.status === 'PENDING_PAYMENT';
  const canPayBalance = order.status === 'DELIVERED' || order.status === 'PICKED_UP';
  const canCancel = ['PENDING_PAYMENT', 'COMMITMENT_PAID', 'CONFIRMED'].includes(order.status);

  // Check paid payments
  const payments = order.payments || [];
  const commitmentPayment = payments.find((p) => p.purpose === 'COMMITMENT' && p.status === 'SUCCESS');
  const balancePayment = payments.find((p) => p.purpose === 'BALANCE' && p.status === 'SUCCESS');

  return (
    <div className="card um-subview-card um-order-detail-view">
      {/* Header */}
      <div className="um-order-detail-header">
        <div>
          <Link to="/account/orders" className="um-back-link">
            ← Back to All Orders
          </Link>
          <div className="um-order-title-wrap">
            <h2>Order {order.orderNumber}</h2>
            <span className={`badge ${isCancelled ? 'badge-danger' : 'badge-success'}`}>
              {order.status}
            </span>
          </div>
          <span className="um-order-timestamp">
            Placed on {new Date(order.createdAt).toLocaleString()}
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
        <div className="alert alert-success">
          <span>{actionMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="alert alert-error">
          <span>⚠️ {errorMessage}</span>
        </div>
      )}

      {/* Lifecycle Progress Stepper */}
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
                    {isPassed && !isCurrent ? '✓' : idx + 1}
                  </div>
                  <span className="um-step-label">{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="alert alert-error">
          <span>❌ This order has been cancelled.</span>
        </div>
      )}

      {/* Action Banners */}
      {canPayCommitment && (
        <div className="um-action-banner card">
          <div>
            <strong>Action Required: Pay 10% Commitment Deposit</strong>
            <p>
              Please pay <strong>{formatUGX(order.pricing?.commitmentUgx)}</strong> via Mobile Money to confirm and start harvesting your fresh produce.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleInitiatePayment('COMMITMENT')}
            disabled={actionLoading}
            className="btn btn-primary btn-lg"
          >
            {actionLoading ? 'Initiating...' : `Pay Deposit (${formatUGX(order.pricing?.commitmentUgx)})`}
          </button>
        </div>
      )}

      {canPayBalance && (
        <div className="um-action-banner card um-balance-action-banner">
          <div>
            <strong>Produce Received: Complete 90% Balance</strong>
            <p>
              Your produce has been delivered/picked up! Please verify quality and complete the remaining balance of{' '}
              <strong>{formatUGX(order.pricing?.remainingBalanceUgx)}</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleInitiatePayment('BALANCE')}
            disabled={actionLoading}
            className="btn btn-accent btn-lg"
          >
            {actionLoading ? 'Processing...' : `Pay 90% Balance (${formatUGX(order.pricing?.remainingBalanceUgx)})`}
          </button>
        </div>
      )}

      {/* Order Items Table */}
      <div className="um-order-items-box card">
        <h4>Harvest Line Items</h4>
        <div className="um-order-items-table">
          <div className="um-order-table-head">
            <span>Produce</span>
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

      {/* Two Column Section: Fulfillment & Financials */}
      <div className="um-order-info-grid">
        {/* Fulfillment Card */}
        <div className="um-info-card card">
          <h4>Fulfillment Destination</h4>
          {order.fulfillment?.method === 'HOME_DELIVERY' ? (
            <div className="um-fulfillment-info">
              <span className="badge badge-info">🚚 Home Delivery</span>
              {order.fulfillment.address ? (
                <div className="um-addr-box">
                  <strong>{order.fulfillment.address.recipientName}</strong>
                  <span>📞 {order.fulfillment.address.phone}</span>
                  <p>{order.fulfillment.address.addressLine}, {order.fulfillment.address.city || order.fulfillment.address.district}</p>
                  {order.fulfillment.address.deliveryNotes && (
                    <small>Instructions: {order.fulfillment.address.deliveryNotes}</small>
                  )}
                </div>
              ) : (
                <p>Address details stored on order.</p>
              )}
            </div>
          ) : (
            <div className="um-fulfillment-info">
              <span className="badge badge-success">📍 Pickup Station</span>
              {order.fulfillment?.station ? (
                <div className="um-station-info-box">
                  <strong>{order.fulfillment.station.name}</strong>
                  <p>{order.fulfillment.station.addressLine}, {order.fulfillment.station.district || order.fulfillment.station.city}</p>
                  <span>🕒 {order.fulfillment.station.operatingHours || '8:00 AM - 7:00 PM'}</span>
                </div>
              ) : (
                <p>Pickup station selected on order.</p>
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
              {delivery.trackingCode && (
                <div className="um-tracking-item">
                  <span>Tracking Code:</span>
                  <code>{delivery.trackingCode}</code>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Financial Breakdown Card */}
        <div className="um-info-card card">
          <h4>Payment & Financial Summary</h4>
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

            <div className="um-fin-payment-status">
              <div className="um-payment-stage">
                <div>
                  <strong>10% Commitment Deposit</strong>
                  <small>{formatUGX(order.pricing?.commitmentUgx || 0)}</small>
                </div>
                {(commitmentPayment || (order.status !== 'PENDING_PAYMENT' && !isCancelled)) ? (
                  <span className="badge badge-success">✓ Paid</span>
                ) : (
                  <span className="badge badge-warning">Unpaid</span>
                )}
              </div>

              <div className="um-payment-stage">
                <div>
                  <strong>90% Remaining Balance</strong>
                  <small>{formatUGX(order.pricing?.remainingBalanceUgx || 0)}</small>
                </div>
                {balancePayment || order.status === 'COMPLETED' ? (
                  <span className="badge badge-success">✓ Paid</span>
                ) : (
                  <span className="badge badge-neutral">Pay on Delivery</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderDetail;
