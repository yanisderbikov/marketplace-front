import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import PvzSelect from '../shared/PvzSelect/PvzSelect';
import { saveCdek, saveSettings } from '../../services/merchantShop';
import { errorMessage } from '../../shared/errors';
import DomainSettings from './DomainSettings';
import PaymentProviderCards from './PaymentProviderCards';
import { providerByCode } from './paymentProviders';
import { legacyTaxLabel, outdatedReceiptSettings } from './receiptOptions';
import styles from './AdminSettings.module.css';

// Якоря секций: на них ведут пункты статуса готовности (и ссылки вида
// /admin/settings#settings-payment).
const SECTION_IDS = {
  contacts: 'settings-contacts',
  seller: 'settings-seller',
  delivery: 'settings-delivery',
  payment: 'settings-payment',
  domain: 'settings-domain',
};

// Чего не хватает для приёма заказов (MerchantShopDTO.missingForOrders, порядок
// бэка: PAYMENT, DELIVERY, SELLER) — человеческим текстом и с секцией, где это чинится.
const READINESS_STEPS = [
  {
    code: 'PAYMENT',
    title: 'Оплата',
    todo: 'подключите Т-Банк или ЮKassa',
    done: 'подключена',
    anchor: SECTION_IDS.payment,
  },
  {
    code: 'DELIVERY',
    title: 'Доставка СДЭК',
    todo: 'подключите свой аккаунт СДЭК и выберите пункт отправки',
    done: 'аккаунт подключён, пункт выбран',
    anchor: SECTION_IDS.delivery,
  },
  {
    code: 'SELLER',
    title: 'Данные продавца',
    todo: 'укажите название или ФИО и ИНН',
    done: 'заполнены',
    anchor: SECTION_IDS.seller,
  },
];

