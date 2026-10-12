// Ошибка валидации DTO приходит с именем поля бэка впереди: «size: Файл больше 10 МБ»,
// «email: Некорректная почта» (несколько — через «; »). Мерчанту и покупателю имя
// Java-поля ничего не говорит — убираем его, текст бэка оставляем как есть.
// Только camelCase с маленькой буквы (и путь вида items[0].quantity), чтобы не
// задеть осмысленные префиксы вроде «TerminalKey: …».
const FIELD_PREFIX_RE = /(^|;\s*)[a-z][A-Za-z0-9]*(?:\[\d+\])?(?:\.[a-z][A-Za-z0-9]*(?:\[\d+\])?)*:\s+/g;

/** Текст ошибки бэка ({"error": "…"}) без имён полей; нет текста — null. */
export const backendErrorText = (err) => {
  const message = err?.response?.data?.error;
  if (typeof message !== 'string' || !message.trim()) return null;
  return message.trim().replace(FIELD_PREFIX_RE, '$1');
};

// Текст ошибки для тоста/плашки: бэк отдаёт {"error": "<текст по-русски>"} — в том
// числе на 429 («Слишком много … Попробуйте позже»), его и показываем; сетевые сбои
// приходят без response — тогда сообщение axios или запасной текст.
export const errorMessage = (err, fallback) =>
  backendErrorText(err) || err?.message || fallback;
