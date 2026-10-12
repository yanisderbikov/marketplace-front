import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './SiteHeader.module.css';

/**
 * Общая шапка сайта — плавающая «таблетка» с блюром.
 * Одна и та же на лендингах, витринах магазинов, в админке и служебных
 * страницах; страница меняет только логотип, цвет и содержимое слотов.
 *
 * logo — { src, compactSrc?, text?, alt, width, height, href | to, onClick, ariaLabel }:
 *   src — картинка; compactSrc — замена на узких экранах (например, знак
 *   вместо словомарки); text — текстовая словомарка, если картинки нет.
 * logoSize — 'default' (лендинги, ~30px) | 'large' (логотипы магазинов, 44px).
 * navLinks / rightItems / mobile* — как раньше: ссылки по центру, элементы
 *   справа, выпадающее меню на мобильном (бургер появляется только если есть
 *   что показать в меню).
 * left / right — произвольные узлы рядом с логотипом и в правой зоне; в
 *   отличие от rightItems видны на любой ширине (иконки корзины, аватар,
 *   бургер собственного меню страницы).
 * tint — { background, solid, border, color, logoFont }: перекраска таблетки
 *   под палитру страницы (магазина) через CSS-переменные; без tint — чёрная
 *   полупрозрачная, как в кабинете магазина. solid — непрозрачный фон для
 *   браузеров без backdrop-filter: без него там остаётся чёрный #0e0e0e, а
 *   цвет текста страница подбирала под свой tint (на светлом бренде — тёмный).
 */

const renderItemContent = (item, className, onItemClick) => {
  if (item.kind === 'button') {
    return (
      <button
        type={item.buttonType || 'button'}
        className={className}
        onClick={(event) => {
          item.onClick?.(event);
          onItemClick();
        }}
      >
        {item.label}
      </button>
    );
  }

  if (item.to) {
    return (
      <Link
        className={className}
        to={item.to}
        onClick={(event) => {
          item.onClick?.(event);
          onItemClick();
        }}
      >
        {item.label}
      </Link>
    );
  }

  return (
    <a
      className={className}
      href={item.href}
      target={item.target}
      rel={item.rel}
      onClick={(event) => {
        item.onClick?.(event);
        onItemClick();
      }}
    >
      {item.label}
    </a>
  );
};

const getRightItemClassName = (variant) => {
  if (variant === 'phone') return styles.headerPhone;
  if (variant === 'pill') return `${styles.navLink} ${styles.navLinkPill}`;
  return styles.navLink;
};

const getMobileItemClassName = (variant) => {
  if (variant === 'primary') return `${styles.mobileMenuLink} ${styles.mobileMenuPrimary}`;
  return styles.mobileMenuLink;
};

const tintToStyle = (tint) => {
  if (!tint) return undefined;
  const style = {};
  if (tint.background) style['--sh-bg'] = tint.background;
  if (tint.solid) style['--sh-bg-solid'] = tint.solid;
  if (tint.border) style['--sh-border'] = tint.border;
  if (tint.color) style['--sh-fg'] = tint.color;
  if (tint.logoFont) style['--sh-logo-font'] = tint.logoFont;
  return style;
};

const LogoContent = ({ logo }) => {
  if (!logo.src) {
    return <span className={styles.logoText}>{logo.text}</span>;
  }
  return (
    <>
      <img
        className={`${styles.logo} ${logo.compactSrc ? styles.logoWide : ''}`}
        src={logo.src}
        alt={logo.alt || ''}
        width={logo.width}
        height={logo.height}
        decoding="async"
      />
      {logo.compactSrc && (
        <img
          className={`${styles.logo} ${styles.logoCompact}`}
          src={logo.compactSrc}
          alt={logo.alt || ''}
          width={logo.compactWidth}
          height={logo.compactHeight}
          decoding="async"
        />
      )}
    </>
  );
};

const Logo = ({ logo }) => {
  const content = <LogoContent logo={logo} />;
  // Текстовой словомарке разрешаем сжиматься до ширины левой зоны (см. .logoLinkText):
  // так длинное название магазина обрезается многоточием по месту, а не по vw.
  const className = logo.src ? styles.logoLink : `${styles.logoLink} ${styles.logoLinkText}`;
  if (logo.to) {
    return (
      <Link className={className} to={logo.to} onClick={logo.onClick} aria-label={logo.ariaLabel}>
        {content}
      </Link>
    );
  }
  return (
    <a className={className} href={logo.href} onClick={logo.onClick} aria-label={logo.ariaLabel}>
      {content}
    </a>
  );
};

const SiteHeader = ({
  logo,
  logoSize = 'default',
  // 'center' — на телефоне логотип по центру таблетки, слот left у левого
  // края, right у правого (админка: бургер слева, логотип по центру).
  logoAlign = 'start',
  navLinks = [],
  navAriaLabel,
  rightItems = [],
  mobileMenuId,
  mobileLinks,
  mobileTopItems = [],
  left = null,
  right = null,
  tint,
  className = '',
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileNavLinks = useMemo(() => mobileLinks || navLinks, [mobileLinks, navLinks]);
  const hasMobileMenu = mobileNavLinks.length > 0 || mobileTopItems.length > 0;

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return undefined;
    }
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMobileMenuOpen]);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  const headerClass = [
    styles.siteHeader,
    logoSize === 'large' ? styles.logoLarge : '',
    logoAlign === 'center' ? styles.logoCentered : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <>
      <div className={styles.safeArea} aria-hidden="true" />
      <header className={headerClass} style={tintToStyle(tint)}>
        <div className={styles.siteHeaderInner}>
          <div className={styles.leftZone}>
            <Logo logo={logo} />
            {left}
          </div>

          {navLinks.length > 0 && (
            <nav className={styles.headerNav} aria-label={navAriaLabel}>
              {navLinks.map((item) => (
                <React.Fragment key={item.key || item.label}>
                  {renderItemContent(item, styles.navLink, closeMobileMenu)}
                </React.Fragment>
              ))}
            </nav>
          )}

          <div className={styles.rightZone}>
            {rightItems.length > 0 && (
              <div className={styles.headerContact}>
                {rightItems.map((item) => (
                  <React.Fragment key={item.key || item.label}>
                    {renderItemContent(item, getRightItemClassName(item.variant), closeMobileMenu)}
                  </React.Fragment>
                ))}
              </div>
            )}
            {right}
            {hasMobileMenu && (
              <button
                type="button"
                className={styles.burgerButton}
                aria-label={isMobileMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
                aria-expanded={isMobileMenuOpen}
                aria-controls={mobileMenuId}
                onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              >
                <span className={styles.burgerLine} />
                <span className={styles.burgerLine} />
                <span className={styles.burgerLine} />
              </button>
            )}
          </div>
        </div>
      </header>

      {hasMobileMenu && (
        <div
          id={mobileMenuId}
          className={`${styles.mobileMenu} ${isMobileMenuOpen ? styles.mobileMenuOpen : ''}`}
          style={tintToStyle(tint)}
        >
          <div className={styles.mobileMenuInner}>
            {mobileTopItems.map((item) => (
              <React.Fragment key={item.key || item.label}>
                {renderItemContent(item, getMobileItemClassName(item.variant), closeMobileMenu)}
              </React.Fragment>
            ))}
            {mobileNavLinks.map((item) => (
              <React.Fragment key={item.key || item.label}>
                {renderItemContent(item, styles.mobileMenuLink, closeMobileMenu)}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default SiteHeader;
