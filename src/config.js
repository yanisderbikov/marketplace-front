// Адреса берутся только из окружения (см. .env.example) — запасных значений в коде нет.
//
// VITE_API_URL — origin бэкенда. Пустое значение — API на том же origin, что и страница:
// так фронт работает за гейтвеем (marketplace-gateway отдаёт /api/* бэкенду), и это
// единственный вариант для витрин на своих доменах магазинов — им не нужен CORS бэкенда.
const splitHosts = (value) =>
  (value || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

const config = {
  apiUrl: import.meta.env.VITE_API_URL || '',
  // Хосты самой платформы (главная, кабинет, /shop/{slug}). Любой другой хост — свой домен
  // магазина: фронт спрашивает бэкенд, чья это витрина, и открывает её с корня.
  // Пусто — свои домены выключены, любой хост считается платформой.
  platformHosts: splitHosts(import.meta.env.VITE_PLATFORM_HOSTS),
  // Куда мерчанту направить CNAME своего домена (подсказка в настройках). Пусто — подсказки нет.
  customDomainTarget: (import.meta.env.VITE_CUSTOM_DOMAIN_TARGET || '').trim(),
};

export default config;
