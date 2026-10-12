import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { updateFulfillment } from '../../services/merchantOrders';
import { formatPrice } from '../../shared/money';
import { errorMessage } from '../../shared/errors';
import styles from './OrderCard.module.css';

// Статус оплаты: пилюля в шапке карточки. Цвета — палитра статусов anyforms
// (зелёный — готово, жёлтый — ждём, красный — сбой, серый — закрыто).
const PAYMENT_BADGES = {
  PAID: { label: 'оплачен', className: 'badgeGreen' },
  AWAITING_PAYMENT: { label: 'ждёт оплаты', className: 'badgeYellow' },
  FAILED: { label: 'оплата не прошла', className: 'badgeRed' },
  CANCELED: { label: 'платёж отменён', className: 'badgeGrey' },
};

// Статус исполнения — его ведёт сам мерчант (только у оплаченных заказов).
const FULFILLMENT_BADGES = {
  NEW: { label: 'новый', className: 'badgeYellow' },
  SHIPPED: { label: 'отправлен', className: 'badgeBlue' },
  DONE: { label: 'выполнен', className: 'badgeGrey' },
  CANCELLED: { label: 'отменён', className: 'badgeRed' },
};

const FULFILLMENT_OPTIONS = [
  { value: 'NEW', label: 'Новый' },
  { value: 'SHIPPED', label: 'Отправлен' },
  { value: 'DONE', label: 'Выполнен' },
  { value: 'CANCELLED', label: 'Отменён' },
];

const TRACKING_MAX_LENGTH = 64;

// Время в кабинете — по Москве, как и дни в аналитике: мерчант и бэк считают
// одинаково, в каком бы часовом поясе ни был открыт браузер.
const DATE_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// Instant с бэка приходит ISO-строкой UTC (2026-10-01T09:00:00Z).
const formatDate = (iso) => {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return `${DATE_FORMAT.format(date)} МСК`;
};

const Badge = ({ meta }) =>
  meta ? <span className={`${styles.badge} ${styles[meta.className]}`}>{meta.label}</span> : null;

/**
 * Карточка заказа в кабинете мерчанта: покупатель, ПВЗ, состав, сумма и — для
 * оплаченных — смена статуса исполнения с трек-номером. После сохранения отдаёт
 * свежий MerchantOrderDTO наверх через onUpdated.
 */
