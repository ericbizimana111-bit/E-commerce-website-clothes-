import './loaders.css';

/**
 * Professional skeleton loaders — no blank screens while data loads.
 */

export function TableSkeleton({ rows = 6, columns = 5 }) {
  return (
    <div className="skel-table" aria-hidden="true">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="skel-table__row">
          {Array.from({ length: columns }, (_, c) => (
            <span
              key={c}
              className="skel"
              style={{ width: c === 0 ? '26%' : `${Math.max(12, 62 / columns)}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 4 }) {
  return (
    <div className="skel-cards" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skel-card">
          <span className="skel skel--label" />
          <span className="skel skel--value" />
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="skel-detail" aria-hidden="true">
      <span className="skel skel--title" />
      <span className="skel" style={{ width: '70%' }} />
      <span className="skel" style={{ width: '55%' }} />
      <span className="skel" style={{ width: '82%' }} />
    </div>
  );
}
