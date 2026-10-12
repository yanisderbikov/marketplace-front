import React, { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import ImageUploadField from '../shared/ImageUploadField/ImageUploadField';
import { deleteShopImage, saveDesign, uploadShopImage } from '../../services/merchantShop';
import { BRAND_SWATCHES } from '../../shared/shopTheme';
import { errorMessage } from '../../shared/errors';
import StorefrontPreview from './StorefrontPreview';
import styles from './AdminDesign.module.css';

// Лимиты — те же, что проверяет бэк (PUT /api/merchant/shop/design).
const NAME_MIN = 2;
const NAME_MAX = 120;
const TAGLINE_MAX = 160;
const DESCRIPTION_MAX = 600;
const ABOUT_MAX = 4000;

// Бэк принимает #RRGGBB в любом регистре и хранит строчными — сравниваем так же.
const HEX_RE = /^#[0-9a-f]{6}$/;

// «572631», « #572631 », «#57263A» → «#572631» / «#57263a»: решётку мерчанты
// часто не копируют из макета, регистр не важен.
const normalizeHex = (value) => {
  const trimmed = String(value ?? '').trim().toLowerCase();
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
};

const formFromShop = (shop) => ({
  name: shop?.name ?? '',
  brandColor: String(shop?.brandColor ?? '').toLowerCase(),
  tagline: shop?.tagline ?? '',
  description: shop?.description ?? '',
  about: shop?.about ?? '',
});

// Пустое поле → null: бэк так и хранит «не задано», витрина тогда берёт запасной вариант.
const textOrNull = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
};

const buildPayload = (form) => ({
  name: form.name.trim(),
  brandColor: form.brandColor,
  tagline: textOrNull(form.tagline),
  description: textOrNull(form.description),
  about: textOrNull(form.about),
});

const samePayload = (a, b) => Object.keys(a).every((key) => (a[key] ?? null) === (b[key] ?? null));

/**
 * Textarea, которая растёт под содержимое (перенос AutoTextarea из anyforms
 * CustomOrders — в общих компонентах её нет, поэтому локально).
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

const Section = ({ title, children, hint }) => (
  <section className={styles.card}>
    <h2 className={styles.cardTitle}>{title}</h2>
    {children}
    {hint && <p className={styles.hint}>{hint}</p>}
  </section>
);

// Счётчик символов: ближе к лимиту подсвечиваем, чтобы обрезка не стала сюрпризом.
const Counter = ({ value, max }) => (
  <span className={`${styles.counter} ${value.length >= max * 0.9 ? styles.counterWarn : ''}`}>
    {value.length} / {max}
  </span>
);

/**
 * Вкладка «Дизайн»: цвет, название, логотип, фото и тексты витрины с живым
 * превью. Картинки (логотип, фото витрины) сохраняются сразу после загрузки —
 * у них свои ручки; цвет, название и тексты — одной кнопкой «Сохранить».
 * Поэтому форма заполняется из магазина только при открытии (и после своего
 * сохранения): загрузка логотипа обновляет shop в контексте, но не должна
 * затирать несохранённые тексты.
 */
