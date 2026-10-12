import React from 'react';
import styles from './ProductCard.module.css';

// Заглушка карточки на время загрузки каталога: те же классы и размеры, что
// у ProductCard, поэтому сетка не прыгает, когда приходят товары. Ширина
// полосок немного разная, чтобы ряд не выглядел штампом.
const NAME_WIDTHS = ['82%', '64%', '74%', '90%'];
const PRICE_WIDTHS = ['4.6em', '3.8em', '5.4em'];

const ProductCardSkeleton = ({ index = 0, boutique = false }) => (
  <div className={`${styles.card} ${styles.skeleton}${boutique ? ` ${styles.boutique}` : ''}`}>
    <div className={`${styles.photoWrap} ${styles.shimmer}`} />
    <div className={styles.body}>
      <div className={styles.name}>
        <span
          className={`${styles.skeletonLine} ${styles.shimmer}`}
          style={{ width: NAME_WIDTHS[index % NAME_WIDTHS.length] }}
        />
      </div>
      <div className={styles.prices}>
        <span className={styles.price}>
          <span
            className={`${styles.skeletonLine} ${styles.shimmer}`}
            style={{ width: PRICE_WIDTHS[index % PRICE_WIDTHS.length] }}
          />
        </span>
      </div>
    </div>
  </div>
);

export default ProductCardSkeleton;
