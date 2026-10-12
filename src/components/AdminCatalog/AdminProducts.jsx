import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { getProduct, listProducts, reorderProducts, updateProduct } from '../../services/merchantProducts';
import { errorMessage } from '../../shared/errors';
import { formatPrice } from '../../shared/money';
import { useListScrollMemory } from '../../hooks/useListScrollMemory';
import ExternalLinkIcon from './ExternalLinkIcon';
import {
  CATALOG_PATH,
  catalogProductPath,
  createSerialQueue,
  moveItem,
  pluralVariants,
  saveRequestFromProduct,
  storefrontProductPath,
} from './catalogHelpers';
import styles from './AdminProducts.module.css';

// Фильтры списка живут в sessionStorage, чтобы пережить уход на карточку
// товара и возврат к списку (в пределах текущей вкладки).
const FILTERS_KEY = 'adminProductsFilters';

const readSavedFilters = () => {
  let saved = {};
  try {
    saved = JSON.parse(sessionStorage.getItem(FILTERS_KEY)) ?? {};
  } catch {
    /* sessionStorage недоступен или в нём мусор — начинаем с дефолтов */
  }
  return {
    status: saved.status === 'active' || saved.status === 'off' ? saved.status : 'all',
    name: typeof saved.name === 'string' ? saved.name : '',
  };
};

// Порядок каталога — orderNumber (у каждого товара он есть, задаёт бэк).
// sort стабильный, поэтому при равных номерах остаётся порядок ответа (createdAt).
const byOrderNumber = (a, b) => (a.orderNumber ?? 0) - (b.orderNumber ?? 0);

