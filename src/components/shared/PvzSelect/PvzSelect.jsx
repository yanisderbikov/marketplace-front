import React, { useEffect, useRef, useState } from 'react';
import { searchPvz } from '../../../services/storefront';
import { backendErrorText } from '../../../shared/errors';
import styles from './PvzSelect.module.css';

// Поиск ПВЗ СДЭК: город (обязательно) + адрес/улица (необязательно, фильтрует пункты внутри города).
// Выбор отдаёт наверх { pvzCode, pvzCity, pvzStreet }.
// Один компонент на чекауте (ПВЗ получения) и в настройках магазина (ПВЗ отправки).
// onSearchResult(outcome, { query, results }) — для аналитики: outcome = ok | empty | error.
// showError — подсветить незаполненное поле, даже если его ещё не трогали (попытка отправить форму).
// disabled — выбор временно недоступен (в настройках: пока сохраняется соседняя форма).
const MIN_QUERY_LENGTH = 3;
const SEARCH_FAILED_TEXT = 'Не удалось загрузить пункты выдачи. Проверьте интернет и попробуйте ещё раз.';

const PvzSelect = ({ selected, onSelect, onClear, invalid, showError = false, disabled = false, onSearchResult }) => {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Текст ошибки поиска (сеть, 5xx): без неё пустой список выглядел как
  // «ничего не нашли» — будто покупатель ошибся в адресе.
  const [searchError, setSearchError] = useState('');
  // «Повторить» после ошибки — тот же запрос ещё раз.
  const [retryKey, setRetryKey] = useState(0);
  const [touched, setTouched] = useState(false);
  const boxRef = useRef(null);
  const requestIdRef = useRef(0);
  // Колбэк аналитики читаем через ref, чтобы не перезапускать поиск при его смене.
  const onSearchResultRef = useRef(onSearchResult);
  onSearchResultRef.current = onSearchResult;

  // Дебаунс запроса. Свободный текст: улица и/или город («Грибоедова», «грибоедова пермь»).
  useEffect(() => {
    const q = query.trim();
    const requestId = ++requestIdRef.current;
    setSearchError('');
    if (q.length < MIN_QUERY_LENGTH) {
      setOptions([]);
      setLoading(false);
      // Стёрли запрос — закрываем список, иначе в нём висело бы «Ничего не нашли».
      setOpen(false);
      return undefined;
    }
    setLoading(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      // «Ищем пункты выдачи…» видно и на первом поиске, а не только после удачного.
      setOpen(true);
      try {
        const data = await searchPvz(q);
        if (cancelled || requestId !== requestIdRef.current) return;
        const found = Array.isArray(data) ? data : [];
        setOptions(found);
        setOpen(true);
        onSearchResultRef.current?.(found.length ? 'ok' : 'empty', { query: q, results: found.length });
      } catch (err) {
        if (cancelled || requestId !== requestIdRef.current) return;
        setOptions([]);
        // Осмысленный ответ бэка (4xx с текстом, например лимит запросов) показываем как есть.
        const status = err?.response?.status;
        setSearchError((status && status < 500 && backendErrorText(err)) || SEARCH_FAILED_TEXT);
        setOpen(true);
        onSearchResultRef.current?.('error', { query: q, results: 0 });
      } finally {
        if (!cancelled && requestId === requestIdRef.current) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, retryKey]);

  // Закрытие дропдауна по клику вне компонента.
  useEffect(() => {
    const onDocClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const handlePick = (point) => {
    if (disabled) return;
    onSelect({
      pvzCode: point.code,
      pvzCity: point.city ?? '',
      pvzStreet: point.address ?? point.fullAddress ?? '',
    });
    setQuery('');
    setOptions([]);
    setOpen(false);
  };

  if (selected) {
    return (
      <div className={styles.pvzSelected}>
        <div>
          <div className={styles.pvzSelectedAddr}>
            {selected.pvzStreet}
            {selected.pvzCity ? `, г. ${selected.pvzCity}` : ''}
          </div>
          <div className={styles.pvzSelectedMeta}>Пункт выдачи СДЭК · {selected.pvzCode}</div>
        </div>
        <button type="button" className={styles.pvzChange} onClick={onClear} disabled={disabled}>
          Изменить
        </button>
      </div>
    );
  }

  const queryReady = query.trim().length >= MIN_QUERY_LENGTH;

  return (
    <div className={styles.pvzWrap} ref={boxRef}>
      <input
        id="pvz"
        name="pvz"
        className={`${styles.input} ${invalid && (touched || showError) ? styles.inputError : ''}`}
        type="text"
        placeholder="Улица или город — напр. Грибоедова"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => (options.length || searchError) && setOpen(true)}
        onBlur={() => setTouched(true)}
        // Enter в поиске не отправляет форму чекаута: покупатель ещё выбирает пункт.
        onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
        aria-label="Поиск пункта выдачи СДЭК"
        aria-invalid={Boolean(invalid && (touched || showError))}
        autoComplete="off"
        disabled={disabled}
      />
      {open && !disabled && queryReady && (
        <div className={styles.pvzDropdown}>
          {loading && <div className={styles.pvzStatus}>Ищем пункты выдачи…</div>}
          {!loading && searchError && (
            <div className={`${styles.pvzStatus} ${styles.pvzStatusError}`} role="alert">
              {searchError}{' '}
              <button
                type="button"
                className={styles.pvzRetry}
                // mousedown не должен уводить фокус из поля и закрывать список.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setRetryKey((key) => key + 1)}
              >
                Повторить
              </button>
            </div>
          )}
          {!loading && !searchError && options.length === 0 && (
            <div className={styles.pvzStatus}>Ничего не нашли. Проверьте город и адрес.</div>
          )}
          {!loading &&
            options.map((point) => (
              <div
                key={point.code}
                className={styles.pvzOption}
                role="button"
                tabIndex={0}
                onClick={() => handlePick(point)}
                onKeyDown={(e) => e.key === 'Enter' && handlePick(point)}
              >
                <div className={styles.pvzOptionAddr}>
                  {point.address ?? point.fullAddress}
                  {point.city ? `, г. ${point.city}` : ''}
                </div>
                {point.workTime && <div className={styles.pvzOptionMeta}>{point.workTime}</div>}
              </div>
            ))}
        </div>
      )}
    </div>
  );
};

export default PvzSelect;
