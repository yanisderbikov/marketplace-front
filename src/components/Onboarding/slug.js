// Адрес витрины (slug): правила те же, что у бэка (SlugPolicy) — 3–32 символа,
// строчная латиница, цифры и дефис, с буквы/цифры начинается и заканчивается,
// без двойного дефиса. Локальная проверка нужна только для мгновенной подсказки;
// окончательное слово (в т.ч. зарезервированные адреса и «занято») — за бэком.

export const SLUG_MIN = 3;
export const SLUG_MAX = 32;

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/;

// Транслитерация для подсказки адреса из названия: «Свечи Луны» → svechi-luny.
// Упрощённая «паспортная» схема — адрес должен читаться, а не быть обратимым.
const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

const trimHyphens = (value) => value.replace(/^-+/, '').replace(/-+$/, '');

/** Подсказка адреса из названия магазина. Может вернуть пустую или короткую строку. */
export const suggestSlug = (name) => {
  const latin = Array.from(String(name ?? '').toLowerCase())
    .map((ch) => (Object.prototype.hasOwnProperty.call(TRANSLIT, ch) ? TRANSLIT[ch] : ch))
    .join('');
  const dashed = latin.replace(/[^a-z0-9]+/g, '-').replace(/-{2,}/g, '-');
  return trimHyphens(trimHyphens(dashed).slice(0, SLUG_MAX));
};

/**
 * Нормализация ручного ввода: строчные, пробел/подчёркивание → дефис, прочее
 * выкидываем. Дефис на конце оставляем — человек мог ещё не допечатать.
 */
export const sanitizeSlugInput = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .slice(0, SLUG_MAX);

/** Текст ошибки формата или null, если формат подходит (свободен ли — решит бэк). */
export const slugFormatError = (slug) => {
  if (!slug) return 'Придумайте адрес витрины';
  if (slug.length < SLUG_MIN) return `Минимум ${SLUG_MIN} символа`;
  if (slug.length > SLUG_MAX) return `Максимум ${SLUG_MAX} символа`;
  if (slug.startsWith('-') || slug.endsWith('-')) return 'Адрес не может начинаться или заканчиваться дефисом';
  if (slug.includes('--')) return 'Два дефиса подряд нельзя';
  if (!SLUG_RE.test(slug)) return 'Только строчная латиница, цифры и дефис';
  return null;
};
