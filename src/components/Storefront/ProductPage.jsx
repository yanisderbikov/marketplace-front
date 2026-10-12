import React, { useEffect, useRef, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { getShopProduct } from '../../services/storefront';
import { useCart } from '../../context/CartContext';
import { formatPrice } from '../../shared/money';
import { errorMessage } from '../../shared/errors';
import AspectPhoto from '../shared/AspectPhoto/AspectPhoto';
import LikeButton from './LikeButton';
import { useFooterHold } from './useFooterHold';
import { shopBase, tgLink } from './storefrontPaths';
import styles from './ProductPage.module.css';

// Бэк принимает quantity 1..99 в позиции заказа (корзина тоже режет до 99).
const MAX_QUANTITY = 99;

const ChevronLeft = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);
const ChevronRight = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

/**
 * Карточка товара витрины (перенос anyforms MarketplaceProduct). Магазин и
 * тема — из StorefrontLayout; товар грузится отдельной ручкой, а не поиском
 * по всему каталогу, как было в anyforms.
 */
const ProductPage = () => {
  const { shop, slug } = useOutletContext();
  const { productId } = useParams();
  const { addItem, items: cartItems } = useCart(slug);
  const base = shopBase(slug);
  // Вопросы по предзаказу — в Telegram магазина, если мерчант его указал.
  const supportTg = shop.supportTelegram || null;
  // Заказ возможен, только когда магазин включён и заполнил оплату, доставку
  // и реквизиты (acceptsOrders с бэка) — иначе чекаут всё равно ответит 409.
  const canOrder = Boolean(shop.acceptsOrders);

  const [product, setProduct] = useState(null);
  // loading | ready | notFound | error
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeImage, setActiveImage] = useState(0);
  // Выбранный вариант (размер/объём); по умолчанию — первый из списка.
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const thumbsRef = useRef(null);
  // Подвал витрины — когда товар загружен (или показана ошибка), а не под спиннером.
  useFooterHold(status === 'loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    getShopProduct(slug, productId)
      .then((data) => {
        if (cancelled) return;
        setProduct(data);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setProduct(null);
        // 404 — товар выключен, удалён или из другого магазина; 400 — битый id в адресе.
        const code = err?.response?.status;
        if (code === 404 || code === 400) {
          setStatus('notFound');
        } else {
          setError(errorMessage(err, 'Не удалось загрузить товар'));
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug, productId, reloadKey]);

  useEffect(() => {
    setActiveImage(0);
    setSelectedVariantId(null);
    setQuantity(1);
    // Товар открыт из середины каталога — карточку показываем с начала.
    window.scrollTo(0, 0);
  }, [productId]);

  // Заголовок вкладки — товар и магазин; при уходе со страницы возвращаем
  // название магазина (его ставит StorefrontLayout только при смене пути).
  useEffect(() => {
    if (!product) return undefined;
    document.title = `${product.name} — ${shop.name}`;
    return () => {
      document.title = shop.name;
    };
  }, [product, shop.name]);

  // Активное превью подъезжает в середину ленты (и по вертикали, и по горизонтали)
  useEffect(() => {
    const container = thumbsRef.current;
    const active = container?.querySelector(`.${styles.thumbActive}`);
    if (!container || !active) return;
    container.scrollTo({
      top: active.offsetTop - container.clientHeight / 2 + active.clientHeight / 2,
      left: active.offsetLeft - container.clientWidth / 2 + active.clientWidth / 2,
      behavior: 'smooth',
    });
  }, [activeImage]);

  const backLink = (
    <div className={styles.topBar}>
      <Link className={styles.back} to={base} state={{ backToList: true }}>← В магазин</Link>
    </div>
  );

  if (status === 'loading') {
    return (
      <div className={styles.page}>
        <div className={styles.inner}>
          <div className={styles.loader} role="status" aria-label="Загрузка товара">
            <span className={styles.spinner} />
          </div>
        </div>
      </div>
    );
  }

  if (status !== 'ready' || !product) {
    const notFound = status === 'notFound';
    return (
      <div className={styles.page}>
        <div className={styles.inner}>
          {backLink}
          <div className={styles.centered}>
            <p className={styles.centeredText}>
              {notFound ? 'Товар не найден или больше не доступен.' : error}
            </p>
            {notFound ? (
              <Link className={styles.primaryLink} to={base} state={{ backToList: true }}>
                <span>Перейти к товарам</span>
                <span className={styles.ctaArrow} aria-hidden="true">→</span>
              </Link>
            ) : (
              <button
                type="button"
                className={styles.primaryLink}
                onClick={() => setReloadKey((key) => key + 1)}
              >
                <span>Повторить</span>
                <span className={styles.ctaArrow} aria-hidden="true">↻</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const photos = product.photos?.length ? product.photos : [];
  const hasGallery = photos.length > 1;
  const image = photos[Math.min(activeImage, photos.length - 1)];
  const variants = product.variants ?? [];
  const selectedVariant = variants.length
    ? variants.find((v) => v.id === selectedVariantId) ?? variants[0]
    : null;
  const displayPrice = selectedVariant ? selectedVariant.priceKopecks : product.priceKopecks;
  // Зачёркнутая цена/скидка относятся к основной цене — при вариантах не показываем.
  const onSale = !selectedVariant
    && product.crossedPriceKopecks != null
    && Number(product.crossedPriceKopecks) > Number(product.priceKopecks);
  // Бейдж «−N%» — по тому же условию: discountPercent бэк считает от основной
  // цены без учёта вариантов, и у варианта дороже зачёркнутой цены он врал бы.
  const showDiscount = onSale && product.discountPercent > 0;
  const inCart = cartItems.find(
    (item) => item.productId === String(product.id)
      && (item.variantId ?? null) === (selectedVariant?.id ?? null)
  )?.quantity ?? 0;

  const handleAdd = () => {
    if (!canOrder) return;
    addItem(product, quantity, selectedVariant);
    // Счётчик возвращается к 1: подпись кнопки уже показывает, сколько в корзине.
    setQuantity(1);
  };

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        {backLink}

        <div className={styles.split}>
          <div className={styles.gallery}>
            {hasGallery && (
              <div className={styles.thumbsCol}>
                <div className={styles.thumbs} ref={thumbsRef}>
                  {photos.map((src, index) => (
                    <button
                      key={src ?? index}
                      type="button"
                      className={`${styles.thumb} ${index === activeImage ? styles.thumbActive : ''}`}
                      onClick={() => setActiveImage(index)}
                      onMouseEnter={() => setActiveImage(index)}
                      aria-label={`Фото ${index + 1}`}
                    >
                      <img src={src} alt="" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className={styles.main}>
              <LikeButton slug={slug} productId={product.id} overlay />
              {showDiscount && (
                <span className={styles.discountBadge}>−{product.discountPercent}%</span>
              )}
              {product.preorder && <span className={styles.preorderBadge}>Предзаказ</span>}
              {image ? (
                <AspectPhoto src={image} alt={product.name} />
              ) : (
                <div className={styles.mainPlaceholder} />
              )}
              {hasGallery && (
                <div className={styles.arrows}>
                  <button
                    type="button"
                    className={styles.arrowBtn}
                    aria-label="Предыдущее фото"
                    onClick={() => setActiveImage((activeImage - 1 + photos.length) % photos.length)}
                  >
                    <ChevronLeft />
                  </button>
                  <button
                    type="button"
                    className={styles.arrowBtn}
                    aria-label="Следующее фото"
                    onClick={() => setActiveImage((activeImage + 1) % photos.length)}
                  >
                    <ChevronRight />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className={styles.info}>
            <h1 className={styles.name}>{product.name}</h1>
            {product.description && <p className={styles.description}>{product.description}</p>}
            {variants.length > 0 && (
              <div className={styles.variants} role="radiogroup" aria-label="Вариант товара">
                {variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    role="radio"
                    className={`${styles.variantBtn} ${v.id === selectedVariant?.id ? styles.variantBtnActive : ''}`}
                    aria-checked={v.id === selectedVariant?.id}
                    onClick={() => setSelectedVariantId(v.id)}
                  >
                    {v.label}
                    <span className={styles.variantPrice}>{formatPrice(v.priceKopecks)}</span>
                  </button>
                ))}
              </div>
            )}
            <div className={styles.prices}>
              <span className={styles.price}>{formatPrice(displayPrice)}</span>
              {onSale && <span className={styles.crossedPrice}>{formatPrice(product.crossedPriceKopecks)}</span>}
            </div>

            {product.preorder && (
              <div className={styles.preorderNote}>
                <p className={styles.preorderNoteTitle}>Это предзаказ</p>
                <p className={styles.preorderNoteText}>
                  Товар ещё готовится, поэтому сразу после оплаты вы его не получите — отправим,
                  как только он будет готов.
                  {supportTg && (
                    <>
                      {' '}Если есть вопросы — напишите нам в Telegram{' '}
                      <a href={tgLink(supportTg)} target="_blank" rel="noopener noreferrer">
                        @{supportTg}
                      </a>
                      .
                    </>
                  )}
                </p>
              </div>
            )}

            <div className={styles.buyRow}>
              <div className={styles.qty} role="group" aria-label="Количество">
                <button
                  type="button"
                  className={styles.qtyBtn}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={!canOrder || quantity <= 1}
                  aria-label="Уменьшить количество"
                >
                  −
                </button>
                <span className={styles.qtyValue} aria-live="polite">{quantity}</span>
                <button
                  type="button"
                  className={styles.qtyBtn}
                  onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
                  disabled={!canOrder || quantity >= MAX_QUANTITY}
                  aria-label="Увеличить количество"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                className={`${styles.addBtn} ${canOrder && inCart > 0 ? styles.addBtnAdded : ''}`}
                onClick={handleAdd}
                disabled={!canOrder}
              >
                {canOrder && inCart > 0 ? `В корзине ${inCart} шт · добавить ещё` : 'В корзину'}
              </button>
            </div>

            {!canOrder && (
              <p className={styles.closedNote} role="note">
                Магазин пока не принимает заказы
              </p>
            )}

            {canOrder && inCart > 0 && (
              <Link to={`${base}/cart`} className={styles.goToCart}>
                Перейти в корзину
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductPage;
