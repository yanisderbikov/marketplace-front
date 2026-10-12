// Бренд платформы в интерфейсе — всегда строчными. Одна константа на весь фронт:
// шапка кабинета, подвалы, «Сделано на …» на витринах, заголовки вкладок.
export const BRAND_NAME = 'marketplace';

// Оператор платформы (не продавец на витрине!): его реквизиты — в подвале главной,
// на 404 и в политике конфиденциальности платформы. Значения только из окружения
// (см. .env.example); пустое значение — строку не выводим.
export const PLATFORM_OPERATOR = {
  name: import.meta.env.VITE_PLATFORM_OPERATOR_NAME,
  inn: import.meta.env.VITE_PLATFORM_OPERATOR_INN,
  ogrn: import.meta.env.VITE_PLATFORM_OPERATOR_OGRN,
  email: import.meta.env.VITE_PLATFORM_CONTACT_EMAIL,
};
