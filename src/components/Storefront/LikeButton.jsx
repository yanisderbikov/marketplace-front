import React from 'react';
import { useLikes } from '../../hooks/useLikes';
import styles from './LikeButton.module.css';

// Перенос anyforms shared/LikeButton. Избранное теперь своё у каждого магазина
// (useLikes(slug)), аналитики нет. Кроме витрины лайки нигде не нужны,
// поэтому кнопка лежит рядом с каталогом, а не в shared.
const LikeButton = ({ slug, productId, overlay = false, className = '' }) => {
  const { isLiked, toggle } = useLikes(slug);
  const liked = isLiked(productId);

  const handleClick = (e) => {
    // Кнопка лежит поверх ссылки на товар: клик по сердечку не открывает карточку.
    e.preventDefault();
    e.stopPropagation();
    toggle(productId);
  };

  return (
    <button
      type="button"
      className={`${styles.likeBtn} ${liked ? styles.liked : ''} ${overlay ? styles.overlay : ''} ${className}`.trim()}
      aria-label={liked ? 'Убрать из избранного' : 'В избранное'}
      aria-pressed={liked}
      onClick={handleClick}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill={liked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
      </svg>
    </button>
  );
};

export default LikeButton;
