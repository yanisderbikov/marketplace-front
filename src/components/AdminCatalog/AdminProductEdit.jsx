import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  createProduct,
  deleteProduct,
  deleteProductPhoto,
  getProduct,
  reorderProductPhotos,
  updateProduct,
  uploadProductPhotos,
} from '../../services/merchantProducts';
import { errorMessage } from '../../shared/errors';
import { kopecksToRubInput, rubToKopecks } from '../../shared/money';
import UploadProgress from '../shared/UploadProgress';
import AutoTextarea from './AutoTextarea';
import ExternalLinkIcon from './ExternalLinkIcon';
import {
  CATALOG_PATH,
  catalogProductPath,
  createSerialQueue,
  moveItem,
  storefrontProductPath,
} from './catalogHelpers';
import styles from './AdminProductEdit.module.css';

const NEW_ID = 'new';

// Ограничения бэка (ProductSaveRequestDTO, S3FileStorage) — проверяем заранее,
// чтобы мерчант получил понятный текст, а не 400 после долгой загрузки.
const MIN_PRICE_KOPECKS = 100;
const MAX_NAME_LENGTH = 255;
const MAX_DIMENSION = 100000;
const MAX_PHOTOS = 20;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

const DIMENSION_FIELDS = [
  { key: 'weightGrams', label: 'Вес, г' },
  { key: 'lengthCm', label: 'Длина, см' },
  { key: 'widthCm', label: 'Ширина, см' },
  { key: 'heightCm', label: 'Высота, см' },
];

// Цены в форме — строки в рублях (как ввёл мерчант), на бэк уходят копейки.
const emptyForm = {
  name: '',
  description: '',
  price: '',
  crossedPrice: '',
  weightGrams: '',
  lengthCm: '',
  widthCm: '',
  heightCm: '',
  active: true,
  preorder: false,
  variants: [],
};

const intToInput = (value) => (value == null ? '' : String(value));

// Ключ строки варианта для React: у новых строк ещё нет id с сервера, а индекс
// как ключ путает фокус при удалении строки из середины. В payload не уходит.
let variantRowSeq = 0;
const newVariantRow = (fields) => {
  variantRowSeq += 1;
  return { rowKey: `variant-${variantRowSeq}`, id: '', label: '', price: '', ...fields };
};

// Строка варианта, которая уйдёт в payload (полностью пустые buildPayload отбрасывает).
const isFilledVariant = (v) => Boolean(v.label.trim() || v.price.trim());

/**
 * Строки вариантов из ответа сервера. rowKey берём у прежних строк — по id, а у
 * только что созданных (id ещё не было) по позиции среди отправленных: сервер
 * возвращает варианты в порядке запроса. Иначе после каждого сохранения все строки
 * перемонтировались бы и поле, в котором стоит курсор, теряло фокус.
 */
const variantRowsFromProduct = (variants, prevRows = []) => {
  const byId = new Map(prevRows.filter((r) => r.id).map((r) => [r.id, r]));
  const sentRows = prevRows.filter(isFilledVariant);
  const used = new Set();
  return (variants ?? []).map((v, index) => {
    const fields = { id: v.id ?? '', label: v.label ?? '', price: kopecksToRubInput(v.priceKopecks) };
    const prev = (v.id && byId.get(v.id)) || (!sentRows[index]?.id ? sentRows[index] : null);
    if (!prev || used.has(prev.rowKey)) return newVariantRow(fields);
    used.add(prev.rowKey);
    return { ...fields, rowKey: prev.rowKey };
  });
};

const formFromProduct = (p, prevRows) => ({
  name: p.name ?? '',
  description: p.description ?? '',
  price: kopecksToRubInput(p.priceKopecks),
  crossedPrice: kopecksToRubInput(p.crossedPriceKopecks),
  weightGrams: intToInput(p.weightGrams),
  lengthCm: intToInput(p.lengthCm),
  widthCm: intToInput(p.widthCm),
  heightCm: intToInput(p.heightCm),
  active: Boolean(p.active),
  preorder: Boolean(p.preorder),
  variants: variantRowsFromProduct(p.variants, prevRows),
});

/**
 * Мерчант правил форму, пока шло сохранение: его правки не затираем ответом сервера,
 * но строкам вариантов, которые сервер только что создал, проставляем id — иначе
 * следующее сохранение пересоздало бы их (новый id выкинул бы вариант из корзин).
 */
