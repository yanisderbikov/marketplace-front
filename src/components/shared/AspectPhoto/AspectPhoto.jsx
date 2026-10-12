import React, { useEffect, useRef, useState } from 'react';
import styles from './AspectPhoto.module.css';

// Пропорция рамки (ширина / высота): 3 по ширине × 4 по высоте.
const FRAME_RATIO = 3 / 4;

/**
 * Фото в фиксированной рамке 3:4, чтобы вёрстка вокруг не прыгала от фото
 * разных пропорций. Вытянутые по вертикали фото кропаются по высоте;
 * фото шире рамки вписываются во всю ширину, а свободное место сверху
 * и снизу заполняет размытая копия того же фото.
 */
const AspectPhoto = ({ src, alt = '', className = '', ...imgProps }) => {
  const imgRef = useRef(null);
  const [wide, setWide] = useState(false);

  const measure = (img) => {
    if (img?.naturalWidth && img?.naturalHeight) {
      setWide(img.naturalWidth / img.naturalHeight > FRAME_RATIO);
    }
  };

  // При смене src режим сбрасывается; у закешированной картинки onLoad может
  // не сработать — если она уже загружена, меряем сразу.
  useEffect(() => {
    setWide(false);
    if (imgRef.current?.complete) measure(imgRef.current);
  }, [src]);

  return (
    <div className={`${styles.frame} ${className}`}>
      {wide && <img className={styles.blur} src={src} alt="" aria-hidden="true" />}
      <img
        ref={imgRef}
        className={`${styles.photo} ${wide ? styles.photoWide : ''}`}
        src={src}
        alt={alt}
        onLoad={(event) => measure(event.target)}
        {...imgProps}
      />
    </div>
  );
};

export default AspectPhoto;
