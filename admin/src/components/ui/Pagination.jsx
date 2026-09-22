import { ChevronLeft, ChevronRight } from 'lucide-react';
import './pagination.css';

/**
 * Pagination bound to the backend's { page, totalPages, total } metadata.
 * Hidden entirely when there is only one page.
 */
export default function Pagination({ pagination, onPageChange }) {
  if (!pagination || !pagination.totalPages || pagination.totalPages <= 1) {
    return null;
  }
  const { page, totalPages, total } = pagination;
  return (
    <div className="pagination">
      <span className="pagination__info">
        Page {page} of {totalPages}
        {typeof total === 'number' ? ` — ${total.toLocaleString('en-UG')} records` : ''}
      </span>
      <div className="pagination__controls">
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} aria-hidden="true" />
          Previous
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          Next
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
