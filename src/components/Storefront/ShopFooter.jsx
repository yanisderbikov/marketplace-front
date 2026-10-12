import React from 'react';
import { Link } from 'react-router-dom';
import { BRAND_NAME } from '../../config/brand';
import { shopBase, tgLink } from './storefrontPaths';
import styles from './ShopFooter.module.css';

// Ссылка tel: — только цифры и «+»: пробелы, скобки и дефисы из поля
// «Телефон» в настройках магазина звонилки понимают не все.
const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;

/**
 * Подвал витрины (перенос подвала anyforms Marketplace). Продавец на витрине —
 * сам магазин: его реквизиты и контакты из настроек кабинета, оферта и
 * политика — страницы магазина. Платформа — только мелкое «Сделано на …».
 * Блоки без заполненных полей не выводим.
 */
const ShopFooter = ({ shop, slug }) => {
  const base = shopBase(slug);
  const { sellerName, sellerInn, sellerOgrn, sellerAddress } = shop;
  const { contactPhone, contactEmail, supportTelegram } = shop;
  const hasSeller = Boolean(sellerName || sellerInn || sellerOgrn || sellerAddress);
  const hasContacts = Boolean(contactPhone || contactEmail || supportTelegram);
  const singleBlock = hasSeller !== hasContacts;

  return (
    <footer className={styles.siteFooter}>
      {(hasSeller || hasContacts) && (
        <div className={`${styles.footerGrid} ${singleBlock ? styles.footerGridSingle : ''}`}>
          {hasSeller && (
            <div className={styles.footerBlock}>
              <h2 className={styles.footerHeading}>Продавец</h2>
              <p className={styles.footerText}>
                {sellerName && (
                  <>
                    {sellerName}
                    <br />
                  </>
                )}
                {sellerInn && (
                  <>
                    ИНН {sellerInn}
                    <br />
                  </>
                )}
                {/* 15 цифр — ОГРНИП индивидуального предпринимателя, 13 — ОГРН юрлица. */}
                {sellerOgrn && (
                  <>
                    {sellerOgrn.length === 15 ? 'ОГРНИП' : 'ОГРН'} {sellerOgrn}
                    <br />
                  </>
                )}
                {sellerAddress && <>Адрес: {sellerAddress}</>}
              </p>
            </div>
          )}
          {hasContacts && (
            <div className={styles.footerBlock}>
              <h2 className={styles.footerHeading}>Контакты</h2>
              <p className={styles.footerText}>
                {contactPhone && (
                  <>
                    <a className={styles.footerLink} href={telHref(contactPhone)}>
                      {contactPhone}
                    </a>
                    <br />
                  </>
                )}
                {contactEmail && (
                  <>
                    <a className={styles.footerLink} href={`mailto:${contactEmail}`}>
                      {contactEmail}
                    </a>
                    <br />
                  </>
                )}
                {supportTelegram && (
                  <a
                    className={styles.footerLink}
                    href={tgLink(supportTelegram)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Telegram @{supportTelegram}
                  </a>
                )}
              </p>
            </div>
          )}
        </div>
      )}
      <p className={styles.footerLegal}>
        <Link to={`${base}/offer`} className={styles.footerLegalLink}>
          Публичная оферта
        </Link>
        {' · '}
        <Link to={`${base}/privacy`} className={styles.footerLegalLink}>
          Политика конфиденциальности
        </Link>
      </p>
      <p className={styles.footerCopyright}>
        © {shop.name}, {new Date().getFullYear()}
      </p>
      <p className={styles.footerPlatform}>
        <Link to="/" className={styles.footerPlatformLink}>
          Сделано на {BRAND_NAME}
        </Link>
      </p>
    </footer>
  );
};

export default ShopFooter;
