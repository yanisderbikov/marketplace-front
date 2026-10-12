import { useCallback, useEffect, useRef, useState } from 'react';
import { getShopProducts } from '../../services/storefront';

// Корзина лежит в localStorage и могла устареть: товар выключили или удалили,
// у него пропал вариант, сменилась цена, протухла presigned-ссылка на фото
// (живёт 6 часов). На корзине и чекауте сверяем её со свежим каталогом витрины
// (useCart().syncWithProducts) и говорим покупателю, какие позиции пропали —
// молча исчезнувший товар выглядит как баг.
//
// Правило «позицию больше не оформить» — то же, что в CartContext.syncWithProducts.
const isGone = (item, byId) => {
  const product = byId.get(item.productId);
  if (!product) return true;
  const variants = product.variants ?? [];
  return item.variantId ? !variants.some((v) => v.id === item.variantId) : variants.length > 0;
};

const lineName = (item) => (item.variantLabel ? `${item.name} ${item.variantLabel}` : item.name);

/**
 * Один раз на открытие страницы (при непустой корзине) подтягивает каталог
 * витрины и сверяет с ним корзину. Ошибка загрузки каталога не мешает
 * оформлению: цены всё равно считает бэк.
 * → { removedNames, recheck }:
 *   removedNames — названия убранных позиций;
 *   recheck() — сверить ещё раз сейчас (чекаут зовёт его, когда бэк отклонил
 *     заказ 400: товар выключили или удалили уже после открытия страницы, и без
 *     пересверки каждая попытка уходила бы с той же устаревшей корзиной).
 *     Промис с названиями убранных этой сверкой позиций ([] — ничего не убрано
 *     или каталог не загрузился).
 */
export const useCartRefresh = (slug, items, syncWithProducts) => {
  const [removedNames, setRemovedNames] = useState([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const hasItems = items.length > 0;
  // Колбэки читаем через ref: recheck должен оставаться одним и тем же между рендерами.
  const syncRef = useRef(syncWithProducts);
  syncRef.current = syncWithProducts;

  const sync = useCallback(async () => {
    const products = await getShopProducts(slug);
    if (!Array.isArray(products)) return [];
    const byId = new Map(products.map((p) => [String(p.id), p]));
    const gone = itemsRef.current.filter((item) => isGone(item, byId)).map(lineName);
    syncRef.current(products);
    return gone;
  }, [slug]);

  useEffect(() => {
    if (!slug || !hasItems) return undefined;
    let cancelled = false;
    sync()
      .then((gone) => {
        if (!cancelled && gone.length) setRemovedNames(gone);
      })
      .catch(() => {
        /* каталог не загрузился — оставляем корзину как есть */
      });
    return () => {
      cancelled = true;
    };
    // Сверяем один раз на заход: дальнейшие изменения корзины делает сам покупатель.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, hasItems]);

  const recheck = useCallback(async () => {
    if (!slug) return [];
    try {
      const gone = await sync();
      // Новые убранные позиции добавляем к уже показанным, без повторов.
      if (gone.length) setRemovedNames((prev) => [...new Set([...prev, ...gone])]);
      return gone;
    } catch {
      return [];
    }
  }, [slug, sync]);

  return { removedNames, recheck };
};
