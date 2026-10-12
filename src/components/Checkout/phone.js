// Утилиты валидации/форматирования для чекаута (перенос anyforms src/utils/phone.js).

// Простой, но строгий формат email.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Диапазон количества цифр в номере: E.164 допускает до 15. Нижняя граница —
// 10, а не 8, как в anyforms: бэк (PhoneUtil.toE164) короче 10 цифр номер не
// принимает, и покупатель узнал бы об этом только после нажатия «Перейти к оплате».
export const MIN_PHONE_DIGITS = 10;
export const MAX_PHONE_DIGITS = 15;

// Ввод не подгоняем под конкретную страну: оставляем цифры, ведущий «+»
// и привычные разделители (пробелы, скобки, дефисы). Буквы и прочий мусор
// отбрасываем прямо при вводе.
export const sanitizePhoneInput = (value) => {
  const raw = String(value ?? '');
  const hasPlus = /^\s*\+/.test(raw);
  let out = '';
  let digitCount = 0;
  for (const ch of raw.replace(/[^\d\s()-]/g, '').trimStart()) {
    if (/\d/.test(ch)) {
      if (digitCount === MAX_PHONE_DIGITS) break;
      digitCount += 1;
    }
    out += ch;
  }
  out = out.replace(/\s{2,}/g, ' ');
  return hasPlus ? `+${out}` : out;
};

export const isPhoneValid = (value) => {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  // «+7…» — заведомо российский номер: в нём ровно 11 цифр.
  if (raw.startsWith('+7')) return digits.length === 11;
  return digits.length >= MIN_PHONE_DIGITS && digits.length <= MAX_PHONE_DIGITS;
};

// Номер для отправки на бэкенд: привычные российские записи приводим к +7…,
// остальные отправляем как ввёл пользователь (только цифры и ведущий «+»).
export const toSubmitPhone = (value) => {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`;
  // 10 цифр с девятки — мобильный без кода страны.
  if (digits.length === 10 && digits.startsWith('9')) return `+7${digits}`;
  return digits;
};
