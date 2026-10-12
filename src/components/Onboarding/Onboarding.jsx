import React, { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import { checkSlug, createShop } from '../../services/merchantShop';
import { errorMessage } from '../../shared/errors';
import { BRAND_SWATCHES } from '../../shared/shopTheme';
import ShopMock, { SWATCH_NAMES } from '../Home/ShopMock';
import { sanitizeSlugInput, slugFormatError, suggestSlug, SLUG_MAX } from './slug';
import styles from './Onboarding.module.css';

// Как на бэке (name 2..120 — те же границы, что у PUT /api/merchant/shop/design).
const NAME_MIN = 2;
const NAME_MAX = 120;

// Формат цвета, который принимает бэк (brandColor ^#[0-9a-fA-F]{6}$).
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// Пауза перед проверкой адреса: не дёргаем бэк на каждую букву.
const SLUG_CHECK_DELAY_MS = 400;

const nameError = (name) => {
  if (!name) return 'Как называется магазин?';
  if (name.length < NAME_MIN) return `Минимум ${NAME_MIN} символа`;
  if (name.length > NAME_MAX) return `Максимум ${NAME_MAX} символов`;
  return null;
};

/**
 * Онбординг: первый шаг после регистрации — название, адрес витрины и цвет.
 * Остальное оформление (логотип, фото, описание) — на вкладке «Дизайн», куда
 * и ведём после создания. AdminLayout сам уводит отсюда, если магазин уже есть.
 */
const Onboarding = () => {
  const navigate = useNavigate();
  const { refreshMe, setShop } = useOutletContext();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  // Пока человек не трогал адрес руками, подсказываем его из названия.
  const [slugEdited, setSlugEdited] = useState(false);
  const [brandColor, setBrandColor] = useState(BRAND_SWATCHES[0]);
  // status: idle (нечего проверять) | checking | available | taken | error (сеть).
  const [slugCheck, setSlugCheck] = useState({ status: 'idle', reason: null });
  const [recheckKey, setRecheckKey] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const origin = window.location.origin;
  const host = window.location.host;
  const trimmedName = name.trim();
  const nameProblem = nameError(trimmedName);
  const slugProblem = slugFormatError(slug);
  const colorValid = HEX_COLOR_RE.test(brandColor);

  // Живая проверка адреса: формат — сразу локально, занятость и зарезервированные
  // адреса — у бэка с задержкой. cancelled отбрасывает ответы на устаревший ввод.
  useEffect(() => {
    if (slugFormatError(slug)) {
      setSlugCheck({ status: 'idle', reason: null });
      return undefined;
    }
    let cancelled = false;
    setSlugCheck({ status: 'checking', reason: null });
    const timer = setTimeout(() => {
      checkSlug(slug)
        .then((res) => {
          if (cancelled) return;
          setSlugCheck(
            res?.available
              ? { status: 'available', reason: null }
              : { status: 'taken', reason: res?.reason || 'Этот адрес уже занят' }
          );
        })
        .catch((err) => {
          if (cancelled) return;
          setSlugCheck({ status: 'error', reason: errorMessage(err, 'Не удалось проверить адрес') });
        });
    }, SLUG_CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slug, recheckKey]);

  const handleNameChange = (e) => {
    const value = e.target.value;
    setName(value);
    setError('');
    if (!slugEdited) setSlug(suggestSlug(value));
  };

  const handleSlugChange = (e) => {
    const value = sanitizeSlugInput(e.target.value);
    setSlug(value);
    setError('');
    // Стёр адрес целиком — дальше снова подсказываем его из названия.
    setSlugEdited(value !== '');
  };

  // Висящий дефис на конце допустим только пока человек печатает.
  const handleSlugBlur = () => {
    setSlug((prev) => prev.replace(/-+$/, ''));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAttempted(true);
    if (nameProblem || slugProblem || !colorValid || slugCheck.status === 'taken') return;

    setSubmitting(true);
    setError('');
    try {
      const created = await createShop({ name: trimmedName, slug, brandColor: brandColor.toLowerCase() });
      // Полный MerchantShopDTO уже в ответе — кладём его в контекст кабинета сразу,
      // а me (меню, ссылка на витрину) перечитываем. Если перечитать не вышло —
      // не страшно: магазин создан и уже лежит в контексте.
      setShop(created);
      try {
        await refreshMe();
      } catch {
        /* сводка в me обновится из shop (эффект в AdminLayout) */
      }
      toast.success('Магазин создан — добавьте логотип и фото витрины');
      navigate('/admin/design', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Не удалось создать магазин'));
      setSubmitting(false);
      if (err?.response?.status === 409) {
        // 409 — либо адрес заняли, пока человек заполнял форму, либо магазин уже
        // создан (например, в соседней вкладке). Во втором случае — в кабинет.
        try {
          const me = await refreshMe();
          if (me?.shop) {
            navigate('/admin/analytics', { replace: true });
            return;
          }
        } catch {
          /* остаёмся на форме с текстом ошибки */
        }
        setRecheckKey((k) => k + 1);
      }
    }
  };

  const showNameError = Boolean(nameProblem) && (attempted || name.length > 0);
  const showSlugFormatError = Boolean(slugProblem) && (attempted || slug.length > 0);
  const canSubmit = !submitting && !nameProblem && !slugProblem && colorValid && slugCheck.status !== 'taken';

  let slugStatus = null;
  if (showSlugFormatError) {
    slugStatus = { tone: 'bad', text: slugProblem };
  } else if (!slugProblem) {
    if (slugCheck.status === 'checking') slugStatus = { tone: 'muted', text: 'Проверяем адрес…' };
    if (slugCheck.status === 'available') slugStatus = { tone: 'good', text: 'Адрес свободен' };
    if (slugCheck.status === 'taken') slugStatus = { tone: 'bad', text: slugCheck.reason };
    if (slugCheck.status === 'error') slugStatus = { tone: 'muted', text: slugCheck.reason };
  }

  const previewAddress = `${host}/shop/${slug || 'адрес'}`;
  const isCustomColor = !BRAND_SWATCHES.includes(brandColor.toLowerCase());

  return (
    <div className={styles.wrap}>
      <header className={styles.pageHead}>
        <h1 className={styles.title}>Создание магазина</h1>
        <p className={styles.subtitle}>
          Название, адрес витрины и цвет — этого достаточно, чтобы начать. Логотип, фото и описание
          добавите следующим шагом, в «Дизайне».
        </p>
      </header>

      <div className={styles.layout}>
        <form className={styles.card} onSubmit={handleSubmit} noValidate>
          <label className={styles.field}>
            <span className={styles.label}>Название магазина</span>
            <input
              type="text"
              className={`${styles.input} ${showNameError ? styles.inputInvalid : ''}`}
              value={name}
              onChange={handleNameChange}
              maxLength={NAME_MAX}
              placeholder="Например, Свечи ручной работы"
              autoComplete="organization"
              disabled={submitting}
              aria-invalid={showNameError}
              autoFocus
            />
            {showNameError && <span className={`${styles.status} ${styles.statusBad}`}>{nameProblem}</span>}
          </label>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="onboarding-slug">
              Адрес витрины
            </label>
            <div className={`${styles.slugBox} ${slugStatus?.tone === 'bad' ? styles.inputInvalid : ''}`}>
              <span className={styles.slugPrefix}>
                {/* Хост на телефоне прячем — полная ссылка всё равно есть в подсказке ниже. */}
                <span className={styles.slugHost}>{host}</span>/shop/
              </span>
              <input
                id="onboarding-slug"
                type="text"
                className={styles.slugInput}
                value={slug}
                onChange={handleSlugChange}
                onBlur={handleSlugBlur}
                maxLength={SLUG_MAX}
                placeholder="moy-magazin"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode="url"
                disabled={submitting}
                aria-invalid={slugStatus?.tone === 'bad'}
                aria-describedby="onboarding-slug-status onboarding-slug-hint"
              />
            </div>
            <span
              id="onboarding-slug-status"
              className={`${styles.status} ${
                slugStatus?.tone === 'good'
                  ? styles.statusGood
                  : slugStatus?.tone === 'bad'
                    ? styles.statusBad
                    : styles.statusMuted
              }`}
              aria-live="polite"
            >
              {slugStatus?.text || ' '}
            </span>
            <span id="onboarding-slug-hint" className={styles.hint}>
              Строчная латиница, цифры и дефис, от 3 до {SLUG_MAX} символов. После создания адрес не
              меняется. Витрина будет открываться по ссылке{' '}
              <span className={styles.hintUrl}>
                {origin}/shop/{slug || '…'}
              </span>
            </span>
          </div>

          <fieldset className={styles.field} disabled={submitting}>
            <legend className={styles.label}>Цвет бренда</legend>
            <div className={styles.swatches}>
              {BRAND_SWATCHES.map((color) => {
                const active = brandColor.toLowerCase() === color;
                return (
                  <button
                    key={color}
                    type="button"
                    className={`${styles.swatch} ${active ? styles.swatchActive : ''}`}
                    style={{ background: color }}
                    onClick={() => setBrandColor(color)}
                    aria-pressed={active}
                    aria-label={SWATCH_NAMES[color] || color}
                    title={SWATCH_NAMES[color] || color}
                  />
                );
              })}
              <label
                className={`${styles.swatch} ${styles.swatchCustom} ${isCustomColor ? styles.swatchActive : ''}`}
                style={isCustomColor ? { background: brandColor } : undefined}
                title="Свой цвет"
              >
                <input
                  type="color"
                  className={styles.colorInput}
                  value={colorValid ? brandColor.toLowerCase() : BRAND_SWATCHES[0]}
                  onChange={(e) => setBrandColor(e.target.value.toLowerCase())}
                  aria-label="Свой цвет"
                />
                {!isCustomColor && <span className={styles.swatchPlus} aria-hidden="true">+</span>}
              </label>
              <span className={styles.hexValue}>{brandColor.toLowerCase()}</span>
            </div>
            <span className={styles.hint}>
              Из этого цвета соберётся вся витрина: шапка, фон, цены и кнопки. Поменять его можно в любой
              момент.
            </span>
          </fieldset>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.actions}>
            <button type="submit" className={styles.submit} disabled={!canSubmit}>
              {submitting ? 'Создаём…' : 'Создать магазин'}
            </button>
          </div>
        </form>

        <aside className={styles.preview} aria-label="Как будет выглядеть витрина">
          <p className={styles.previewTitle}>так будет выглядеть витрина</p>
          <ShopMock brandColor={brandColor} name={trimmedName || 'Ваш магазин'} address={previewAddress} />
        </aside>
      </div>
    </div>
  );
};

export default Onboarding;
