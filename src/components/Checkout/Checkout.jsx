import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { checkout, getDeliveryCost } from '../../services/storefront';
import { formatPrice } from '../../shared/money';
import PvzSelect from '../shared/PvzSelect/PvzSelect';
import {
  EMAIL_RE,
  MIN_PHONE_DIGITS,
  MAX_PHONE_DIGITS,
  sanitizePhoneInput,
  isPhoneValid,
  toSubmitPhone,
} from './phone';
import {
  readCheckoutBuyer,
  saveCheckoutBuyer,
  readCheckoutForm,
  saveCheckoutForm,
} from './checkoutFormStorage';
import { useCartRefresh } from './useCartRefresh';
import ShopSupport, { hasShopSupport } from './ShopSupport';
import styles from './checkout.module.css';
import { shopPath } from '../Storefront/storefrontPaths';

const DELIVERY_QUOTE_DEBOUNCE_MS = 300;
// Комментарий — свободный текст для продавца; длинные простыни ему не нужны.
const COMMENT_MAX_LENGTH = 1000;
// Предел длины адреса по RFC 5321. Магазин с чеками Т-Банка режет строже (64) —
// это бэк скажет текстом 400, и мы покажем его у кнопки оплаты.
const EMAIL_MAX_LENGTH = 254;

const pluralDays = (n) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
};

const formatDeliveryPeriod = (min, max) => {
  if (min == null && max == null) return '';
  if (min == null) return `до ${max} ${pluralDays(max)}`;
  if (max == null || min === max) return `${min} ${pluralDays(min)}`;
  return `${min}–${max} ${pluralDays(max)}`;
};

const lineKey = (item) => `${item.productId}:${item.variantId ?? ''}`;
const lineName = (item) => (item.variantLabel ? `${item.name} ${item.variantLabel}` : item.name);

// Показываем покупателю только осмысленный текст бэка ({"error": "…"} по-русски);
// сырые сообщения axios вроде «Network Error» до покупателя не доходят.
const apiErrorText = (err) => {
  const message = err?.response?.data?.error;
  if (typeof message === 'string' && message.trim()) {
    const text = message.trim();
    return /[.!?…]$/.test(text) ? text : `${text}.`;
  }
  return err?.response
    ? 'Произошла ошибка.'
    : 'Нет связи с сервером — проверьте интернет.';
};

