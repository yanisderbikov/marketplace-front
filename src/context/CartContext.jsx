import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

// Корзина отдельно на каждый магазин: заказ всегда уходит в один магазин
// (его терминал, его ПВЗ отправки), поэтому покупатель может параллельно
// собирать корзины в разных витринах, и они не мешают друг другу.
// Хранение — localStorage `mp_cart:{slug}`, загружается лениво при первом useCart(slug).
const STORAGE_PREFIX = 'mp_cart:';
// Бэк принимает quantity 1..99 в позиции заказа.
const MAX_QUANTITY = 99;
const EMPTY = [];

const CartContext = createContext(null);

const storageKey = (slug) => `${STORAGE_PREFIX}${slug}`;

const readStorage = (slug) => {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
};

const writeStorage = (slug, items) => {
  try {
    if (items.length) {
      localStorage.setItem(storageKey(slug), JSON.stringify(items));
    } else {
      localStorage.removeItem(storageKey(slug));
    }
  } catch {
    /* localStorage недоступен — корзина живёт в памяти до перезагрузки */
  }
};

const clampQuantity = (value) => Math.min(MAX_QUANTITY, Math.max(0, Math.floor(Number(value) || 0)));

// Ключ позиции: товар + вариант (один товар в разных вариантах — разные строки корзины).
const sameLine = (item, productId, variantId = null) =>
  item.productId === String(productId) && (item.variantId ?? null) === (variantId ?? null);

/**
 * Позиция корзины из PublicProductDTO. Цена — снапшот для показа; к оплате бэк
 * всё равно считает по своим ценам. photo — presigned-ссылка S3, живёт несколько
 * часов: корзина обновляет её через syncWithProducts по свежим данным витрины.
 */
const toCartItem = (product, quantity, variant = null) => ({
  productId: String(product.id),
  variantId: variant?.id ?? null,
  variantLabel: variant?.label ?? null,
  name: product.name ?? '',
  priceKopecks: Number(variant ? variant.priceKopecks : product.priceKopecks) || 0,
  photo: product.photos?.[0] ?? null,
  preorder: Boolean(product.preorder),
  quantity,
});

export const CartProvider = ({ children }) => {
  // { [slug]: items[] } — только магазины, в которые заходили в этой вкладке.
  const [carts, setCarts] = useState({});
  // Последнее записанное в localStorage — чтобы писать только изменившиеся корзины.
  const persistedRef = useRef({});

  useEffect(() => {
    Object.entries(carts).forEach(([slug, items]) => {
      if (persistedRef.current[slug] === items) return;
      persistedRef.current[slug] = items;
      writeStorage(slug, items);
    });
  }, [carts]);

  // Корзина, изменённая в другой вкладке, подтягивается и сюда — в том числе
  // корзина магазина, который в этой вкладке ещё не меняли: её useCart читает
  // прямо из localStorage, но пересчитывается только при смене carts, и без
  // записи в стейт счётчик в шапке и страница корзины показывали бы старое.
  useEffect(() => {
    const onStorage = (event) => {
      if (!event.key?.startsWith(STORAGE_PREFIX)) return;
      const slug = event.key.slice(STORAGE_PREFIX.length);
      if (!slug) return;
      const items = readStorage(slug);
      // Пришло из localStorage — обратно не пишем (см. эффект сохранения выше).
      persistedRef.current[slug] = items;
      setCarts((prev) => ({ ...prev, [slug]: items }));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((slug, updater) => {
    setCarts((prev) => {
      const current = prev[slug] ?? readStorage(slug);
      const next = updater(current);
      return next === current && slug in prev ? prev : { ...prev, [slug]: next };
    });
  }, []);

  const value = useMemo(() => ({ carts, update }), [carts, update]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

/**
 * Корзина магазина slug:
 * { items, count, totalKopecks, addItem(product, quantity, variant|null),
 *   setQuantity(productId, variantId, quantity), removeItem(productId, variantId), clear(),
 *   syncWithProducts(products) }.
 * Элемент: { productId, variantId, variantLabel, name, priceKopecks, photo, preorder, quantity }.
 */
export const useCart = (slug) => {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart должен использоваться внутри <CartProvider>');
  }
  const { carts, update } = ctx;

  // До первого изменения корзина читается прямо из localStorage — без setState в рендере.
  const items = useMemo(() => {
    if (!slug) return EMPTY;
    return carts[slug] ?? readStorage(slug);
  }, [carts, slug]);

  const addItem = useCallback(
    (product, quantity = 1, variant = null) => {
      if (!slug || !product?.id) return;
      const add = clampQuantity(quantity);
      if (!add) return;
      update(slug, (prev) => {
        const existing = prev.find((i) => sameLine(i, product.id, variant?.id));
        if (!existing) return [...prev, toCartItem(product, add, variant)];
        // Повторное добавление заодно освежает название, цену и фото позиции.
        return prev.map((i) =>
          sameLine(i, product.id, variant?.id)
            ? toCartItem(product, clampQuantity(i.quantity + add), variant)
            : i
        );
      });
    },
    [slug, update]
  );

  const setQuantity = useCallback(
    (productId, variantId, quantity) => {
      if (!slug) return;
      const q = clampQuantity(quantity);
      update(slug, (prev) =>
        q === 0
          ? prev.filter((i) => !sameLine(i, productId, variantId))
          : prev.map((i) => (sameLine(i, productId, variantId) ? { ...i, quantity: q } : i))
      );
    },
    [slug, update]
  );

  const removeItem = useCallback(
    (productId, variantId) => {
      if (!slug) return;
      update(slug, (prev) => prev.filter((i) => !sameLine(i, productId, variantId)));
    },
    [slug, update]
  );

  const clear = useCallback(() => {
    if (!slug) return;
    update(slug, () => EMPTY);
  }, [slug, update]);

  /**
   * Свести корзину со свежим каталогом (PublicProductDTO[] витрины): обновить
   * название, цену, фото и предзаказ; убрать позиции, которых больше нет
   * (товар выключен/удалён, вариант пропал). Удобно звать на странице корзины.
   */
  const syncWithProducts = useCallback(
    (products) => {
      if (!slug || !Array.isArray(products)) return;
      const byId = new Map(products.map((p) => [String(p.id), p]));
      update(slug, (prev) => {
        let changed = false;
        const next = [];
        prev.forEach((item) => {
          const product = byId.get(item.productId);
          const variants = product?.variants ?? [];
          const variant = item.variantId ? variants.find((v) => v.id === item.variantId) : null;
          // Нет товара, пропал вариант или у товара появились варианты — позицию не оформить.
          if (!product || (item.variantId ? !variant : variants.length > 0)) {
            changed = true;
            return;
          }
          const fresh = toCartItem(product, item.quantity, variant);
          if (
            fresh.name !== item.name ||
            fresh.priceKopecks !== item.priceKopecks ||
            fresh.photo !== item.photo ||
            fresh.preorder !== item.preorder ||
            fresh.variantLabel !== item.variantLabel
          ) {
            changed = true;
          }
          next.push(fresh);
        });
        return changed ? next : prev;
      });
    },
    [slug, update]
  );

  const count = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);
  const totalKopecks = useMemo(
    () => items.reduce((sum, i) => sum + i.priceKopecks * i.quantity, 0),
    [items]
  );

  return useMemo(
    () => ({ items, count, totalKopecks, addItem, setQuantity, removeItem, clear, syncWithProducts }),
    [items, count, totalKopecks, addItem, setQuantity, removeItem, clear, syncWithProducts]
  );
};
