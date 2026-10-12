import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { hasLiveToken } from '../../apiClient';
import { BRAND_NAME, PLATFORM_OPERATOR } from '../../config/brand';
import { getPublicShops } from '../../services/storefront';
import { BRAND_SWATCHES, buildShopTheme } from '../../shared/shopTheme';
import SiteHeader from '../shared/SiteHeader/SiteHeader';
import ShopMock, { SWATCH_NAMES } from './ShopMock';
import styles from './Home.module.css';

// Цвет витрины-схемы в первом экране меняется сам — показываем, что оформление
// магазина задаётся одним цветом. Клик по свотчу останавливает перебор.
const SWATCH_ROTATE_MS = 2800;

// «Т‑Банк» пишем с неразрывным дефисом (U+2011): на узком экране обычный
// дефис переносил строку прямо внутри названия банка.
const STEPS = [
  {
    num: '01',
    title: 'Войдите по почте',
    text: 'Пришлём код на почту — пароль не нужен. Первый вход и есть регистрация.',
  },
  {
    num: '02',
    title: 'Создайте витрину',
    text: 'Название, адрес и цвет бренда. Логотип, фото витрины и описание — на вкладке «Дизайн».',
  },
  {
    num: '03',
    title: 'Добавьте товары и подключите оплату',
    text:
      'Каталог с фото и вариантами, свой терминал Т‑Банка и свой аккаунт СДЭК. ' +
      'После этого витрина принимает заказы.',
  },
];

const FEATURES = [
  {
    title: 'Витрина в цвет бренда',
    text: 'Выберите один цвет — шапка, фон, цены и кнопки подстроятся сами, с читаемым контрастом.',
  },
  {
    title: 'Оплата на ваш счёт',
    text: 'Покупатель платит через ваш терминал Т‑Банка — деньги приходят вам напрямую.',
  },
  {
    title: 'Доставка СДЭК',
    text:
      'По тарифам вашего договора со СДЭК: покупатель выбирает пункт выдачи и видит стоимость доставки, ' +
      'а оплачивает её при получении.',
  },
  {
    title: 'Заказы и аналитика',
    text: 'Письмо о каждом оплаченном заказе, статусы отправки с трек-номером и продажи по товарам за любой период.',
  },
];

