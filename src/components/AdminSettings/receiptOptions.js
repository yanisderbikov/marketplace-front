// Значения — коды Т-Банка для чека (Receipt.Taxation / Items[].Tax; для ЮKassa бэк
// переводит их в tax_system_code / vat_code); те же
// перечни проверяет бэк (ShopServiceImpl.TAXATIONS / TAXES).
export const TAXATION_OPTIONS = [
  { value: 'osn', label: 'ОСН — общая система' },
  { value: 'usn_income', label: 'УСН доходы' },
  { value: 'usn_income_outcome', label: 'УСН доходы минус расходы' },
  { value: 'esn', label: 'ЕСХН' },
  { value: 'patent', label: 'Патент' },
];

// vat20 нет: с 01.01.2026 основная ставка — 22%, и из API чеков Т-Банка vat20
// убран — бэк такую ставку больше не сохраняет.
export const TAX_OPTIONS = [
  { value: 'none', label: 'Без НДС' },
  { value: 'vat0', label: 'НДС 0%' },
  { value: 'vat5', label: 'НДС 5%' },
  { value: 'vat7', label: 'НДС 7%' },
  { value: 'vat10', label: 'НДС 10%' },
  { value: 'vat22', label: 'НДС 22%' },
];

// Подписи ставок, которых в перечне уже нет, — чтобы назвать мерчанту сохранённую.
const LEGACY_TAX_LABELS = { vat20: 'НДС 20%' };

const TAXATION_VALUES = new Set(TAXATION_OPTIONS.map((o) => o.value));
const TAX_VALUES = new Set(TAX_OPTIONS.map((o) => o.value));

export const isKnownTaxation = (value) => TAXATION_VALUES.has(value);
export const isKnownTax = (value) => TAX_VALUES.has(value);

/**
 * Чек включён, а сохранённые налоги уже не из перечня (например vat20 до 2026 года).
 * Бэк считает такую оплату ненастроенной (PAYMENT в missingForOrders), хотя
 * ключи на месте, — мерчанту нужно выбрать ставку заново. Чек у каждого провайдера
 * свой; по умолчанию смотрим того, через кого витрина принимает оплату.
 * → { tax, taxation } — сохранённые устаревшие значения (или null), либо null.
 */
export const outdatedReceiptSettings = (shop, provider = shop?.paymentProvider) => {
  if (!shop) return null;
  const yookassa = provider === 'YOOKASSA';
  const enabled = yookassa ? shop.yookassaReceiptEnabled : shop.tinkoffReceiptEnabled;
  if (!enabled) return null;
  const savedTax = yookassa ? shop.yookassaTax : shop.tinkoffTax;
  const savedTaxation = yookassa ? shop.yookassaTaxation : shop.tinkoffTaxation;
  const tax = savedTax && !isKnownTax(savedTax) ? savedTax : null;
  const taxation = savedTaxation && !isKnownTaxation(savedTaxation) ? savedTaxation : null;
  return tax || taxation ? { tax, taxation } : null;
};

export const legacyTaxLabel = (value) => LEGACY_TAX_LABELS[value] || value;
