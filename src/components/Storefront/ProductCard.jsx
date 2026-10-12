import React from 'react';
import { Link } from 'react-router-dom';
import { formatPrice } from '../../shared/money';
import LikeButton from './LikeButton';
import styles from './ProductCard.module.css';

// В каталоге у карточки только название и цена — описание живёт на странице
// товара. boutique — подача для витрин с темой: крупное фото 3:4 без рамки
// (на маркетплейсе тема есть у каждой витрины, поэтому Storefront всегда
// передаёт boutique; базовый вид оставлен как в anyforms).
//
// Карточка — настоящая ссылка (растянутая на всю карточку через ::after у
// названия), а не article с onClick: товар можно открыть в новой вкладке,
// а сердечко поверх ссылки остаётся отдельной кнопкой.
const ProductCard = ({ item, to, slug, index = null, boutique = false }) => {
  const photos = item.photos?.length ? item.photos : [];
  const firstPhoto = photos[0];
  // Вторая фотография (порядок задаётся в кабинете) проявляется при наведении на карточку.
  const hoverPhoto = photos[1];

  // Товар с вариантами (размерами) — в карточке показываем цену «от минимальной».
  const variantPrices = (item.variants ?? [])
    .map((v) => Number(v.priceKopecks))
    .filter((n) => Number.isFinite(n) && n > 0);
  const minVariantPrice = variantPrices.length ? Math.min(...variantPrices) : null;

  const hasCrossedPrice = minVariantPrice == null
    && item.crossedPriceKopecks != null
    && Number(item.crossedPriceKopecks) > Number(item.priceKopecks);
  // discountPercent бэк считает от основной цены и зачёркнутой, варианты не
  // учитывает. Бейдж «−N%» показываем по тому же условию, что и зачёркнутую
  // цену: иначе у товара с вариантами висит «−18%» рядом с «от 1 290 ₽» без
  // зачёркнутой цены, а у дорогого варианта скидка и вовсе неправда.
  const showDiscount = hasCrossedPrice && item.discountPercent > 0;

  return (
    <article className={boutique ? `${styles.card} ${styles.boutique}` : styles.card}>
      <div className={styles.photoWrap}>
        <LikeButton slug={slug} productId={item.id} overlay />
        {firstPhoto ? (
          <img
            className={styles.photo}
            src={firstPhoto}
            alt={item.name}
            loading={index != null && index >= 4 ? 'lazy' : undefined}
            decoding="async"
          />
        ) : null}
        {firstPhoto && hoverPhoto ? (
          <img
            className={styles.photoHover}
            src={hoverPhoto}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
          />
        ) : null}
        {showDiscount && (
          <span className={styles.discountBadge}>−{item.discountPercent}%</span>
        )}
        {item.preorder && <span className={styles.preorderBadge}>Предзаказ</span>}
      </div>
      <div className={styles.body}>
        <h2 className={styles.name}>
          <Link className={styles.link} to={to}>
            {item.name}
          </Link>
        </h2>
        <div className={styles.prices}>
          <span className={styles.price}>
            {minVariantPrice != null
              ? `от ${formatPrice(minVariantPrice)}`
              : formatPrice(item.priceKopecks)}
          </span>
          {hasCrossedPrice && (
            <span className={styles.crossedPrice}>{formatPrice(item.crossedPriceKopecks)}</span>
          )}
        </div>
      </div>
    </article>
  );
};

export default ProductCard;
