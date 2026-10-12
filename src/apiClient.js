import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import config from './config';

// Храним JWT в localStorage (без куки): бэк stateless, токен уходит Bearer-заголовком.
const TOKEN_KEY = 'mp_jwt';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token) => {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch (e) {
    console.warn('localStorage unavailable', e);
  }
};

// Очистка токена (логаут).
export const clearToken = () => setToken(null);

// Есть ли живой токен: существует, парсится и не истёк.
export const hasLiveToken = () => {
  const token = getToken();
  if (!token) return false;
  try {
    const { exp } = jwtDecode(token);
    return !exp || exp * 1000 > Date.now();
  } catch {
    return false;
  }
};

const api = axios.create({
  baseURL: config.apiUrl,
});

// Токен читаем на каждый запрос, а не один раз при создании инстанса:
// после логина/логаута заголовок меняется без перезагрузки страницы.
api.interceptors.request.use((requestConfig) => {
  const token = getToken();
  if (token) {
    requestConfig.headers.Authorization = `Bearer ${token}`;
  }
  return requestConfig;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401 в кабинете — бэк не признал токен (истёк, пользователя нет): стираем его
    // и уводим на логин с возвратом обратно. 403 на логин не бросаем: токен валиден,
    // просто не хватает прав (иначе петля логина) — такие случаи разруливает гвард
    // в AdminLayout. Публичные страницы (витрина, чекаут) на логин не бросаем.
    const path = window.location.pathname;
    if (error.response?.status === 401 && path.startsWith('/admin')) {
      clearToken();
      const from = encodeURIComponent(path + window.location.search);
      window.location.href = `/login?from=${from}`;
      // Страница уходит на логин — вызывающему коду не нужно показывать ошибку.
      return new Promise(() => {});
    }
    // Прокидываем ошибку дальше для локальной обработки (errorMessage в shared/errors.js).
    return Promise.reject(error);
  }
);

export default api;
