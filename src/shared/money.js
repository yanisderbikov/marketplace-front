// Деньги на бэке везде в копейках (целые числа) — так нет ошибок округления
// float. Фронт переводит в рубли только для показа и для полей ввода.

const RUB_FORMAT = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** 119000 → '1 190', 119050 → '1 190,5' (ru-RU, до двух знаков, без ₽). null → ''. */
export const formatRub = (kopecks) => {
  const value = Number(kopecks);
  if (kopecks == null || kopecks === '' || !Number.isFinite(value)) return '';
  return RUB_FORMAT.format(value / 100);
};

/** 119000 → '1 190 ₽'. */
export const formatPrice = (kopecks) => `${formatRub(kopecks)} ₽`;

/**
 * Ввод цены в рублях → копейки: '1 190,50' → 119050, '1190.5' → 119050, '990' → 99000.
 * Пусто, мусор, отрицательное или больше двух знаков после запятой → null
 * (поле подсвечивается как ошибочное, а не молча округляется).
 * Считаем строкой, без умножения float на 100: 1.13 * 100 = 112.99999999999999.
 */
export const rubToKopecks = (input) => {
  if (input == null) return null;
  if (typeof input === 'number') {
    return Number.isFinite(input) && input >= 0 ? Math.round(input * 100) : null;
  }
  const cleaned = String(input)
    .replace(/[\s  ]/g, '')
    .replace(/₽|руб\.?/gi, '')
    .replace(',', '.');
  const match = cleaned.match(/^(\d+)(?:\.(\d{0,2}))?$/);
  if (!match) return null;
  const rubles = Number(match[1]);
  const fraction = Number((match[2] || '').padEnd(2, '0'));
  const kopecks = rubles * 100 + fraction;
  return Number.isSafeInteger(kopecks) ? kopecks : null;
};

/** Копейки → значение поля ввода: 119050 → '1190.50', 119000 → '1190', null → ''. */
export const kopecksToRubInput = (kopecks) => {
  if (kopecks == null || kopecks === '') return '';
  const value = Math.round(Number(kopecks));
  if (!Number.isFinite(value)) return '';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const rubles = Math.floor(abs / 100);
  const rest = abs % 100;
  return rest ? `${sign}${rubles}.${String(rest).padStart(2, '0')}` : `${sign}${rubles}`;
};
