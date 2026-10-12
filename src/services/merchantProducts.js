import api from '../apiClient';
import { uploadToS3 } from './uploads';

// Каталог своего магазина. Ответы — MerchantProductDTO (цены в копейках).

const productPath = (id) => `/api/merchant/products/${encodeURIComponent(id)}`;

/** Все товары, включая выключенные, в порядке каталога. */
export const listProducts = () => api.get('/api/merchant/products').then((res) => res.data);

/** Чужой или несуществующий товар — 404. */
export const getProduct = (id) => api.get(productPath(id)).then((res) => res.data);

/** ProductSaveRequestDTO → MerchantProductDTO (товар встаёт в конец каталога). */
export const createProduct = (payload) =>
  api.post('/api/merchant/products', payload).then((res) => res.data);

/** variants в payload — полная замена набора: вариант с id обновится, без id — создастся. */
export const updateProduct = (id, payload) =>
  api.put(productPath(id), payload).then((res) => res.data);

/** 204; фото удаляются из S3, в старых заказах остаётся снапшот названия. */
export const deleteProduct = (id) => api.delete(productPath(id)).then((res) => res.data);

/** Новый порядок каталога: набор id должен совпадать с товарами магазина. */
export const reorderProducts = (productIds) =>
  api.put('/api/merchant/products/order', { productIds }).then((res) => res.data);

/**
 * Подпись PUT-загрузки одного фото: { uploadUrl, key }. size входит в подпись
 * (Content-Length): больше 10 МБ бэк откажет сразу 400 с текстом — его и покажем.
 */
export const presignProductPhoto = (id, file) =>
  api
    .post(`${productPath(id)}/photos/presign`, {
      filename: file.name,
      contentType: file.type,
      size: file.size,
    })
    .then((res) => res.data);

/** Привязать загруженный в S3 ключ к товару (фото встаёт в конец) → MerchantProductDTO. */
export const registerProductPhoto = (id, key) =>
  api.post(`${productPath(id)}/photos`, { key }).then((res) => res.data);

/**
 * Загрузить несколько фото: каждое presign → PUT в S3 → привязка к товару.
 * Привязываем сразу после загрузки файла, а не пачкой в конце: если сломается
 * третий файл, первые два уже в карточке и не висят в бакете сиротами.
 * При ошибке промис отклоняется — карточку стоит перечитать (часть фото могла сохраниться).
 * Прогресс общий по байтам всех файлов: onProgress(percent, { index, count, filename }).
 * Возвращает MerchantProductDTO после последнего фото.
 */
export const uploadProductPhotos = async (id, files, onProgress) => {
  const list = Array.from(files || []);
  const totalBytes = list.reduce((sum, f) => sum + (f.size || 0), 0);
  let doneBytes = 0;
  let product = null;
  for (let i = 0; i < list.length; i += 1) {
    const file = list[i];
    const meta = { index: i, count: list.length, filename: file.name };
    const report = (filePercent) => {
      const loaded = doneBytes + ((file.size || 0) * filePercent) / 100;
      onProgress?.(totalBytes ? (loaded / totalBytes) * 100 : filePercent, meta);
    };
    report(0);
    const { uploadUrl, key } = await presignProductPhoto(id, file);
    await uploadToS3(uploadUrl, file, report);
    product = await registerProductPhoto(id, key);
    doneBytes += file.size || 0;
  }
  if (list.length) {
    onProgress?.(100, { index: list.length - 1, count: list.length, filename: list[list.length - 1].name });
  }
  return product;
};

/** Удалить фото (и объект в S3) → MerchantProductDTO. */
export const deleteProductPhoto = (id, photoId) =>
  api.delete(`${productPath(id)}/photos/${encodeURIComponent(photoId)}`).then((res) => res.data);

/** Порядок фото: первое — главное на витрине → MerchantProductDTO. */
export const reorderProductPhotos = (id, photoIds) =>
  api.put(`${productPath(id)}/photos/order`, { photoIds }).then((res) => res.data);