const pluralProducts = (n) => {
  const tail10 = n % 10;
  const tail100 = n % 100;
  if (tail10 === 1 && tail100 !== 11) return 'товар';
  if (tail10 >= 2 && tail10 <= 4 && (tail100 < 12 || tail100 > 14)) return 'товара';
  return 'товаров';
};

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const scrollToSection = (id) => (event) => {
  event.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/** Карточка витрины: фото витрины (или логотип/буква на цвете бренда), название, слоган. */
const ShopCard = ({ shop }) => {
  const theme = useMemo(() => buildShopTheme(shop.brandColor), [shop.brandColor]);
  // Ссылки на картинки подписанные и живут несколько часов: если открыть
  // главную из давно висящей вкладки, картинка может не загрузиться — тогда фолбэк.
  const [heroFailed, setHeroFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const hasHero = Boolean(shop.heroImageUrl) && !heroFailed;
  const hasLogo = Boolean(shop.logoUrl) && !logoFailed;
  const count = Number(shop.productsCount) || 0;

  return (
    <Link to={`/shop/${shop.slug}`} className={styles.shopCard} style={theme.style}>
      <div className={styles.shopMedia}>
        {hasHero ? (
          <img
            className={styles.shopHero}
            src={shop.heroImageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setHeroFailed(true)}
          />
        ) : (
          <div className={styles.shopMediaFallback}>
            {hasLogo ? (
              <span className={styles.shopFallbackLogo}>
                <img src={shop.logoUrl} alt="" loading="lazy" decoding="async" onError={() => setLogoFailed(true)} />
              </span>
            ) : (
              <span className={styles.shopInitial}>{(shop.name || '?').trim().charAt(0)}</span>
            )}
          </div>
        )}
      </div>
      <div className={styles.shopBody}>
        <div className={styles.shopTitleRow}>
          {hasHero && hasLogo && (
            <span className={styles.shopLogo}>
              <img src={shop.logoUrl} alt="" loading="lazy" decoding="async" onError={() => setLogoFailed(true)} />
            </span>
          )}
          <h3 className={styles.shopName}>{shop.name}</h3>
        </div>
        {shop.tagline && <p className={styles.shopTagline}>{shop.tagline}</p>}
        <div className={styles.shopFoot}>
          <span className={styles.shopCount}>
            {count} {pluralProducts(count)}
          </span>
          <span className={styles.shopGo} aria-hidden="true">
            →
          </span>
        </div>
      </div>
    </Link>
  );
};

const ShopCardSkeleton = () => (
  <div className={`${styles.shopCard} ${styles.shopCardSkeleton}`} aria-hidden="true">
    <div className={styles.shopMedia} />
    <div className={styles.shopBody}>
      <span className={`${styles.skeletonBar} ${styles.skeletonTitle}`} />
      <span className={styles.skeletonBar} />
    </div>
  </div>
);

const Home = () => {
  // Уже вошёл — «Создать магазин» и «Войти» ведут сразу в кабинет: AdminLayout
  // сам отправит в онбординг, если магазина ещё нет.
  const loggedIn = hasLiveToken();
  const startPath = loggedIn ? '/admin' : '/login';

  // null — витрины ещё грузятся.
  const [shops, setShops] = useState(null);
  const [swatchIndex, setSwatchIndex] = useState(0);
  const [autoRotate, setAutoRotate] = useState(() => !prefersReducedMotion());

  // Главная — чёрная: красим и body, иначе при оверскролле видно светлый фон
  // (App выставляет фон по умолчанию раньше, в layout-эффекте).
  useEffect(() => {
    document.body.style.background = '#000';
  }, []);

  useEffect(() => {
    let cancelled = false;
    getPublicShops()
      .then((data) => {
        if (!cancelled) setShops(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        // Витрины на главной — витрина платформы, а не её суть: при ошибке
        // просто не показываем блок, страница остаётся рабочей.
        if (!cancelled) setShops([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!autoRotate) return undefined;
    const timer = window.setInterval(
      () => setSwatchIndex((i) => (i + 1) % BRAND_SWATCHES.length),
      SWATCH_ROTATE_MS
    );
    return () => window.clearInterval(timer);
  }, [autoRotate]);

  const pickSwatch = (index) => {
    setAutoRotate(false);
    setSwatchIndex(index);
  };

  const showShops = shops === null || shops.length > 0;
  const mockColor = BRAND_SWATCHES[swatchIndex];

  const navLinks = [
    { key: 'how', label: 'Как это работает', href: '#how', onClick: scrollToSection('how') },
    ...(shops?.length > 0
      ? [{ key: 'shops', label: 'Магазины', href: '#shops', onClick: scrollToSection('shops') }]
      : []),
  ];
  const accountLink = { key: 'account', kind: 'link', label: loggedIn ? 'Кабинет' : 'Войти', to: startPath };

  const { name: operatorName, inn, ogrn, email } = PLATFORM_OPERATOR;
  const hasRequisites = Boolean(operatorName || inn || ogrn);

  return (
    <div className={styles.page}>
      <SiteHeader
        logo={{
          href: '/',
          ariaLabel: `${BRAND_NAME} — наверх`,
          text: <span className={styles.brandWordmark}>{BRAND_NAME}</span>,
          onClick: (event) => {
            event.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          },
        }}
        navLinks={navLinks}
        navAriaLabel="Разделы главной"
        rightItems={[{ ...accountLink, variant: 'pill' }]}
        mobileMenuId="home-mobile-menu"
        mobileTopItems={[
          {
            key: 'create-mobile',
            kind: 'link',
            label: 'Создать магазин',
            variant: 'primary',
            to: startPath,
          },
        ]}
        mobileLinks={[...navLinks, accountLink]}
      />

      <section className={styles.hero} aria-label="Главный экран">
        <div className={styles.heroGrid}>
          <div className={styles.heroInfoCard}>
            <h1 className={styles.heroTitle}>
              <span className={styles.heroTitleLine}>Свой интернет-магазин</span>
              <span className={`${styles.heroTitleLine} ${styles.heroTitleMuted}`}>за вечер</span>
            </h1>
            <p className={styles.heroTagline}>
              Витрина с каталогом, корзиной и онлайн-оплатой. Деньги приходят на ваш терминал Т‑Банка,
              заказы уезжают через СДЭК.
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.cta} to={startPath}>
                Создать магазин
                <span className={styles.ctaArrow} aria-hidden="true">
                  →
                </span>
              </Link>
              <span className={styles.heroNote}>Вход по коду из письма, без пароля</span>
            </div>
          </div>

          <div className={styles.heroMediaCard}>
            <ShopMock
              brandColor={mockColor}
              name="Ваш магазин"
              address={`${window.location.host}/shop/vash-magazin`}
            />
            <div className={styles.mockControls}>
              <p className={styles.mockCaption}>Оформление — это один цвет. Попробуйте:</p>
              <div className={styles.mockSwatches} role="group" aria-label="Цвет витрины">
                {BRAND_SWATCHES.map((color, index) => (
                  <button
                    key={color}
                    type="button"
                    className={`${styles.mockSwatch} ${index === swatchIndex ? styles.mockSwatchActive : ''}`}
                    style={{ background: color }}
                    onClick={() => pickSwatch(index)}
                    aria-pressed={index === swatchIndex}
                    aria-label={SWATCH_NAMES[color] || color}
                    title={SWATCH_NAMES[color] || color}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className={styles.lightSection} aria-labelledby="how-title">
        <div className={styles.sectionInner}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle} id="how-title">
              Как это работает
            </h2>
            <p className={styles.sectionLead}>Три шага от регистрации до первого заказа.</p>
          </div>
          <ol className={styles.stepsList}>
            {STEPS.map((step) => (
              <li key={step.num} className={styles.stepCard}>
                <span className={styles.stepNum}>{step.num}</span>
                <h3 className={styles.cardTitle}>{step.title}</h3>
                <p className={styles.cardText}>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.darkSection} aria-labelledby="features-title">
        <div className={styles.sectionInner}>
          <div className={`${styles.sectionHead} ${styles.sectionHeadLight}`}>
            <h2 className={`${styles.sectionTitle} ${styles.sectionTitleLight}`} id="features-title">
              Что внутри
            </h2>
            <p className={`${styles.sectionLead} ${styles.sectionLeadLight}`}>
              Всё, чтобы продавать: от витрины до отчёта о продажах.
            </p>
          </div>
          <ul className={styles.featureGrid}>
            {FEATURES.map((feature) => (
              <li key={feature.title} className={styles.featureCard}>
                <h3 className={styles.featureTitle}>{feature.title}</h3>
                <p className={styles.featureText}>{feature.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {showShops && (
        <section id="shops" className={styles.shopsSection} aria-labelledby="shops-title" aria-busy={shops === null}>
          <div className={styles.sectionInner}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle} id="shops-title">
                Магазины
              </h2>
              <p className={styles.sectionLead}>Витрины, которые уже работают на {BRAND_NAME}.</p>
            </div>
            <div className={styles.shopGrid}>
              {shops === null
                ? [0, 1, 2].map((i) => <ShopCardSkeleton key={i} />)
                : shops.map((shop) => <ShopCard key={shop.slug} shop={shop} />)}
            </div>
          </div>
        </section>
      )}

      <section className={styles.finalCta} aria-labelledby="final-cta-title">
        <div className={styles.finalCtaCard}>
          <h2 className={styles.finalCtaTitle} id="final-cta-title">
            Начните с названия и цвета
          </h2>
          <p className={styles.finalCtaText}>
            Товары, оплату и доставку настроите в кабинете, когда будете готовы.
          </p>
          <Link className={`${styles.cta} ${styles.ctaCentered}`} to={startPath}>
            Создать магазин
            <span className={styles.ctaArrow} aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </section>

      <footer className={styles.siteFooter}>
        {(hasRequisites || email) && (
          <div className={styles.footerGrid}>
            {hasRequisites && (
              <div className={styles.footerBlock}>
                <h2 className={styles.footerHeading}>О сервисе</h2>
                <p className={styles.footerText}>
                  {operatorName && (
                    <>
                      {operatorName}
                      <br />
                    </>
                  )}
                  {inn && (
                    <>
                      ИНН {inn}
                      <br />
                    </>
                  )}
                  {ogrn && (
                    <>
                      {ogrn.length === 15 ? 'ОГРНИП' : 'ОГРН'} {ogrn}
                    </>
                  )}
                </p>
              </div>
            )}
            {email && (
              <div className={styles.footerBlock}>
                <h2 className={styles.footerHeading}>Контакты</h2>
                <p className={styles.footerText}>
                  <a className={styles.footerLink} href={`mailto:${email}`}>
                    {email}
                  </a>
                </p>
              </div>
            )}
          </div>
        )}
        <p className={styles.footerLegal}>
          <Link to="/privacy" className={styles.footerLegalLink}>
            Политика конфиденциальности
          </Link>
          {' · '}
          <Link to={startPath} className={styles.footerLegalLink}>
            {loggedIn ? 'Кабинет магазина' : 'Вход для продавцов'}
          </Link>
        </p>
        <p className={styles.footerCopyright}>
          © {BRAND_NAME}, {new Date().getFullYear()}. Все права защищены
        </p>
      </footer>
    </div>
  );
};

export default Home;
