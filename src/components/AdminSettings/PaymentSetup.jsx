import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useOutletContext, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { selectPaymentProvider } from '../../services/merchantShop';
import { errorMessage } from '../../shared/errors';
import ProviderLogo from './ProviderLogo';
import {
  formFromShop,
  isActive,
  isConnected,
  providerBySlug,
  sameAsSaved,
  validateForm,
  yookassaWebhookUrl,
} from './paymentProviders';
import {
  TAXATION_OPTIONS,
  TAX_OPTIONS,
  isKnownTax,
  isKnownTaxation,
  legacyTaxLabel,
  outdatedReceiptSettings,
} from './receiptOptions';
import fields from './AdminSettings.module.css';
import styles from './PaymentSetup.module.css';

const SETTINGS_PATH = '/admin/settings';
const BACK_PATH = `${SETTINGS_PATH}#settings-payment`;

const FieldError = ({ message }) => (message ? <span className={fields.fieldError}>{message}</span> : null);

const CopyField = ({ value }) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Адрес скопирован');
    } catch {
      toast.error('Не удалось скопировать — выделите адрес и скопируйте вручную');
    }
  };
  return (
    <div className={styles.copyField}>
      <input
        type="text"
        readOnly
        value={value}
        className={`${fields.input} ${fields.mono}`}
        onFocus={(e) => e.target.select()}
        aria-label="Адрес для HTTP-уведомлений"
      />
      <button type="button" className={styles.copyBtn} onClick={handleCopy}>Копировать</button>
    </div>
  );
};

/**
 * Страница подключения платёжки (/admin/settings/payment/:slug), как «Подключить» в Ecwid:
 * пошаговая инструкция, что и где взять в кабинете провайдера, форма ключей и чека,
 * а для подключённой — выбор её основной и отключение.
 */
