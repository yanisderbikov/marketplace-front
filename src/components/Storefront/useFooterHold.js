import { useLayoutEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

/**
 * Страница витрины, пока грузит своё содержимое (каталог, товар), прячет
 * подвал StorefrontLayout: иначе он стоит под скелетоном или спиннером и
 * прыгает вниз, когда приходят товары (в anyforms подвал тоже появлялся
 * только после загрузки).
 *
 * Layout-эффект, а не обычный: подвал снимается до первой отрисовки, без
 * кадра, где он мелькает под заглушкой. Подвал возвращается сам, когда
 * active стал false или страница размонтировалась.
 */
export const useFooterHold = (active) => {
  const { holdFooter } = useOutletContext() ?? {};
  useLayoutEffect(() => {
    if (!active || !holdFooter) return undefined;
    return holdFooter();
  }, [active, holdFooter]);
};
