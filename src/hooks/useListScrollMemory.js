import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Возврат к списку с карточки: помним прокрутку страницы-списка и
// восстанавливаем её, когда посетитель вернулся назад (кнопкой браузера
// или ссылкой «назад» со state.backToList), а не пришёл на список заново.
// ready=false, пока список грузится и страница ещё не набрала высоту.
export const useListScrollMemory = (key, ready) => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const restoredRef = useRef(false);

  // Восстановление — один раз, как только список отрисован в полную высоту.
  useEffect(() => {
    if (!ready || restoredRef.current) return;
    restoredRef.current = true;
    const cameBack = navigationType === 'POP' || Boolean(location.state?.backToList);
    if (!cameBack) return;
    let saved = 0;
    try {
      saved = Number(sessionStorage.getItem(key)) || 0;
    } catch {
      return;
    }
    if (saved > 0) window.scrollTo(0, saved);
  }, [ready, key, navigationType, location.state]);

  // Запоминаем прокрутку не чаще кадра. Пока ready=false, не пишем: короткая
  // страница-лоадер прижимает скролл к нулю и затёрла бы сохранённое место.
  useEffect(() => {
    if (!ready) return undefined;
    let raf = 0;
    const onScroll = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        try {
          sessionStorage.setItem(key, String(window.scrollY));
        } catch {
          /* приватный режим — просто не запоминаем */
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [key, ready]);
};
