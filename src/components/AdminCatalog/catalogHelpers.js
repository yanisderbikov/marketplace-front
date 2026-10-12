// Общие помощники каталога: список (переключатель «на витрине», стрелки порядка)
// и карточка товара ходят в одни и те же ручки /api/merchant/products.

export const CATALOG_PATH = '/admin/catalog';

/** Ссылка на карточку товара в кабинете. */
export const catalogProductPath = (id) => `${CATALOG_PATH}/${encodeURIComponent(id)}`;

/** Ссылка на товар на витрине магазина (выключенный товар там отдаёт 404). */
export const storefrontProductPath = (slug, id) =>
  `/shop/${encodeURIComponent(slug)}/product/${encodeURIComponent(id)}`;

/**
 * MerchantProductDTO → ProductSaveRequestDTO. PUT товара — полная замена полей
 * и набора вариантов, поэтому даже ради одного флажка (active в списке) шлём
 * всё как есть: варианты с id обновятся, а не пересоздадутся. Передавайте
 * свежий DTO (getProduct), а не копию из давно загруженного списка — иначе PUT
 * откатит правки, сделанные после его загрузки.
 */
export const saveRequestFromProduct = (product, overrides = {}) => ({
  name: product.name,
  description: product.description ?? '',
  priceKopecks: product.priceKopecks,
  crossedPriceKopecks: product.crossedPriceKopecks ?? null,
  active: Boolean(product.active),
  preorder: Boolean(product.preorder),
  weightGrams: product.weightGrams ?? null,
  lengthCm: product.lengthCm ?? null,
  widthCm: product.widthCm ?? null,
  heightCm: product.heightCm ?? null,
  variants: (product.variants ?? []).map((v) => ({
    id: v.id ?? null,
    label: v.label,
    priceKopecks: v.priceKopecks,
  })),
  ...overrides,
});

/** Перенести элемент с индекса from на место to (массив не мутируется). */
export const moveItem = (list, from, to) => {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

/**
 * Очередь запросов «по одному». Стрелки порядка можно жать быстро: без очереди
 * два PUT …/order уходят параллельно, сервер может применить их не в том порядке,
 * и витрина разойдётся с тем, что мерчант видит на экране.
 * enqueue(task) → промис результата task(); упавшая задача очередь не ломает.
 */
export const createSerialQueue = () => {
  let tail = Promise.resolve();
  return (task) => {
    const run = tail.then(task, task);
    tail = run.catch(() => {});
    return run;
  };
};

export const pluralVariants = (n) => {
  const tail10 = n % 10;
  const tail100 = n % 100;
  if (tail10 === 1 && tail100 !== 11) return 'вариант';
  if (tail10 >= 2 && tail10 <= 4 && (tail100 < 12 || tail100 > 14)) return 'варианта';
  return 'вариантов';
};
