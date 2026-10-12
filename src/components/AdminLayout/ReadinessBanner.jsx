import React from 'react';
import { Link } from 'react-router-dom';
import { legacyTaxLabel, outdatedReceiptSettings } from '../AdminSettings/receiptOptions';
import styles from './ReadinessBanner.module.css';

// Чего не хватает витрине, чтобы принимать заказы (MerchantShopDTO.missingForOrders).
// Подписи — продолжение фразы «Витрина пока не принимает заказы: …»; их же
// может показывать вкладка «Настройки» в своём статусе готовности.
export const READINESS_LABELS = {
  PAYMENT: 'подключите оплату — Т-Банк или ЮKassa',
  DELIVERY: 'подключите свой аккаунт СДЭК и выберите пункт отправки',
  SELLER: 'заполните данные продавца (название и ИНН)',
};

// PAYMENT бывает и при подключённом терминале: в чеке сохранена ставка, которой
// больше нет (vat20). «Подключите оплату» тогда сбивает с толку — называем причину.
const paymentLabel = (shop) => {
  const outdated = outdatedReceiptSettings(shop);
  if (!outdated) return READINESS_LABELS.PAYMENT;
  return outdated.tax
    ? `выберите заново ставку НДС для чека («${legacyTaxLabel(outdated.tax)}» больше не действует)`
    : 'выберите заново систему налогообложения для чека';
};

// DELIVERY — это и свой аккаунт СДЭК, и пункт отправки: называем то, чего не хватает.
const deliveryLabel = (shop) => {
  const connected = Boolean(shop.cdekClientId) && Boolean(shop.cdekSecretSet);
  if (connected) return 'выберите пункт СДЭК, откуда отправляете заказы';
  return shop.cdekFromPvzCode ? 'подключите свой аккаунт СДЭК' : READINESS_LABELS.DELIVERY;
};

/** Подпись пункта готовности для этого магазина. */
export const readinessLabel = (shop, code) => {
  if (code === 'PAYMENT') return paymentLabel(shop);
  if (code === 'DELIVERY') return deliveryLabel(shop);
  return READINESS_LABELS[code] || code;
};

/**
 * Плашка «витрина не принимает заказы». Ничего не рисует, если магазин готов
 * (acceptsOrders). Выключенный супер-админом магазин — отдельный текст: настройками
 * это не починить. showSettingsLink=false — для самой страницы настроек.
 */
const ReadinessBanner = ({ shop, showSettingsLink = true, className = '' }) => {
  if (!shop || shop.acceptsOrders) return null;

  if (!shop.active) {
    return (
      <div className={`${styles.banner} ${styles.bannerOff} ${className}`} role="status">
        <p className={styles.text}>
          <strong>Витрина отключена администратором платформы.</strong> Покупатели её не видят,
          заказы не принимаются.
        </p>
      </div>
    );
  }

  const missing = (shop.missingForOrders || []).map((code) => readinessLabel(shop, code));

  return (
    <div className={`${styles.banner} ${className}`} role="status">
      <p className={styles.text}>
        <strong>Витрина пока не принимает заказы:</strong> {missing.join('; ')}.
      </p>
      {showSettingsLink && (
        <Link to="/admin/settings" className={styles.link}>
          Перейти в настройки →
        </Link>
      )}
    </div>
  );
};

export default ReadinessBanner;
