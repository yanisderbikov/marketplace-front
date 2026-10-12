// Черновик формы чекаута: переживает уход со страницы и оплату,
// чтобы покупателю не пришлось вводить контакты и ПВЗ заново.
//
// Перенос anyforms checkoutFormStorage.js + shared/checkoutContactStorage.js, но
// черновик разделён на две части:
// - данные покупателя (ФИО, телефон, почта, ПВЗ получения) — общие для всех
//   витрин платформы: заполнил в одном магазине — подставятся в другом;
// - согласия и комментарий — отдельно на каждый магазин. Оферта и рассылка у
//   каждого продавца свои: согласие с офертой одного магазина не должно
//   «переезжать» в чекаут чужого, а комментарий относится к конкретному заказу.
const BUYER_KEY = 'mp_checkout_buyer';
const FORM_PREFIX = 'mp_checkout_form:';
// Заказы, по которым страница «Спасибо» уже очистила корзину (см. CheckoutSuccess).
const ORDER_HANDLED_PREFIX = 'mp_order_done:';

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* localStorage недоступен (приватный режим) — просто не сохраняем */
  }
}

const asString = (value) => (typeof value === 'string' ? value : '');

// ПВЗ из черновика подставляем только целым: без кода пункт не оформить.
const asPvz = (value) =>
  value && typeof value === 'object' && typeof value.pvzCode === 'string' && value.pvzCode
    ? {
        pvzCode: value.pvzCode,
        pvzCity: asString(value.pvzCity),
        pvzStreet: asString(value.pvzStreet),
      }
    : null;

/** Данные покупателя: { fullName, phone, email, pvz | null }. */
export function readCheckoutBuyer() {
  const saved = readJson(BUYER_KEY) || {};
  return {
    fullName: asString(saved.fullName),
    phone: asString(saved.phone),
    email: asString(saved.email),
    pvz: asPvz(saved.pvz),
  };
}

export function saveCheckoutBuyer({ fullName = '', phone = '', email = '', pvz = null }) {
  writeJson(BUYER_KEY, { fullName, phone, email, pvz: asPvz(pvz) });
}

/** Черновик чекаута магазина: { marketingConsent, acceptTerms, comment }. */
export function readCheckoutForm(slug) {
  const saved = (slug && readJson(`${FORM_PREFIX}${slug}`)) || {};
  return {
    marketingConsent: saved.marketingConsent === true,
    acceptTerms: saved.acceptTerms === true,
    comment: asString(saved.comment),
  };
}

export function saveCheckoutForm(slug, { marketingConsent = false, acceptTerms = false, comment = '' }) {
  if (!slug) return;
  writeJson(`${FORM_PREFIX}${slug}`, { marketingConsent, acceptTerms, comment });
}

// После оплаты контакты, ПВЗ и согласия оставляем для следующего заказа,
// а комментарий затираем: он относился к оплаченному заказу.
export function clearCheckoutFormComment(slug) {
  if (!slug) return;
  const form = readCheckoutForm(slug);
  if (!form.comment) return;
  saveCheckoutForm(slug, { ...form, comment: '' });
}

// Корзину чистим один раз на оплаченный заказ: если покупатель позже снова
// откроет ссылку «Спасибо» (из истории, закладки), новая корзина не пропадёт.
export function wasOrderHandled(publicId) {
  try {
    return localStorage.getItem(`${ORDER_HANDLED_PREFIX}${publicId}`) === '1';
  } catch {
    return false;
  }
}

export function markOrderHandled(publicId) {
  try {
    localStorage.setItem(`${ORDER_HANDLED_PREFIX}${publicId}`, '1');
  } catch {
    // localStorage может быть недоступен — тогда корзина чистится при каждом открытии.
  }
}
