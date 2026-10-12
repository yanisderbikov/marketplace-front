import api from '../apiClient';

// Супер-админ платформы: все магазины и рубильник активности.

/** AdminShopDTO[] — новые сверху. */
export const getAllShops = () => api.get('/api/admin/shops').then((res) => res.data);

/** Выключенный магазин: витрина 404, оформление заказа 409. → AdminShopDTO. */
export const setShopActive = (id, active) =>
  api.put(`/api/admin/shops/${encodeURIComponent(id)}/active`, { active }).then((res) => res.data);
