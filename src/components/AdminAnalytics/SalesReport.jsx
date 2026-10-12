import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { getSalesReport } from '../../services/merchantOrders';
import { formatRub } from '../../shared/money';
import { errorMessage } from '../../shared/errors';
import styles from './SalesReport.module.css';

// Дни отчёта бэк считает по Москве (границы from/to — московские даты), поэтому
// и «сегодня» для пресетов берём московское, а не по часам браузера: иначе к
// западу от МСК вечером свежий заказ (по Москве уже следующий день) выпадает из
// «этой недели» и «этого месяца». Календарную дату держим как полночь UTC и
// считаем через getUTC*/setUTCDate — так арифметика дней не зависит от пояса
// браузера и его перехода на летнее время.
const MSK_DATE_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Moscow',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

const mskToday = () => {
  const parts = Object.fromEntries(
    MSK_DATE_PARTS.formatToParts(new Date()).map((part) => [part.type, part.value])
  );
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
};

// Дата в формате YYYY-MM-DD для <input type="date"> и запроса (toISOString не
// подходит для произвольного времени — сдвигает день; здесь всегда полночь UTC).
const toInputDate = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

const daysAgo = (n) => {
  const d = mskToday();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};

// Понедельник текущей (московской) недели (getUTCDay: воскресенье = 0).
const startOfWeek = () => {
  const d = mskToday();
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
};

const PRESETS = [
  { key: 'week', label: 'эта неделя', range: () => [startOfWeek(), mskToday()] },
  { key: '7d', label: '7 дней', range: () => [daysAgo(6), mskToday()] },
  { key: '30d', label: '30 дней', range: () => [daysAgo(29), mskToday()] },
  {
    key: 'month',
    label: 'этот месяц',
    range: () => {
      const today = mskToday();
      return [new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), today];
    },
  },
  {
    key: 'year',
    label: 'этот год',
    range: () => {
      const today = mskToday();
      return [new Date(Date.UTC(today.getUTCFullYear(), 0, 1)), today];
    },
  },
  { key: 'all', label: 'всё время', range: () => [new Date(Date.UTC(2020, 0, 1)), mskToday()] },
];

// Русское склонение по числу: 1 заказ, 2 заказа, 5 заказов (11–14 — всегда «много»).
const pluralRu = (n, one, few, many) => {
  const tail10 = n % 10;
  const tail100 = n % 100;
  if (tail10 === 1 && tail100 !== 11) return one;
  if (tail10 >= 2 && tail10 <= 4 && (tail100 < 12 || tail100 > 14)) return few;
  return many;
};

const pluralProducts = (n) => pluralRu(n, 'товар', 'товара', 'товаров');
const pluralOrders = (n) => pluralRu(n, 'заказ', 'заказа', 'заказов');

/**
 * Страница «Аналитика»: продажи своего магазина за период — итоги
 * (заказы, товары, сумма) и разбивка по товарам. Данные — /api/merchant/analytics/sales;
 * дни бэк считает по Москве, границы периода включительно.
 */
const SalesReport = () => {
  // AdminLayout пускает сюда только с магазином — shop уже загружен.
  const { shop } = useOutletContext();
  // По умолчанию — текущая неделя; отчёт запрашивается сразу.
  const [from, setFrom] = useState(() => toInputDate(startOfWeek()));
  const [to, setTo] = useState(() => toInputDate(mskToday()));
  const [preset, setPreset] = useState('week');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Пока дата стёрта в поле ввода — не дёргаем бэк заведомо битым периодом.
    // Прерванный этим запрос сам loading не снимет (cancelled) — снимаем здесь.
    if (!from || !to) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    getSalesReport({ from, to })
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setReport(null);
          setError(errorMessage(err, 'Не удалось загрузить отчёт'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const applyPreset = (p) => {
    const [start, end] = p.range();
    setPreset(p.key);
    setFrom(toInputDate(start));
    setTo(toInputDate(end));
  };

  return (
    <div className={styles.wrap}>
      <header className={styles.pageHead}>
        <h1 className={styles.title}>Аналитика</h1>
        <p className={styles.subtitle}>
          {shop?.name ? `Продажи магазина ${shop.name} за период` : 'Продажи магазина за период'}
        </p>
      </header>

      <div className={styles.controls}>
        <div className={styles.dates}>
          <input
            type="date"
            className={styles.dateInput}
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset('');
            }}
            aria-label="Начало периода"
          />
          <span className={styles.dateDash}>—</span>
          <input
            type="date"
            className={styles.dateInput}
            value={to}
            min={from}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset('');
            }}
            aria-label="Конец периода"
          />
        </div>
        <div className={styles.presets} role="group" aria-label="Быстрый выбор периода">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={preset === p.key ? `${styles.presetBtn} ${styles.presetActive}` : styles.presetBtn}
              aria-pressed={preset === p.key}
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {(!from || !to) && !error && <p className={styles.hint}>Выберите начало и конец периода.</p>}
      {loading && <p className={styles.hint}>Загрузка отчёта…</p>}
      {error && <p className={styles.error}>{error}</p>}

      {report && from && to && !loading && !error && (
        <>
          <div className={styles.stats}>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{report.ordersCount}</span>
              <span className={styles.statLabel}>{pluralOrders(report.ordersCount)}</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{report.itemsCount}</span>
              <span className={styles.statLabel}>{pluralProducts(report.itemsCount)} куплено</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{formatRub(report.totalKopecks)} ₽</span>
              <span className={styles.statLabel}>общая сумма</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>
                {report.ordersCount > 0
                  ? `${formatRub(Math.round(report.totalKopecks / report.ordersCount))} ₽`
                  : '—'}
              </span>
              <span className={styles.statLabel}>средний чек</span>
            </div>
          </div>

          {report.products?.length > 0 ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thName}>Товар</th>
                  <th className={styles.thNum}>Кол-во</th>
                  <th className={styles.thNum}>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {report.products.map((p) => (
                  <tr key={p.productName}>
                    <td className={styles.tdName}>{p.productName}</td>
                    <td className={styles.tdNum}>{p.quantity}</td>
                    <td className={styles.tdNum}>
                      {p.totalKopecks != null ? `${formatRub(p.totalKopecks)} ₽` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.hint}>За выбранный период оплаченных заказов нет.</p>
          )}
        </>
      )}
    </div>
  );
};

export default SalesReport;
