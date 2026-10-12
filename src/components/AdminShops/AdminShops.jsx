import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getAllShops, setShopActive } from '../../services/admin';
import { errorMessage } from '../../shared/errors';
import { formatPrice } from '../../shared/money';
import styles from './AdminShops.module.css';

const STATUS_TABS = [
  { key: 'all', label: 'Все' },
  { key: 'active', label: 'Активные' },
  { key: 'off', label: 'Выключенные' },
];

// Дата создания по Москве — как и все даты кабинета (дни аналитики тоже по МСК).
const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  });
};

const pluralShops = (n) => {
  const tail10 = n % 10;
  const tail100 = n % 100;
  if (tail10 === 1 && tail100 !== 11) return 'магазин';
  if (tail10 >= 2 && tail10 <= 4 && (tail100 < 12 || tail100 > 14)) return 'магазина';
  return 'магазинов';
};

// Кнопка «обновить» — перенос RefreshButton из anyforms (AdminInvoices/invoiceShared).
const RefreshButton = ({ onClick, refreshing, label }) => (
  <button
    type="button"
    className={styles.refreshBtn}
    onClick={onClick}
    disabled={refreshing}
    title={label}
    aria-label={label}
  >
    <svg
      className={refreshing ? styles.spinning : undefined}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M13.9 8a5.9 5.9 0 1 1-1.73-4.17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M13.9 1.6v2.8h-2.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </button>
);

/**
 * Супер-админ платформы: все магазины и рубильник активности. Выключенный
 * магазин пропадает с витрины (404) и не принимает заказы (409) — это
 * модерация, а не удаление: данные и товары остаются, включить можно обратно.
 */
