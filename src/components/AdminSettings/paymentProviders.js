import config from '../../config';
import { savePayment, saveYookassa } from '../../services/merchantShop';
import { isKnownTax, isKnownTaxation } from './receiptOptions';

// Платёжки, которые мерчант может подключить. Всё, чем они отличаются (поля ключей,
// ручка сохранения, инструкция), — здесь; карточки в «Настройках» и страница
// подключения /admin/settings/payment/:slug одинаковые для обеих.

const apiBase = () => String(config.apiUrl || window.location.origin).replace(/\/+$/, '');

/** Адрес HTTP-уведомлений ЮKassa: его мерчант вставляет в свой кабинет ЮKassa. */
export const yookassaWebhookUrl = () => `${apiBase()}/api/public/payment/yookassa-webhook`;

export const PAYMENT_PROVIDERS = [
  {
    code: 'TINKOFF',
    slug: 'tinkoff',
    name: 'Т-Банк',
    title: 'Т-Банк — интернет-эквайринг',
    tagline: 'Оплата картой и по СБП через ваш терминал Т-Банка. Деньги приходят прямо на ваш счёт.',
    methods: ['Карты', 'СБП', 'T-Pay', 'SberPay', 'Mir Pay'],
    cabinetUrl: 'https://business.tbank.ru/',
    cabinetLabel: 'кабинет Т-Бизнеса',
    id: {
      label: 'TerminalKey',
      placeholder: '1234567890123',
      maxLength: 64,
      mono: true,
      saved: (shop) => shop?.tinkoffTerminalKey ?? '',
      validate: (value) => (/\s/.test(value) ? 'TerminalKey — без пробелов' : null),
    },
    secret: {
      label: 'Пароль терминала',
      placeholder: 'пароль из кабинета Т-Банка',
      maxLength: 128,
      isSet: (shop) => Boolean(shop?.tinkoffPasswordSet),
      required: 'Введите пароль терминала',
      requiredForNewId: 'Терминал новый — введите и его пароль',
    },
    receipt: (shop) => ({
      enabled: Boolean(shop?.tinkoffReceiptEnabled),
      taxation: shop?.tinkoffTaxation ?? null,
      tax: shop?.tinkoffTax ?? null,
    }),
    receiptHint: 'Т-Банк сформирует и отправит чек покупателю. Нужна онлайн-касса, подключённая к терминалу в кабинете Т-Банка.',
    // У тестового терминала к TerminalKey приписано DEMO.
    testWarning: (form) => (/demo$/i.test(form.id.trim())
      ? 'Это тестовый терминал: покупатели не смогут оплатить заказ по-настоящему.'
      : null),
    save: (form) => savePayment({
      // Пустой TerminalKey — бэк сбрасывает и ключ, и пароль (Т-Банк отключён).
      terminalKey: form.id.trim(),
      password: form.secret.trim() || null,
      receiptEnabled: Boolean(form.receiptEnabled),
      taxation: form.taxation || null,
      tax: form.tax || null,
    }),
    checksKeys: false,
    steps: [
      {
        title: 'Подключите интернет-эквайринг',
        text: 'В кабинете Т-Бизнеса оставьте заявку на интернет-эквайринг для своего магазина. Если эквайринг уже есть — переходите к следующему шагу.',
        link: true,
      },
      {
        title: 'Найдите терминал',
        text: '«Интернет-эквайринг» → «Магазины» → ваш магазин → вкладка «Терминалы». Нужен рабочий терминал: у тестового в конце TerminalKey стоит DEMO.',
      },
      {
        title: 'Скопируйте TerminalKey и пароль',
        text: 'Вставьте их в форму ниже и нажмите «Подключить». Пароль хранится в зашифрованном виде и никому не показывается.',
      },
      {
        title: 'Уведомления — уже настроены',
        text: 'Адрес для уведомлений о платежах мы передаём в каждом платеже сами — в кабинете Т-Банка ничего менять не нужно.',
      },
    ],
  },
  {
    code: 'YOOKASSA',
    slug: 'yookassa',
    name: 'ЮKassa',
    title: 'ЮKassa',
    tagline: 'Карты, СБП, SberPay и ЮMoney через ваш магазин в ЮKassa. Деньги приходят прямо на ваш счёт.',
    methods: ['Карты', 'СБП', 'SberPay', 'T-Pay', 'ЮMoney'],
    cabinetUrl: 'https://yookassa.ru/my',
    cabinetLabel: 'личный кабинет ЮKassa',
    id: {
      label: 'shopId',
      placeholder: '123456',
      maxLength: 32,
      mono: true,
      inputMode: 'numeric',
      saved: (shop) => shop?.yookassaShopId ?? '',
      validate: (value) => (/^\d+$/.test(value) ? null : 'shopId — только цифры, как в кабинете ЮKassa'),
    },
    secret: {
      label: 'Секретный ключ',
      placeholder: 'live_…',
      maxLength: 256,
      isSet: (shop) => Boolean(shop?.yookassaSecretKeySet),
      required: 'Введите секретный ключ',
      requiredForNewId: 'Магазин новый — введите и его секретный ключ',
    },
    receipt: (shop) => ({
      enabled: Boolean(shop?.yookassaReceiptEnabled),
      taxation: shop?.yookassaTaxation ?? null,
      tax: shop?.yookassaTax ?? null,
    }),
    receiptHint: 'ЮKassa передаст чек в вашу онлайн-кассу или в «Чеки от ЮKassa» — что подключено в кабинете ЮKassa.',
    // Ключ тестового магазина ЮKassa начинается с test_.
    testWarning: (form) => (/^test_/i.test(form.secret.trim())
      ? 'Это ключ тестового магазина: покупатели не смогут оплатить заказ по-настоящему.'
      : null),
    save: (form) => saveYookassa({
      // Пустой shopId — бэк сбрасывает и его, и ключ (ЮKassa отключена).
      shopId: form.id.trim(),
      secretKey: form.secret.trim() || null,
      receiptEnabled: Boolean(form.receiptEnabled),
      taxation: form.taxation || null,
      tax: form.tax || null,
    }),
    // Новые ключи бэк проверяет запросом в ЮKassa — кнопка показывает, что ждём ответа.
    checksKeys: true,
    steps: [
      {
        title: 'Зарегистрируйте магазин в ЮKassa',
        text: 'Создайте магазин в личном кабинете ЮKassa и пройдите проверку — подключение доступно ИП и организациям. Если магазин уже работает — переходите к следующему шагу.',
        link: true,
      },
      {
        title: 'Выпустите секретный ключ',
        text: '«Интеграция» → «Ключи API». Там же указан shopId. Нажмите «Выпустить секретный ключ» и сразу скопируйте его — ЮKassa показывает ключ только один раз.',
      },
      {
        title: 'Включите HTTP-уведомления',
        text: '«Интеграция» → «HTTP-уведомления»: вставьте адрес ниже и отметьте события payment.succeeded, payment.canceled и refund.succeeded. Так заказ станет оплаченным сразу после оплаты.',
        webhook: true,
      },
      {
        title: 'Вставьте shopId и ключ',
        text: 'Заполните форму ниже и нажмите «Подключить» — мы проверим ключи в ЮKassa. Ключ хранится в зашифрованном виде и никому не показывается.',
      },
    ],
  },
];

