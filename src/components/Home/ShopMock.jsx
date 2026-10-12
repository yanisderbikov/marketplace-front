import React, { useMemo } from 'react';
import { buildShopTheme } from '../../shared/shopTheme';
import styles from './ShopMock.module.css';

const PRODUCT_PLACEHOLDERS = [0, 1, 2];

// Подписи готовых цветов (BRAND_SWATCHES) для aria-label и подсказок у свотчей.
export const SWATCH_NAMES = {
  '#111111': 'чёрный',
  '#572631': 'бордо',
  '#d78da1': 'пыльная роза',
  '#c2410c': 'терракота',
  '#c9a227': 'горчица',
  '#3f6b4f': 'хвоя',
  '#7f95a7': 'пыльно-голубой',
  '#1e3a8a': 'индиго',
};

/**
 * Схематичная витрина в окне браузера, раскрашенная buildShopTheme — той же
 * функцией, что красит настоящие витрины. Нужна там, где мерчант выбирает цвет
 * (главная платформы, онбординг): видно, как один цвет превращается в шапку,
 * фон, цены и кнопки. Товары — серые плашки, а не выдуманные товары и цены.
 *
 * brandColor — '#rrggbb' (невалидный → нейтральная чёрная тема);
 * name — название в шапке; address — строка в адресной строке окна.
 */
const ShopMock = ({ brandColor, name, address, className = '' }) => {
  const theme = useMemo(() => buildShopTheme(brandColor), [brandColor]);

  return (
    <div className={`${styles.window} ${className}`} style={theme.style} aria-hidden="true">
      <div className={styles.chrome}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.url}>{address}</span>
      </div>
      <div className={styles.page}>
        <div className={styles.header}>
          <span className={styles.logo}>{name}</span>
          <span className={styles.cart}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 7h12l-1.2 11.1a2 2 0 0 1-2 1.9H9.2a2 2 0 0 1-2-1.9L6 7Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path d="M9 7a3 3 0 0 1 6 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
        </div>

        <div className={styles.hero}>
          <span className={`${styles.bar} ${styles.barTitle}`} />
          <span className={`${styles.bar} ${styles.barText}`} />
          <span className={`${styles.bar} ${styles.barTextShort}`} />
        </div>

        <div className={styles.grid}>
          {PRODUCT_PLACEHOLDERS.map((i) => (
            <div key={i} className={styles.card}>
              <div className={styles.photo} />
              <span className={`${styles.bar} ${styles.barName}`} />
              <span className={styles.price} />
              <span className={styles.btn}>в корзину</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ShopMock;
