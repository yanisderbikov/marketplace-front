import React from 'react';

// Контакты продавца для строк «напишите продавцу» на чекауте и странице оплаты.
// В anyforms здесь был один бот поддержки (useShopSupport); у нас за заказ
// отвечает сам мерчант, поэтому показываем то, что он указал в настройках:
// Telegram, почту и телефон — каждый только если заполнен.

const telegramHref = (handle) => `https://t.me/${encodeURIComponent(handle)}`;
const phoneHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;

const contactLinks = (shop) => {
  const links = [];
  const telegram = shop?.supportTelegram?.trim().replace(/^@/, '');
  if (telegram) {
    links.push({ key: 'tg', href: telegramHref(telegram), label: `@${telegram}`, external: true });
  }
  const email = shop?.contactEmail?.trim();
  if (email) links.push({ key: 'email', href: `mailto:${email}`, label: email });
  const phone = shop?.contactPhone?.trim();
  // Неразрывные пробелы: номер не должен переноситься посередине.
  if (phone) links.push({ key: 'phone', href: phoneHref(phone), label: phone.replace(/ /g, '\u00a0') });
  return links;
};

export const hasShopSupport = (shop) => contactLinks(shop).length > 0;

/** Контакты продавца через запятую; нет ни одного — ничего не рендерит. */
const ShopSupport = ({ shop, linkClassName }) => {
  const links = contactLinks(shop);
  if (!links.length) return null;
  return links.map((link, idx) => (
    <React.Fragment key={link.key}>
      {idx > 0 && (idx === links.length - 1 ? ' или ' : ', ')}
      <a
        className={linkClassName}
        href={link.href}
        {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {link.label}
      </a>
    </React.Fragment>
  ));
};

export default ShopSupport;
