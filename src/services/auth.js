import api from '../apiClient';

// Вход и регистрация — одно и то же: почта → код из письма → JWT.
// Первый вход создаёт пользователя; магазин он заводит уже в кабинете (онбординг).

/** Отправить код на почту. Повтор раньше минуты бэк молча пропускает (200 без письма). */
export const requestCode = (email) =>
  api.post('/api/public/auth/request-code', { email }).then((res) => res.data);

/** Проверить код. Возвращает строку JWT — сохранить её через setToken (apiClient). */
export const verifyCode = (email, code) =>
  api.post('/api/public/auth/verify-code', { email, code }).then((res) => res.data.token);

/** MeDTO { email, name, superAdmin, shop: { id, slug, name, active } | null }. */
export const getMe = () => api.get('/api/auth/me').then((res) => res.data);