const AdminProducts = () => {
  const { shop } = useOutletContext() ?? {};
  const slug = shop?.slug;

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  // id товаров, у которых сейчас сохраняется переключатель «на витрине».
  const [togglingIds, setTogglingIds] = useState(() => new Set());
  // Возврат с карточки товара — на то же место списка, а не в начало.
  useListScrollMemory('admin-products-scroll', !loading);
  // Фильтры списка: статус и поиск по названию.
  const [statusFilter, setStatusFilter] = useState(() => readSavedFilters().status);
  const [nameFilter, setNameFilter] = useState(() => readSavedFilters().name);

  const orderQueueRef = useRef(null);
  if (!orderQueueRef.current) orderQueueRef.current = createSerialQueue();
  // Номер последнего перемещения: ответ применяем, только если после него
  // мерчант больше ничего не двигал — иначе экран откатился бы назад.
  const orderSeqRef = useRef(0);

  const loadProducts = useCallback(async () => {
    try {
      // Список кабинета: включает и выключенные товары.
      const data = await listProducts();
      setProducts(Array.isArray(data) ? [...data].sort(byOrderNumber) : []);
      setPageError('');
    } catch (err) {
      setPageError(errorMessage(err, 'Не удалось загрузить товары'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    try {
      sessionStorage.setItem(FILTERS_KEY, JSON.stringify({ status: statusFilter, name: nameFilter }));
    } catch {
      /* sessionStorage недоступен — фильтры просто не сохранятся */
    }
  }, [statusFilter, nameFilter]);

  // Сервер подтвердил порядок — берём из ответа только orderNumber: остальные поля
  // в списке могли уже поменяться (переключатель), и ответ на перенос их бы затёр.
  const applyServerOrder = (saved) => {
    if (!Array.isArray(saved)) return;
    const orderById = new Map(saved.map((p) => [p.id, p.orderNumber]));
    setProducts((prev) =>
      prev
        .map((p) => (orderById.has(p.id) ? { ...p, orderNumber: orderById.get(p.id) } : p))
        .sort(byOrderNumber)
    );
  };

  /**
   * Переставить товар на место соседа (соседа по видимому списку: с фильтром
   * стрелка перепрыгивает скрытые товары). Порядок меняется на экране сразу,
   * запросы уходят в очередь по одному; ошибка — перечитываем список с сервера.
   */
  const moveProduct = (id, neighbourId) => {
    const from = products.findIndex((p) => p.id === id);
    const to = products.findIndex((p) => p.id === neighbourId);
    if (from < 0 || to < 0 || from === to) return;
    const next = moveItem(products, from, to).map((p, index) => ({ ...p, orderNumber: index }));
    setProducts(next);
    const ids = next.map((p) => p.id);
    const seq = ++orderSeqRef.current;
    orderQueueRef
      .current(() => reorderProducts(ids))
      .then((saved) => {
        if (seq === orderSeqRef.current) applyServerOrder(saved);
      })
      .catch((err) => {
        toast.error(errorMessage(err, 'Не удалось изменить порядок'));
        if (seq === orderSeqRef.current) loadProducts();
      });
  };

  const setToggling = (id, on) =>
    setTogglingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // «На витрине» прямо из списка: PUT товара целиком с перевёрнутым active.
  // PUT заменяет все поля и набор вариантов, а список загружен при открытии
  // страницы и мог устареть (товар правили в другой вкладке или с телефона) —
  // поэтому запрос строим из свежей карточки, а не из копии в списке. Иначе
  // один клик по переключателю вернул бы старые цену, название и даже удалённый вариант.
  const toggleActive = async (product) => {
    const nextActive = !product.active;
    setToggling(product.id, true);
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, active: nextActive } : p)));
    try {
      const fresh = await getProduct(product.id);
      const saved = await updateProduct(
        product.id,
        saveRequestFromProduct(fresh, { active: nextActive })
      );
      // orderNumber оставляем свой: пока шёл запрос, товар могли передвинуть стрелками.
      setProducts((prev) =>
        prev.map((p) => (p.id === saved.id ? { ...saved, orderNumber: p.orderNumber } : p))
      );
      toast.success(nextActive ? 'Товар снова на витрине' : 'Товар снят с витрины');
    } catch (err) {
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, active: product.active } : p))
      );
      toast.error(errorMessage(err, 'Не удалось переключить товар'));
      // 404 — товар уже удалили (в другой вкладке): список устарел, перечитываем.
      if (err?.response?.status === 404) loadProducts();
    } finally {
      setToggling(product.id, false);
    }
  };

  const nameQuery = nameFilter.trim().toLowerCase();
  const visibleProducts = products.filter((p) => {
    if (statusFilter === 'active' && !p.active) return false;
    if (statusFilter === 'off' && p.active) return false;
    if (nameQuery && !(p.name ?? '').toLowerCase().includes(nameQuery)) return false;
    return true;
  });

  const onSaleCount = products.filter((p) => p.active).length;
  const isFiltered = Boolean(nameQuery || statusFilter !== 'all');

  if (loading) {
    return (
      <div className={styles.wrap}>
        <p className={styles.message}>Загрузка товаров…</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Каталог</h1>
          <p className={styles.subtitle}>
            {products.length} всего · {onSaleCount} на витрине
          </p>
        </div>
        <div className={styles.headActions}>
          {slug && (
            <a
              className={styles.shopLink}
              href={`/shop/${encodeURIComponent(slug)}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Открыть витрину магазина"
            >
              <ExternalLinkIcon />
              <span>Витрина</span>
            </a>
          )}
          <Link className={styles.addBtn} to={`${CATALOG_PATH}/new`}>
            + Добавить товар
          </Link>
        </div>
      </header>

      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.search}
          placeholder="Поиск по названию"
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          aria-label="Поиск по названию"
        />
        <div className={styles.statusTabs} role="group" aria-label="Фильтр по статусу">
          {[
            { key: 'all', label: 'Все' },
            { key: 'active', label: 'На витрине' },
            { key: 'off', label: 'Выключенные' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={statusFilter === tab.key ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              aria-pressed={statusFilter === tab.key}
              onClick={() => setStatusFilter(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {pageError && <p className={`${styles.banner} ${styles.bannerError}`}>{pageError}</p>}

      {!pageError && (
        <p className={styles.listCount}>
          Найдено: {visibleProducts.length}
          {isFiltered && visibleProducts.length !== products.length && ` из ${products.length}`}
          {products.length > 1 && ' · порядок на витрине меняется стрелками'}
        </p>
      )}

      {visibleProducts.length === 0 ? (
        !pageError && (
          <p className={styles.message}>
            {products.length === 0
              ? 'Товаров пока нет — добавьте первый.'
              : 'Ничего не нашлось — измените поиск или фильтры.'}
          </p>
        )
      ) : (
        <ul className={styles.list}>
          {visibleProducts.map((p, i) => {
            const photo = p.photos?.[0]?.url;
            const variants = p.variants ?? [];
            const prev = visibleProducts[i - 1];
            const next = visibleProducts[i + 1];
            const toggling = togglingIds.has(p.id);
            return (
              <li key={p.id} className={styles.item}>
                <div className={styles.orderArrows}>
                  <button
                    type="button"
                    className={styles.arrowBtn}
                    disabled={!prev}
                    title="Выше на витрине"
                    aria-label={`Поднять «${p.name}» выше`}
                    onClick={() => prev && moveProduct(p.id, prev.id)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={styles.arrowBtn}
                    disabled={!next}
                    title="Ниже на витрине"
                    aria-label={`Опустить «${p.name}» ниже`}
                    onClick={() => next && moveProduct(p.id, next.id)}
                  >
                    ↓
                  </button>
                </div>

                {photo ? (
                  <img className={styles.itemPhoto} src={photo} alt="" />
                ) : (
                  <div className={`${styles.itemPhoto} ${styles.itemPhotoEmpty}`} aria-hidden="true">
                    нет фото
                  </div>
                )}

                <div className={styles.itemBody}>
                  {/* Название — настоящая ссылка, растянутая на всю строку (::after):
                      работают Ctrl/Cmd+клик и средняя кнопка мыши, а стрелки и
                      переключатель лежат поверх и кликаются отдельно. */}
                  <Link className={styles.itemLink} to={catalogProductPath(p.id)}>
                    <span className={styles.itemName}>{p.name || '—'}</span>
                  </Link>
                  {(!p.active || p.preorder) && (
                    <span className={styles.itemBadges}>
                      {!p.active && <span className={`${styles.badge} ${styles.badgeOff}`}>выключен</span>}
                      {p.preorder && (
                        <span className={`${styles.badge} ${styles.badgePreorder}`}>предзаказ</span>
                      )}
                    </span>
                  )}
                  {variants.length > 0 && (
                    <span className={styles.itemMeta}>
                      {variants.length} {pluralVariants(variants.length)}:{' '}
                      {variants.map((v) => `${v.label} — ${formatPrice(v.priceKopecks)}`).join(' · ')}
                    </span>
                  )}
                </div>

                <div className={styles.itemSide}>
                  <span className={styles.itemPrice}>{formatPrice(p.priceKopecks)}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(p.active)}
                    aria-label={`«${p.name}» на витрине`}
                    title={p.active ? 'На витрине — нажмите, чтобы скрыть' : 'Скрыт — нажмите, чтобы показать на витрине'}
                    className={p.active ? `${styles.switch} ${styles.switchOn}` : styles.switch}
                    disabled={toggling}
                    onClick={() => toggleActive(p)}
                  >
                    <span className={styles.switchKnob} />
                  </button>
                  {slug && p.active ? (
                    <a
                      className={styles.rowShopLink}
                      href={storefrontProductPath(slug, p.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Открыть товар на витрине"
                      aria-label={`Открыть «${p.name}» на витрине`}
                    >
                      <ExternalLinkIcon size={14} />
                    </a>
                  ) : (
                    <span
                      className={`${styles.rowShopLink} ${styles.rowShopLinkOff}`}
                      title="Выключенный товар покупатели не видят"
                      aria-hidden="true"
                    >
                      <ExternalLinkIcon size={14} />
                    </span>
                  )}
                  <span className={styles.editBtn} aria-hidden="true">
                    Открыть
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default AdminProducts;