const CheckoutForm = ({ shop, slug }) => {
  const { items, count, totalKopecks, syncWithProducts } = useCart(slug);
  const shopBase = shopPath(slug);
  // Корзина из localStorage могла устареть — сверяем со свежим каталогом витрины;
  // recheck — повторная сверка, когда бэк отклонил заказ (см. handleSubmit).
  const { removedNames, recheck } = useCartRefresh(slug, items, syncWithProducts);

  // Черновик формы: возвращение с других страниц (и после оплаты) не заставляет
  // вводить всё заново. Контакты и ПВЗ — общие для всех витрин, согласия и
  // комментарий — свои у каждого магазина (см. checkoutFormStorage).
  const savedBuyer = useMemo(() => readCheckoutBuyer(), []);
  const savedForm = useMemo(() => readCheckoutForm(slug), [slug]);

  const [fullName, setFullName] = useState(savedBuyer.fullName);
  const [phone, setPhone] = useState(savedBuyer.phone);
  const [email, setEmail] = useState(savedBuyer.email);
  const [pvz, setPvz] = useState(savedBuyer.pvz);
  const [comment, setComment] = useState(savedForm.comment);
  const [deliveryQuote, setDeliveryQuote] = useState(null);
  const [deliveryQuoteState, setDeliveryQuoteState] = useState('idle');
  const [marketingConsent, setMarketingConsent] = useState(savedForm.marketingConsent);
  const [acceptTerms, setAcceptTerms] = useState(savedForm.acceptTerms);
  const [touched, setTouched] = useState({ fullName: false, phone: false, email: false });
  // Была попытка отправки: с этого момента подсвечиваем и ПВЗ, и галочку согласия
  // (у них нет своего «blur», по которому показывать ошибку раньше).
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [error, setError] = useState('');
  // Ошибка создания платежа (а не валидации формы): к тексту добавляем
  // приглашение написать продавцу.
  const [paymentError, setPaymentError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Заголовок вкладки поверх названия магазина, которое ставит StorefrontLayout.
  useEffect(() => {
    document.title = `Оформление заказа — ${shop.name}`;
  }, [shop.name]);

  useEffect(() => {
    saveCheckoutBuyer({ fullName, phone, email, pvz });
  }, [fullName, phone, email, pvz]);

  useEffect(() => {
    saveCheckoutForm(slug, { marketingConsent, acceptTerms, comment });
  }, [slug, marketingConsent, acceptTerms, comment]);

  // Покупатель ушёл на платёжную страницу и вернулся кнопкой «Назад»: браузер
  // может достать страницу из bfcache вместе с «Переходим к оплате…» — разблокируем.
  useEffect(() => {
    const onPageShow = (event) => {
      if (event.persisted) setSubmitting(false);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const nameValid = fullName.trim().length >= 2;
  const phoneValid = isPhoneValid(phone);
  const emailValid = EMAIL_RE.test(email.trim());
  const pvzValid = Boolean(pvz?.pvzCode);

  const markTouched = (field) => setTouched((prev) => ({ ...prev, [field]: true }));

  // Расчёт доставки — только информативно: СДЭК берёт оплату при получении,
  // в платёж она не входит. Состав корзины читаем через ref, а перезапускаемся
  // по «ключу» корзины, чтобы не дёргать СДЭК на каждый ре-рендер.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const cartItemsKey = items.map((i) => `${lineKey(i)}:${i.quantity}`).join('|');
  const pvzCode = pvz?.pvzCode || '';
  // Магазин без ПВЗ отправки (не принимает заказы) СДЭК не посчитает — бэк ответит 409.
  const canQuote = Boolean(shop.acceptsOrders);
  useEffect(() => {
    if (!pvzCode || !cartItemsKey || !canQuote) {
      setDeliveryQuote(null);
      setDeliveryQuoteState('idle');
      return undefined;
    }
    let cancelled = false;
    setDeliveryQuoteState('loading');
    const timer = setTimeout(async () => {
      try {
        const data = await getDeliveryCost(slug, {
          pvzCode,
          items: itemsRef.current.map((i) => ({
            productId: i.productId,
            variantId: i.variantId ?? null,
            quantity: i.quantity,
          })),
        });
        if (cancelled) return;
        // Ответ без стоимости показать нечем (а Number(null) дал бы «~0 ₽») —
        // для покупателя это то же «не посчитали», что и ошибка.
        const hasCost = data?.cost != null && Number.isFinite(Number(data.cost));
        setDeliveryQuote(hasCost ? data : null);
        setDeliveryQuoteState(hasCost ? 'ready' : 'error');
      } catch {
        // Расчёт — подсказка, а не условие заказа: при ошибке СДЭК оформить заказ
        // всё равно можно, а под ПВЗ пишем нейтральную строку (см. 'error' в разметке).
        if (cancelled) return;
        setDeliveryQuote(null);
        setDeliveryQuoteState('error');
      }
    }, DELIVERY_QUOTE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slug, pvzCode, cartItemsKey, canQuote]);

  const nameError = touched.fullName && !nameValid ? 'Укажите ваше ФИО.' : '';
  const phoneError =
    touched.phone && !phoneValid
      ? `Проверьте номер: в нём должно быть от ${MIN_PHONE_DIGITS} до ${MAX_PHONE_DIGITS} цифр.`
      : '';
  const emailError = touched.email && !emailValid ? 'Введите корректный адрес, например you@example.com.' : '';
  const pvzError = submitAttempted && !pvzValid ? 'Выберите пункт выдачи СДЭК.' : '';
  const termsError =
    submitAttempted && !acceptTerms ? 'Подтвердите согласие с офертой и политикой обработки данных.' : '';

  const removedNote = removedNames.length > 0 && (
    <p className={`${styles.note} ${styles.noteTop}`} role="status">
      <strong>Корзина обновлена:</strong> {removedNames.join(', ')} — больше нет в продаже,
      мы убрали {removedNames.length > 1 ? 'эти позиции' : 'эту позицию'} из заказа.
    </p>
  );

  if (items.length === 0) {
    return (
      <div className={styles.page} id="top">
        <div className={styles.inner}>
          {removedNote}
          <div className={styles.centered}>
            <p className={styles.centeredText}>Корзина пуста — оформлять нечего.</p>
            <Link className={styles.primaryLink} to={shopBase}>
              <span>Перейти к товарам</span>
              <span className={styles.ctaArrow} aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Продавец ещё не подключил оплату, доставку или реквизиты — вместо формы
  // объясняем, что заказ оформить пока нельзя; корзина остаётся как есть.
  if (!shop.acceptsOrders) {
    return (
      <div className={styles.page} id="top">
        <div className={styles.inner}>
          <div className={styles.topBar}>
            <Link className={styles.back} to={shopPath(slug, 'cart')}>
              ← В корзину
            </Link>
          </div>
          <span className={styles.eyebrow}>Оформление</span>
          <h1 className={styles.title}>Оформление заказа</h1>
          <p className={`${styles.note} ${styles.noteTop}`}>
            <strong>Магазин пока не принимает заказы.</strong> Продавец ещё не завершил
            настройку оплаты и доставки. Корзина сохранится — загляните чуть позже.
          </p>
          <Link className={styles.primaryLink} to={shopBase}>
            <span>Вернуться в магазин</span>
            <span className={styles.ctaArrow} aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    );
  }

  const hasPreorder = items.some((i) => i.preorder);
  const quoteCost = Number(deliveryQuote?.cost);
  const quotePeriod = formatDeliveryPeriod(deliveryQuote?.periodMin, deliveryQuote?.periodMax);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setPaymentError(false);
    setError('');
    // Кнопка оплаты не блокируется для незаполненной формы — иначе покупатель
    // видел серую кнопку и не понимал, чего не хватает. Вместо этого по нажатию
    // показываем ошибки у полей и ставим фокус на первое неверное (id полей формы,
    // у ПВЗ — инпут поиска внутри PvzSelect).
    setTouched({ fullName: true, phone: true, email: true });
    setSubmitAttempted(true);
    const firstInvalid = [
      [nameValid, 'fullName'],
      [phoneValid, 'phone'],
      [emailValid, 'email'],
      [pvzValid, 'pvz'],
      [acceptTerms, 'acceptTerms'],
    ].find(([valid]) => !valid)?.[1];
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      // Цены не отправляем: сумму платежа бэк считает сам по своим ценам.
      const data = await checkout(slug, {
        items: items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId ?? null,
          quantity: i.quantity,
        })),
        fullName: fullName.trim(),
        phone: toSubmitPhone(phone),
        email: email.trim(),
        pvzCode: pvz.pvzCode,
        pvzCity: pvz.pvzCity || null,
        pvzAddress: pvz.pvzStreet || null,
        comment: comment.trim() || null,
        marketingConsent,
        acceptTerms,
        // Сюда Т-Банк вернёт покупателя (бэк допишет ?order=…&status=success|fail).
        returnUrl: `${window.location.origin}${shopPath(slug, 'success')}`,
      });
      if (data?.paymentUrl) {
        // Корзину не чистим: если оплата сорвётся, покупатель вернётся к ней.
        // Чистит страница «Спасибо», когда бэк подтвердит оплату.
        window.location.href = data.paymentUrl;
        return;
      }
      setError('Не удалось создать платёж.');
      setPaymentError(true);
      setSubmitting(false);
    } catch (err) {
      if (err?.response?.status === 400) {
        // 400 — бэк отклонил сам заказ (товар выключили или удалили после открытия
        // страницы, почта длиннее лимита чека и т.п.), а не сбой оплаты: «попробуйте
        // ещё раз» тут не поможет. Показываем его текст у кнопки, заново сверяем
        // корзину с каталогом и оставляем покупателя на странице — убранные позиции
        // назовёт заметка «Корзина обновлена» наверху.
        const gone = await recheck();
        setError(
          gone.length
            ? `${apiErrorText(err)} Мы обновили корзину — проверьте заказ и нажмите «Перейти к оплате» ещё раз.`
            : apiErrorText(err)
        );
        setPaymentError(false);
        setSubmitting(false);
        return;
      }
      setError(apiErrorText(err));
      setPaymentError(true);
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page} id="top">
      <div className={styles.inner}>
        <div className={styles.topBar}>
          <Link className={styles.back} to={shopPath(slug, 'cart')}>
            ← В корзину
          </Link>
        </div>
        <span className={styles.eyebrow}>Оформление</span>
        <h1 className={styles.title}>Оформление заказа</h1>

        {removedNote}

        <div className={styles.summary}>
          <div className={styles.orderItems}>
            {items.map((item) => (
              <div key={lineKey(item)} className={styles.orderItem}>
                {item.photo ? (
                  <img className={styles.orderThumb} src={item.photo} alt={item.name} />
                ) : (
                  <div className={styles.orderThumb} />
                )}
                <div className={styles.orderItemInfo}>
                  <p className={styles.orderItemName}>
                    {lineName(item)}
                    {item.preorder && <span className={styles.preorderTag}>Предзаказ</span>}
                  </p>
                  <p className={styles.orderItemMeta}>
                    {formatPrice(item.priceKopecks)} × {item.quantity}
                  </p>
                </div>
                <span className={styles.orderItemPrice}>
                  {formatPrice(item.priceKopecks * item.quantity)}
                </span>
              </div>
            ))}
          </div>
          <hr className={styles.summaryDivider} />
          <div className={styles.summaryRow}>
            <span>Доставка СДЭК</span>
            <span>на ПВЗ при получении</span>
          </div>
          <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
            <span>К оплате сейчас ({count})</span>
            <span>{formatPrice(totalKopecks)}</span>
          </div>
          <p className={styles.note}>
            <strong>Доставка:</strong> заказ доставляет компания СДЭК до выбранного пункта выдачи.
            Стоимость доставки не входит в сумму заказа и оплачивается вами при получении по тарифам СДЭК.
          </p>
          {hasPreorder && (
            <p className={styles.note}>
              <strong>Предзаказ:</strong> товары с этой отметкой продавец отправит после
              изготовления или поступления — срок уточняйте в описании товара или у продавца.
            </p>
          )}
        </div>

        <form className={styles.form} id="checkout-form" name="checkout" onSubmit={handleSubmit} noValidate>
          <label className={`${styles.label} ${styles.labelFirst}`} htmlFor="fullName">
            ФИО <span className={styles.req}>*</span>
          </label>
          <input
            id="fullName"
            name="fullName"
            className={`${styles.input} ${nameError ? styles.inputError : ''}`}
            type="text"
            autoComplete="name"
            placeholder="Иванов Иван Иванович"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              setError('');
            }}
            onBlur={() => markTouched('fullName')}
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? 'fullName-error' : undefined}
            required
          />
          {nameError && (
            <p className={styles.fieldError} id="fullName-error">
              {nameError}
            </p>
          )}

          <label className={styles.label} htmlFor="phone">
            Телефон <span className={styles.req}>*</span>
          </label>
          <input
            id="phone"
            name="phone"
            className={`${styles.input} ${phoneError ? styles.inputError : ''}`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+7 999 123-45-67"
            value={phone}
            onChange={(e) => {
              setPhone(sanitizePhoneInput(e.target.value));
              setError('');
            }}
            onBlur={() => markTouched('phone')}
            aria-invalid={Boolean(phoneError)}
            aria-describedby={phoneError ? 'phone-error' : undefined}
            required
          />
          {phoneError && (
            <p className={styles.fieldError} id="phone-error">
              {phoneError}
            </p>
          )}

          <label className={styles.label} htmlFor="email">
            Электронная почта <span className={styles.req}>*</span>
          </label>
          <input
            id="email"
            name="email"
            className={`${styles.input} ${emailError ? styles.inputError : ''}`}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            maxLength={EMAIL_MAX_LENGTH}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            onBlur={() => markTouched('email')}
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? 'email-error' : 'email-hint'}
            required
          />
          {emailError ? (
            <p className={styles.fieldError} id="email-error">
              {emailError}
            </p>
          ) : (
            <p className={styles.hint} id="email-hint">
              На этот адрес пришлём подтверждение оплаты и состав заказа.
            </p>
          )}

          <label className={styles.label} htmlFor="pvz">
            Пункт выдачи СДЭК <span className={styles.req}>*</span>
          </label>
          <PvzSelect
            selected={pvz}
            onSelect={(p) => {
              setPvz(p);
              setError('');
            }}
            onClear={() => setPvz(null)}
            invalid={!pvzValid}
            showError={submitAttempted}
          />
          {pvzError && <p className={styles.fieldError}>{pvzError}</p>}
          {deliveryQuoteState === 'loading' && (
            <p className={styles.deliveryQuote}>Рассчитываем доставку…</p>
          )}
          {deliveryQuoteState === 'ready' && Number.isFinite(quoteCost) && (
            <p className={styles.deliveryQuote}>
              Доставка до пункта: ~{formatPrice(Math.round(quoteCost) * 100)}
              {quotePeriod ? ` · ~${quotePeriod}` : ''} — оплачивается при получении.
            </p>
          )}
          {/* Без этой строки после «Рассчитываем…» под ПВЗ становилось пусто, и покупатель
              не понимал, бесплатна доставка, не посчиталась или что-то сломалось. */}
          {deliveryQuoteState === 'error' && (
            <p className={styles.deliveryQuote} role="status">
              Не удалось рассчитать стоимость доставки — её оплачивают при получении по тарифу СДЭК.
            </p>
          )}

          <label className={styles.label} htmlFor="comment">
            Комментарий к заказу <span className={styles.optional}>— необязательно</span>
          </label>
          <textarea
            id="comment"
            name="comment"
            className={`${styles.input} ${styles.textarea}`}
            placeholder="Пожелания для продавца"
            value={comment}
            maxLength={COMMENT_MAX_LENGTH}
            onChange={(e) => setComment(e.target.value)}
          />

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              name="marketingConsent"
              className={styles.checkbox}
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
            />
            <span className={styles.checkText}>
              Хочу получать новости и предложения магазина «{shop.name}» на email. Можно отписаться
              в любой момент.
            </span>
          </label>

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              id="acceptTerms"
              name="acceptTerms"
              className={styles.checkbox}
              checked={acceptTerms}
              onChange={(e) => {
                setAcceptTerms(e.target.checked);
                setError('');
              }}
              aria-invalid={Boolean(termsError)}
              aria-describedby={termsError ? 'acceptTerms-error' : undefined}
              required
            />
            <span className={styles.checkText}>
              Я принимаю условия{' '}
              <Link
                to={shopPath(slug, 'offer')}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.inlineLink}
              >
                публичной оферты
              </Link>{' '}
              продавца и подтверждаю, что ознакомлен с{' '}
              <Link
                to={shopPath(slug, 'privacy')}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.inlineLink}
              >
                политикой обработки персональных данных
              </Link>
              .
            </span>
          </label>
          {termsError && (
            <p className={styles.fieldError} id="acceptTerms-error">
              {termsError}
            </p>
          )}

          {error && (
            <p className={styles.error} role="alert">
              {error}
              {paymentError &&
                (hasShopSupport(shop) ? (
                  <>
                    {' '}Попробуйте ещё раз или напишите продавцу:{' '}
                    <ShopSupport shop={shop} linkClassName={styles.inlineLink} />.
                  </>
                ) : (
                  ' Попробуйте ещё раз чуть позже.'
                ))}
            </p>
          )}

          {/* Блокируем только на время отправки: невалидная форма объясняет себя
              ошибками у полей по нажатию (см. handleSubmit). */}
          <button type="submit" className={styles.payBtn} disabled={submitting}>
            <span>{submitting ? 'Переходим к оплате…' : 'Перейти к оплате'}</span>
            <span className={styles.ctaArrow} aria-hidden="true">→</span>
          </button>

          {hasShopSupport(shop) && (
            <p className={styles.support}>
              Возникли вопросы? Напишите продавцу:{' '}
              <ShopSupport shop={shop} linkClassName={styles.inlineLink} />
            </p>
          )}
        </form>
      </div>
    </div>
  );
};

const Checkout = () => {
  // Страница внутри StorefrontLayout: магазин уже загружен, шапка и тема — от лэйаута.
  const { shop, slug } = useOutletContext();
  if (!shop) return null;
  // key: при переходе в чекаут другого магазина без размонтирования (меняется
  // только :slug) форма должна заново прочитать черновик именно этого магазина.
  return <CheckoutForm key={slug} shop={shop} slug={slug} />;
};

export default Checkout;
