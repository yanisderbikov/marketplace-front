import React, { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { getShopProducts } from '../../services/storefront';
import { errorMessage } from '../../shared/errors';
import { useLikes } from '../../hooks/useLikes';
import { useListScrollMemory } from '../../hooks/useListScrollMemory';
import ProductCard from './ProductCard';
import ProductCardSkeleton from './ProductCardSkeleton';
import { useFooterHold } from './useFooterHold';
import { LIKED_PARAM, productPath, shopBase } from './storefrontPaths';
import styles from './Storefront.module.css';

// Карточек в скелетоне: ровные ряды при 2, 3 и 4 колонках, на экран хватает.
const SKELETON_CARDS = 8;

/**
 * Каталог витрины /shop/:slug (перенос anyforms Marketplace в «бутиковой»
 * подаче). Шапка, тема и подвал — в StorefrontLayout; магазин уже загружен
 * и приходит через контекст роута.
 */
const Storefront = () => {
  const { shop, slug } = useOutletContext();
  const base = shopBase(slug);
  const [searchParams] = useSearchParams();
  // Фильтр «избранное» переключает сердечко в шапке (ссылка на ?liked=1).
  const showLiked = searchParams.get(LIKED_PARAM) === '1';
  const { isLiked, prune: pruneLikes } = useLikes(slug);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Возврат из карточки товара — на то же место каталога, а не в начало.
  useListScrollMemory(`shop-scroll:${base}`, !loading);
  // Подвал витрины — после загрузки товаров (как «О магазине» ниже).
  useFooterHold(loading);

  const prefersReducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  // Фото-приветствие магазина (загружается во вкладке «Дизайн»). Если файл
  // не загрузился (например, истекла подпись ссылки) — показываем обычный
  // текстовый заголовок вместо пустой рамки.
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  useEffect(() => {
    setHeroImageFailed(false);
  }, [shop.heroImageUrl]);
  const heroImage = !heroImageFailed ? shop.heroImageUrl || null : null;
  const showHero = Boolean(heroImage);
  // Заголовок витрины — слоган магазина, без него — название.
  const title = shop.tagline || shop.name;

  // Плавный скролл к каталогу; ссылка с #catalog остаётся рабочей и без JS.
  const scrollToCatalog = (e) => {
    const catalog = document.getElementById('catalog');
    if (!catalog) return;
    e.preventDefault();
    catalog.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  const visibleItems = useMemo(
    () => (showLiked ? items.filter((item) => isLiked(item.id)) : items),
    [items, showLiked, isLiked]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getShopProducts(slug)
      .then((list) => {
        if (cancelled) return;
        if (!Array.isArray(list)) {
          setItems([]);
          return;
        }
        setItems(list);
        // Ответ — весь каталог (без страниц и фильтров): выкидываем из избранного
        // выключенные и удалённые товары, чтобы счётчик на сердечке в шапке
        // совпадал с тем, что покажет фильтр «Избранное». На битом ответе
        // (не массив) не чистим — иначе потеряли бы все лайки.
        pruneLikes(list.map((item) => item.id));
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, 'Не удалось загрузить товары'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, reloadKey, pruneLikes]);

  const gridClass = `${styles.grid} ${styles.gridBoutique}`;
  // Якорь каталога: с фото-приветствием он на заголовке «Каталог», без него —
  // на самой сетке (или сообщении вместо неё).
  const catalogAnchor = showHero ? undefined : 'catalog';

  const renderCatalog = () => {
    if (loading) {
      // Шапка и первый экран не зависят от товаров и видны сразу, а вместо
      // сетки — скелетон в той же раскладке.
      return (
        <div role="status" aria-label="Загрузка товаров">
          <ul className={gridClass} aria-hidden="true">
            {Array.from({ length: SKELETON_CARDS }, (_, index) => (
              <li key={index} className={styles.gridItem}>
                <ProductCardSkeleton index={index} boutique />
              </li>
            ))}
          </ul>
        </div>
      );
    }
    if (error) {
      return (
        <div id={catalogAnchor} className={styles.message}>
          <p className={styles.error}>{error}</p>
          <button
            type="button"
            className={styles.retryButton}
            onClick={() => setReloadKey((key) => key + 1)}
          >
            Повторить
          </button>
        </div>
      );
    }
    if (!items.length) {
      return (
        <p id={catalogAnchor} className={styles.message}>
          Товаров пока нет.
        </p>
      );
    }
    if (showLiked && visibleItems.length === 0) {
      return (
        <p id={catalogAnchor} className={styles.message}>
          Пока ничего не выбрано — нажмите на сердечко у товара, чтобы сохранить его здесь.{' '}
          <Link to={base} replace className={styles.messageLink}>
            Показать все товары
          </Link>
        </p>
      );
    }
    return (
      <ul id={catalogAnchor} className={gridClass}>
        {visibleItems.map((item, index) => (
          <li key={item.id} className={styles.gridItem}>
            <ProductCard
              item={item}
              index={index}
              slug={slug}
              to={productPath(slug, item.id)}
              boutique
            />
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className={`${styles.wrap} ${styles.wrapBoutique}`}>
      {showHero ? (
        <section className={styles.hero}>
          <div className={styles.heroTitleBlock}>
            <h1 className={styles.shopTitle}>{title}</h1>
            <span className={styles.shopDivider} aria-hidden="true" />
            {shop.description && (
              <p className={styles.shopDescription}>{shop.description}</p>
            )}
          </div>
          <div className={styles.heroMedia}>
            <img
              className={styles.heroImage}
              src={heroImage}
              alt={shop.name}
              onError={() => setHeroImageFailed(true)}
            />
          </div>
          <a className={styles.heroCta} href="#catalog" onClick={scrollToCatalog}>
            Смотреть каталог
          </a>
        </section>
      ) : (
        <div className={styles.intro}>
          <h1 className={styles.shopTitle}>{title}</h1>
          <span className={styles.shopDivider} aria-hidden="true" />
          {shop.description && (
            <p className={styles.shopDescription}>{shop.description}</p>
          )}
        </div>
      )}
      {showHero && (
        <div className={styles.catalogHead} id="catalog">
          <h2 className={styles.catalogTitle}>Каталог</h2>
          <span className={styles.shopDivider} aria-hidden="true" />
        </div>
      )}
      {renderCatalog()}
      {/* «О магазине» стоит под каталогом — до загрузки товаров его не
          показываем, иначе он уедет вниз, когда вырастет сетка. */}
      {!loading && shop.about && (
        <section className={styles.about} aria-labelledby="shop-about-title">
          <h2 className={styles.catalogTitle} id="shop-about-title">
            О магазине
          </h2>
          <span className={styles.shopDivider} aria-hidden="true" />
          <p className={styles.aboutText}>{shop.about}</p>
        </section>
      )}
    </div>
  );
};

export default Storefront;
