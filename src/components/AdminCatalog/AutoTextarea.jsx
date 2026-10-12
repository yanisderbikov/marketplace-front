import React, { useEffect, useRef } from 'react';

/**
 * Textarea, которая динамически растёт под содержимое (без предела и без скролла).
 * Высота подстраивается под scrollHeight при каждом изменении значения.
 * Перенос anyforms CustomOrders/AutoTextarea: в общих компонентах её нет, а нужна
 * она только карточке товара — поэтому лежит рядом с каталогом.
 */
const AutoTextarea = ({ value, onChange, minRows = 2, ...rest }) => {
  const ref = useRef(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    resize();
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      onChange={(e) => {
        onChange(e);
        resize();
      }}
      {...rest}
    />
  );
};

export default AutoTextarea;
