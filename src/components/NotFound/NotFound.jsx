import React, { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BRAND_NAME, PLATFORM_OPERATOR } from '../../config/brand';
import SiteHeader from '../shared/SiteHeader/SiteHeader';
import styles from './NotFound.module.css';

const NotFound = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { name, inn, ogrn, email } = PLATFORM_OPERATOR;
  const hasRequisites = Boolean(name || inn || ogrn);

  // Чёрная страница: красим и body, иначе при оверскролле видно светлый фон.
  // App выставляет фон по умолчанию в layout-эффекте, этот эффект идёт после него;
  // зависимость от пути — на случай перехода между двумя несуществующими адресами.
  useEffect(() => {
    document.body.style.background = '#000';
    document.title = `Страница не найдена — ${BRAND_NAME}`;
  }, [location.pathname]);

  return (
    <div className={styles.page}>
      <SiteHeader
        logo={{
          href: '/',
          ariaLabel: `${BRAND_NAME} — на главную`,
          text: <span className={styles.brandWordmark}>{BRAND_NAME}</span>,
          onClick: (event) => {
            event.preventDefault();
            navigate('/');
          },
        }}
        rightItems={[
          {
            key: 'home',
            kind: 'link',
            label: 'На главную',
            variant: 'pill',
            to: '/',
          },
        ]}
        mobileMenuId="notfound-mobile-menu"
        mobileTopItems={[
          {
            key: 'home-mobile',
            kind: 'link',
            label: 'На главную',
            variant: 'primary',
            to: '/',
          },
        ]}
      />

      <section className={styles.hero} aria-label="Страница не найдена">
        <div className={styles.heroCard}>
          <p className={styles.code}>404</p>
          <h1 className={styles.title}>Страница не найдена</h1>
          <p className={styles.text}>
            Возможно, ссылка устарела или была введена с ошибкой.
            <br />
            Если вы искали магазин — проверьте адрес витрины.
          </p>
          <div className={styles.actions}>
            <Link className={styles.cta} to="/">
              На главную
              <span className={styles.ctaArrow} aria-hidden>
                →
              </span>
            </Link>
            {email && (
              <a className={`${styles.cta} ${styles.secondaryCta}`} href={`mailto:${email}`}>
                Написать нам
                <span className={styles.ctaArrow} aria-hidden>
                  →
                </span>
              </a>
            )}
          </div>
        </div>
      </section>

      <footer className={styles.siteFooter}>
        {(hasRequisites || email) && (
          <div className={styles.footerGrid}>
            {hasRequisites && (
              <div className={styles.footerBlock}>
                <h2 className={styles.footerHeading}>О сервисе</h2>
                <p className={styles.footerText}>
                  {name && (
                    <>
                      {name}
                      <br />
                    </>
                  )}
                  {inn && (
                    <>
                      ИНН {inn}
                      <br />
                    </>
                  )}
                  {ogrn && <>{ogrn.length === 15 ? 'ОГРНИП' : 'ОГРН'} {ogrn}</>}
                </p>
              </div>
            )}
            {email && (
              <div className={styles.footerBlock}>
                <h2 className={styles.footerHeading}>Контакты</h2>
                <p className={styles.footerText}>
                  <a className={styles.footerLink} href={`mailto:${email}`}>
                    {email}
                  </a>
                </p>
              </div>
            )}
          </div>
        )}
        <p className={styles.footerLegal}>
          <Link to="/privacy" className={styles.footerLegalLink}>
            Политика конфиденциальности
          </Link>
        </p>
        <p className={styles.footerCopyright}>
          © {BRAND_NAME}, {new Date().getFullYear()}. Все права защищены
        </p>
      </footer>
    </div>
  );
};

export default NotFound;
