import config from '../config';

// Локальная разработка — всегда платформа, даже если VITE_PLATFORM_HOSTS не перечисляет localhost.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/**
 * Открыта ли страница на домене платформы. false — это свой домен магазина:
 * index.jsx узнаёт у бэкенда slug и монтирует витрину с корня.
 */
export const isPlatformHost = (hostname = window.location.hostname) => {
  const host = hostname.toLowerCase();
  if (config.platformHosts.length === 0) return true;
  return LOCAL_HOSTS.includes(host) || config.platformHosts.includes(host);
};
