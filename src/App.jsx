import React, { Suspense, useEffect, useLayoutEffect } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import styles from './App.module.css';
import { BRAND_NAME } from './config/brand';
import Home from './components/Home/Home';
import NotFound from './components/NotFound/NotFound';
import StorefrontLayout from './components/Storefront/StorefrontLayout';
import Storefront from './components/Storefront/Storefront';
import ProductPage from './components/Storefront/ProductPage';
import { customDomainShop } from './components/Storefront/storefrontPaths';

// Код-сплиттинг по роутам. В основном бандле остаются только:
// - витрина магазина и карточка товара (/shop/:slug, …/product/:id) — туда
//   приходит почти весь трафик покупателей;
// - главная платформы и NotFound — маленькие и нужны сразу.
// Остальное (кабинет, корзина/чекаут, юр-тексты) грузится при заходе на
// страницу. Переходы внутри SPA обёрнуты в startTransition (index.jsx), поэтому
// на время загрузки чанка остаётся текущая страница, а не пустой fallback.
const Login = React.lazy(() => import('./components/Login/Login'));
const AdminLayout = React.lazy(() => import('./components/AdminLayout/AdminLayout'));
const Onboarding = React.lazy(() => import('./components/Onboarding/Onboarding'));
const SalesReport = React.lazy(() => import('./components/AdminAnalytics/SalesReport'));
const AdminOrders = React.lazy(() => import('./components/AdminOrders/AdminOrders'));
const AdminProducts = React.lazy(() => import('./components/AdminCatalog/AdminProducts'));
const AdminProductEdit = React.lazy(() => import('./components/AdminCatalog/AdminProductEdit'));
const AdminDesign = React.lazy(() => import('./components/AdminDesign/AdminDesign'));
const AdminSettings = React.lazy(() => import('./components/AdminSettings/AdminSettings'));
const PaymentSetup = React.lazy(() => import('./components/AdminSettings/PaymentSetup'));
const AdminShops = React.lazy(() => import('./components/AdminShops/AdminShops'));
// Корзина и чекаут — продолжение витрины: их чанки догружаем заранее в простое,
// как только покупатель оказался на витрине (см. эффект ниже).
const loadCart = () => import('./components/Checkout/Cart');
const loadCheckout = () => import('./components/Checkout/Checkout');
const Cart = React.lazy(loadCart);
const Checkout = React.lazy(loadCheckout);
const CheckoutSuccess = React.lazy(() => import('./components/Checkout/CheckoutSuccess'));
const ShopOffer = React.lazy(() => import('./components/Legal/ShopOffer'));
const ShopPrivacy = React.lazy(() => import('./components/Legal/ShopPrivacy'));
const PlatformPrivacy = React.lazy(() => import('./components/Legal/PlatformPrivacy'));

// Витрина на своём домене магазина (index.jsx узнал slug до первого рендера): она открыта
// с корня, а платформенных страниц (главная, вход, кабинет) на таком домене нет.
const onCustomDomain = () => Boolean(customDomainShop());

// Страницы, которые не нужны поисковикам: кабинет, вход и шаги покупки.
const isPrivatePath = (path) =>
  onCustomDomain()
    ? /^\/(cart|checkout|success)$/.test(path)
    : path === '/login' ||
      path === '/admin' ||
      path.startsWith('/admin/') ||
      /^\/shop\/[^/]+\/(cart|checkout|success)$/.test(path);

// Фон body и заголовок вкладки по умолчанию для страниц платформы. Витрины
// (/shop/…) не трогаем: их фон и заголовок задаёт StorefrontLayout по теме
// магазина (buildShopTheme().pageBackground), а этот эффект перетёр бы их при
// переходах внутри витрины.
const platformDefaults = (path) => {
  if (path === '/') return { background: '#fff', title: `${BRAND_NAME} — свой интернет-магазин за вечер` };
  if (path === '/privacy') return { background: '#fff', title: `Политика конфиденциальности — ${BRAND_NAME}` };
  if (path === '/login') return { background: '#000', title: `Вход — ${BRAND_NAME}` };
  if (path === '/admin' || path.startsWith('/admin/')) {
    return { background: '#e5e5e5', title: `Кабинет магазина — ${BRAND_NAME}` };
  }
  return { background: '#e5e5e5', title: BRAND_NAME };
};

