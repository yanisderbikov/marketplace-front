// Адреса страниц витрины в одном месте: шапка (StorefrontLayout), каталог,
// карточка товара и подвал строят ссылки одинаково. Slug магазина по SlugPolicy
// бэка — только [a-z0-9-], поэтому кодировать его не нужно.

// Фильтр «избранное» живёт в адресе (?liked=1), а не в состоянии каталога:
// сердечко в общей шапке видно на любой странице витрины и ведёт в каталог
// уже с фильтром — например, с карточки товара.
export const LIKED_PARAM = 'liked';

export const shopBase = (slug) => `/shop/${slug}`;

export const productPath = (slug, productId) => `${shopBase(slug)}/product/${productId}`;

export const likedPath = (slug) => `${shopBase(slug)}?${LIKED_PARAM}=1`;

// Ник поддержки приходит без «@» (supportTelegram в PublicShopDTO).
export const tgLink = (handle) => `https://t.me/${handle}`;
