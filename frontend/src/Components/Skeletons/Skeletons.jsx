import React from 'react';
import './Skeletons.css';

/**
 * UgaMarket — home to home | Skeleton loading components.
 * Communicate layout while API data loads — no blank screens.
 */

export const SkeletonBox = ({ className = '', style }) => (
  <div className={`um-skeleton ${className}`} style={style} aria-hidden="true" />
);

/** Matches the ProductCard layout exactly */
export const ProductCardSkeleton = () => (
  <div className="um-skel-card" role="status" aria-label="Loading product">
    <SkeletonBox className="um-skel-card-img" />
    <div className="um-skel-card-body">
      <SkeletonBox className="um-skel-line um-skel-line--meta" />
      <SkeletonBox className="um-skel-line um-skel-line--title" />
      <div className="um-skel-card-footer">
        <SkeletonBox className="um-skel-line um-skel-line--price" />
        <SkeletonBox className="um-skel-line um-skel-line--btn" />
      </div>
    </div>
    <span className="um-visually-hidden">Loading products…</span>
    <span className="um-visually-hidden" />
  </div>
);

export const ProductGridSkeleton = ({ count = 8 }) => (
  <div className="um-products-grid">
    {Array.from({ length: count }, (_, i) => (
      <ProductCardSkeleton key={i} />
    ))}
  </div>
);

export const CategoryGridSkeleton = ({ count = 6 }) => (
  <div className="um-cat-grid">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="um-skel-card" role="status" aria-label="Loading category">
        <SkeletonBox className="um-skel-cat-img" />
        <div className="um-skel-card-body">
          <SkeletonBox className="um-skel-line um-skel-line--title" />
          <SkeletonBox className="um-skel-line um-skel-line--meta" />
        </div>
      </div>
    ))}
  </div>
);
