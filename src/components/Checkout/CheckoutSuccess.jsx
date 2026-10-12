import React, { useEffect, useState } from 'react';
import { Link, Navigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { getOrderStatus } from '../../services/storefront';
import { formatPrice } from '../../shared/money';
import { clearCheckoutFormComment, markOrderHandled, wasOrderHandled } from './checkoutFormStorage';
import ShopSupport, { hasShopSupport } from './ShopSupport';
import styles from './checkout.module.css';

// Т-Банк возвращает покупателя сюда раньше, чем до бэка доходит вебхук с
// подтверждением. Поэтому статус не берём из URL (status=success — лишь
// «форма оплаты закрылась»), а опрашиваем бэк: пока заказ AWAITING_PAYMENT,
// бэк сам спрашивает у банка GetState и обновляет статус.
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 90000;

const CheckoutSuccess = () => {
  // Страница внутри StorefrontLayout: магазин уже загружен, шапка и тема — от лэйаута.
  const { shop, slug } = useOutletContext();
  const { clear } = useCart(slug);
  const [searchParams] = useSearchParams();
  const orderNumber = searchParams.get('order')?.trim().toUpperCase() || null;
  // status=fail — Т-Банк вернул по FailURL: платёж не прошёл, опрашивать нечего.
  const isFail = searchParams.get('status') === 'fail';
  const shopBase = `/shop/${slug}`;

  const [order, setOrder] = useState(null);
  const [polling, setPolling] = useState(Boolean(orderNumber));
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Счётчик ручных перепроверок («Проверить ещё раз») — перезапускает опрос.
  const [attempt, setAttempt] = useState(0);

  // Заголовок вкладки поверх названия магазина, которое ставит StorefrontLayout.
  const shopName = shop?.name;
  useEffect(() => {
    if (shopName) document.title = `Оплата заказа — ${shopName}`;
  }, [shopName]);

  useEffect(() => {
    if (!orderNumber) return undefined;
    let cancelled = false;
    let timer = null;
    const startedAt = Date.now();
    // При возврате по FailURL статус запрашиваем один раз: вдруг банк всё же
    // подтвердил оплату — тогда честно покажем успех, а не ошибку.
    const canRetry = () => !isFail && Date.now() - startedAt < POLL_TIMEOUT_MS;

    setPolling(true);
    setLoadError(false);
    setNotFound(false);
    // Сменился номер заказа в адресе — статус прежнего заказа не показываем ни на кадр.
    setOrder((prev) => (prev?.publicId === orderNumber ? prev : null));

    const poll = async () => {
      try {
        const data = await getOrderStatus(orderNumber);
        if (cancelled) return;
        setOrder(data);
        setLoadError(false);
        if (data?.paymentStatus === 'AWAITING_PAYMENT' && canRetry()) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
          return;
        }
        setPolling(false);
      } catch (err) {
        if (cancelled) return;
        if (err?.response?.status === 404) {
          setNotFound(true);
          setPolling(false);
          return;
        }
        // Сетевой сбой посреди опроса — не повод пугать покупателя: пробуем дальше.
        if (canRetry()) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
          return;
        }
        setLoadError(true);
        setPolling(false);
      }
    };
    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orderNumber, isFail, attempt]);

  const paymentStatus = order?.paymentStatus ?? null;
  const orderInThisShop = !order?.shopSlug || order.shopSlug === slug;

  // Оплачено: чистим корзину магазина (один раз на заказ — см. wasOrderHandled)
  // и комментарий из черновика; контакты и ПВЗ остаются для следующего заказа.
  // При неуспешной оплате корзину не трогаем — покупатель может оформить заново.
  useEffect(() => {
    if (paymentStatus !== 'PAID' || !orderInThisShop || !order?.publicId) return;
    if (wasOrderHandled(order.publicId)) return;
    markOrderHandled(order.publicId);
    clear();
    clearCheckoutFormComment(slug);
  }, [paymentStatus, orderInThisShop, order, slug, clear]);

  // Ссылку открыли под чужой витриной — уводим на страницу оплаты магазина заказа,
  // там своя тема, своя корзина и свои контакты продавца.
  if (order?.shopSlug && !orderInThisShop) {
    return (
      <Navigate
        to={{ pathname: `/shop/${order.shopSlug}/success`, search: `?${searchParams.toString()}` }}
        replace
      />
    );
  }

  // Что показать. Статус бэка главнее параметра status из адреса: PAID — успех
  // даже при возврате по FailURL. status=fail без окончательного статуса —
  // неудача, как только единственный запрос статуса завершился.
  let view;
  if (!orderNumber) view = isFail ? 'failed' : 'noOrder';
  else if (notFound) view = 'notFound';
  else if (paymentStatus === 'PAID') view = 'paid';
  else if (paymentStatus === 'FAILED') view = 'failed';
  else if (paymentStatus === 'CANCELED') view = 'canceled';
  else if (isFail && (paymentStatus || !polling)) view = 'failed';
  else if (polling) view = 'pending';
  else if (loadError && !order) view = 'error';
  else view = 'timeout';

  const orderTag = orderNumber ? (
    <strong className={styles.orderNumber}>#{orderNumber}</strong>
  ) : null;

  const supportLine = hasShopSupport(shop) && (
    <p className={styles.support}>
      Если понадобится помощь — напишите продавцу:{' '}
      <ShopSupport shop={shop} linkClassName={styles.inlineLink} />
      {/* На экране неудачи номер заказа уже назван в тексте выше — не повторяем. */}
      {orderNumber && view !== 'failed' && view !== 'canceled' && (
        <>
          {' '}
          и укажите номер заказа <strong className={styles.orderNumber}>#{orderNumber}</strong>
        </>
      )}
      .
    </p>
  );

  const toCart = (label) => (
    <Link className={styles.primaryLink} to={`${shopBase}/cart`}>
      <span>{label}</span>
      <span className={styles.ctaArrow} aria-hidden="true">→</span>
    </Link>
  );

  const toShop = (
    <Link className={styles.primaryLink} to={shopBase}>
      <span>Вернуться в магазин</span>
      <span className={styles.ctaArrow} aria-hidden="true">→</span>
    </Link>
  );

  const recheckButton = (
    <button type="button" className={styles.secondaryLink} onClick={() => setAttempt((n) => n + 1)}>
      Проверить ещё раз
    </button>
  );

  let content;
  if (view === 'paid') {
    content = (
      <>
        <div className={styles.successIcon}>✓</div>
        <h1 className={styles.centeredTitle}>
          Заказ <span className={styles.orderNumber}>#{order.publicId || orderNumber}</span> оплачен
        </h1>
        <p className={styles.centeredText}>
          Спасибо за покупку! Подтверждение оплаты и состав заказа мы отправили на вашу почту.
          Продавец соберёт заказ и отправит его в выбранный пункт выдачи СДЭК — доставка
          оплачивается при получении.
        </p>

        {order.items?.length > 0 && (
          <div className={styles.receipt}>
            <p className={styles.receiptTitle}>Состав заказа #{order.publicId || orderNumber}</p>
            {order.items.map((item, idx) => (
              <div key={idx} className={styles.receiptRow}>
                <span className={styles.receiptName}>
                  {item.productName} <span className={styles.receiptQty}>× {item.quantity}</span>
                </span>
                <span className={styles.receiptPrice}>
                  {formatPrice(item.unitPriceKopecks * item.quantity)}
                </span>
              </div>
            ))}
            <div className={`${styles.receiptRow} ${styles.receiptTotal}`}>
              <span>Итого оплачено</span>
              <span>{formatPrice(order.itemsTotalKopecks)}</span>
            </div>
            <p className={styles.receiptNote}>
              Магазин: {order.shopName || shop?.name}. Доставка СДЭК оплачивается отдельно при получении.
            </p>
          </div>
        )}

        <div className={styles.actions}>{toShop}</div>
      </>
    );
  } else if (view === 'pending') {
    content = (
      <>
        <div className={styles.pendingIcon} role="status" aria-label="Проверяем оплату" />
        <h1 className={styles.centeredTitle}>Проверяем оплату…</h1>
        <p className={styles.centeredText}>
          Получаем подтверждение от банка по заказу {orderTag} — обычно это несколько секунд.
          Не закрывайте страницу.
        </p>
      </>
    );
  } else if (view === 'timeout') {
    content = (
      <>
        <div className={styles.waitIcon} aria-hidden="true">…</div>
        <h1 className={styles.centeredTitle}>Оплата ещё не подтверждена</h1>
        <p className={styles.centeredText}>
          Банк пока не прислал подтверждение по заказу {orderTag}. Если вы завершили оплату,
          статус обновится сам, а на почту придёт письмо с подтверждением. Если оплату
          не завершили — товары остались в корзине, заказ можно оформить ещё раз.
        </p>
        <div className={styles.actions}>
          {recheckButton}
          {toCart('Вернуться в корзину')}
        </div>
      </>
    );
  } else if (view === 'failed' || view === 'canceled') {
    content = (
      <>
        <div className={styles.failIcon}>✕</div>
        <h1 className={styles.centeredTitle}>
          {view === 'canceled' ? 'Платёж отменён' : 'Оплата не прошла'}
        </h1>
        <p className={styles.centeredText}>
          {view === 'canceled'
            ? 'Платёж по заказу отменён — заказ не оплачен.'
            : 'Платёж не прошёл, деньги не списаны — заказ не оплачен.'}{' '}
          Товары остались в корзине, можно оформить заказ ещё раз.
          {orderNumber && (
            <>
              {' '}
              Если деньги всё же списались — напишите продавцу и укажите номер заказа {orderTag}.
            </>
          )}
        </p>
        <div className={styles.actions}>{toCart('Вернуться в корзину')}</div>
      </>
    );
  } else if (view === 'error') {
    content = (
      <>
        <div className={styles.failIcon}>!</div>
        <h1 className={styles.centeredTitle}>Не удалось проверить оплату</h1>
        <p className={styles.centeredText}>
          Не получилось связаться с сервером. Проверьте интернет и попробуйте ещё раз — если оплата прошла,
          заказ {orderTag} уже ждёт продавца, а письмо с подтверждением придёт на почту.
        </p>
        <div className={styles.actions}>{recheckButton}</div>
      </>
    );
  } else if (view === 'notFound') {
    content = (
      <>
        <h1 className={styles.centeredTitle}>Заказ не найден</h1>
        <p className={styles.centeredText}>
          Заказа {orderTag} нет. Проверьте ссылку или вернитесь в магазин.
        </p>
        <div className={styles.actions}>{toShop}</div>
      </>
    );
  } else {
    content = (
      <>
        <h1 className={styles.centeredTitle}>Номер заказа не указан</h1>
        <p className={styles.centeredText}>
          Похоже, ссылка неполная. Товары, которые вы выбрали, ждут в корзине.
        </p>
        <div className={styles.actions}>{toCart('Перейти в корзину')}</div>
      </>
    );
  }

  return (
    <div className={styles.page} id="top">
      <div className={styles.inner}>
        <div className={styles.centered}>
          {content}
          {view !== 'pending' && supportLine}
        </div>
      </div>
    </div>
  );
};

export default CheckoutSuccess;
