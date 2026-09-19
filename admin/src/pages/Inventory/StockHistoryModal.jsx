import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import api from '../../services/api';
import { formatDateTime } from '../../utils/format';
import './StockActionModal.css';

/**
 * Inventory transaction history for one product.
 * GET /api/admin/products/:id/inventory/history?page=&limit=
 * -> { success, data: [transactions], product, pagination }
 * (Note the flattened `data` array + sibling `product`/`pagination` — this is
 * the actual controller shape, not the usual nested envelope.)
 */
const TYPE_LABELS = {
  RESTOCK: 'Restock',
  ADJUSTMENT: 'Adjustment',
  SALE: 'Sale',
  RETURN: 'Return',
  INITIAL: 'Initial',
};

export default function StockHistoryModal({ product, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    let active = true;
    // Async load; setState happens in promise callbacks, not synchronously.
    async function loadHistory() {
      try {
        const res = await api.get(
          `/admin/catalog/products/${product.id}/inventory/history?page=${page}&limit=10`,
        );
        if (!active) return;
        setItems(Array.isArray(res?.data) ? res.data : []);
        setPagination(res?.pagination || null);
        setError(null);
      } catch (err) {
        if (active) setError(err.message || 'Unable to load history.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadHistory();
    return () => {
      active = false;
    };
  }, [product.id, page]);

  return (
    <div className="history-modal__overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="history-modal" role="dialog" aria-modal="true" aria-labelledby="history-modal-title">
        <div className="history-modal__header">
          <h2 id="history-modal-title">
            Inventory history — <span className="mono">{product.slug}</span>
          </h2>
          <button type="button" className="history-modal__close" onClick={onClose} aria-label="Close dialog">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {loading ? (
          <div className="history-modal__loading">Loading history…</div>
        ) : error ? (
          <div className="alert alert--error" role="alert">
            <span>{error}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="history-modal__loading">No inventory transactions recorded yet.</div>
        ) : (
          <>
            <table className="history-modal__table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Type</th>
                  <th scope="col">Change</th>
                  <th scope="col">Stock</th>
                  <th scope="col">By / Reason</th>
                </tr>
              </thead>
              <tbody>
                {items.map((txn) => (
                  <tr key={txn.id}>
                    <td>{formatDateTime(txn.createdAt)}</td>
                    <td>{TYPE_LABELS[txn.type] || txn.type}</td>
                    <td className={txn.quantityChange >= 0 ? 'history-txn--in' : 'history-txn--out'}>
                      {txn.quantityChange >= 0 ? '+' : ''}
                      {txn.quantityChange}
                    </td>
                    <td>
                      {txn.previousQuantity} → {txn.newQuantity}
                    </td>
                    <td>
                      {txn.admin?.fullName || 'System'}
                      {txn.reason && <div className="inventory-page__sub">{txn.reason}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="pagination" style={{ marginTop: 14 }}>
              <span className="pagination__info">
                Page {pagination?.page ?? page} of {pagination?.totalPages ?? 1}
              </span>
              <div className="pagination__controls">
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={page >= (pagination?.totalPages ?? 1)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
