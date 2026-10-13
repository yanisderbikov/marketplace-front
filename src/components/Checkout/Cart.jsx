import React, { useEffect } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { formatPrice } from '../../shared/money';
import { useCartRefresh } from './useCartRefresh';
import styles from './checkout.module.css';
import { shopPath } from '../Storefront/storefrontPaths';

// Бэк принимает quantity 1..99 в позиции заказа — дальше «+» не пускаем.
const MAX_QUANTITY = 99;

const lineKey = (item) => `${item.productId}:${item.variantId ?? ''}`;
const lineName = (item) => (item.variantLabel ? `${item.name} ${item.variantLabel}` : item.name);

const Cart = () => {
  // Страница внутри StorefrontLayout: магазин уже загружен, шапка и тема — от лэйаута.
  const { shop, slug } = useOutletContext();
  const { items, count, totalKopecks, setQuantity, removeItem, syncWithProducts } = useCart(slug);
  const navigate = useNavigate();
  // Корзина из localStorage могла устареть — сверяем со свежим каталогом витрины.
  const { removedNames } = useCartRefresh(slug, items, syncWithProducts);
  const shopBase = shopPath(slug);
  const acceptsOrders = Boolean(shop?.acceptsOrders);

  // Заголовок вкладки: StorefrontLayout ставит название магазина раньше (layout-эффект),
  // страница уточняет его своим.
  const shopName = shop?.name;
  useEffect(() => {
    if (shopName) document.title = `Корзина — ${shopName}`;
  }, [shopName]);

  const changeQty = (item, delta) => {
    const newQty = Math.min(MAX_QUANTITY, Math.max(0, item.quantity + delta));
    if (newQty === item.quantity) return;
    // 0 — CartContext сам убирает позицию.
    setQuantity(item.productId, item.variantId, newQty);
  };

  const removedNote = removedNames.length > 0 && (
    <p className={`${styles.note} ${styles.noteTop}`} role="status">
      <strong>Корзина обновлена:</strong> {removedNames.join(', ')} — больше нет в продаже,
      мы убрали {removedNames.length > 1 ? 'эти позиции' : 'эту позицию'} из корзины.
    </p>
  );

  return (
    <div className={styles.page} id="top">
      <div className={styles.inner}>
        <div className={styles.topBar}>
          <Link className={styles.back} to={shopBase}>
            ← В магазин
          </Link>
        </div>
        <span className={styles.eyebrow}>Корзина{shop?.name ? ` · ${shop.name}` : ''}</span>
        <h1 className={styles.title}>Ваш заказ</h1>

        {items.length === 0 ? (
          <>
            {removedNote}
            <div className={styles.centered}>
              <p className={styles.centeredText}>В корзине пока пусто.</p>
              <Link className={styles.primaryLink} to={shopBase}>
                <span>Перейти к товарам</span>
                <span className={styles.ctaArrow} aria-hidden="true">→</span>
              </Link>
            </div>
          </>
        ) : (
          <>
            {removedNote}
            <div className={styles.cartList}>
              {items.map((item) => (
                <div key={lineKey(item)} className={styles.cartRow}>
                  {item.photo ? (
                    <img className={styles.cartPhoto} src={item.photo} alt={item.name} />
                  ) : (
                    <div className={styles.cartPhoto} />
                  )}
                  <div className={styles.cartInfo}>
                    <p className={styles.cartName}>
                      <Link
                        to={shopPath(slug, `product/${encodeURIComponent(item.productId)}`)}
                        className={styles.cartNameLink}
                      >
                        {lineName(item)}
                      </Link>
                      {item.preorder && <span className={styles.preorderTag}>Предзаказ</span>}
                    </p>
                    <div className={styles.cartUnit}>{formatPrice(item.priceKopecks)} / шт</div>
                  </div>
                  <div className={styles.qty}>
                    <button
                      type="button"
                      className={styles.qtyBtn}
                      onClick={() => changeQty(item, -1)}
                      aria-label="Уменьшить количество"
                    >
                      −
                    </button>
                    <span className={styles.qtyVal}>{item.quantity}</span>
                    <button
                      type="button"
                      className={styles.qtyBtn}
                      onClick={() => changeQty(item, 1)}
                      disabled={item.quantity >= MAX_QUANTITY}
                      aria-label="Увеличить количество"
                    >
                      +
                    </button>
                  </div>
                  <div className={styles.rowPrice}>{formatPrice(item.priceKopecks * item.quantity)}</div>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => removeItem(item.productId, item.variantId)}
                    aria-label="Удалить из корзины"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div className={styles.summary}>
              <div className={styles.summaryRow}>
                <span>Товары ({count})</span>
                <span>{formatPrice(totalKopecks)}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Доставка СДЭК</span>
                <span>на ПВЗ при получении</span>
              </div>
              <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                <span>К оплате сейчас</span>
                <span>{formatPrice(totalKopecks)}</span>
              </div>
            </div>

            {acceptsOrders ? (
              <button
                type="button"
                className={styles.payBtn}
                onClick={() => navigate(shopPath(slug, 'checkout'))}
              >
                <span>Оформить заказ</span>
                <span className={styles.ctaArrow} aria-hidden="true">→</span>
              </button>
            ) : (
              // Продавец ещё не подключил оплату/доставку/реквизиты (или витрину
              // выключили): оформлять нельзя, но корзину не трогаем — она дождётся.
              <>
                <button type="button" className={styles.payBtn} disabled>
                  <span>Оформить заказ</span>
                  <span className={styles.ctaArrow} aria-hidden="true">→</span>
                </button>
                <p className={styles.note}>
                  <strong>Магазин пока не принимает заказы.</strong> Корзина сохранится —
                  загляните чуть позже.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Cart;
