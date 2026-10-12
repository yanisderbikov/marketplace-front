import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { listOrders } from '../../services/merchantOrders';
import { errorMessage } from '../../shared/errors';
import OrderCard from './OrderCard';
import styles from './AdminOrders.module.css';

const PAGE_SIZE = 20;

const PAYMENT_FILTERS = [
  { value: 'PAID', label: 'Оплаченные' },
  { value: 'AWAITING_PAYMENT', label: 'Ожидают оплаты' },
  { value: 'ALL', label: 'Все' },
];

const FULFILLMENT_FILTERS = [
  { value: 'ALL', label: 'Все' },
  { value: 'NEW', label: 'Новые' },
  { value: 'SHIPPED', label: 'Отправлены' },
  { value: 'DONE', label: 'Выполнены' },
  { value: 'CANCELLED', label: 'Отменены' },
];

// По умолчанию — оплаченные заказы: именно их мерчанту нужно собрать и отправить.
const DEFAULT_PAYMENT = 'PAID';
const DEFAULT_FULFILLMENT = 'ALL';

// Фильтры живут в адресе (?payment=&fulfillment=) — как режимы списка заказов в anyforms:
// обновление страницы и «назад» из другой вкладки возвращают тот же срез.
// Мусор в адресе молча заменяем значением по умолчанию.
const pickFilter = (value, options, fallback) =>
  options.some((option) => option.value === value) ? value : fallback;

const emptyText = (payment, fulfillment) => {
  if (fulfillment !== 'ALL') return 'Нет заказов с выбранными фильтрами';
  if (payment === 'PAID') return 'Оплаченных заказов пока нет';
  if (payment === 'AWAITING_PAYMENT') return 'Нет заказов, ожидающих оплаты';
  return 'Заказов пока нет';
};

/** Сегмент-переключатель в стиле вкладок режимов списка заказов anyforms. */
const FilterTabs = ({ label, options, value, onChange }) => (
  <div className={styles.filterGroup}>
    <span className={styles.filterLabel}>{label}</span>
    <div className={styles.modeTabs} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`${styles.modeTab} ${value === option.value ? styles.modeTabActive : ''}`}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);

/**
 * Страница «Заказы»: заказы своего магазина постранично (новые сверху) с фильтрами
 * по оплате и исполнению. Карточка оплаченного заказа сама меняет статус исполнения
 * и трек-номер. Данные — /api/merchant/orders.
 */
const AdminOrders = () => {
  const { shop } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const payment = pickFilter(searchParams.get('payment'), PAYMENT_FILTERS, DEFAULT_PAYMENT);
  const fulfillment = pickFilter(searchParams.get('fulfillment'), FULFILLMENT_FILTERS, DEFAULT_FULFILLMENT);

  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  // Номер последней загруженной страницы (с 0).
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  // Номер актуального запроса: ответ на старые фильтры (пользователь успел
  // переключиться, пока шёл запрос) не должен перезаписать новый список.
  const requestRef = useRef(0);

  const loadFirstPage = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadingMore(false);
    setError('');
    try {
      const data = await listOrders({ payment, fulfillment, page: 0, size: PAGE_SIZE });
      if (requestId !== requestRef.current) return;
      setOrders(data.items || []);
      setTotal(data.total ?? 0);
      setPage(0);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setOrders([]);
      setTotal(0);
      setError(errorMessage(err, 'Не удалось загрузить заказы'));
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [payment, fulfillment]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = async () => {
    // Номер не увеличиваем: смена фильтров во время запроса сама сделает этот ответ устаревшим.
    const requestId = requestRef.current;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const data = await listOrders({ payment, fulfillment, page: nextPage, size: PAGE_SIZE });
      if (requestId !== requestRef.current) return;
      // Пока листали, мог прийти новый заказ и сдвинуть страницы — без дублей по publicId.
      setOrders((prev) => {
        const seen = new Set(prev.map((order) => order.publicId));
        return [...prev, ...(data.items || []).filter((order) => !seen.has(order.publicId))];
      });
      setTotal(data.total ?? 0);
      setPage(nextPage);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      toast.error(errorMessage(err, 'Не удалось загрузить заказы'));
    } finally {
      if (requestId === requestRef.current) setLoadingMore(false);
    }
  };

  const changeFilters = (next) => {
    const nextPayment = next.payment ?? payment;
    const nextFulfillment = next.fulfillment ?? fulfillment;
    const params = {};
    // Значения по умолчанию в адрес не пишем — /admin/orders остаётся чистым.
    if (nextPayment !== DEFAULT_PAYMENT) params.payment = nextPayment;
    if (nextFulfillment !== DEFAULT_FULFILLMENT) params.fulfillment = nextFulfillment;
    setSearchParams(params, { replace: true });
  };

  // Сохранённый заказ остаётся на месте, даже если под фильтр уже не подходит
  // (например, «Новые» → отправлен): карточка не пропадает из-под рук сразу после
  // сохранения. Список пересоберётся при смене фильтра или «обновить».
  const handleUpdated = (updated) => {
    setOrders((prev) => prev.map((order) => (order.publicId === updated.publicId ? updated : order)));
  };

  const isDefaultFilters = payment === DEFAULT_PAYMENT && fulfillment === DEFAULT_FULFILLMENT;
  const hasMore = (page + 1) * PAGE_SIZE < total;

  return (
    <div className={styles.wrap}>
      <header className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Заказы</h1>
          <p className={styles.subtitle}>
            {shop?.name ? `Заказы магазина ${shop.name}` : 'Заказы магазина'}
          </p>
        </div>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={loadFirstPage}
          disabled={loading}
        >
          Обновить
        </button>
      </header>

      <div className={styles.controls}>
        <FilterTabs
          label="оплата"
          options={PAYMENT_FILTERS}
          value={payment}
          onChange={(value) => changeFilters({ payment: value })}
        />
        <FilterTabs
          label="исполнение"
          options={FULFILLMENT_FILTERS}
          value={fulfillment}
          onChange={(value) => changeFilters({ fulfillment: value })}
        />
      </div>

      {loading ? (
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p className={styles.loadingText}>Загрузка заказов...</p>
        </div>
      ) : error ? (
        <div className={styles.errorBox} role="alert">
          <p className={styles.errorText}>{error}</p>
          <button type="button" className={styles.retryBtn} onClick={loadFirstPage}>
            Повторить
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>{emptyText(payment, fulfillment)}</p>
          {isDefaultFilters ? (
            <p className={styles.emptyHint}>
              Заказ появится здесь, как только покупатель оплатит его на витрине.
            </p>
          ) : (
            <button
              type="button"
              className={styles.resetBtn}
              onClick={() => changeFilters({ payment: DEFAULT_PAYMENT, fulfillment: DEFAULT_FULFILLMENT })}
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : (
        <>
          <p className={styles.listCount}>
            {hasMore ? `показано ${orders.length} из ${total}` : `всего: ${total}`}
          </p>
          <div className={styles.cardsContainer}>
            {orders.map((order) => (
              <OrderCard key={order.publicId} order={order} onUpdated={handleUpdated} />
            ))}
          </div>
          {hasMore && (
            <div className={styles.loadMoreWrap}>
              <button
                type="button"
                className={styles.loadMoreBtn}
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Загружаем…' : 'Показать ещё'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminOrders;
