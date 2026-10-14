import api from '../apiClient';
import { uploadAllToS3 } from './uploads';

// Магазин текущего мерчанта. Все ручки (кроме проверки адреса) возвращают
// MerchantShopDTO целиком — его можно сразу класть в setShop из контекста AdminLayout.

/** Онбординг: { name, slug, brandColor } → MerchantShopDTO. */
export const createShop = ({ name, slug, brandColor }) =>
  api.post('/api/merchant/shop', { name, slug, brandColor }).then((res) => res.data);

/** Живая проверка адреса витрины: { available, reason }. */
export const checkSlug = (slug) =>
  api.get('/api/public/shops/slug-available', { params: { slug } }).then((res) => res.data);

export const getMyShop = () => api.get('/api/merchant/shop').then((res) => res.data);

/** { name, brandColor, tagline, description, about } → MerchantShopDTO. */
export const saveDesign = (payload) =>
  api.put('/api/merchant/shop/design', payload).then((res) => res.data);

/**
 * Логотип (kind = 'logo') или фото витрины (kind = 'hero'). Файл идёт из браузера
 * прямо в S3 (presign → PUT), бэк только подписывает URL и потом привязывает ключ
 * к магазину (старую картинку удаляет сам). onProgress(percent, { index, count, filename }).
 */
export const uploadShopImage = async (kind, file, onProgress) => {
  const [{ key }] = await uploadAllToS3(
    [file],
    (f) =>
      api
        .post(`/api/merchant/shop/images/${kind}/presign`, {
          filename: f.name,
          contentType: f.type,
          // Размер входит в подпись (Content-Length): больше 10 МБ бэк откажет 400 с текстом.
          size: f.size,
        })
        .then((res) => res.data),
    onProgress
  );
  return api.put(`/api/merchant/shop/images/${kind}`, { key }).then((res) => res.data);
};

export const deleteShopImage = (kind) =>
  api.delete(`/api/merchant/shop/images/${kind}`).then((res) => res.data);

/**
 * Контакты, продавец и ПВЗ отправки: { supportTelegram, contactEmail, contactPhone,
 * sellerName, sellerInn, sellerOgrn, sellerAddress, cdekFromPvzCode } → MerchantShopDTO.
 */
export const saveSettings = (payload) =>
  api.put('/api/merchant/shop/settings', payload).then((res) => res.data);

/**
 * Свой аккаунт СДЭК: { clientId, clientSecret } → MerchantShopDTO. Новые ключи бэк проверяет
 * в СДЭК (не приняты — 400, СДЭК не ответил — 502); clientSecret пустой — оставить сохранённый,
 * clientId пустой — отключить СДЭК. Секрет наружу не отдаётся никогда.
 */
export const saveCdek = (payload) =>
  api.put('/api/merchant/shop/cdek', payload).then((res) => res.data);

/**
 * Терминал Т-Банка: { terminalKey, password, receiptEnabled, taxation, tax } → MerchantShopDTO.
 * password пустой — бэк оставляет сохранённый (наружу пароль не отдаётся никогда).
 */
export const savePayment = (payload) =>
  api.put('/api/merchant/shop/payment', payload).then((res) => res.data);

/**
 * Магазин ЮKassa: { shopId, secretKey, receiptEnabled, taxation, tax } → MerchantShopDTO. Новые ключи бэк
 * проверяет в ЮKassa (не приняты — 400, не ответила — 502); secretKey пустой — оставить сохранённый,
 * shopId пустой — отключить ЮKassa. Ключ наружу не отдаётся никогда.
 */
export const saveYookassa = (payload) =>
  api.put('/api/merchant/shop/payment/yookassa', payload).then((res) => res.data);

/** Через кого витрина принимает оплату: provider — 'TINKOFF' | 'YOOKASSA' (должен быть подключён). */
export const selectPaymentProvider = (provider) =>
  api.put('/api/merchant/shop/payment/provider', { provider }).then((res) => res.data);

/**
 * Свой домен витрины: { domain } → ShopDomainDTO { domain, status, message, records }. Бэк подключает
 * домен к гейтвею платформы и сразу отдаёт DNS-записи для регистратора. Пусто — отвязать.
 * 400 — некорректный домен, 409 — у другого магазина, 502 — не удалось подключить (домен не сохранён).
 */
export const saveDomain = (domain) =>
  api.put('/api/merchant/shop/domain', { domain }).then((res) => res.data);

/** Отвязать свой домен: витрина остаётся на адресе платформы. Ответ — ShopDomainDTO со status NONE. */
export const unbindDomain = () => api.delete('/api/merchant/shop/domain').then((res) => res.data);

/** DNS-записи и статус своего домена: ShopDomainDTO; status NONE — домен не привязан. */
export const getDomain = () => api.get('/api/merchant/shop/domain').then((res) => res.data);
