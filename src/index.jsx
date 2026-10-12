import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { CartProvider } from './context/CartContext';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
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