const upsertMetaTag = (selector, attributes) => {
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement('meta');
    document.head.appendChild(tag);
  }
  Object.entries(attributes).forEach(([key, value]) => {
    tag.setAttribute(key, value);
  });
};

function App() {
  const location = useLocation();
  // Ссылки из соцсетей иногда приходят с закодированным якорем в пути
  // (/shop/demo%23top): возвращаем '#' на место — путь /shop/demo, якорь #top.
  const encodedHashIndex = location.pathname.indexOf('%23');
  const pathnameWithoutEncodedHash =
    encodedHashIndex === -1 ? location.pathname : location.pathname.slice(0, encodedHashIndex);
  const recoveredHash =
    encodedHashIndex === -1 ? location.hash : `#${location.pathname.slice(encodedHashIndex + 3)}`;
  const normalizedPathname =
    pathnameWithoutEncodedHash.length > 1
      ? pathnameWithoutEncodedHash.replace(/\/+$/, '')
      : pathnameWithoutEncodedHash;
  const isShopPath = onCustomDomain() || normalizedPathname.startsWith('/shop/');
  // Витрина и карточка товара — отсюда покупатель идёт в корзину.
  const isStorefrontPage = onCustomDomain()
    ? /^\/(product\/[^/]+)?$/.test(normalizedPathname)
    : /^\/shop\/[^/]+(\/product\/[^/]+)?$/.test(normalizedPathname);

  // Layout-эффект, а не обычный: он отрабатывает раньше useEffect страниц, поэтому
  // страница со своим фоном (главная, 404) просто красит body в своём useEffect.
  useLayoutEffect(() => {
    if (isShopPath) return;
    const { background, title } = platformDefaults(normalizedPathname);
    document.body.style.background = background;
    document.title = title;
  }, [normalizedPathname, isShopPath]);

  useEffect(() => {
    upsertMetaTag('meta[name="robots"]', {
      name: 'robots',
      content: isPrivatePath(normalizedPathname) ? 'noindex,nofollow' : 'index,follow,max-image-preview:large',
    });
  }, [normalizedPathname]);

  // Корзина и чекаут лежат в отдельных чанках; покупателю на витрине они
  // понадобятся следующим шагом — догружаем их в простое, чтобы переход был мгновенным.
  useEffect(() => {
    if (!isStorefrontPage) return undefined;
    const prefetch = () => {
      loadCart();
      loadCheckout();
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(prefetch, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(prefetch, 1500);
    return () => window.clearTimeout(id);
  }, [isStorefrontPage]);

  if (location.pathname !== normalizedPathname) {
    return (
      <Navigate
        to={{ pathname: normalizedPathname, search: location.search, hash: recoveredHash }}
        replace
      />
    );
  }

  // Страницы витрины: StorefrontLayout грузит магазин, красит тему и отдаёт { shop, slug }
  // вложенным страницам. Одни и те же — под /shop/:slug на платформе и под / на своём домене.
  const storefrontPages = (
    <>
      <Route index element={<Storefront />} />
      <Route path="product/:productId" element={<ProductPage />} />
      <Route path="cart" element={<Cart />} />
      <Route path="checkout" element={<Checkout />} />
      <Route path="success" element={<CheckoutSuccess />} />
      <Route path="offer" element={<ShopOffer />} />
      <Route path="privacy" element={<ShopPrivacy />} />
    </>
  );

  if (onCustomDomain()) {
    return (
      <div className={styles.app}>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<StorefrontLayout />}>
              {storefrontPages}
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </div>
    );
  }

  return (
    <div className={styles.app}>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/privacy" element={<PlatformPrivacy />} />

          {/* Кабинет мерчанта. Гварды (токен, нет магазина → онбординг, «Магазины»
              только супер-админу) — в AdminLayout. */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/analytics" replace />} />
            <Route path="onboarding" element={<Onboarding />} />
            <Route path="analytics" element={<SalesReport />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="catalog" element={<AdminProducts />} />
            {/* Карточка товара: productId = "new" — создание, uuid — редактирование. */}
            <Route path="catalog/:productId" element={<AdminProductEdit />} />
            <Route path="design" element={<AdminDesign />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="settings/payment/:slug" element={<PaymentSetup />} />
            <Route path="shops" element={<AdminShops />} />
          </Route>

          <Route path="/shop/:slug" element={<StorefrontLayout />}>
            {storefrontPages}
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </div>
  );
}

export default App;
