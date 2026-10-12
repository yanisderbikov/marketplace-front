import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Обычная SPA-сборка: без SSR-пререндера и без 404.html для GitHub Pages —
// фронт отдаёт nginx (см. nginx.conf), он сам заворачивает любой путь на index.html.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    host: '0.0.0.0',
  },
});
