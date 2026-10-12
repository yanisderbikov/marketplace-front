import { useCallback, useMemo, useSyncExternalStore } from 'react';

// Избранное покупателя — отдельно на каждый магазин (`mp_likes:{slug}`), только в
// этом браузере. Внешний стор на useSyncExternalStore: все карточки и шапка витрины
// видят одно и то же состояние без контекста.
const STORAGE_PREFIX = 'mp_likes:';
const listeners = new Set();
// Сырые JSON-строки по магазинам: сравнение строк даёт стабильный снапшот для React.
const cache = new Map();

const storageKey = (slug) => `${STORAGE_PREFIX}${slug}`;

const readRaw = (slug) => {
  if (!slug) return '[]';
  if (!cache.has(slug)) {
    let raw = '[]';
    try {
      const stored = localStorage.getItem(storageKey(slug)) ?? '[]';
      raw = Array.isArray(JSON.parse(stored)) ? stored : '[]';
    } catch {
      raw = '[]';
    }
    cache.set(slug, raw);
  }
  return cache.get(slug);
};

const writeRaw = (slug, ids) => {
  const raw = JSON.stringify(ids);
  cache.set(slug, raw);
  try {
    localStorage.setItem(storageKey(slug), raw);
  } catch {
    /* localStorage недоступен — лайки живут в памяти до перезагрузки */
  }
  listeners.forEach((listener) => listener());
};

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * { ids, isLiked(id), toggle(id) → новое состояние (true — лайк поставлен), count,
 *   prune(existingIds) }.
 */
export function useLikes(slug) {
  const raw = useSyncExternalStore(subscribe, () => readRaw(slug));
  const ids = useMemo(() => JSON.parse(raw), [raw]);

  const isLiked = useCallback(
    (productId) => productId != null && ids.includes(String(productId)),
    [ids]
  );

  const toggle = useCallback(
    (productId) => {
      if (!slug || productId == null) return null;
      const id = String(productId);
      const current = JSON.parse(readRaw(slug));
      const liked = !current.includes(id);
      writeRaw(slug, liked ? [...current, id] : current.filter((x) => x !== id));
      return liked;
    },
    [slug]
  );

  // Лайкнутый товар продавец мог выключить или удалить, а его id так и лежит в
  // localStorage — счётчик в шапке показывал бы больше, чем найдётся в «Избранном».
  // Витрина после загрузки ПОЛНОГО каталога зовёт prune(id всех товаров), и лишние
  // id выкидываются. Частичный список (страница, фильтр) сюда передавать нельзя —
  // иначе пропадут лайки товаров, которых в нём просто не было.
  const prune = useCallback(
    (existingIds) => {
      if (!slug || existingIds == null) return;
      const existing = new Set(Array.from(existingIds, String));
      const current = JSON.parse(readRaw(slug));
      const kept = current.filter((id) => existing.has(id));
      if (kept.length !== current.length) writeRaw(slug, kept);
    },
    [slug]
  );

  return { ids, isLiked, toggle, prune, count: ids.length };
}