const AdminDesign = () => {
  const { shop, setShop, setLeaveGuard } = useOutletContext();
  const [form, setForm] = useState(() => formFromShop(shop));
  // Текст поля HEX отдельно от цвета формы: пока мерчант набирает «#57», превью
  // остаётся в последнем валидном цвете, а не мигает запасной темой.
  const [hexDraft, setHexDraft] = useState(() => formFromShop(shop).brandColor);
  const [hexTouched, setHexTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  // Текущий текст HEX для обработчика сохранения (после await замыкание уже старое).
  const hexDraftRef = useRef(hexDraft);
  hexDraftRef.current = hexDraft;

  const shopRef = useRef(shop);
  shopRef.current = shop;
  const shopId = shop?.id;

  // Другой магазин (после перезагрузки кабинета) — форма с нуля.
  useEffect(() => {
    const initial = formFromShop(shopRef.current);
    setForm(initial);
    setHexDraft(initial.brandColor);
    setHexTouched(false);
  }, [shopId]);

  const normalizedHex = normalizeHex(hexDraft);
  const hexValid = HEX_RE.test(normalizedHex);
  const dirty = Boolean(shop) && (
    !hexValid
    || normalizedHex !== form.brandColor
    || !samePayload(buildPayload(form), buildPayload(formFromShop(shop)))
  );

  // Закрытие вкладки с несохранёнными правками — браузер переспросит.
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // Переход по меню кабинета с несохранёнными правками — тоже переспрашиваем
  // (beforeunload ловит только закрытие вкладки; проверку вызывает AdminLayout).
  useEffect(() => {
    if (!dirty || !setLeaveGuard) return undefined;
    setLeaveGuard(() => window.confirm('Есть несохранённые изменения. Уйти без сохранения?'));
    return () => setLeaveGuard(null);
  }, [dirty, setLeaveGuard]);

  if (!shop) return null;

  const setField = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const pickColor = (color) => {
    const hex = normalizeHex(color);
    setForm((prev) => ({ ...prev, brandColor: hex }));
    setHexDraft(hex);
    setHexTouched(false);
  };

  const handleHexChange = (e) => {
    const raw = e.target.value;
    setHexDraft(raw);
    const hex = normalizeHex(raw);
    if (HEX_RE.test(hex)) setForm((prev) => ({ ...prev, brandColor: hex }));
  };

  const handleHexBlur = () => {
    setHexTouched(true);
    // Валидный цвет приводим к каноническому виду: с решёткой, строчными.
    if (hexValid) setHexDraft(normalizedHex);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (form.name.trim().length < NAME_MIN) {
      toast.error(`Название магазина — от ${NAME_MIN} символов`);
      return;
    }
    if (!hexValid) {
      setHexTouched(true);
      toast.error('Цвет — в формате #RRGGBB, например #572631');
      return;
    }
    setSaving(true);
    // Снимок отправленного: поля во время запроса редактируемы, и если мерчант
    // продолжил печатать, ответ сервера его правки не затирает (все изменения
    // формы идут через setForm(prev => …) — «не трогали» = тот же объект).
    const sentForm = form;
    const sentHex = hexDraft;
    try {
      const updated = await saveDesign(buildPayload({ ...form, brandColor: normalizedHex }));
      setShop(updated);
      const next = formFromShop(updated);
      setForm((prev) => (prev === sentForm ? next : prev));
      if (hexDraftRef.current === sentHex) {
        setHexDraft(next.brandColor);
        setHexTouched(false);
      }
      toast.success('Дизайн сохранён');
    } catch (err) {
      toast.error(errorMessage(err, 'Не удалось сохранить дизайн'));
    } finally {
      setSaving(false);
    }
  };

  // Картинки уходят из браузера прямо в S3, бэк привязывает ключ и отдаёт свежий
  // MerchantShopDTO. Тост об успехе/ошибке показывает само поле (ImageUploadField).
  const uploadImage = (kind) => async (file, onProgress) => {
    const updated = await uploadShopImage(kind, file, onProgress);
    setShop(updated);
  };

  const removeImage = (kind) => async () => {
    const updated = await deleteShopImage(kind);
    setShop(updated);
  };

  const showHexError = hexTouched && !hexValid;
  const saveLabel = saving ? 'Сохранение…' : 'Сохранить';

  return (
    <div className={styles.wrap}>
      <form className={styles.layout} onSubmit={handleSubmit} noValidate>
        <header className={styles.pageHead}>
          <div className={styles.headTitles}>
            <h1 className={styles.title}>дизайн</h1>
            <p className={styles.subtitle}>
              Цвет, логотип, фото и тексты витрины. Превью меняется сразу, на витрину правки попадут после сохранения.
            </p>
          </div>
          <div className={styles.headActions}>
            {shop.storefrontPath && (
              <a
                className={styles.shopLink}
                href={shop.storefrontPath}
                target="_blank"
                rel="noopener noreferrer"
                title="Открыть витрину в новой вкладке"
              >
                Открыть витрину ↗
              </a>
            )}
            <button type="submit" className={styles.saveBtn} disabled={saving || !dirty}>
              {saveLabel}
            </button>
          </div>
        </header>

        <div className={styles.main}>
          <Section
            title="Название и цвет"
            hint="Из одного цвета собирается вся палитра витрины: шапка, фон страницы, кнопки и акценты. Текст остаётся читаемым при любом цвете — слишком светлые оттенки для кнопок и цен мы затемним сами."
          >
            <label className={styles.label}>
              <span className={styles.labelRow}>
                <span>Название магазина *</span>
                <Counter value={form.name} max={NAME_MAX} />
              </span>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={setField}
                className={styles.input}
                maxLength={NAME_MAX}
                placeholder="Мастерская свечей"
                autoComplete="off"
              />
            </label>

            <div className={styles.label}>
              <span>Цвет бренда</span>
              <div className={styles.colorRow}>
                <div className={styles.swatches} role="radiogroup" aria-label="Готовые цвета">
                  {BRAND_SWATCHES.map((color) => {
                    const active = hexValid && form.brandColor === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={`Цвет ${color}`}
                        title={color}
                        className={`${styles.swatch} ${active ? styles.swatchActive : ''}`}
                        style={{ background: color }}
                        onClick={() => pickColor(color)}
                      />
                    );
                  })}
                </div>
                <div className={styles.customColor}>
                  <label className={styles.colorPicker} title="Свой цвет">
                    {/* type=color принимает только #rrggbb: пока HEX в поле невалиден,
                        палитра показывает последний валидный цвет. */}
                    <input
                      type="color"
                      value={HEX_RE.test(form.brandColor) ? form.brandColor : BRAND_SWATCHES[0]}
                      onChange={(e) => pickColor(e.target.value)}
                      aria-label="Выбрать свой цвет"
                    />
                  </label>
                  <input
                    type="text"
                    value={hexDraft}
                    onChange={handleHexChange}
                    onBlur={handleHexBlur}
                    className={`${styles.input} ${styles.hexInput} ${showHexError ? styles.inputError : ''}`}
                    maxLength={7}
                    placeholder="#572631"
                    spellCheck={false}
                    autoComplete="off"
                    aria-label="Цвет в формате HEX"
                    aria-invalid={showHexError}
                  />
                </div>
              </div>
              {showHexError && (
                <span className={styles.fieldError}>Цвет — в формате #RRGGBB, например #572631</span>
              )}
            </div>
          </Section>
        </div>

        <aside className={styles.previewArea} aria-label="Предпросмотр витрины">
          <div className={styles.previewCard}>
            <h2 className={styles.cardTitle}>предпросмотр</h2>
            <StorefrontPreview
              name={form.name}
              brandColor={form.brandColor}
              logoUrl={shop.logoUrl}
              heroImageUrl={shop.heroImageUrl}
              tagline={form.tagline}
              description={form.description}
              about={form.about}
              storefrontPath={shop.storefrontPath}
            />
            <p className={styles.hint}>
              Упрощённая копия витрины на компьютере: товары — заглушки, цвет и тексты — как в форме.
            </p>
          </div>
        </aside>

        <div className={styles.rest}>
          <Section
            title="Логотип и фото витрины"
            hint="Картинки сохраняются сразу после загрузки — нажимать «Сохранить» для них не нужно. JPG, PNG, WebP, GIF или AVIF до 10 МБ."
          >
            {/* Превью логотипа — на цвете шапки витрины, как его увидят покупатели
                (белый логотип на светло-сером поле просто пропал бы). */}
            <div className={styles.imagesRow} style={{ '--image-field-wide-bg': form.brandColor }}>
              <ImageUploadField
                label="Логотип"
                hint="Показывается в шапке вместо названия, превью — на цвете шапки. Лучше всего — горизонтальный PNG с прозрачным фоном. Без логотипа в шапке будет название текстом."
                url={shop.logoUrl}
                aspect="wide"
                onUpload={uploadImage('logo')}
                onDelete={removeImage('logo')}
              />
              <ImageUploadField
                label="Фото витрины"
                hint="Квадрат рядом с заголовком на первом экране. Кадрируется по центру с прижимом к верху — главное держите в верхней части кадра. Без фото первый экран будет текстовым."
                url={shop.heroImageUrl}
                aspect="square"
                onUpload={uploadImage('hero')}
                onDelete={removeImage('hero')}
              />
            </div>
          </Section>

          <Section title="Тексты витрины">
            <label className={styles.label}>
              <span className={styles.labelRow}>
                <span>Заголовок</span>
                <Counter value={form.tagline} max={TAGLINE_MAX} />
              </span>
              <input
                type="text"
                name="tagline"
                value={form.tagline}
                onChange={setField}
                className={styles.input}
                maxLength={TAGLINE_MAX}
                placeholder="Свечи ручной работы из соевого воска"
                autoComplete="off"
              />
              <span className={styles.fieldHint}>Крупная строка на первом экране. Пусто — покажем название магазина.</span>
            </label>

            <label className={styles.label}>
              <span className={styles.labelRow}>
                <span>Описание</span>
                <Counter value={form.description} max={DESCRIPTION_MAX} />
              </span>
              <AutoTextarea
                name="description"
                minRows={3}
                value={form.description}
                onChange={setField}
                className={`${styles.input} ${styles.textarea}`}
                maxLength={DESCRIPTION_MAX}
                placeholder="Пара предложений о том, что вы делаете и чем ваши товары особенные"
              />
              <span className={styles.fieldHint}>Короткий текст под заголовком, рядом с фото витрины.</span>
            </label>

            <label className={styles.label}>
              <span className={styles.labelRow}>
                <span>О магазине</span>
                <Counter value={form.about} max={ABOUT_MAX} />
              </span>
              <AutoTextarea
                name="about"
                minRows={6}
                value={form.about}
                onChange={setField}
                className={`${styles.input} ${styles.textarea}`}
                maxLength={ABOUT_MAX}
                placeholder="История мастерской, материалы, сроки изготовления, как ухаживать за изделиями"
              />
              <span className={styles.fieldHint}>
                Блок «О магазине» под каталогом. Переносы строк сохраняются.
              </span>
            </label>
          </Section>

          <div className={styles.footActions}>
            <span className={`${styles.saveState} ${dirty ? styles.saveStateDirty : ''}`} role="status">
              {dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'}
            </span>
            <button type="submit" className={styles.saveBtn} disabled={saving || !dirty}>
              {saveLabel}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default AdminDesign;