const OrderCard = ({ order, onUpdated }) => {
  const isPaid = order.paymentStatus === 'PAID';
  const [status, setStatus] = useState(order.fulfillmentStatus);
  const [tracking, setTracking] = useState(order.trackingNumber || '');
  const [saving, setSaving] = useState(false);

  // Пришёл обновлённый заказ (после сохранения или перезагрузки списка) —
  // поля формы снова показывают то, что лежит на бэке.
  useEffect(() => {
    setStatus(order.fulfillmentStatus);
    setTracking(order.trackingNumber || '');
  }, [order.fulfillmentStatus, order.trackingNumber]);

  const trimmedTracking = tracking.trim();
  const dirty =
    status !== order.fulfillmentStatus || trimmedTracking !== (order.trackingNumber || '');

  const copyToClipboard = (text, message) => {
    if (!text) return;
    // clipboard есть только в безопасном контексте (https/localhost).
    if (!navigator.clipboard?.writeText) {
      toast.error('Ошибка при копировании');
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      toast.success(message, {
        position: 'top-right',
        duration: 2000,
      });
    }).catch(() => {
      toast.error('Ошибка при копировании');
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const updated = await updateFulfillment(order.publicId, {
        fulfillmentStatus: status,
        // Пустое поле — трек-номера нет (бэк хранит null, а не пустую строку).
        trackingNumber: trimmedTracking || null,
      });
      toast.success(`Заказ #${order.publicId} обновлён`);
      onUpdated?.(updated);
    } catch (err) {
      toast.error(errorMessage(err, 'Не удалось сохранить заказ'));
    } finally {
      setSaving(false);
    }
  };

  const items = order.items || [];

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.leadId}>
          <span className={styles.orderNumber}>#{order.publicId}</span>
        </h3>
        <div className={styles.badges}>
          <Badge meta={PAYMENT_BADGES[order.paymentStatus]} />
          {isPaid && <Badge meta={FULFILLMENT_BADGES[order.fulfillmentStatus]} />}
        </div>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.contactInfo}>
          <div className={styles.contactItem}>
            <span className={styles.label}>ФИО:</span>
            <span
              className={`${styles.value} ${styles.clickable}`}
              onClick={() => copyToClipboard(order.customerName, 'ФИО скопировано')}
              title="Нажмите для копирования"
            >
              {order.customerName || '-'}
            </span>
          </div>
          <div className={styles.contactItem}>
            <span className={styles.label}>Телефон:</span>
            {order.customerPhone ? (
              <a className={`${styles.value} ${styles.link}`} href={`tel:${order.customerPhone}`}>
                {order.customerPhone}
              </a>
            ) : (
              <span className={styles.value}>-</span>
            )}
          </div>
          <div className={styles.contactItem}>
            <span className={styles.label}>Email:</span>
            {order.customerEmail ? (
              <a className={`${styles.value} ${styles.link}`} href={`mailto:${order.customerEmail}`}>
                {order.customerEmail}
              </a>
            ) : (
              <span className={styles.value}>-</span>
            )}
          </div>
          <div className={styles.contactItem}>
            <span className={styles.label}>ПВЗ СДЭК:</span>
            <span
              className={`${styles.value} ${styles.clickable}`}
              onClick={() => copyToClipboard(order.pvzCode, 'Код ПВЗ скопирован')}
              title="Нажмите для копирования"
            >
              {order.pvzCode || '-'}
            </span>
          </div>
          {order.pvzCity && (
            <div className={styles.contactItem}>
              <span className={styles.label}>ПВЗ СДЭК город:</span>
              <span
                className={`${styles.value} ${styles.clickable}`}
                onClick={() => copyToClipboard(order.pvzCity, 'ПВЗ СДЭК город скопирован')}
                title="Нажмите для копирования"
              >
                {order.pvzCity}
              </span>
            </div>
          )}
          {order.pvzAddress && (
            <div className={styles.contactItem}>
              <span className={styles.label}>ПВЗ СДЭК адрес:</span>
              <span
                className={`${styles.value} ${styles.clickable}`}
                onClick={() => copyToClipboard(order.pvzAddress, 'ПВЗ СДЭК адрес скопирован')}
                title="Нажмите для копирования"
              >
                {order.pvzAddress}
              </span>
            </div>
          )}
          <div className={styles.contactItem}>
            <span className={styles.label}>Создан:</span>
            <span className={styles.value}>{formatDate(order.createdAt)}</span>
          </div>
          {order.paidAt && (
            <div className={styles.contactItem}>
              <span className={styles.label}>Дата оплаты:</span>
              <span className={styles.value}>{formatDate(order.paidAt)}</span>
            </div>
          )}
          {order.trackingNumber && (
            <div className={styles.contactItem}>
              <span className={styles.label}>Трекер:</span>
              <span
                className={`${styles.value} ${styles.clickable}`}
                onClick={() => copyToClipboard(order.trackingNumber, 'Трек-номер скопирован')}
                title="Нажмите для копирования"
              >
                {order.trackingNumber}
              </span>
            </div>
          )}
          {order.comment && (
            <div className={`${styles.contactItem} ${styles.commentItem}`}>
              <span className={styles.label}>Комментарий:</span>
              <span className={`${styles.value} ${styles.commentValue}`}>{order.comment}</span>
            </div>
          )}
        </div>

        <div className={styles.itemsSection}>
          <h4 className={styles.itemsTitle}>Товары:</h4>
          <ul className={styles.itemsList}>
            {items.map((item, index) => (
              <li key={`${item.productId || 'deleted'}-${index}`} className={styles.item}>
                <span className={styles.itemName}>{item.productName}</span>
                <span className={styles.itemQuantity}>
                  {item.quantity} × {formatPrice(item.unitPriceKopecks)}
                </span>
              </li>
            ))}
          </ul>
          <div className={styles.totalRow}>
            {/* Доставку покупатель оплачивает в ПВЗ при получении — в сумме заказа её нет. */}
            <span className={styles.totalLabel}>Итого без доставки:</span>
            <span className={styles.totalValue}>{formatPrice(order.itemsTotalKopecks)}</span>
          </div>
        </div>
      </div>

      {isPaid ? (
        <form className={styles.cardFooter} onSubmit={handleSave}>
          <div className={styles.fields}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>статус</span>
              <select
                className={styles.select}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={saving}
              >
                {FULFILLMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${styles.field} ${styles.fieldWide}`}>
              <span className={styles.fieldLabel}>трек-номер</span>
              <input
                type="text"
                className={styles.input}
                value={tracking}
                maxLength={TRACKING_MAX_LENGTH}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="Номер отправления СДЭК"
                disabled={saving}
                autoComplete="off"
              />
            </label>
          </div>
          {status === 'CANCELLED' && (
            // Платёж прошёл через терминал мерчанта — платформа деньги не возвращает.
            <p className={styles.cancelHint}>
              Отмена здесь не возвращает деньги: верните платёж покупателю в личном кабинете Т-Банка.
            </p>
          )}
          <button type="submit" className={styles.addTrackerButton} disabled={!dirty || saving}>
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </form>
      ) : (
        <div className={styles.cardFooter}>
          <p className={styles.footerHint}>
            {order.paymentStatus === 'AWAITING_PAYMENT'
              ? 'Покупатель ещё не оплатил заказ — отправлять его можно будет после оплаты.'
              : 'Заказ не оплачен — отправлять его не нужно.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default OrderCard;
