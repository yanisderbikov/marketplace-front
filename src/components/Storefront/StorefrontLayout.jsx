import React, { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useMatch,
  useNavigationType,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { getPublicShop } from '../../services/storefront';
import { buildShopTheme } from '../../shared/shopTheme';
import { errorMessage } from '../../shared/errors';
import { BRAND_NAME } from '../../config/brand';
import { useCart } from '../../context/CartContext';
import { useLikes } from '../../hooks/useLikes';
import SiteHeader from '../shared/SiteHeader/SiteHeader';
import NotFound from '../NotFound/NotFound';
import ShopFooter from './ShopFooter';
import { LIKED_PARAM, likedPath, shopBase, tgLink } from './storefrontPaths';
import styles from './StorefrontLayout.module.css';

const HeartIcon = ({ filled }) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
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
    width="26"
    height="26"
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

// Бумажный самолётик — узнаваемый знак Telegram без логотипа-бренда.
const TelegramIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4 20-7z" />
  </svg>
);

// Ссылки на картинки (логотип, фото) — presigned GET, живут 6 часов, а флаг
// acceptsOrders мерчант может переключить в любой момент. Вкладку витрины
// часто оставляют открытой надолго: вернувшись в неё спустя полчаса, тихо
// перечитываем магазин, чтобы не показывать протухшие ссылки и старый статус.
const SHOP_REFRESH_AFTER_MS = 30 * 60 * 1000;

// Фон body, пока тема магазина неизвестна (магазин грузится или не
// загрузился). Главная и 404 красят body в чёрный и обратно его не
// возвращают, а App на путях /shop/ фон не трогает — без этого спиннер
// загрузки и текст ошибки оказывались на чёрном.
const NEUTRAL_BODY_BACKGROUND = '#fff';

const PageLoader = ({ label, fullscreen = false }) => (
  <div className={`${styles.loader} ${fullscreen ? styles.loaderFullscreen : ''}`} role="status" aria-label={label}>
    <span className={styles.spinner} />
  </div>
);

// Заглушка Suspense, пока догружается чанк страницы (корзина, чекаут,
// юр-тексты): тоже прячет подвал, чтобы он не прыгал вниз под пришедшую страницу.
const ChunkLoader = ({ holdFooter }) => {
  useLayoutEffect(() => holdFooter(), [holdFooter]);
  return <PageLoader label="Загрузка страницы" />;
};

/**
 * Каркас витрины /shop/:slug: грузит магазин (PublicShopDTO), строит тему из
 * его цвета (buildShopTheme), красит body, ставит заголовок вкладки, рисует
 * общую шапку и подвал. Вложенные страницы (каталог, товар, корзина, чекаут,
 * юр-тексты) получают уже загруженный магазин через <Outlet context>.
 *
 * Шапка — фиксированная «таблетка» SiteHeader; место под неё резервирует
 * .main, поэтому страницам не нужно отступать от верха самим.
 */
