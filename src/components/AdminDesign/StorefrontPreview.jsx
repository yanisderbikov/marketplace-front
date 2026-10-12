import React, { useMemo, useState } from 'react';
import { buildShopTheme } from '../../shared/shopTheme';
import styles from './StorefrontPreview.module.css';

// Две карточки-заглушки: каталог мерчанта здесь не грузим — превью про оформление,
// а не про товары. Бейджи (скидка, предзаказ) показывают, как акцент ляжет на фото.
const PLACEHOLDER_PRODUCTS = [
  { key: 'first', name: 'Ваш товар', price: '1 990 ₽', crossedPrice: '2 490 ₽', badge: 'discount' },
  { key: 'second', name: 'Ещё один товар', price: 'от 890 ₽', crossedPrice: null, badge: 'preorder' },
];

const HeartIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
  </svg>
);

const CartIcon = () => (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="9" cy="21" r="1" />
    <circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
);

const PhotoPlaceholderIcon = () => (
  <svg
    className={styles.photoIcon}
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <circle cx="8.5" cy="8.5" r="1.6" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
);

/**
 * Живое превью витрины на вкладке «Дизайн»: шапка, первый экран и пара карточек
 * в тех же CSS-переменных --shop-*, что читает настоящая витрина (buildShopTheme).
 * Раскладка повторяет партнёрские витрины anyforms (shopThemes.js): логотип
 * в шапке вместо названия (headerLogo), заголовок (tagline) и описание рядом
 * с квадратным фото (heroImage), кнопка к каталогу, «бутиковые» карточки 3:4,
 * ниже — «О магазине». Это уменьшенная вёрстка, а не iframe витрины: несохранённые
 * правки видны сразу, без запросов к бэку.
 */
const StorefrontPreview = ({
  name,
  brandColor,
  logoUrl,
  heroImageUrl,
  tagline,
  description,
  about,
  storefrontPath,
}) => {
  const theme = useMemo(() => buildShopTheme(brandColor), [brandColor]);
  // Логотип и фото — presigned-ссылки S3, живут 6 часов. Если вкладка открыта
  // дольше, картинка перестанет грузиться — тогда рисуем запасной вариант
  // (название текстом / заголовок без фото), а не битую иконку.
  const [brokenUrls, setBrokenUrls] = useState({});
  const markBroken = (url) => setBrokenUrls((prev) => ({ ...prev, [url]: true }));

  const shopName = name?.trim() || 'Ваш магазин';
  const title = tagline?.trim() || shopName;
  const descriptionText = description?.trim() || '';
  const aboutText = about?.trim() || '';
  const showLogo = Boolean(logoUrl) && !brokenUrls[logoUrl];
  const showHero = Boolean(heroImageUrl) && !brokenUrls[heroImageUrl];
  const host = typeof window !== 'undefined' ? window.location.host : '';

  return (
    <div className={styles.frame}>
      <div className={styles.browserBar} aria-hidden="true">
        <span className={styles.browserDots}>
          <span />
          <span />
          <span />
        </span>
        <span className={styles.browserUrl}>
          {host}
          {storefrontPath}
        </span>
      </div>

      <div
        className={styles.page}
        style={{ ...theme.style, background: theme.pageBackground }}
        role="img"
        aria-label={`Предпросмотр витрины «${shopName}»`}
      >
        <div className={styles.header}>
          {showLogo ? (
            <img
              className={styles.logo}
              src={logoUrl}
              alt=""
              decoding="async"
              onError={() => markBroken(logoUrl)}
            />
          ) : (
            <span className={styles.logoText}>{shopName}</span>
          )}
          <span className={styles.headerIcons}>
            <HeartIcon />
            <CartIcon />
          </span>
        </div>

        {showHero ? (
          <section className={styles.hero}>
            <div className={styles.heroTitleBlock}>
              <p className={styles.shopTitle}>{title}</p>
              <span className={styles.divider} />
              {descriptionText && <p className={styles.heroDescription}>{descriptionText}</p>}
            </div>
            <div className={styles.heroMedia}>
              <img
                className={styles.heroImage}
                src={heroImageUrl}
                alt=""
                decoding="async"
                onError={() => markBroken(heroImageUrl)}
              />
            </div>
            <span className={styles.heroCta}>Смотреть каталог</span>
          </section>
        ) : (
          // Без фото витрины — текстовый первый экран, как у темы без heroImage.
          <div className={styles.intro}>
            <p className={styles.shopTitle}>{title}</p>
            <span className={styles.divider} />
            {descriptionText && <p className={styles.introDescription}>{descriptionText}</p>}
          </div>
        )}

        {showHero && (
          <div className={styles.sectionHead}>
            <p className={styles.sectionTitle}>Каталог</p>
            <span className={styles.divider} />
          </div>
        )}

        <ul className={styles.grid}>
          {PLACEHOLDER_PRODUCTS.map((product) => (
            <li key={product.key} className={styles.card}>
              <div className={styles.photo}>
                <PhotoPlaceholderIcon />
                {product.badge === 'discount' && <span className={styles.discountBadge}>−20%</span>}
                {product.badge === 'preorder' && <span className={styles.preorderBadge}>Предзаказ</span>}
              </div>
              <p className={styles.cardName}>{product.name}</p>
              <p className={styles.prices}>
                <span className={styles.price}>{product.price}</span>
                {product.crossedPrice && <span className={styles.crossedPrice}>{product.crossedPrice}</span>}
              </p>
            </li>
          ))}
        </ul>

        {aboutText && (
          <div className={styles.about}>
            <div className={styles.sectionHead}>
              <p className={styles.sectionTitle}>О магазине</p>
              <span className={styles.divider} />
            </div>
            <p className={styles.aboutText}>{aboutText}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default StorefrontPreview;
