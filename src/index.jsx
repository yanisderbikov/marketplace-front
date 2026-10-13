import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { CartProvider } from './context/CartContext';
import { isPlatformHost } from './shared/customDomain';
import { resolveDomain } from './services/storefront';
import { setCustomDomainShop } from './components/Storefront/storefrontPaths';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));

// Режим (платформа / свой домен) App читает при рендере — slug своего домена должен быть известен раньше.
const renderApp = () => {
  root.render(
    <React.StrictMode>
      {/* v7_startTransition: переходы между роутами идут как transition — при
          навигации на ленивый роут (App.jsx) React держит текущую страницу, пока
          грузится чанк, вместо того чтобы показать пустой Suspense-fallback.
          v7_relativeSplatPath — поведение v7 заранее (и без предупреждения в консоли). */}
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CartProvider>
          <App />
          <Toaster position="top-right" />
        </CartProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
};

const renderMessage = (text) => {
  document.body.style.background = '#fff';
  root.render(
    <p style={{ fontFamily: 'system-ui, sans-serif', textAlign: 'center', marginTop: '30vh', padding: '0 16px' }}>
      {text}
    </p>
  );
};

if (isPlatformHost()) {
  renderApp();
} else {
  // Свой домен магазина: узнаём, чья это витрина, и открываем её с корня.
  resolveDomain(window.location.hostname)
    .then(({ slug }) => {
      setCustomDomainShop(slug);
      renderApp();
    })
    .catch((err) => {
      renderMessage(
        err?.response?.status === 404
          ? 'Магазин на этом домене не найден'
          : 'Не удалось загрузить магазин. Обновите страницу через минуту.'
      );
    });
}