export const providerBySlug = (slug) => PAYMENT_PROVIDERS.find((p) => p.slug === slug) || null;
export const providerByCode = (code) => PAYMENT_PROVIDERS.find((p) => p.code === code) || null;

/** Ключи провайдера сохранены целиком (оба поля). */
export const isConnected = (provider, shop) => Boolean(provider.id.saved(shop)) && provider.secret.isSet(shop);

/** Через этого провайдера витрина сейчас принимает оплату. */
export const isActive = (provider, shop) => shop?.paymentProvider === provider.code;

export const setupPath = (provider) => `/admin/settings/payment/${provider.slug}`;

/** Форма страницы подключения из сохранённого магазина; секрет наружу не отдаётся — поле всегда пустое. */
export const formFromShop = (provider, shop) => {
  const receipt = provider.receipt(shop);
  return {
    id: provider.id.saved(shop),
    secret: '',
    receiptEnabled: receipt.enabled,
    // Сохранённое значение не из перечня (vat20 до 2026 года) — в форме «не выбрано»:
    // бэк его обратно не примет, мерчант выбирает заново.
    taxation: isKnownTaxation(receipt.taxation) ? receipt.taxation : '',
    tax: isKnownTax(receipt.tax) ? receipt.tax : '',
  };
};

export const validateForm = (provider, form, shop) => {
  const errors = {};
  const id = form.id.trim();
  const secret = form.secret.trim();
  if (!id) {
    if (secret) errors.id = `Укажите ${provider.id.label} — без него ключ не сохранить`;
  } else {
    const idError = provider.id.validate(id);
    if (idError) errors.id = idError;
    else if (!secret) {
      // Секрет выдаётся под конкретный терминал/магазин — от другого не подойдёт.
      const idChanged = id !== provider.id.saved(shop);
      if (idChanged && provider.secret.isSet(shop)) errors.secret = provider.secret.requiredForNewId;
      else if (!provider.secret.isSet(shop)) errors.secret = provider.secret.required;
    }
  }
  if (form.receiptEnabled) {
    if (!form.taxation) errors.taxation = 'Выберите систему налогообложения';
    if (!form.tax) errors.tax = 'Выберите ставку НДС';
  }
  return errors;
};

export const sameAsSaved = (provider, form, shop) => {
  const saved = formFromShop(provider, shop);
  return (
    form.id.trim() === saved.id
    && !form.secret.trim()
    && form.receiptEnabled === saved.receiptEnabled
    && form.taxation === saved.taxation
    && form.tax === saved.tax
  );
};
