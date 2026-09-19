import { useEffect, useState } from 'react';
import { X, Truck, UserPlus } from 'lucide-react';
import api from '../../services/api';
import './DeliveryStatusModal.css';

/**
 * Delivery manage modal: status transition (+ failure details when FAILED)
 * and dispatcher assignment.
 * Verified contract:
 *  - PATCH /api/admin/deliveries/:id/status
 *      { status, failureReason?, failureMessage?, notes?, scheduledAt? }
 *  - PATCH /api/admin/deliveries/:id/assign { assignedAdminId, notes? }
 * The backend enforces the delivery state machine and fulfillment-type
 * branches; a 409 means the chosen transition is not allowed from here.
 */
const FAILURE_REASONS = [
  { value: 'CUSTOMER_UNAVAILABLE', label: 'Customer unavailable' },
  { value: 'INVALID_ADDRESS', label: 'Invalid address' },
  { value: 'DRIVER_UNABLE_TO_COMPLETE', label: 'Driver unable to complete' },
  { value: 'PICKUP_STATION_ISSUE', label: 'Pickup station issue' },
  { value: 'OTHER', label: 'Other' },
];

export default function DeliveryStatusModal({ delivery, onClose, onDone }) {
  const [mode, setMode] = useState('status'); // 'status' | 'assign'
  const [status, setStatus] = useState('');
  const [failureReason, setFailureReason] = useState('');
  const [failureMessage, setFailureMessage] = useState('');
  const [notes, setNotes] = useState('');
  const [staff, setStaff] = useState([]);
  const [assignedAdminId, setAssignedAdminId] = useState('');
  const [validation, setValidation] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Load candidate assignees (dispatchers/admins) from the deliveries page's
  // own assignment flow: the backend validates target staff server-side.
  // There is no public admin-directory endpoint, so assignment uses a pasted
  // admin ID OR the assigned dispatcher shown on the record. We support the
  // ID field and surface backend errors verbatim.
  useEffect(() => {
    if (mode !== 'assign') return;
    setStaff([]);
  }, [mode]);

  const validate = () => {
    const errors = {};
    if (mode === 'status') {
      if (!status) errors.status = 'Choose the new status.';
      if (status === 'FAILED') {
        if (!failureReason) errors.failureReason = 'A failure reason is required for FAILED.';
        if (!failureMessage.trim())
          errors.failureMessage = 'A short failure message is required for FAILED.';
      }
    } else if (!assignedAdminId.trim()) {
      errors.assignedAdminId = 'Enter the staff member ID to assign.';
    }
    setValidation(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setServerError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (mode === 'status') {
        const payload = { status };
        if (status === 'FAILED') {
          payload.failureReason = failureReason;
          payload.failureMessage = failureMessage.trim();
        }
        if (notes.trim()) payload.notes = notes.trim();
        await api.patch(`/admin/deliveries/${delivery.id}/status`, payload);
        await onDone(`Delivery for ${delivery.orderNumber || 'order'} moved to ${status}.`);
      } else {
        const payload = { assignedAdminId: assignedAdminId.trim() };
        if (notes.trim()) payload.notes = notes.trim();
        await api.patch(`/admin/deliveries/${delivery.id}/assign`, payload);
        await onDone(`Delivery for ${delivery.orderNumber || 'order'} assigned.`);
      }
    } catch (err) {
      setServerError(
        err.status === 409
          ? `The backend rejected this operation: ${err.message}`
          : err.message || 'Operation failed.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dstat-modal__overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dstat-modal" role="dialog" aria-modal="true" aria-labelledby="dstat-title">
        <div className="dstat-modal__header">
          <Truck size={17} aria-hidden="true" />
          <h2 id="dstat-title">Manage delivery</h2>
          <button type="button" className="dstat-modal__close" onClick={onClose} aria-label="Close dialog">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <p className="dstat-modal__order">
          Order <strong className="mono">{delivery.orderNumber || delivery.orderId}</strong> ·
          current status <strong>{delivery.status}</strong> ·{' '}
          {delivery.fulfillmentType === 'PICKUP_STATION' ? 'Pickup' : 'Home delivery'}
        </p>

        <div className="dstat-modal__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'status'}
            className={`dstat-modal__tab ${mode === 'status' ? 'dstat-modal__tab--active' : ''}`}
            onClick={() => setMode('status')}
          >
            <Truck size={13} aria-hidden="true" />
            Update status
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'assign'}
            className={`dstat-modal__tab ${mode === 'assign' ? 'dstat-modal__tab--active' : ''}`}
            onClick={() => setMode('assign')}
          >
            <UserPlus size={13} aria-hidden="true" />
            Assign staff
          </button>
        </div>

        {serverError && (
          <div className="alert alert--error" role="alert" style={{ marginBottom: 12 }}>
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {mode === 'status' ? (
            <>
              <div className="form-field">
                <label htmlFor="dstat-status" className="required">
                  New status
                </label>
                <select
                  id="dstat-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  disabled={submitting}
                >
                  <option value="">Select status…</option>
                  {['PENDING', 'ASSIGNED', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PICKED_UP', 'FAILED', 'CANCELLED'].map(
                    (s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ),
                  )}
                </select>
                {validation.status && <span className="field-error">{validation.status}</span>}
                <span className="field-hint">
                  The backend validates this against the delivery state machine for the
                  fulfillment type.
                </span>
              </div>

              {status === 'FAILED' && (
                <>
                  <div className="form-field">
                    <label htmlFor="dstat-reason" className="required">
                      Failure reason
                    </label>
                    <select
                      id="dstat-reason"
                      value={failureReason}
                      onChange={(e) => setFailureReason(e.target.value)}
                      disabled={submitting}
                    >
                      <option value="">Select reason…</option>
                      {FAILURE_REASONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    {validation.failureReason && (
                      <span className="field-error">{validation.failureReason}</span>
                    )}
                  </div>
                  <div className="form-field">
                    <label htmlFor="dstat-fmsg" className="required">
                      Failure message
                    </label>
                    <input
                      id="dstat-fmsg"
                      type="text"
                      value={failureMessage}
                      onChange={(e) => setFailureMessage(e.target.value)}
                      maxLength={500}
                      placeholder="Customer not reachable at the address."
                      disabled={submitting}
                    />
                    {validation.failureMessage && (
                      <span className="field-error">{validation.failureMessage}</span>
                    )}
                  </div>
                </>
              )}

              <div className="form-field">
                <label htmlFor="dstat-notes">Operational notes (optional)</label>
                <textarea
                  id="dstat-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={500}
                  disabled={submitting}
                />
              </div>
            </>
          ) : (
            <div className="form-field">
              <label htmlFor="dstat-assignee" className="required">
                Staff member ID (DISPATCHER / ADMIN / SUPER_ADMIN)
              </label>
              <input
                id="dstat-assignee"
                type="text"
                value={assignedAdminId}
                onChange={(e) => setAssignedAdminId(e.target.value)}
                placeholder="UUID of the staff member"
                disabled={submitting}
                className="mono"
              />
              {validation.assignedAdminId && (
                <span className="field-error">{validation.assignedAdminId}</span>
              )}
              <span className="field-hint">
                The backend verifies the target is active staff; only home deliveries can be
                assigned.
              </span>
            </div>
          )}

          <div className="dstat-modal__actions">
            <button type="button" className="btn btn--secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'Applying…' : mode === 'status' ? 'Apply status' : 'Assign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
