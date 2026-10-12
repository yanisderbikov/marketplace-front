// Адрес бэкенда берётся только из окружения (VITE_API_URL, см. .env.example):
// запасного значения нет нарочно — фронт без него не должен тихо ходить «куда-то».
if (!import.meta.env.VITE_API_URL) {
  console.error('VITE_API_URL не задан — запросы к API уйдут на текущий origin. См. .env.example');
}

const config = {
  apiUrl: import.meta.env.VITE_API_URL,
};

export default config;
