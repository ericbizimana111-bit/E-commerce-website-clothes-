import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../Context/LanguageContext';

/** Page list with ellipses, e.g. 1 … 4 5 [6] 7 8 … 20 */
export function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (current >= total - 2) [total - 1, total - 2, total - 3].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push('gap');
    result.push(p);
  });
  return result;
}

const Pagination = ({ page, totalPages, onChange }) => {
  const { t } = useLanguage();
  if (!totalPages || totalPages <= 1) return null;

  return (
    <nav className="um-pagination" aria-label={t('page')}>
      <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft size={15} aria-hidden="true" />
        <span className="um-pagination__label">{t('previous')}</span>
      </button>

      <div className="um-page-numbers">
        {pageWindow(page, totalPages).map((p, i) =>
          p === 'gap' ? (
            <span key={`gap-${i}`} className="um-page-gap" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={`um-page-btn ${p === page ? 'um-page-btn--active' : ''}`}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          )
        )}
      </div>

      <button type="button" className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        <span className="um-pagination__label">{t('next')}</span>
        <ChevronRight size={15} aria-hidden="true" />
      </button>
    </nav>
  );
};

export default Pagination;