// Те же правила, что у бэка (PUT /api/merchant/shop/settings): проверяем заранее,
// чтобы показать ошибку у поля, а не одним тостом на всю форму.
const TELEGRAM_RE = /^[A-Za-z0-9_]{4,64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// «@my_shop», «t.me/my_shop», «https://t.me/my_shop» → «my_shop»: бэк хранит ник
// без @, а мерчанты чаще всего вставляют ссылку на профиль.
const normalizeTelegram = (value) =>
  String(value ?? '')
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.me\//i, '')
    .replace(/^@+/, '')
    .replace(/[/?#].*$/, '');

const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '');

// Пустое поле → null: так бэк понимает «не задано».
const textOrNull = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
};

const settingsFromShop = (shop) => ({
  supportTelegram: shop?.supportTelegram ?? '',
  contactEmail: shop?.contactEmail ?? '',
  contactPhone: shop?.contactPhone ?? '',
  sellerName: shop?.sellerName ?? '',
  sellerInn: shop?.sellerInn ?? '',
  sellerOgrn: shop?.sellerOgrn ?? '',
  sellerAddress: shop?.sellerAddress ?? '',
});

const settingsPayload = (form, cdekFromPvzCode) => ({
  supportTelegram: textOrNull(normalizeTelegram(form.supportTelegram)),
  contactEmail: textOrNull(form.contactEmail),
  contactPhone: textOrNull(form.contactPhone),
  sellerName: textOrNull(form.sellerName),
  sellerInn: textOrNull(form.sellerInn),
  sellerOgrn: textOrNull(form.sellerOgrn),
  sellerAddress: textOrNull(form.sellerAddress),
  cdekFromPvzCode: cdekFromPvzCode || null,
});

const validateSettings = (form) => {
  const errors = {};
  const telegram = normalizeTelegram(form.supportTelegram);
  if (telegram && !TELEGRAM_RE.test(telegram)) {
    errors.supportTelegram = 'Ник Telegram: латиница, цифры и «_», от 4 символов';
  }
  const email = form.contactEmail.trim();
  if (email && !EMAIL_RE.test(email)) {
    errors.contactEmail = 'Проверьте адрес почты';
  }
  const phoneDigits = digitsOnly(form.contactPhone);
  if (form.contactPhone.trim() && (phoneDigits.length < 10 || phoneDigits.length > 15)) {
    errors.contactPhone = 'Телефон — от 10 до 15 цифр';
  }
  const inn = form.sellerInn.trim();
  if (inn && !/^(\d{10}|\d{12})$/.test(inn)) {
    errors.sellerInn = 'ИНН — 10 цифр у организации или 12 у ИП и самозанятого';
  }
  const ogrn = form.sellerOgrn.trim();
  if (ogrn && !/^(\d{13}|\d{15})$/.test(ogrn)) {
    errors.sellerOgrn = 'ОГРН — 13 цифр, ОГРНИП — 15';
  }
  return errors;
};

// Ключи СДЭК: Secure password наружу не отдаётся — поле всегда пустое,
// пусто = «оставить сохранённый» (если Account не менялся).
const cdekFromShop = (shop) => ({
  clientId: shop?.cdekClientId ?? '',
  clientSecret: '',
});

const cdekConnectedOf = (shop) => Boolean(shop?.cdekClientId) && Boolean(shop?.cdekSecretSet);

const validateCdek = (form, shop) => {
  const errors = {};
  const clientId = form.clientId.trim();
  const clientSecret = form.clientSecret.trim();
  if (!clientId) {
    if (clientSecret) errors.clientId = 'Укажите Account — без него Secure password не сохранить';
  } else if (/\s/.test(clientId)) {
    errors.clientId = 'Account — без пробелов';
  } else if (!clientSecret) {
    // Secure password выдаётся под конкретный Account — от другого не подойдёт.
    const idChanged = clientId !== (shop.cdekClientId ?? '');
    if (idChanged || !shop.cdekSecretSet) errors.clientSecret = 'Введите Secure password';
  }
  return errors;
};

const cdekPayload = (form) => ({
  // Пустой Account — бэк сбрасывает и его, и секрет (СДЭК отключён).
  clientId: form.clientId.trim(),
  clientSecret: form.clientSecret.trim() || null,
});

const sameCdekAsSaved = (form, shop) =>
  form.clientId.trim() === (shop.cdekClientId ?? '') && !form.clientSecret.trim();

const scrollToSection = (id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Фокус на первое поле секции: с клавиатуры сразу можно вводить.
  const field = el.querySelector('input, select, textarea, button');
  field?.focus({ preventScroll: true });
};

const Section = ({ id, title, badge, children, hint }) => (
  <section id={id} className={styles.card}>
    <div className={styles.cardHead}>
      <h2 className={styles.cardTitle}>{title}</h2>
      {badge}
    </div>
    {children}
    {hint && <p className={styles.hint}>{hint}</p>}
  </section>
);

const FieldError = ({ message }) => (message ? <span className={styles.fieldError}>{message}</span> : null);

/**
 * Статус готовности сверху страницы: что ещё мешает витрине принимать заказы,
 * со ссылками на нужные секции. Выключенный супер-админом магазин настройками
 * не починить — для него отдельный текст.
 */
const ReadinessStatus = ({ shop }) => {
  const missing = new Set(shop.missingForOrders || []);
  const outdatedReceipt = outdatedReceiptSettings(shop);
  // Платёжка подключена, но в её чеке устаревшая ставка — «подключите оплату» тут неправда.
  // Доставка: называем то, чего не хватает — аккаунта СДЭК, пункта отправки или обоих.
  const todoText = (step) => {
    if (step.code === 'DELIVERY') {
      if (cdekConnectedOf(shop)) return 'выберите пункт, откуда отправляете заказы';
      return shop.cdekFromPvzCode ? 'подключите свой аккаунт СДЭК' : step.todo;
    }
    if (step.code !== 'PAYMENT' || !outdatedReceipt) return step.todo;
    return outdatedReceipt.tax
      ? `выберите заново ставку НДС для чека — «${legacyTaxLabel(outdatedReceipt.tax)}» больше не действует`
      : 'выберите заново систему налогообложения для чека';
  };

  if (shop.acceptsOrders) {
    return (
      <div className={`${styles.status} ${styles.statusOk}`} role="status">
        <p className={styles.statusTitle}>Витрина принимает заказы</p>
        <p className={styles.statusText}>
          Оплата, доставка СДЭК и данные продавца на месте — покупатели могут оформлять и оплачивать заказы.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`${styles.status} ${shop.active ? styles.statusWarn : styles.statusOff}`}
      role="status"
    >
      {shop.active ? (
        <p className={styles.statusTitle}>Витрина пока не принимает заказы</p>
      ) : (
        <>
          <p className={styles.statusTitle}>Витрина отключена администратором платформы</p>
          <p className={styles.statusText}>Покупатели её не видят, заказы не принимаются.</p>
        </>
      )}
      {missing.size > 0 && (
        <ul className={styles.steps}>
          {READINESS_STEPS.map((step) => {
            const todo = missing.has(step.code);
            return (
              <li key={step.code} className={`${styles.step} ${todo ? '' : styles.stepDone}`}>
                <span className={styles.stepMark} aria-hidden="true">{todo ? '•' : '✓'}</span>
                <span className={styles.stepBody}>
                  <strong>{step.title}</strong>
                  {todo ? (
                    <>
                      {': '}
                      <a
                        href={`#${step.anchor}`}
                        className={styles.stepLink}
                        onClick={(e) => {
                          e.preventDefault();
                          scrollToSection(step.anchor);
                        }}
                      >
                        {todoText(step)}
                      </a>
                    </>
                  ) : (
                    ` — ${step.code === 'PAYMENT' && providerByCode(shop.paymentProvider)
                      ? `через ${providerByCode(shop.paymentProvider).name}`
                      : step.done}`
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

/**
 * Вкладка «Настройки»: контакты и продавец (одна форма), доставка — ключи своего
 * аккаунта СДЭК (своя форма) и ПВЗ отправки (сохраняется сразу при выборе) — и плашки
 * платёжек (Т-Банк, ЮKassa); их ключи — на отдельной странице подключения. Все ручки
 * отдают свежий MerchantShopDTO — кладём его в контекст кабинета (setShop),
 * чтобы статус готовности и плашки на других вкладках обновились без перезагрузки.
 * Формы заполняются из магазина при открытии и после своего сохранения:
 * сохранение одной формы не затирает несохранённые правки в другой.
 */
const AdminSettings = () => {
  const { shop, setShop, setLeaveGuard } = useOutletContext();
  const location = useLocation();

  const [settingsForm, setSettingsForm] = useState(() => settingsFromShop(shop));
  const [settingsErrors, setSettingsErrors] = useState({});
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [cdekForm, setCdekForm] = useState(() => cdekFromShop(shop));
  const [cdekErrors, setCdekErrors] = useState({});
  const [cdekSaving, setCdekSaving] = useState(false);

  const [pvzEditing, setPvzEditing] = useState(false);
  const [pvzSaving, setPvzSaving] = useState(false);

  const shopRef = useRef(shop);
  shopRef.current = shop;
  const shopId = shop?.id;
  // Контакты и ПВЗ уходят в одну ручку PUT /settings, и она заменяет всё целиком:
  // два запроса сразу (выбрали ПВЗ и, не дождавшись, нажали «Сохранить») затёрли бы
  // друг друга тем, что сохранил второй. Поэтому пока летит один — второй не шлём.
  const settingsBusy = settingsSaving || pvzSaving;

  // Другой магазин (после перезагрузки кабинета) — формы с нуля.
  useEffect(() => {
    setSettingsForm(settingsFromShop(shopRef.current));
    setCdekForm(cdekFromShop(shopRef.current));
    setSettingsErrors({});
    setCdekErrors({});
    setPvzEditing(false);
  }, [shopId]);

  // Пришли по ссылке с якорем (/admin/settings#settings-payment) — листаем к секции.
  useEffect(() => {
    const id = location.hash.replace(/^#/, '');
    if (!id || !Object.values(SECTION_IDS).includes(id)) return undefined;
    const timer = setTimeout(() => scrollToSection(id), 0);
    return () => clearTimeout(timer);
  }, [location.hash]);

  const settingsDirty = Boolean(shop) && JSON.stringify(settingsPayload(settingsForm))
    !== JSON.stringify(settingsPayload(settingsFromShop(shop)));
  const cdekDirty = Boolean(shop) && !sameCdekAsSaved(cdekForm, shop);
  const dirty = settingsDirty || cdekDirty;

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

  // ---------- Контакты и продавец ----------

  const setSettingsField = (e) => {
    const { name, value } = e.target;
    setSettingsForm((prev) => ({ ...prev, [name]: value }));
    setSettingsErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  };

  // ИНН и ОГРН — только цифры: пробелы и дефисы из выписки отбрасываем при вводе.
  const setDigitsField = (e) => {
    const { name, value } = e.target;
    setSettingsForm((prev) => ({ ...prev, [name]: digitsOnly(value) }));
    setSettingsErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  };

  const handleTelegramBlur = () => {
    setSettingsForm((prev) => ({ ...prev, supportTelegram: normalizeTelegram(prev.supportTelegram) }));
  };

  const handleSettingsSubmit = async (e) => {
    e.preventDefault();
    if (settingsBusy) return;
    const errors = validateSettings(settingsForm);
    setSettingsErrors(errors);
    const firstError = Object.values(errors).find(Boolean);
    if (firstError) {
      toast.error(firstError);
      return;
    }
    setSettingsSaving(true);
    // Что отправили: если мерчант правил форму, пока шёл запрос, ответ сервера
    // его правки не затирает (форма меняется только через setSettingsForm(prev => …),
    // поэтому «не трогали» = тот же объект).
    const sent = settingsForm;
    try {
      // ПВЗ отправки в этой форме не меняется — отправляем сохранённый, свежий
      // на момент отправки (shopRef), а не из замыкания рендера.
      const updated = await saveSettings(settingsPayload(sent, shopRef.current?.cdekFromPvzCode));
      setShop(updated);
      setSettingsForm((prev) => (prev === sent ? settingsFromShop(updated) : prev));
      toast.success('Контакты и данные продавца сохранены');
    } catch (err) {
      toast.error(errorMessage(err, 'Не удалось сохранить настройки'));
    } finally {
      setSettingsSaving(false);
    }
  };

  // ---------- Доставка ----------

  const setCdekField = (e) => {
    const { name, value } = e.target;
    setCdekForm((prev) => ({ ...prev, [name]: value }));
    setCdekErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  };

  const handleCdekSubmit = async (e) => {
    e.preventDefault();
    if (cdekSaving) return;
    const errors = validateCdek(cdekForm, shop);
    setCdekErrors(errors);
    const firstError = Object.values(errors).find(Boolean);
    if (firstError) {
      toast.error(firstError);
      return;
    }
    const disconnecting = !cdekForm.clientId.trim() && Boolean(shop.cdekClientId);
    if (
      disconnecting
      && !window.confirm('Отключить СДЭК? Ключи будут удалены, витрина перестанет принимать заказы.')
    ) {
      return;
    }
    setCdekSaving(true);
    const sent = cdekForm;
    try {
      const updated = await saveCdek(cdekPayload(sent));
      setShop(updated);
      // Правки, сделанные во время запроса, не затираем (см. handleSettingsSubmit).
      setCdekForm((prev) => (prev === sent ? cdekFromShop(updated) : prev));
      toast.success(disconnecting ? 'СДЭК отключён' : 'Ключи СДЭК проверены и сохранены');
    } catch (err) {
      toast.error(errorMessage(err, 'Не удалось сохранить ключи СДЭК'));
    } finally {
      setCdekSaving(false);
    }
  };

  const cdekConnected = cdekConnectedOf(shop);

  // ПВЗ сохраняется сразу при выборе. Контакты и продавец уходят в том же запросе
  // (ручка общая), но сохранённые, а не из формы: несохранённые правки там
  // остаются правками и сохраняются своей кнопкой.
  const handlePvzSelect = async ({ pvzCode }) => {
    if (settingsBusy) return;
    setPvzSaving(true);
    try {
      const updated = await saveSettings(settingsPayload(settingsFromShop(shopRef.current), pvzCode));
      setShop(updated);
      setPvzEditing(false);
      toast.success('Пункт отправки сохранён');
    } catch (err) {
      toast.error(errorMessage(err, 'Не удалось сохранить пункт отправки'));
    } finally {
      setPvzSaving(false);
    }
  };

  const savedPvz = shop.cdekFromPvzCode
    ? {
      pvzCode: shop.cdekFromPvzCode,
      pvzCity: shop.cdekFromCity ?? '',
      pvzStreet: shop.cdekFromAddress ?? '',
    }
    : null;

  return (
    <div className={styles.wrap}>
      <header className={styles.pageHead}>
        <h1 className={styles.title}>настройки</h1>
        <p className={styles.subtitle}>Контакты, данные продавца, доставка СДЭК, оплата и свой домен витрины.</p>
      </header>

      <ReadinessStatus shop={shop} />

      <form onSubmit={handleSettingsSubmit} noValidate>
        <Section
          id={SECTION_IDS.contacts}
          title="Контакты"
          hint="Покупатели увидят контакты в подвале витрины и в письме о заказе. Всё необязательно, но хотя бы один способ связи лучше оставить."
        >
          <label className={styles.label}>
            <span><span className={styles.keepCase}>Telegram</span> для вопросов</span>
            <span className={`${styles.prefixField} ${settingsErrors.supportTelegram ? styles.inputError : ''}`}>
              <span className={styles.prefix} aria-hidden="true">@</span>
              <input
                type="text"
                name="supportTelegram"
                value={settingsForm.supportTelegram}
                onChange={setSettingsField}
                onBlur={handleTelegramBlur}
                className={styles.prefixInput}
                placeholder="my_shop"
                maxLength={128}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(settingsErrors.supportTelegram)}
              />
            </span>
            <FieldError message={settingsErrors.supportTelegram} />
          </label>
          <div className={styles.row}>
            <label className={styles.label}>
              Почта
              <input
                type="email"
                name="contactEmail"
                value={settingsForm.contactEmail}
                onChange={setSettingsField}
                className={`${styles.input} ${settingsErrors.contactEmail ? styles.inputError : ''}`}
                placeholder="shop@example.ru"
                maxLength={255}
                autoComplete="email"
                aria-invalid={Boolean(settingsErrors.contactEmail)}
              />
              <FieldError message={settingsErrors.contactEmail} />
            </label>
            <label className={styles.label}>
              Телефон
              <input
                type="tel"
                name="contactPhone"
                value={settingsForm.contactPhone}
                onChange={setSettingsField}
                className={`${styles.input} ${settingsErrors.contactPhone ? styles.inputError : ''}`}
                placeholder="+7 900 000-00-00"
                maxLength={32}
                autoComplete="tel"
                aria-invalid={Boolean(settingsErrors.contactPhone)}
              />
              <FieldError message={settingsErrors.contactPhone} />
            </label>
          </div>
        </Section>

        <Section
          id={SECTION_IDS.seller}
          title="Продавец"
          hint="Название (или ФИО) и ИНН нужны для приёма заказов: покупатель видит, у кого покупает, — в подвале витрины и в оферте."
        >
          <label className={styles.label}>
            Название или ФИО
            <input
              type="text"
              name="sellerName"
              value={settingsForm.sellerName}
              onChange={setSettingsField}
              className={styles.input}
              placeholder="ИП Иванова Анна Сергеевна"
              maxLength={255}
              autoComplete="organization"
            />
          </label>
          <div className={styles.row}>
            <label className={styles.label}>
              <span className={styles.keepCase}>ИНН</span>
              <input
                type="text"
                inputMode="numeric"
                name="sellerInn"
                value={settingsForm.sellerInn}
                onChange={setDigitsField}
                className={`${styles.input} ${settingsErrors.sellerInn ? styles.inputError : ''}`}
                placeholder="10 или 12 цифр"
                maxLength={12}
                autoComplete="off"
                aria-invalid={Boolean(settingsErrors.sellerInn)}
              />
              <FieldError message={settingsErrors.sellerInn} />
            </label>
            <label className={styles.label}>
              <span className={styles.keepCase}>ОГРН / ОГРНИП</span>
              <input
                type="text"
                inputMode="numeric"
                name="sellerOgrn"
                value={settingsForm.sellerOgrn}
                onChange={setDigitsField}
                className={`${styles.input} ${settingsErrors.sellerOgrn ? styles.inputError : ''}`}
                placeholder="13 или 15 цифр"
                maxLength={15}
                autoComplete="off"
                aria-invalid={Boolean(settingsErrors.sellerOgrn)}
              />
              <FieldError message={settingsErrors.sellerOgrn} />
            </label>
          </div>
          <label className={styles.label}>
            Адрес
            <input
              type="text"
              name="sellerAddress"
              value={settingsForm.sellerAddress}
              onChange={setSettingsField}
              className={styles.input}
              placeholder="г. Москва, ул. Примерная, д. 1"
              maxLength={512}
              autoComplete="street-address"
            />
          </label>
        </Section>

        <div className={styles.formActions}>
          {settingsDirty && <span className={styles.dirtyNote}>Есть несохранённые изменения</span>}
          <button type="submit" className={styles.saveBtn} disabled={settingsBusy || !settingsDirty}>
            {settingsSaving ? 'Сохранение…' : 'Сохранить контакты и продавца'}
          </button>
        </div>
      </form>

      <Section
        id={SECTION_IDS.delivery}
        title={<>Доставка — <span className={styles.keepCase}>СДЭК</span></>}
        badge={
          cdekConnected && savedPvz
            ? <span className={`${styles.badge} ${styles.badgeOk}`}>подключено</span>
            : (
              <span className={`${styles.badge} ${styles.badgeOff}`}>
                {cdekConnected ? 'выберите пункт' : 'не подключено'}
              </span>
            )
        }
        hint="Доставку покупатель оплачивает при получении — в сумму оплаты на витрине она не входит."
      >
        <form className={styles.subForm} onSubmit={handleCdekSubmit} noValidate>
          <p className={styles.lead}>
            Стоимость доставки на витрине считаем по тарифам вашего договора со СДЭК — через ваш аккаунт.
            Посылки вы отправляете от своего имени, как обычно.
          </p>

          <details className={styles.help}>
            <summary className={styles.helpSummary}>
              Где взять <span className={styles.keepCase}>Account</span> и <span className={styles.keepCase}>Secure password</span>
            </summary>
            <ol className={styles.helpList}>
              <li>Ключи выдаются по договору со СДЭК для интернет-магазина (ИП или организация).</li>
              <li>Откройте личный кабинет СДЭК → раздел «Интеграция».</li>
              <li>
                Создайте ключи для API и скопируйте <strong>боевые</strong> Account и Secure password —
                с тестовыми стоимость доставки не посчитается.
              </li>
            </ol>
            <p className={styles.helpNote}>
              При сохранении мы проверим ключи в СДЭК. Secure password хранится в зашифрованном виде
              и никому не показывается.
            </p>
          </details>

          <div className={styles.row}>
            <label className={styles.label}>
              <span className={styles.keepCase}>Account</span>
              <input
                type="text"
                name="clientId"
                value={cdekForm.clientId}
                onChange={setCdekField}
                className={`${styles.input} ${styles.mono} ${cdekErrors.clientId ? styles.inputError : ''}`}
                placeholder="идентификатор из кабинета СДЭК"
                maxLength={128}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(cdekErrors.clientId)}
              />
              <FieldError message={cdekErrors.clientId} />
            </label>
            <label className={styles.label}>
              <span className={styles.keepCase}>Secure password</span>
              <input
                type="password"
                name="clientSecret"
                value={cdekForm.clientSecret}
                onChange={setCdekField}
                className={`${styles.input} ${cdekErrors.clientSecret ? styles.inputError : ''}`}
                placeholder={shop.cdekSecretSet ? '••••••••, сохранён' : 'пароль из кабинета СДЭК'}
                maxLength={256}
                autoComplete="new-password"
                spellCheck={false}
                aria-invalid={Boolean(cdekErrors.clientSecret)}
              />
              <FieldError message={cdekErrors.clientSecret} />
              {shop.cdekSecretSet && !cdekErrors.clientSecret && (
                <span className={styles.fieldHint}>Оставьте пустым, чтобы не менять сохранённый.</span>
              )}
            </label>
          </div>

          <div className={styles.cardActions}>
            {cdekDirty && <span className={styles.dirtyNote}>Есть несохранённые изменения</span>}
            <button type="submit" className={styles.saveBtn} disabled={cdekSaving || !cdekDirty}>
              {cdekSaving ? 'Проверяем в СДЭК…' : 'Сохранить ключи СДЭК'}
            </button>
          </div>
        </form>

        {/* Не .label: подпись строчными, а адрес выбранного пункта — как есть. */}
        <div className={`${styles.field} ${styles.subBlock}`}>
          <label htmlFor="pvz" className={styles.fieldLabel}>
            Пункт <span className={styles.keepCase}>СДЭК</span>, откуда вы отправляете заказы
          </label>
          <PvzSelect
            selected={pvzEditing ? null : savedPvz}
            onSelect={handlePvzSelect}
            onClear={() => setPvzEditing(true)}
            disabled={settingsBusy}
          />
          <span className={styles.fieldHint}>От этого пункта считаем стоимость доставки до покупателя.</span>
          {pvzSaving && <span className={styles.fieldHint}>Сохраняем пункт…</span>}
          {settingsSaving && <span className={styles.fieldHint}>Дождитесь сохранения контактов…</span>}
          {pvzEditing && savedPvz && !pvzSaving && (
            <button type="button" className={styles.linkBtn} onClick={() => setPvzEditing(false)}>
              Оставить прежний пункт
            </button>
          )}
        </div>
      </Section>

      <Section
        id={SECTION_IDS.payment}
        title="Оплата"
        hint="Деньги покупателей приходят прямо на ваш счёт — платформа их не касается. Подключить можно обе платёжки, оплату витрина принимает через одну."
      >
        <PaymentProviderCards shop={shop} setShop={setShop} />
      </Section>

      <Section id={SECTION_IDS.domain} title="Свой домен">
        <DomainSettings shop={shop} setShop={setShop} />
      </Section>
    </div>
  );
};

export default AdminSettings;
