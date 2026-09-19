import { Inbox, AlertCircle, RefreshCw } from 'lucide-react';

/**
 * Empty state: honest "no data" rendering (never fake rows).
 */
export function EmptyState({ title = 'Nothing here yet', message, action }) {
  return (
    <div className="state-block" role="status">
      <Inbox size={30} aria-hidden="true" />
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

/**
 * Error state: customer-friendly recovery, never a raw technical dump.
 */
export function ErrorState({ message = 'Something went wrong loading this data.', onRetry }) {
  return (
    <div className="state-block state-block--error" role="alert">
      <AlertCircle size={30} aria-hidden="true" />
      <h3>Unable to load data</h3>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  );
}
