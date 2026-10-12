import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { selectPaymentProvider } from '../../services/merchantShop';
import { errorMessage } from '../../shared/errors';
import ProviderLogo from './ProviderLogo';
import { PAYMENT_PROVIDERS, isActive, isConnected, setupPath } from './paymentProviders';
import { outdatedReceiptSettings } from './receiptOptions';
import styles from './PaymentProviderCards.module.css';

/**
 * Плашки платёжек в «Настройках» (как раздел «Оплата» в Ecwid): у каждой — статус и одна
 * главная кнопка. Не подключена — «Подключить» ведёт на страницу с инструкцией; подключена —
 * «Настроить», а если оплату сейчас принимает другая — ещё и «Принимать через …».
 */
const PaymentProviderCards = ({ shop, setShop }) => {
  const [switching, setSwitching] = useState(null);

  const handleSelect = async (provider) => {
    if (switching) return;
    setSwitching(provider.code);
    try {
      setShop(await selectPaymentProvider(provider.code));
      toast.success(`Оплата теперь принимается через ${provider.name}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Не удалось сменить способ оплаты'));
    } finally {
      setSwitching(null);
    }
  };

  return (
    <ul className={styles.list}>
      {PAYMENT_PROVIDERS.map((provider) => {
        const connected = isConnected(provider, shop);
        const active = isActive(provider, shop);
        const outdated = connected && outdatedReceiptSettings(shop, provider.code);
        let badge;
        if (!connected) badge = <span className={`${styles.badge} ${styles.badgeIdle}`}>не подключено</span>;
        else if (outdated) badge = <span className={`${styles.badge} ${styles.badgeWarn}`}>проверьте чек</span>;
        else if (active) badge = <span className={`${styles.badge} ${styles.badgeOk}`}>принимает оплату</span>;
        else badge = <span className={`${styles.badge} ${styles.badgeIdle}`}>подключено</span>;

        return (
          <li key={provider.code} className={`${styles.item} ${active && connected ? styles.itemActive : ''}`}>
            <div className={styles.logo}>
              <ProviderLogo code={provider.code} />
            </div>
            <div className={styles.body}>
              <div className={styles.titleRow}>
                <h3 className={styles.name}>{provider.title}</h3>
                {badge}
              </div>
              <p className={styles.tagline}>{provider.tagline}</p>
              <ul className={styles.methods} aria-label="Способы оплаты">
                {provider.methods.map((method) => (
                  <li key={method} className={styles.method}>{method}</li>
                ))}
              </ul>
            </div>
            <div className={styles.actions}>
              {connected ? (
                <>
                  {!active && (
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={() => handleSelect(provider)}
                      disabled={Boolean(switching)}
                    >
                      {switching === provider.code ? 'Переключаем…' : `Принимать через ${provider.name}`}
                    </button>
                  )}
                  <Link to={setupPath(provider)} className={styles.secondaryBtn}>Настроить</Link>
                </>
              ) : (
                <Link to={setupPath(provider)} className={styles.primaryBtn}>Подключить</Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default PaymentProviderCards;
