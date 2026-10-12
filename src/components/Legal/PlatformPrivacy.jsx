import React, { useMemo } from 'react';
import { BRAND_NAME } from '../../config/brand';
import SiteHeader from '../shared/SiteHeader/SiteHeader';
import LegalDocument from './LegalDocument';
import { buildPlatformPrivacy } from './legalTexts';
import styles from './Legal.module.css';

/* Политика платформы для мерчантов (/privacy) — своя простая раскладка, как
   LegalPage в anyforms: белая страница, тёмная шапка с текстовой словомаркой.
   Оператор — PLATFORM_OPERATOR из окружения; незаданные реквизиты в тексте
   выводятся как «не указан». Фон body и заголовок вкладки ставит App. */
const PlatformPrivacy = () => {
  const doc = useMemo(() => buildPlatformPrivacy(), []);

  return (
    <div className={styles.platformPage} id="top">
      <SiteHeader
        logo={{
          to: '/',
          ariaLabel: `${BRAND_NAME} — на главную`,
          text: <span className={styles.brandWordmark}>{BRAND_NAME}</span>,
        }}
        navLinks={[]}
        navAriaLabel="Разделы"
        rightItems={[{ key: 'back', kind: 'link', to: '/', label: 'Главная', variant: 'pill' }]}
        mobileMenuId="legal-mobile-menu"
        mobileTopItems={[{ key: 'back-m', kind: 'link', to: '/', label: 'Главная', variant: 'primary' }]}
      />
      <main className={styles.main}>
        <div className={styles.inner}>
          <LegalDocument doc={doc} backTo="/" backLabel="← На главную" />
        </div>
      </main>
    </div>
  );
};

export default PlatformPrivacy;