const StorefrontLayout = () => {
  const { slug } = useParams();
  const location = useLocation();
  const navigationType = useNavigationType();
  const [searchParams] = useSearchParams();
  // Index-маршрут /shop/:slug — каталог (useMatch по умолчанию требует точного совпадения).
  const onCatalog = Boolean(useMatch('/shop/:slug'));
  const likedActive = onCatalog && searchParams.get(LIKED_PARAM) === '1';
  const base = shopBase(slug);

  const { count } = useCart(slug);
  const { count: likesCount } = useLikes(slug);

  // { slug, shop, status: 'loading' | 'ready' | 'notFound' | 'error', error }
  const [state, setState] = useState({ slug: null, shop: null, status: 'loading', error: null });
  const [reloadKey, setReloadKey] = useState(0);
  // Пока грузится новый slug, старый магазин не показываем ни на кадр.
  const current = state.slug === slug ? state : { slug, shop: null, status: 'loading', error: null };
  const { shop, status } = current;

  // Когда магазин загружен в последний раз — для тихого обновления (см. SHOP_REFRESH_AFTER_MS).
  const loadedAtRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setState((prev) =>
      prev.slug === slug && prev.status === 'ready'
        ? prev
        : { slug, shop: null, status: 'loading', error: null }
    );
    getPublicShop(slug)
      .then((data) => {
        if (cancelled) return;
        loadedAtRef.current = Date.now();
        setState({ slug, shop: data, status: 'ready', error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        // 404 — магазина нет или его выключил супер-админ: витрина не существует.
        const notFound = err?.response?.status === 404;
        setState({
          slug,
          shop: null,
          status: notFound ? 'notFound' : 'error',
          error: errorMessage(err, 'Не удалось загрузить магазин'),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, reloadKey]);

  // Тихое обновление при возврате во вкладку. Ошибку (сеть, магазин только что
  // выключили) не показываем: витрина остаётся как была, а оформление заказа
  // всё равно проверит магазин на сервере.
  useEffect(() => {
    if (status !== 'ready') return undefined;
    let cancelled = false;
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - loadedAtRef.current < SHOP_REFRESH_AFTER_MS) return;
      loadedAtRef.current = Date.now();
      getPublicShop(slug)
        .then((data) => {
          if (cancelled) return;
          setState((prev) =>
            prev.slug === slug && prev.status === 'ready'
              ? { slug, shop: data, status: 'ready', error: null }
              : prev
          );
        })
        .catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [slug, status]);

  // Логотип не загрузился (ссылка протухла, файл удалён) — в шапке название
  // текстом, а не битая картинка. SiteHeader своего onError не даёт, поэтому
  // проверяем ссылку отдельной загрузкой (браузер возьмёт её из кэша).
  const logoUrl = shop?.logoUrl;
  const [failedLogoUrl, setFailedLogoUrl] = useState(null);
  useEffect(() => {
    if (!logoUrl) return undefined;
    let cancelled = false;
    const probe = new Image();
    probe.onerror = () => {
      if (!cancelled) setFailedLogoUrl(logoUrl);
    };
    probe.src = logoUrl;
    return () => {
      cancelled = true;
      probe.onerror = null;
    };
  }, [logoUrl]);

  const brandColor = shop?.brandColor;
  const theme = useMemo(() => (brandColor ? buildShopTheme(brandColor) : null), [brandColor]);
  const pageBackground = theme?.pageBackground;
  // Сразу при входе на витрину — нейтральный светлый фон, после загрузки
  // магазина — фон темы. Страница 404 рисует себя сама (и сама красит body).
  const bodyBackground =
    status === 'notFound' ? null : pageBackground ?? NEUTRAL_BODY_BACKGROUND;

  // Фон body в цвет витрины (иначе при оверскролле видно серый фон платформы).
  // Layout-эффект, а не обычный: его cleanup при уходе с витрины отрабатывает
  // раньше layout-эффекта App, который ставит фон новой страницы, — обычный
  // эффект вернул бы старый фон уже поверх нового.
  useLayoutEffect(() => {
    if (!bodyBackground) return undefined;
    const previous = document.body.style.background;
    document.body.style.background = bodyBackground;
    return () => {
      document.body.style.background = previous;
    };
  }, [bodyBackground]);

  // Сколько страниц сейчас держат подвал скрытым (useFooterHold): каталог
  // и карточка товара — пока грузят содержимое, Suspense — пока грузит чанк.
  // Счётчик, а не флаг: при переходе каталог → товар уходящая страница
  // отпускает подвал, а новая берёт его в том же коммите, и он не мелькает.
  const [footerHolds, setFooterHolds] = useState(0);
  const holdFooter = useCallback(() => {
    setFooterHolds((holds) => holds + 1);
    return () => setFooterHolds((holds) => holds - 1);
  }, []);

  // Заголовок вкладки — название магазина на каждой странице витрины. Тоже
  // layout-эффект: он срабатывает раньше обычных эффектов (useEffect) вложенных
  // страниц, и страница со своим заголовком (карточка товара, корзина)
  // спокойно его перезаписывает.
  const shopName = shop?.name;
  useLayoutEffect(() => {
    if (shopName) document.title = shopName;
  }, [shopName, location.pathname]);

  // Переход на другую страницу витрины (каталог → товар → корзина) открывает
  // её с начала. Возврат назад (POP) и «← В магазин» (state.backToList) не
  // трогаем: там прокрутку восстанавливает useListScrollMemory каталога.
  useEffect(() => {
    if (navigationType === 'POP' || location.state?.backToList) return;
    window.scrollTo(0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const outletContext = useMemo(() => ({ shop, slug, holdFooter }), [shop, slug, holdFooter]);

  if (status === 'notFound') {
    return <NotFound />;
  }

  if (status === 'error') {
    return (
      <div className={styles.state}>
        <p className={styles.stateText}>{current.error}</p>
        <div className={styles.stateActions}>
          <button
            type="button"
            className={styles.stateButton}
            onClick={() => setReloadKey((key) => key + 1)}
          >
            Повторить
          </button>
          <Link className={styles.stateLink} to="/">
            На главную {BRAND_NAME}
          </Link>
        </div>
      </div>
    );
  }

  if (status !== 'ready' || !shop || !theme) {
    return <PageLoader label="Загрузка магазина" fullscreen />;
  }

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Логотип магазина (вкладка «Дизайн»), без него — название текстом.
  // Клик по логотипу на самом каталоге поднимает страницу наверх (как «#top»
  // в anyforms); на остальных страницах — обычный переход в каталог.
  const headerLogo = {
    to: base,
    ariaLabel: `${shop.name} — каталог`,
    alt: shop.name,
    src: shop.logoUrl && shop.logoUrl !== failedLogoUrl ? shop.logoUrl : undefined,
    text: <span className={styles.logoName}>{shop.name}</span>,
    onClick: () => {
      if (onCatalog) {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      }
    },
  };

  const headerRight = (
    <>
      {shop.supportTelegram && (
        <a
          className={`${styles.headerIcon} ${styles.headerIconOptional}`}
          href={tgLink(shop.supportTelegram)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Написать магазину в Telegram @${shop.supportTelegram}`}
          title={`Telegram @${shop.supportTelegram}`}
        >
          <TelegramIcon />
        </a>
      )}
      {/* Фильтр избранного: ссылка на каталог с ?liked=1 (повторное нажатие
          на каталоге снимает фильтр). На каталоге — replace, чтобы
          переключение фильтра не копило записи в истории. */}
      <Link
        className={`${styles.headerIcon} ${likedActive ? styles.headerIconActive : ''}`}
        to={likedActive ? base : likedPath(slug)}
        replace={onCatalog}
        aria-label={likedActive ? 'Показать все товары' : `Избранное${likesCount ? `, товаров: ${likesCount}` : ''}`}
        aria-current={likedActive ? 'page' : undefined}
      >
        <HeartIcon filled={likedActive} />
        {likesCount > 0 && <span className={styles.badge}>{likesCount}</span>}
      </Link>
      <Link
        className={styles.headerIcon}
        to={`${base}/cart`}
        aria-label={`Корзина${count ? `, товаров: ${count}` : ''}`}
      >
        <CartIcon />
        {count > 0 && <span className={styles.badge}>{count}</span>}
      </Link>
    </>
  );

  return (
    <div className={styles.root} style={theme.style}>
      <SiteHeader logo={headerLogo} logoSize="large" tint={theme.headerTint} right={headerRight} />
      <main className={styles.main}>
        {/* Свой Suspense: корзина, чекаут и юр-страницы — ленивые чанки (App.jsx);
            пока чанк грузится при прямом заходе, шапка остаётся на месте. */}
        <Suspense fallback={<ChunkLoader holdFooter={holdFooter} />}>
          <Outlet context={outletContext} />
        </Suspense>
      </main>
      {/* Подвал — только когда содержимое страницы загружено: до этого .main
          (flex: 1 0 auto) занимает весь экран под шапкой, а подвал не стоит
          под заглушкой и не уезжает вниз, когда она сменится контентом. */}
      {footerHolds === 0 && <ShopFooter shop={shop} slug={slug} />}
    </div>
  );
};

export default StorefrontLayout;
