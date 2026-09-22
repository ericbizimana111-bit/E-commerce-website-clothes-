import React from 'react';
import { useLanguage } from '../../Context/LanguageContext';
import './Skeletons.css';

/** Skeleton placeholders: keep the layout stable while API data loads. */

export const SkeletonBox = ({ className = '', style }) => (
  <div className={`um-skeleton ${className}`} style={style} aria-hidden="true" />
);

/** Mirrors the ProductCard layout so nothing jumps when data arrives. */
export const ProductCardSkeleton = () => (
  <div className="um-skel-card" aria-hidden="true">
    <SkeletonBox className="um-skel-card-img" />
    <div className="um-skel-card-body">
      <SkeletonBox className="um-skel-line um-skel-line--title" />
      <SkeletonBox className="um-skel-line um-skel-line--title-short" />
      <SkeletonBox className="um-skel-line um-skel-line--price" />
      <SkeletonBox className="um-skel-line um-skel-line--btn" />
    </div>
  </div>
);

export const ProductGridSkeleton = ({ count = 8 }) => {
  const { t } = useLanguage();
  return (
    <div className="um-products-grid" role="status" aria-label={t('productsLoadingLabel')}>
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
};

export const CategoryGridSkeleton = ({ count = 6 }) => {
  const { t } = useLanguage();
  return (
    <div className="um-cat-grid" role="status" aria-label={t('categoryLoadingLabel')}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="um-skel-card" aria-hidden="true">
          <SkeletonBox className="um-skel-cat-img" />
          <div className="um-skel-card-body">
            <SkeletonBox className="um-skel-line um-skel-line--title" />
          </div>
        </div>
      ))}
    </div>
  );
};