const withCreatedVariantIds = (form, sentRows, saved) => {
  const idByRowKey = new Map();
  sentRows.filter(isFilledVariant).forEach((row, index) => {
    const created = saved?.variants?.[index];
    if (!row.id && created?.id) idByRowKey.set(row.rowKey, created.id);
  });
  if (!idByRowKey.size) return form;
  return {
    ...form,
    variants: form.variants.map((row) =>
      !row.id && idByRowKey.has(row.rowKey) ? { ...row, id: idByRowKey.get(row.rowKey) } : row
    ),
  };
};

// Ответ сохранения → форма: из сервера, только если с отправки её не трогали (все
// правки идут через setForm(prev => …), поэтому «не трогали» = тот же объект).
const formAfterSave = (prev, sent, saved) =>
  prev === sent ? formFromProduct(saved, sent.variants) : withCreatedVariantIds(prev, sent.variants, saved);

// Скидка на витрине считается из цен (округление вниз, как в PublicProductDTO).
const discountPercent = (priceKopecks, crossedKopecks) => {
  if (priceKopecks == null || crossedKopecks == null || crossedKopecks <= priceKopecks) return null;
  return Math.floor(((crossedKopecks - priceKopecks) * 100) / crossedKopecks);
};

/**
 * Форма → ProductSaveRequestDTO. Возвращает { payload } или { error } с текстом
 * для тоста: проверки те же, что на бэке, чтобы не ловить 400 с английским полем.
 */
const buildPayload = (form) => {
  const name = form.name.trim();
  if (!name) return { error: 'Укажите название товара' };
  if (name.length > MAX_NAME_LENGTH) return { error: `Название — не длиннее ${MAX_NAME_LENGTH} символов` };

  const priceKopecks = rubToKopecks(form.price);
  if (priceKopecks == null) return { error: 'Цена: введите сумму в рублях, например 1190 или 1190,50' };
  if (priceKopecks < MIN_PRICE_KOPECKS) return { error: 'Цена — не меньше 1 ₽' };

  let crossedPriceKopecks = null;
  if (form.crossedPrice.trim()) {
    crossedPriceKopecks = rubToKopecks(form.crossedPrice);
    if (crossedPriceKopecks == null) {
      return { error: 'Зачёркнутая цена: введите сумму в рублях или оставьте поле пустым' };
    }
    if (crossedPriceKopecks <= priceKopecks) {
      return { error: 'Зачёркнутая цена должна быть больше основной' };
    }
  }

  const dimensions = {};
  for (const { key, label } of DIMENSION_FIELDS) {
    const raw = String(form[key] ?? '').trim();
    if (!raw) {
      dimensions[key] = null;
      continue;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > MAX_DIMENSION) {
      return { error: `${label}: целое число от 1 до 100 000 или пусто` };
    }
    dimensions[key] = value;
  }

  // Полностью пустые строки вариантов просто отбрасываем (как в anyforms).
  const variantRows = form.variants.filter(isFilledVariant);
  const variants = [];
  for (let i = 0; i < variantRows.length; i += 1) {
    const v = variantRows[i];
    const label = v.label.trim();
    const where = `Вариант ${i + 1}`;
    if (!label) return { error: `${where}: укажите название (например, «80 мл»)` };
    if (label.length > MAX_NAME_LENGTH) return { error: `${where}: название не длиннее ${MAX_NAME_LENGTH} символов` };
    const variantKopecks = rubToKopecks(v.price);
    if (variantKopecks == null) return { error: `${where}: введите цену в рублях` };
    if (variantKopecks < MIN_PRICE_KOPECKS) return { error: `${where}: цена не меньше 1 ₽` };
    variants.push({ id: v.id || null, label, priceKopecks: variantKopecks });
  }

  return {
    payload: {
      name,
      description: form.description.trim(),
      priceKopecks,
      crossedPriceKopecks,
      active: Boolean(form.active),
      preorder: Boolean(form.preorder),
      ...dimensions,
      variants,
    },
  };
};

const Section = ({ title, children, hint }) => (
  <section className={styles.card}>
    <h2 className={styles.cardTitle}>{title}</h2>
    {children}
    {hint && <p className={styles.hint}>{hint}</p>}
  </section>
);

