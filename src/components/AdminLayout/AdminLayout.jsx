import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearToken, hasLiveToken as hasLiveTokenNow } from '../../apiClient';
import { getMe } from '../../services/auth';
import { getMyShop } from '../../services/merchantShop';
import { errorMessage } from '../../shared/errors';
import { BRAND_NAME } from '../../config/brand';
import SiteHeader from '../shared/SiteHeader/SiteHeader';
import ReadinessBanner from './ReadinessBanner';
import styles from './AdminLayout.module.css';

// Меню кабинета. Подписи строчными (navLink → text-transform: lowercase), как в anyforms.
// `match` — префиксы путей, на которых пункт считается активным (карточка товара
// живёт под каталогом).
const SHOP_MENU = {
  title: 'магазин',
  items: [
    { to: '/admin/analytics', label: 'Аналитика' },
    { to: '/admin/orders', label: 'Заказы' },
    { to: '/admin/catalog', label: 'Каталог', match: ['/admin/catalog'] },
    { to: '/admin/design', label: 'Дизайн' },
    { to: '/admin/settings', label: 'Настройки', match: ['/admin/settings'] },
  ],
};

// Пока магазина нет, в кабинете делать нечего, кроме как его создать.
const ONBOARDING_MENU = {
  title: 'магазин',
  items: [{ to: '/admin/onboarding', label: 'Создать магазин' }],
};

const PLATFORM_MENU = {
  title: 'платформа',
  items: [{ to: '/admin/shops', label: 'Магазины' }],
};

const ONBOARDING_PATH = '/admin/onboarding';
const SHOPS_PATH = '/admin/shops';
// Плашка «витрина не принимает заказы» — на страницах, где мерчант ждёт продаж.
const READINESS_BANNER_PATHS = ['/admin/analytics', '/admin/orders', '/admin/catalog'];

// Короткая сводка магазина в MeDTO — держим её в согласии с полным MerchantShopDTO.
const shopSummary = (shop) => ({ id: shop.id, slug: shop.slug, name: shop.name, active: shop.active });

const sameSummary = (a, b) =>
  Boolean(a && b) && a.id === b.id && a.slug === b.slug && a.name === b.name && a.active === b.active;

