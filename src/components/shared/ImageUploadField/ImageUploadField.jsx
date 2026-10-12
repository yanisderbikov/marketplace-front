import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import UploadProgress from '../UploadProgress';
import { errorMessage } from '../../../shared/errors';
import styles from './ImageUploadField.module.css';

// Бэк подписывает загрузку только для этих типов (S3FileStorage) — проверяем
// заранее, чтобы не гонять presign ради HEIC с айфона и получить понятный текст.
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Поле одной картинки (логотип, фото витрины): превью, выбор файла, прогресс
 * загрузки, «Заменить» / «Удалить». Само ничего не знает про API —
 * onUpload(file, onProgress) и onDelete() передаёт страница (обычно
 * uploadShopImage / deleteShopImage + setShop). Ошибки показывает тостом.
 *
 * aspect: 'square' — квадрат с кадрированием (как фото витрины в hero);
 *         'wide'   — широкая рамка, картинка вписывается целиком (логотип-словомарка).
 */
const ImageUploadField = ({ label, hint, url, aspect = 'square', onUpload, onDelete, disabled = false }) => {
  const inputRef = useRef(null);
  const [progress, setProgress] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const busy = Boolean(progress) || deleting;

  const pickFile = () => {
    if (disabled || busy) return;
    inputRef.current?.click();
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    // Сбрасываем value, чтобы повторный выбор того же файла снова вызвал onChange.
    event.target.value = '';
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Подойдёт JPG, PNG, WebP, GIF или AVIF');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Файл больше 10 МБ — уменьшите картинку');
      return;
    }
    setProgress({ percent: 0, index: 0, count: 1, filename: file.name });
    try {
      await onUpload(file, (percent, meta) => setProgress({ percent, ...meta }));
      toast.success('Картинка загружена');
    } catch (err) {
      toast.error(errorMessage(err, 'Не удалось загрузить картинку'));
    } finally {
      setProgress(null);
    }
  };

  const handleDelete = async () => {
    if (disabled || busy || !window.confirm('Удалить картинку?')) return;
    setDeleting(true);
    try {
      await onDelete();
      toast.success('Картинка удалена');
    } catch (err) {
      toast.error(errorMessage(err, 'Не удалось удалить картинку'));
    } finally {
      setDeleting(false);
    }
  };

  const frameClass = `${styles.frame} ${aspect === 'wide' ? styles.frameWide : styles.frameSquare}`;

  return (
    <div className={styles.field}>
      {label && <span className={styles.label}>{label}</span>}

      {url ? (
        <div className={frameClass}>
          <img className={styles.preview} src={url} alt={label || ''} decoding="async" />
        </div>
      ) : (
        <button
          type="button"
          className={`${frameClass} ${styles.empty}`}
          onClick={pickFile}
          disabled={disabled || busy}
        >
          <span className={styles.emptyPlus} aria-hidden="true">+</span>
          <span>Выбрать картинку</span>
        </button>
      )}

      {progress && <UploadProgress progress={progress} className={styles.progress} />}

      {url && (
        <div className={styles.actions}>
          <button type="button" className={styles.btn} onClick={pickFile} disabled={disabled || busy}>
            Заменить
          </button>
          {onDelete && (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={handleDelete}
              disabled={disabled || busy}
            >
              {deleting ? 'Удаляем…' : 'Удалить'}
            </button>
          )}
        </div>
      )}

      {hint && <p className={styles.hint}>{hint}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className={styles.fileInput}
        onChange={handleFile}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
};

export default ImageUploadField;
