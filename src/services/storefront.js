import api from '../apiClient';

// Публичная часть: витрины магазинов, ПВЗ СДЭК, оформление заказа и его статус.
// Все ручки под /api/public — токен не нужен (если он есть, apiClient его всё равно приложит).

const shopPath = (slug) => `/api/public/shops/${encodeURIComponent(slug)}`;

/** Чья витрина на своём домене: { slug, domain }; домен не привязан или магазин выключен — 404. */
export const resolveDomain = (domain) =>
  api.get('/api/public/domains/resolve', { params: { domain } }).then((res) => res.data);

/** Витрины для главной: PublicShopCardDTO[] (активные магазины с ≥1 активным товаром). */
export const getPublicShops = () => api.get('/api/public/shops').then((res) => res.data);

/** PublicShopDTO; нет магазина или он выключен — 404. */
export const getPublicShop = (slug) => api.get(shopPath(slug)).then((res) => res.data);

/** PublicProductDTO[] — активные товары витрины в порядке каталога. */
export const getShopProducts = (slug) =>
  api.get(`${shopPath(slug)}/products`).then((res) => res.data);

/** PublicProductDTO; неактивный или чужой товар — 404. */
export const getShopProduct = (slug, id) =>
  api.get(`${shopPath(slug)}/products/${encodeURIComponent(id)}`).then((res) => res.data);

/** Поиск ПВЗ СДЭК свободным текстом (улица и/или город): CdekPvzDTO[]. */
export const searchPvz = (query) =>
  api.get('/api/public/cdek/pvz', { params: { query } }).then((res) => res.data);

/**
 * Расчёт доставки от ПВЗ отправки магазина: { cost (рубли), periodMin, periodMax, tariffCode }.
 * Информативно — доставка оплачивается при получении и в платёж не входит.
 * items: [{ productId, variantId, quantity }].
 */
export const getDeliveryCost = (slug, { pvzCode, items }) =>
  api.post(`${shopPath(slug)}/delivery-cost`, { pvzCode, items }).then((res) => res.data);

/**
 * Оформить заказ: { items, fullName, phone, email, pvzCode, pvzCity, pvzAddress, comment,
 * marketingConsent, acceptTerms, returnUrl } → { orderPublicId, paymentUrl }.
 * Дальше — редирект покупателя на paymentUrl (платёжная форма Т-Банка магазина).
 */
export const checkout = (slug, payload) =>
  api.post(`${shopPath(slug)}/checkout`, payload).then((res) => res.data);

/** Статус заказа для страницы «Спасибо»: OrderStatusDTO. */
export const getOrderStatus = (publicId) =>
  api.get(`/api/public/orders/${encodeURIComponent(publicId)}/status`).then((res) => res.data);