const PaymentSetup = () => {
  const { slug } = useParams();
  const provider = providerBySlug(slug);
  const { shop, setShop, setLeaveGuard } = useOutletContext();

  const [form, setForm] = useState(() => (provider ? formFromShop(provider, shop) : null));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [selecting, setSelecting] = useState(false);

  const shopRef = useRef(shop);
  shopRef.current = shop;
  const shopId = shop?.id;

  // Другой магазин или другая платёжка — форма с нуля.
  useEffect(() => {
    if (!provider) return;
    setForm(formFromShop(provider, shopRef.current));
    setErrors({});
  }, [shopId, provider]);

  const dirty = Boolean(provider && shop && form) && !sameAsSaved(provider, form, shop);

  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty || !setLeaveGuard) return undefined;
    setLeaveGuard(() => window.confirm('Есть несохранённые изменения. Уйти без сохранения?'));
    return () => setLeaveGuard(null);
  }, [dirty, setLeaveGuard]);

  if (!provider) return <Navigate to={BACK_PATH} replace />;
  if (!shop || !form) return null;

  const connected = isConnected(provider, shop);
  const active = isActive(provider, shop);
  const outdated = connected ? outdatedReceiptSettings(shop, provider.code) : null;
  const savedReceipt = provider.receipt(shop);
  // Подсказки у полей — по сохранённому значению, даже если чек сейчас выключен.
  const legacyTax = savedReceipt.tax && !isKnownTax(savedReceipt.tax) ? savedReceipt.tax : null;
  const legacyTaxation = savedReceipt.taxation && !isKnownTaxation(savedReceipt.taxation)
    ? savedReceipt.taxation
    : null;
  const testWarning = provider.testWarning(form);
  const keysChanging = Boolean(form.id.trim() && form.secret.trim());

  const setField = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  };

  const submit = async (sent, { disconnecting = false } = {}) => {
    setSaving(true);
    try {
      const updated = await provider.save(sent);
      setShop(updated);
      // Правки, сделанные во время запроса, не затираем.
      setForm((prev) => (prev === sent || disconnecting ? formFromShop(provider, updated) : prev));
      if (disconnecting) toast.success(`${provider.name} отключён`);
      else if (!connected && isConnected(provider, updated)) {
        toast.success(`${provider.name} подключён — витрина принимает оплату через него`);
      } else toast.success('Настройки оплаты сохранены');
    } catch (err) {
      toast.error(errorMessage(err, 'Не удалось сохранить настройки оплаты'));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (saving) return;
    const found = validateForm(provider, form, shop);
    setErrors(found);
    const firstError = Object.values(found).find(Boolean);
    if (firstError) {
      toast.error(firstError);
      return;
    }
    if (!form.id.trim() && connected) {
      handleDisconnect();
      return;
    }
    submit(form);
  };

  const handleDisconnect = () => {
    if (saving) return;
    const tail = active
      ? ' Если другой способ оплаты не подключён, витрина перестанет принимать заказы.'
      : '';
    if (!window.confirm(`Отключить ${provider.name}? Ключи будут удалены.${tail}`)) return;
    submit({ ...form, id: '', secret: '' }, { disconnecting: true });
  };

  const handleSelect = async () => {
    if (selecting) return;
    setSelecting(true);
    try {
      setShop(await selectPaymentProvider(provider.code));
      toast.success(`Оплата теперь принимается через ${provider.name}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Не удалось сменить способ оплаты'));
    } finally {
      setSelecting(false);
    }
  };

  let status;
  if (!connected) status = <span className={`${fields.badge} ${styles.badgeIdle}`}>не подключено</span>;
  else if (outdated) status = <span className={`${fields.badge} ${styles.badgeWarn}`}>проверьте чек</span>;
  else if (active) status = <span className={`${fields.badge} ${fields.badgeOk}`}>принимает оплату</span>;
  else status = <span className={`${fields.badge} ${styles.badgeIdle}`}>подключено</span>;

  let submitLabel = connected ? 'Сохранить' : 'Подключить';
  if (saving) submitLabel = provider.checksKeys && keysChanging ? `Проверяем в ${provider.name}…` : 'Сохранение…';

  return (
    <div className={fields.wrap}>
      <Link to={BACK_PATH} className={styles.backLink}>← Настройки</Link>

      <header className={styles.hero}>
        <ProviderLogo code={provider.code} size={64} />
        <div className={styles.heroBody}>
          <div className={styles.heroTitleRow}>
            <h1 className={styles.heroTitle}>{provider.title}</h1>
            {status}
          </div>
          <p className={styles.heroText}>{provider.tagline}</p>
          <ul className={styles.methods} aria-label="Способы оплаты">
            {provider.methods.map((method) => <li key={method} className={styles.method}>{method}</li>)}
          </ul>
          <p className={styles.heroNote}>
            Какие способы доступны покупателям и комиссия — по вашему договору с {provider.name}.
          </p>
        </div>
      </header>

      {connected && !active && (
        <div className={styles.notice} role="status">
          <p className={styles.noticeText}>
            {provider.name} подключён, но оплату сейчас принимает другой способ.
          </p>
          <button type="button" className={fields.saveBtn} onClick={handleSelect} disabled={selecting}>
            {selecting ? 'Переключаем…' : `Принимать через ${provider.name}`}
          </button>
        </div>
      )}

      <section className={fields.card}>
        <div className={fields.cardHead}>
          <h2 className={fields.cardTitle}>как подключить</h2>
        </div>
        <ol className={styles.steps}>
          {provider.steps.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNum} aria-hidden="true">{index + 1}</span>
              <div className={styles.stepBody}>
                <p className={styles.stepTitle}>{step.title}</p>
                <p className={styles.stepText}>{step.text}</p>
                {step.link && (
                  <a className={styles.stepLink} href={provider.cabinetUrl} target="_blank" rel="noreferrer noopener">
                    Открыть {provider.cabinetLabel} ↗
                  </a>
                )}
                {step.webhook && <CopyField value={yookassaWebhookUrl()} />}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <form onSubmit={handleSubmit} noValidate>
        <section className={fields.card}>
          <div className={fields.cardHead}>
            <h2 className={fields.cardTitle}>ключи {provider.name}</h2>
          </div>

          <div className={fields.row}>
            <label className={fields.label}>
              <span className={fields.keepCase}>{provider.id.label}</span>
              <input
                type="text"
                name="id"
                value={form.id}
                onChange={setField}
                className={`${fields.input} ${provider.id.mono ? fields.mono : ''} ${errors.id ? fields.inputError : ''}`}
                placeholder={provider.id.placeholder}
                maxLength={provider.id.maxLength}
                inputMode={provider.id.inputMode}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(errors.id)}
              />
              <FieldError message={errors.id} />
            </label>
            <label className={fields.label}>
              {provider.secret.label}
              <input
                type="password"
                name="secret"
                value={form.secret}
                onChange={setField}
                className={`${fields.input} ${errors.secret ? fields.inputError : ''}`}
                placeholder={provider.secret.isSet(shop) ? '••••••••, сохранён' : provider.secret.placeholder}
                maxLength={provider.secret.maxLength}
                autoComplete="new-password"
                spellCheck={false}
                aria-invalid={Boolean(errors.secret)}
              />
              <FieldError message={errors.secret} />
              {provider.secret.isSet(shop) && !errors.secret && (
                <span className={fields.fieldHint}>Оставьте пустым, чтобы не менять сохранённый.</span>
              )}
            </label>
          </div>
          {testWarning && !errors.id && !errors.secret && <span className={fields.fieldWarn}>{testWarning}</span>}
        </section>

        <section className={fields.card}>
          <div className={fields.cardHead}>
            <h2 className={fields.cardTitle}>чеки 54-фз</h2>
          </div>
          <label className={fields.switch}>
            <input
              type="checkbox"
              role="switch"
              name="receiptEnabled"
              checked={form.receiptEnabled}
              onChange={setField}
              className={fields.switchInput}
            />
            <span className={fields.switchTrack} aria-hidden="true" />
            <span className={fields.switchText}>
              Передавать чек в {provider.name}
              <span className={fields.fieldHint}>{provider.receiptHint}</span>
            </span>
          </label>

          {form.receiptEnabled && (
            <div className={fields.row}>
              <label className={fields.label}>
                Система налогообложения
                <select
                  name="taxation"
                  value={form.taxation}
                  onChange={setField}
                  className={`${fields.input} ${fields.select} ${errors.taxation ? fields.inputError : ''}`}
                  aria-invalid={Boolean(errors.taxation)}
                >
                  <option value="">— выберите —</option>
                  {TAXATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <FieldError message={errors.taxation} />
                {legacyTaxation && !form.taxation && !errors.taxation && (
                  <span className={fields.fieldWarn}>
                    Сохранённая система «{legacyTaxation}» больше не принимается — выберите заново.
                  </span>
                )}
              </label>
              <label className={fields.label}>
                <span><span className={fields.keepCase}>НДС</span> в чеке</span>
                <select
                  name="tax"
                  value={form.tax}
                  onChange={setField}
                  className={`${fields.input} ${fields.select} ${errors.tax ? fields.inputError : ''}`}
                  aria-invalid={Boolean(errors.tax)}
                >
                  <option value="">— выберите —</option>
                  {TAX_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <FieldError message={errors.tax} />
                {legacyTax && !form.tax && !errors.tax && (
                  <span className={fields.fieldWarn}>
                    Ставка «{legacyTaxLabel(legacyTax)}» больше не действует (с 2026 года
                    основная — 22%): выберите ставку заново и сохраните.
                  </span>
                )}
              </label>
            </div>
          )}
        </section>

        <div className={styles.actions}>
          {connected && (
            <button type="button" className={styles.dangerBtn} onClick={handleDisconnect} disabled={saving}>
              Отключить {provider.name}
            </button>
          )}
          <div className={styles.actionsMain}>
            {dirty && <span className={fields.dirtyNote}>Есть несохранённые изменения</span>}
            <button type="submit" className={fields.saveBtn} disabled={saving || (connected && !dirty)}>
              {submitLabel}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default PaymentSetup;