const AdminProductEdit = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { shop } = useOutletContext() ?? {};
  const slug = shop?.slug;
  const isNew = !productId || productId === NEW_ID;

  const [product, setProduct] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(!isNew);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // { percent, index, count, filename }
  const [previewIndex, setPreviewIndex] = useState(0);
  const [dragIndex, setDragIndex] = useState(null);
  const photos = product?.photos ?? [];

  const productRef = useRef(product);
  productRef.current = product;

  // Операции с фото (порядок, удаление, загрузка) — строго по одному запросу;
  // ответ применяем, только если после него не было новой операции.
  const photoQueueRef = useRef(null);
  if (!photoQueueRef.current) photoQueueRef.current = createSerialQueue();
  const photoSeqRef = useRef(0);

  const runPhotoOp = (op) => {
    const seq = ++photoSeqRef.current;
    return photoQueueRef.current(op).then((saved) => {
      if (seq === photoSeqRef.current && saved) setProduct(saved);
      return saved;
    });
  };

  // Фото могли частично сохраниться (или порядок не применился) — берём правду с сервера.
  // Форму не трогаем: в ней могут быть несохранённые правки.
  const refreshPhotos = async () => {
    const seq = photoSeqRef.current;
    try {
      const fresh = await getProduct(productId);
      if (seq === photoSeqRef.current) setProduct(fresh);
    } catch {
      /* не страшно: ошибку уже показали тостом */
    }
  };

  useEffect(() => {
    if (isNew) {
      setProduct(null);
      setForm(emptyForm);
      setNotFound(false);
      setLoading(false);
      return undefined;
    }
    // Только что созданный товар уже на руках (ответ POST) — не перечитываем и не мигаем лоадером.
    if (productRef.current?.id === productId) return undefined;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    getProduct(productId)
      .then((data) => {
        if (cancelled) return;
        setProduct(data);
        setForm(formFromProduct(data));
        setPreviewIndex(0);
      })
      .catch((err) => {
        if (cancelled) return;
        // Товар не загрузился — редактировать нечего, показываем заглушку вместо пустой формы.
        setNotFound(true);
        // 400 — в адресе не uuid (бэк не смог разобрать id): для мерчанта это тот же «товар не найден».
        const status = err?.response?.status;
        if (status !== 404 && status !== 400) {
          toast.error(errorMessage(err, 'Не удалось загрузить товар'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, isNew]);

  // Карточка открыта из середины списка — показываем её с начала.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [productId]);

  const setField = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const addVariant = () =>
    setForm((prev) => ({ ...prev, variants: [...prev.variants, newVariantRow()] }));

  const changeVariant = (index, field, value) =>
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) => (i === index ? { ...v, [field]: value } : v)),
    }));

  const removeVariant = (index) =>
    setForm((prev) => ({ ...prev, variants: prev.variants.filter((_, i) => i !== index) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving || deleting) return;
    const { payload, error } = buildPayload(form);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    // Поля остаются редактируемыми во время запроса (Enter в поле отправляет форму,
    // а печатать можно дальше) — снимок нужен, чтобы ответ не затёр набранное.
    const sent = form;
    try {
      if (isNew) {
        const created = await createProduct(payload);
        setProduct(created);
        setForm((prev) => formAfterSave(prev, sent, created));
        toast.success('Товар создан — теперь можно загрузить фото');
        // Уходим на страницу созданного товара: там уже можно загрузить фото.
        navigate(catalogProductPath(created.id), { replace: true });
        return;
      }
      const saved = await updateProduct(productId, payload);
      // Фото этот PUT не меняет; если параллельно шла загрузка, её ответ свежее —
      // поэтому список фото оставляем свой.
      setProduct((prev) => (prev ? { ...saved, photos: prev.photos } : saved));
      setForm((prev) => formAfterSave(prev, sent, saved));
      toast.success('Товар сохранён');
    } catch (err) {
      toast.error(errorMessage(err, 'Не удалось сохранить товар'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isNew || deleting) return;
    const title = form.name.trim() || product?.name || 'без названия';
    if (
      !window.confirm(
        `Удалить товар «${title}»? Фото удалятся безвозвратно, в старых заказах останется только название.`
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await deleteProduct(productId);
      toast.success('Товар удалён');
      navigate(CATALOG_PATH, { replace: true, state: { backToList: true } });
    } catch (err) {
      toast.error(errorMessage(err, 'Не удалось удалить товар'));
      setDeleting(false);
    }
  };

  // Фото уходят из браузера сразу в S3 (presign → PUT), затем каждое привязывается к товару.
  const uploadPhotos = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || isNew) return;
    const wrongType = files.find((f) => !ALLOWED_PHOTO_TYPES.includes(f.type));
    if (wrongType) {
      toast.error(`«${wrongType.name}»: подойдёт JPG, PNG, WebP, GIF или AVIF`);
      return;
    }
    const tooBig = files.find((f) => f.size > MAX_PHOTO_BYTES);
    if (tooBig) {
      toast.error(`«${tooBig.name}» больше 10 МБ — уменьшите картинку`);
      return;
    }
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) {
      toast.error(
        room > 0
          ? `Можно добавить ещё ${room} фото — у товара не больше ${MAX_PHOTOS}`
          : `У товара уже ${MAX_PHOTOS} фото — это максимум`
      );
      return;
    }
    setUploading(true);
    setUploadProgress({ percent: 0, index: 0, count: files.length, filename: files[0].name });
    try {
      await runPhotoOp(() =>
        uploadProductPhotos(productId, files, (percent, meta) => setUploadProgress({ percent, ...meta }))
      );
      toast.success(files.length === 1 ? 'Фото загружено' : `Загружено фото: ${files.length}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Не удалось загрузить фото'));
      // Часть файлов могла успеть привязаться к товару — перечитываем карточку.
      refreshPhotos();
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const deletePhoto = async (photo) => {
    if (uploading || !window.confirm('Удалить это фото?')) return;
    // Убираем фото с экрана сразу, не дожидаясь ответа: иначе стрелка порядка,
    // нажатая до ответа, отправила бы набор с уже удалённым фото (сервер отклонит
    // 400), а повторный клик по крестику — второй DELETE (404). Ошибка — перечитаем.
    setProduct((prev) => (prev ? { ...prev, photos: prev.photos.filter((p) => p.id !== photo.id) } : prev));
    setPreviewIndex(0);
    try {
      await runPhotoOp(() => deleteProductPhoto(productId, photo.id));
      toast.success('Фото удалено');
    } catch (err) {
      toast.error(errorMessage(err, 'Не удалось удалить фото'));
      refreshPhotos();
    }
  };

  // Порядок задаём id фото: первое — главное фото на витрине.
  // На экране меняем сразу, запрос — в очередь.
  const saveOrder = (orderedPhotos) => {
    setProduct((prev) => ({ ...prev, photos: orderedPhotos }));
    runPhotoOp(() => reorderProductPhotos(productId, orderedPhotos.map((p) => p.id))).catch((err) => {
      toast.error(errorMessage(err, 'Не удалось изменить порядок фото'));
      refreshPhotos();
    });
  };

  const movePhoto = (from, to) => {
    // Пока идёт загрузка, новое фото ещё не в списке — порядок без него сервер не примет.
    if (uploading || to < 0 || to >= photos.length || from === to) return;
    setPreviewIndex(to);
    saveOrder(moveItem(photos, from, to));
  };

  const handleDrop = (targetIndex) => {
    const from = dragIndex;
    setDragIndex(null);
    if (from === null || from === targetIndex) return;
    movePhoto(from, targetIndex);
  };

  const uploadInputRef = useRef(null);
  const uploadInput = (
    <input
      ref={uploadInputRef}
      type="file"
      accept={ALLOWED_PHOTO_TYPES.join(',')}
      multiple
      hidden
      disabled={uploading}
      onChange={(e) => {
        uploadPhotos(e.target.files);
        e.target.value = '';
      }}
    />
  );

  if (loading) {
    return <p className={styles.message}>Загрузка товара…</p>;
  }

  if (notFound) {
    return (
      <div className={styles.wrap}>
        <p className={styles.message}>Товар не найден.</p>
        <Link className={styles.backLink} to={CATALOG_PATH} state={{ backToList: true }}>← Все товары</Link>
      </div>
    );
  }

  const preview = photos.length > 0 ? Math.min(previewIndex, photos.length - 1) : 0;
  const photosFull = photos.length >= MAX_PHOTOS;
  const discount = discountPercent(rubToKopecks(form.price), rubToKopecks(form.crossedPrice));
  // Ссылка на витрину — по сохранённому состоянию: выключенный товар там не откроется.
  const storefrontHref = !isNew && slug && product?.active ? storefrontProductPath(slug, productId) : null;
  const busy = saving || deleting;

  return (
    <div className={styles.wrap}>
      <Link className={styles.backLink} to={CATALOG_PATH} state={{ backToList: true }}>← Все товары</Link>

      <form onSubmit={handleSubmit}>
        <header className={styles.pageHead}>
          <div className={styles.headTitles}>
            <h1 className={styles.title}>{isNew ? 'Новый товар' : (form.name || 'Без названия')}</h1>
            <div className={styles.headBadges}>
              {!form.active && <span className={`${styles.badge} ${styles.badgeOff}`}>выключен</span>}
              {form.preorder && <span className={`${styles.badge} ${styles.badgePreorder}`}>предзаказ</span>}
              {storefrontHref && (
                <a
                  className={styles.storefrontLink}
                  href={storefrontHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Открыть товар на витрине"
                >
                  <ExternalLinkIcon size={13} />
                  <span>на витрине</span>
                </a>
              )}
            </div>
          </div>
          <button type="submit" className={styles.saveBtn} disabled={busy}>
            {saving ? 'Сохранение…' : isNew ? 'Создать товар' : 'Сохранить'}
          </button>
        </header>

        <Section
          title="Фотографии"
          hint={
            isNew
              ? 'Фото можно загрузить после создания товара.'
              : photos.length > 0
                ? `Первая миниатюра — главное фото на витрине. Перетащите миниатюру или используйте стрелки, чтобы поменять порядок. Крестик удаляет фото. До ${MAX_PHOTOS} фото, JPG, PNG, WebP, GIF или AVIF до 10 МБ.`
                : `Нажмите на квадрат с плюсом, чтобы загрузить фото. Можно сразу несколько (до ${MAX_PHOTOS}, JPG, PNG, WebP, GIF или AVIF до 10 МБ).`
          }
        >
          {isNew ? (
            <div className={styles.galleryEmpty}>Сначала создайте товар</div>
          ) : (
            <>
              {photos.length > 0 && (
                <div className={styles.galleryMain}>
                  <img src={photos[preview].url} alt="" />
                  {preview === 0 && <span className={styles.mainTag}>главное фото</span>}
                </div>
              )}
              <div className={styles.thumbs}>
                {photos.map((photo, index) => (
                  <div
                    key={photo.id}
                    className={`${styles.thumb} ${index === preview ? styles.thumbActive : ''} ${
                      index === dragIndex ? styles.thumbDragging : ''
                    }`}
                    draggable={!uploading}
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(index)}
                    onDragEnd={() => setDragIndex(null)}
                    title="Перетащите, чтобы поменять порядок"
                  >
                    <img src={photo.url} alt="" onClick={() => setPreviewIndex(index)} />
                    <button
                      type="button"
                      className={styles.thumbRemove}
                      title="Удалить фото"
                      disabled={uploading}
                      onClick={() => deletePhoto(photo)}
                    >
                      ×
                    </button>
                    <span className={styles.thumbMove}>
                      <button
                        type="button"
                        disabled={uploading || index === 0}
                        title="Левее"
                        onClick={() => movePhoto(index, index - 1)}
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        disabled={uploading || index === photos.length - 1}
                        title="Правее"
                        onClick={() => movePhoto(index, index + 1)}
                      >
                        ›
                      </button>
                    </span>
                  </div>
                ))}
                {(!photosFull || uploading) && (
                  <button
                    type="button"
                    className={styles.thumbAdd}
                    title="Добавить фото"
                    disabled={uploading}
                    onClick={() => uploadInputRef.current?.click()}
                  >
                    {uploading ? `${Math.round(uploadProgress?.percent ?? 0)}%` : '+'}
                  </button>
                )}
                {uploadInput}
              </div>
              {uploading && (
                <UploadProgress className={styles.uploadProgress} progress={uploadProgress} />
              )}
            </>
          )}
        </Section>

        <Section title="Основное">
          <label className={styles.label}>
            Название *
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={setField}
              className={styles.input}
              maxLength={MAX_NAME_LENGTH}
              placeholder="Например, кружка «Утро»"
            />
          </label>
          <label className={styles.label}>
            Описание
            <AutoTextarea
              name="description"
              minRows={7}
              value={form.description}
              onChange={setField}
              className={`${styles.input} ${styles.textarea}`}
              placeholder="Материал, размеры, уход — всё, что покупатель захочет знать до заказа"
            />
          </label>
        </Section>

        <Section
          title="Цена"
          hint="В рублях, можно с копейками: 1190 или 1190,50. Зачёркнутая — старая цена; скидка на витрине посчитается сама."
        >
          <div className={styles.row3}>
            <label className={styles.label}>
              Цена, ₽ *
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                name="price"
                value={form.price}
                onChange={setField}
                className={styles.input}
                placeholder="890"
              />
            </label>
            <label className={styles.label}>
              Зачёркнутая, ₽
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                name="crossedPrice"
                value={form.crossedPrice}
                onChange={setField}
                className={styles.input}
                placeholder="1190"
              />
            </label>
            <label className={styles.label}>
              Скидка
              <input
                type="text"
                value={discount != null ? `${discount}%` : '—'}
                readOnly
                tabIndex={-1}
                className={`${styles.input} ${styles.inputReadonly}`}
                title="Считается из цены и зачёркнутой цены"
              />
            </label>
          </div>
        </Section>

        <Section
          title="Вес и габариты для доставки"
          hint="Нужны для расчёта стоимости доставки СДЭК на чекауте: вес и размеры одной единицы товара в упаковке. Заполните их, чтобы покупатель видел точную цену доставки."
        >
          <div className={styles.row4}>
            {DIMENSION_FIELDS.map(({ key, label }) => (
              <label key={key} className={styles.label}>
                {label}
                <input
                  type="number"
                  min="1"
                  max={MAX_DIMENSION}
                  step="1"
                  inputMode="numeric"
                  name={key}
                  value={form[key]}
                  onChange={setField}
                  className={styles.input}
                  placeholder={key === 'weightGrams' ? '300' : '15'}
                />
              </label>
            ))}
          </div>
        </Section>

        <Section
          title="Варианты (размер / объём — цена)"
          hint="Без вариантов товар продаётся по основной цене. С вариантами покупатель выбирает один из них, и в заказ позиция уходит с названием и ценой варианта."
        >
          {form.variants.map((v, index) => (
            <div key={v.rowKey} className={styles.variantRow}>
              <input
                type="text"
                value={v.label}
                onChange={(e) => changeVariant(index, 'label', e.target.value)}
                className={styles.input}
                maxLength={MAX_NAME_LENGTH}
                placeholder="80 мл"
                aria-label={`Вариант ${index + 1}: название`}
              />
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={v.price}
                onChange={(e) => changeVariant(index, 'price', e.target.value)}
                className={`${styles.input} ${styles.variantPrice}`}
                placeholder="1990 ₽"
                aria-label={`Вариант ${index + 1}: цена в рублях`}
              />
              <button
                type="button"
                className={styles.variantRemove}
                title="Удалить вариант"
                onClick={() => removeVariant(index)}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className={styles.addBtn} onClick={addVariant}>
            + Добавить вариант
          </button>
        </Section>

        <Section title="Доступность">
          <label className={styles.checkLabel}>
            <input type="checkbox" name="active" checked={form.active} onChange={setField} />
            Активен (виден на витрине и доступен к продаже)
          </label>
          <label className={styles.checkLabel}>
            <input type="checkbox" name="preorder" checked={form.preorder} onChange={setField} />
            Предзаказ (плашка и пояснение на витрине)
          </label>
        </Section>

        {!isNew && (
          <Section title="Служебное">
            <p className={styles.idLine}>ID: <code>{productId}</code></p>
          </Section>
        )}

        <div className={styles.footActions}>
          {!isNew && (
            <button type="button" className={styles.deleteBtn} onClick={handleDelete} disabled={busy}>
              {deleting ? 'Удаление…' : 'Удалить товар'}
            </button>
          )}
          <Link className={styles.cancelBtn} to={CATALOG_PATH} state={{ backToList: true }}>К списку</Link>
          <button type="submit" className={styles.saveBtn} disabled={busy}>
            {saving ? 'Сохранение…' : isNew ? 'Создать товар' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminProductEdit;