const AdminLayout = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname.length > 1 ? location.pathname.replace(/\/+$/, '') : location.pathname;

  const hasLiveToken = hasLiveTokenNow();
  const [me, setMe] = useState(null);
  // Полный MerchantShopDTO (null, пока магазина нет): страницам кабинета он нужен
  // почти всем — грузим один раз здесь и раздаём через Outlet context.
  const [shop, setShopState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const meRef = useRef(null);
  meRef.current = me;
  // Магазин создан в этой сессии на странице онбординга: не уводим оттуда на
  // аналитику — Onboarding сам переходит дальше (в «Дизайн») после refreshMe().
  const createdHereRef = useRef(false);
  // Проверка «можно ли уйти со страницы» от страницы с несохранёнными правками
  // (Дизайн, Настройки): () => boolean или null. Роутер — BrowserRouter, useBlocker
  // в нём нет, поэтому переходы по меню кабинета и выход спрашиваем здесь сами.
  // Кнопку «Назад» браузера это не ловит; закрытие вкладки ловит beforeunload страниц.
  const leaveGuardRef = useRef(null);
  const setLeaveGuard = useCallback((guard) => {
    leaveGuardRef.current = typeof guard === 'function' ? guard : null;
  }, []);
  /** true — уходить можно; иначе отменяет переход (event.preventDefault) и возвращает false. */
  const confirmLeave = (event) => {
    const guard = leaveGuardRef.current;
    if (!guard || guard()) return true;
    event?.preventDefault();
    return false;
  };

  const loadAll = useCallback(async () => {
    const meData = await getMe();
    const shopData = meData.shop ? await getMyShop() : null;
    return { meData, shopData };
  }, []);

  useEffect(() => {
    if (!hasLiveToken) return undefined;
    let cancelled = false;
    setLoadError(null);
    loadAll()
      .then(({ meData, shopData }) => {
        if (cancelled) return;
        setMe(meData);
        setShopState(shopData);
      })
      .catch((err) => {
        // 401 сюда не доходит — apiClient сам уводит на логин.
        if (!cancelled) setLoadError(errorMessage(err, 'Не удалось загрузить кабинет'));
      });
    return () => {
      cancelled = true;
    };
  }, [hasLiveToken, reloadKey, loadAll]);

  /** Перечитать /api/auth/me (и магазин, если он есть). Возвращает MeDTO. */
  const refreshMe = useCallback(async () => {
    const { meData, shopData } = await loadAll();
    if (!meRef.current?.shop && meData.shop) createdHereRef.current = true;
    setMe(meData);
    setShopState(shopData);
    return meData;
  }, [loadAll]);

  /** Перечитать только магазин (после сохранений, которые вернули не DTO). */
  const reloadShop = useCallback(async () => {
    const shopData = await getMyShop();
    setShopState(shopData);
    return shopData;
  }, []);

  /** Положить свежий MerchantShopDTO из ответа ручки (значение или функция-апдейтер). */
  const setShop = useCallback((next) => {
    setShopState((prev) => (typeof next === 'function' ? next(prev) : next));
  }, []);

  // Название/активность могли поменяться на «Дизайне» или в онбординге — сводка
  // в me (меню, шапка, ссылка на витрину) обновляется вслед за полным DTO.
  useEffect(() => {
    if (!shop) return;
    if (!meRef.current?.shop) createdHereRef.current = true;
    setMe((prev) => {
      if (!prev || sameSummary(prev.shop, shop)) return prev;
      return { ...prev, shop: shopSummary(shop) };
    });
  }, [shop]);

  // Ушли со страницы онбординга — дальше гвард работает как обычно.
  useEffect(() => {
    if (path !== ONBOARDING_PATH) createdHereRef.current = false;
  }, [path]);

  // Закрываем мобильное меню при переходе на другую страницу.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Блокируем скролл фона, пока открыт мобильный drawer.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const handleLogout = () => {
    if (!confirmLeave()) return;
    clearToken();
    navigate('/login', { replace: true });
  };

  // Без живого токена в кабинете делать нечего — на логин с возвратом обратно.
  if (!hasLiveToken) {
    const from = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?from=${from}`} replace />;
  }

  if (loadError) {
    return (
      <div className={styles.loadError}>
        <div className={styles.loadErrorCard}>
          <p className={styles.loadErrorTitle}>кабинет не загрузился</p>
          <p className={styles.loadErrorText}>{loadError}</p>
          <div className={styles.loadErrorActions}>
            <button type="button" className={styles.retry} onClick={() => setReloadKey((k) => k + 1)}>
              Повторить
            </button>
            <button type="button" className={styles.logout} onClick={handleLogout}>
              Выйти
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!me) {
    return null;
  }

  const hasShop = Boolean(me.shop);
  const isSuperAdmin = Boolean(me.superAdmin);
  const isOnboarding = path === ONBOARDING_PATH;
  const isShops = path === SHOPS_PATH;

  // Раздел «Магазины» — только супер-админу платформы.
  if (isShops && !isSuperAdmin) {
    return <Navigate to="/admin" replace />;
  }
  // Пока магазина нет — только онбординг (супер-админу оставляем и список магазинов:
  // админ платформы не обязан заводить свою витрину, чтобы модерировать чужие).
  if (!hasShop && !isOnboarding && !isShops) {
    return <Navigate to={ONBOARDING_PATH} replace />;
  }
  // Магазин уже есть — второй не создать, онбординг больше не нужен.
  if (hasShop && isOnboarding && !createdHereRef.current) {
    return <Navigate to="/admin/analytics" replace />;
  }

  const menu = [hasShop ? SHOP_MENU : ONBOARDING_MENU, ...(isSuperAdmin ? [PLATFORM_MENU] : [])];
  const storefrontSlug = shop?.slug ?? me.shop?.slug;
  const showReadiness = Boolean(shop) && READINESS_BANNER_PATHS.includes(path);

  const nav = (
    <nav className={styles.nav}>
      {menu.map((section) => (
        <div key={section.title} className={styles.section}>
          <p className={styles.sectionTitle}>{section.title}</p>
          {section.items.map((item) => {
            const matched = item.match?.some((prefix) => path.startsWith(prefix));
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={!item.match}
                // Клик по пункту текущей страницы её не покидает — не переспрашиваем.
                onClick={(event) => item.to !== path && confirmLeave(event)}
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive || matched ? styles.navLinkActive : ''}`
                }
              >
                {item.label}
              </NavLink>
            );
          })}
        </div>
      ))}
      <div className={styles.navBottom}>
        {hasShop && storefrontSlug && (
          <a
            className={styles.storefrontLink}
            href={shop?.customDomain ? `https://${shop.customDomain}` : `/shop/${storefrontSlug}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Открыть витрину ↗
          </a>
        )}
        <button type="button" className={styles.logout} onClick={handleLogout}>
          Выйти
        </button>
      </div>
    </nav>
  );

  const userName = shop?.name || me.name || me.email;

  return (
    <div className={styles.layout}>
      <SiteHeader
        logo={{
          to: '/admin',
          onClick: confirmLeave,
          ariaLabel: `${BRAND_NAME} — кабинет`,
          // Словомарка текстом: бренд строчными (SiteHeader по умолчанию делает uppercase).
          text: <span className={styles.brandWordmark}>{BRAND_NAME}</span>,
        }}
        logoAlign="center"
        left={(
          <button
            type="button"
            className={styles.burger}
            aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <span className={`${styles.burgerLine} ${menuOpen ? styles.burgerLineTop : ''}`} />
            <span className={`${styles.burgerLine} ${menuOpen ? styles.burgerLineHidden : ''}`} />
            <span className={`${styles.burgerLine} ${menuOpen ? styles.burgerLineBottom : ''}`} />
          </button>
        )}
        right={userName ? <span className={styles.userName}>{userName}</span> : null}
      />

      <aside className={styles.sidebar}>{nav}</aside>

      {/* Всегда в DOM: открытие/закрытие анимируется классом (см. .drawer в CSS). */}
      <div
        className={`${styles.backdrop} ${menuOpen ? styles.backdropOpen : ''}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />
      <aside className={`${styles.drawer} ${menuOpen ? styles.drawerOpen : ''}`} aria-hidden={!menuOpen}>
        {nav}
      </aside>

      <main className={styles.content}>
        {showReadiness && (
          <div className={styles.bannerWrap}>
            <ReadinessBanner shop={shop} />
          </div>
        )}
        {/* Свой Suspense: пока грузится чанк страницы, шапка и меню остаются на месте. */}
        <Suspense fallback={null}>
          <Outlet context={{ me, refreshMe, shop, setShop, reloadShop, setLeaveGuard }} />
        </Suspense>
      </main>
    </div>
  );
};

export default AdminLayout;
