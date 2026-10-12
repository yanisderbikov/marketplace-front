import React from 'react';
import styles from './UploadProgress.module.css';

/**
 * Полоса прогресса прямой загрузки в S3: общий процент по байтам всех файлов
 * плюс какой файл сейчас идёт. progress = { percent, index, count, filename } | null.
 */
const UploadProgress = ({ progress, className }) => {
  if (!progress) return null;
  const { percent = 0, index = 0, count = 1, filename } = progress;
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      className={`${styles.wrap} ${className || ''}`}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={styles.meta}>
        <span className={styles.name}>
          {count > 1 ? `файл ${Math.min(index + 1, count)} из ${count}` : 'загрузка'}
          {filename ? ` · ${filename}` : ''}
        </span>
        <span className={styles.percent}>{clamped}%</span>
      </div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
};

export default UploadProgress;
