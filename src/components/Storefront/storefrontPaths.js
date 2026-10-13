// Адреса страниц витрины в одном месте: шапка (StorefrontLayout), каталог,
// карточка товара, корзина, чекаут и подвал строят ссылки одинаково. Slug магазина по SlugPolicy
// бэка — только [a-z0-9-], поэтому кодировать его не нужно.
//
// Витрина живёт по двум адресам: /shop/{slug}/… на домене платформы и /… на своём домене
// магазина. На своём домене index.jsx вызывает setCustomDomainShop(slug) до первого рендера.

let customDomainSlug = null;

export const setCustomDomainShop = (slug) => {
  customDomainSlug = slug;
};

/** Slug магазина, чья витрина открыта на своём домене; null — мы на домене платформы. */
export const customDomainShop = () => customDomainSlug;

// Фильтр «избранное» живёт в адресе (?liked=1), а не в состоянии каталога:
// сердечко в общей шапке видно на любой странице витрины и ведёт в каталог
// уже с фильтром — например, с карточки товара.
export const LIKED_PARAM = 'liked';

/** Путь страницы витрины: shopPath(slug) — каталог, shopPath(slug, 'cart') — корзина. */
export const shopPath = (slug, sub = '') => {
  if (slug === customDomainSlug) return `/${sub}`;
  return sub ? `/shop/${slug}/${sub}` : `/shop/${slug}`;
};

/** Каталог витрины. */
export const shopBase = (slug) => shopPath(slug);

export const productPath = (slug, productId) => shopPath(slug, `product/${productId}`);

export const likedPath = (slug) => `${shopBase(slug)}?${LIKED_PARAM}=1`;

// Ник поддержки приходит без «@» (supportTelegram в PublicShopDTO).
export const tgLink = (handle) => `https://t.me/${handle}`;