const AdminShops = () => {
  // Свой магазин супер-админа (может и не быть) — из контекста кабинета: переключив
  // его здесь, перечитываем и контекст, иначе плашка готовности и статус в
  // «Настройках» показывали бы старую активность до перезагрузки страницы.
  const { shop: myShop, setShop, reloadShop } = useOutletContext() ?? {};
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState('');
  // id магазинов, по которым сейчас летит запрос: второй клик по тому же
  // переключателю ждёт ответа, а не шлёт встречный запрос.
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadShops = useCallback(async () => {
    try {
      const data = await getAllShops();
      setShops(Array.isArray(data) ? data : []);
      setPageError('');
    } catch (err) {
      setPageError(errorMessage(err, 'Не удалось загрузить магазины'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShops();
  }, [loadShops]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadShops();
    } finally {
      setRefreshing(false);
    }
  };

  const setBusy = (id, busy) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });

  const replaceShop = (id, patch) =>
    setShops((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const handleToggle = async (shop) => {
    if (busyIds.has(shop.id)) return;
    const next = !shop.active;
    if (
      !next &&
      !window.confirm(
        `Выключить магазин «${shop.name}»? Витрина перестанет открываться, новые заказы не примутся. Включить можно обратно в любой момент.`
      )
    ) {
      return;
    }
    // Оптимистично: переключатель меняется сразу, при ошибке — откат.
    // acceptsOrders без магазина-активности не бывает, поэтому при выключении
    // гасим и его; при включении правду скажет ответ бэка.
    const previous = { active: shop.active, acceptsOrders: shop.acceptsOrders };
    replaceShop(shop.id, next ? { active: true } : { active: false, acceptsOrders: false });
    setBusy(shop.id, true);
    try {
      const updated = await setShopActive(shop.id, next);
      if (updated?.id) replaceShop(shop.id, updated);
      if (myShop?.id === shop.id) {
        // Ответ — AdminShopDTO, а контексту нужен полный MerchantShopDTO
        // (missingForOrders и т. п.): активность кладём сразу (меню и плашки не ждут
        // и не остаются старыми, если перечитать не выйдет), остальное — перечитываем.
        const patch = updated?.id
          ? { active: updated.active, acceptsOrders: updated.acceptsOrders }
          : { active: next, ...(next ? {} : { acceptsOrders: false }) };
        setShop?.((prev) => (prev?.id === shop.id ? { ...prev, ...patch } : prev));
        reloadShop?.().catch(() => {});
      }
      toast.success(next ? `Магазин «${shop.name}» включён` : `Магазин «${shop.name}» выключен`);
    } catch (err) {
      replaceShop(shop.id, previous);
      toast.error(errorMessage(err, 'Не удалось переключить магазин'));
    } finally {
      setBusy(shop.id, false);
    }
  };

  const nameQuery = query.trim().toLowerCase();
  const visibleShops = shops.filter((s) => {
    if (statusFilter === 'active' && !s.active) return false;
    if (statusFilter === 'off' && s.active) return false;
    if (!nameQuery) return true;
    return [s.name, s.slug, s.ownerEmail].some((v) => (v ?? '').toLowerCase().includes(nameQuery));
  });

  const activeCount = shops.filter((s) => s.active).length;
  const acceptingCount = shops.filter((s) => s.acceptsOrders).length;
  const isFiltered = Boolean(nameQuery) || statusFilter !== 'all';

  if (loading) {
    return (
      <div className={styles.wrap}>
        <p className={styles.message}>Загрузка магазинов…</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Магазины</h1>
          <p className={styles.subtitle}>
            {shops.length} {pluralShops(shops.length)} · активны: {activeCount} · принимают заказы:{' '}
            {acceptingCount}
          </p>
        </div>
        <RefreshButton onClick={handleRefresh} refreshing={refreshing} label="Обновить список магазинов" />
      </header>

      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.search}
          placeholder="Название, адрес или почта владельца"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Поиск магазина"
        />
        <div className={styles.statusTabs} role="group" aria-label="Фильтр по статусу">
          {STATUS_TABS.map((tab) => (
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

      {isFiltered && (
        <p className={styles.listCount}>
          Найдено: {visibleShops.length} из {shops.length}
        </p>
      )}

      {visibleShops.length === 0 ? (
        <p className={styles.message}>
          {shops.length === 0 ? 'Магазинов пока нет.' : 'Ничего не нашлось — измените поиск или фильтр.'}
        </p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thName}>Магазин</th>
                <th className={styles.thName}>Владелец</th>
                <th className={styles.thName}>Создан</th>
                <th className={styles.thNum}>Товаров</th>
                <th className={styles.thNum}>Оплач. заказов</th>
                <th className={styles.thNum}>Выручка</th>
                <th className={styles.thName}>Заказы</th>
                <th className={styles.thCenter}>Активен</th>
              </tr>
            </thead>
            <tbody>
              {visibleShops.map((s) => {
                const busy = busyIds.has(s.id);
                return (
                  <tr key={s.id} className={`${busy ? styles.rowBusy : ''} ${s.active ? '' : styles.rowOff}`}>
                    <td className={styles.tdShop}>
                      <a
                        className={styles.shopLink}
                        href={`/shop/${s.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Открыть витрину в новой вкладке"
                      >
                        {s.name}
                        <span className={styles.shopLinkArrow} aria-hidden="true">
                          ↗
                        </span>
                      </a>
                      <span className={styles.slug}>/shop/{s.slug}</span>
                    </td>
                    <td className={styles.tdText} data-label="владелец">
                      <span className={styles.email}>{s.ownerEmail || '—'}</span>
                    </td>
                    <td className={styles.tdText} data-label="создан">
                      {formatDate(s.createdAt)}
                    </td>
                    <td className={styles.tdNum} data-label="товаров">
                      {s.productsCount ?? 0}
                    </td>
                    <td className={styles.tdNum} data-label="оплач. заказов">
                      {s.paidOrdersCount ?? 0}
                    </td>
                    <td className={styles.tdNum} data-label="выручка">
                      {formatPrice(s.paidTotalKopecks ?? 0)}
                    </td>
                    <td className={styles.tdText} data-label="заказы">
                      {s.acceptsOrders ? (
                        <span className={`${styles.badge} ${styles.badgeOn}`}>принимает</span>
                      ) : (
                        <span
                          className={`${styles.badge} ${styles.badgeIdle}`}
                          title={
                            s.active
                              ? 'Магазину не хватает оплаты, доставки СДЭК или данных продавца'
                              : 'Магазин выключен'
                          }
                        >
                          не принимает
                        </span>
                      )}
                    </td>
                    <td className={styles.tdToggle} data-label="активен">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={Boolean(s.active)}
                        aria-label={`${s.active ? 'Выключить' : 'Включить'} магазин ${s.name}`}
                        className={`${styles.switch} ${s.active ? styles.switchOn : ''}`}
                        onClick={() => handleToggle(s)}
                        disabled={busy}
                      >
                        <span className={styles.switchKnob} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminShops;
