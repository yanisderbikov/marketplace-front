import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setToken } from '../../apiClient';
import { requestCode as requestLoginCode, verifyCode as verifyLoginCode, getMe } from '../../services/auth';
import { errorMessage } from '../../shared/errors';
import { BRAND_NAME } from '../../config/brand';
import SiteHeader from '../shared/SiteHeader/SiteHeader';
import styles from './Login.module.css';

// Совпадает с auth.login-code.resend-seconds на бэке: раньше бэк новое письмо
// не отправит (ответит 200 без письма), поэтому и кнопку раньше не открываем.
const RESEND_SECONDS = 60;

const CODE_LENGTH = 6;

// Правая тёмная карточка: коротко, что будет после входа.
const PERKS = [
  {
    num: '01',
    title: 'Код вместо пароля',
    text: 'Шесть цифр на почту — запоминать и хранить ничего не нужно.',
  },
  {
    num: '02',
    title: 'Первый вход — это регистрация',
    text: 'Аккаунт создастся сам, магазин заведёте следующим шагом.',
  },
  {
    num: '03',
    title: 'Всё в одном кабинете',
    text: 'Каталог, заказы, оплата Т‑Банком и доставка СДЭК.',
  },
];

const ADMIN_HOME = '/admin/analytics';
const ONBOARDING_PATH = '/admin/onboarding';

// Возвращаем только внутрь кабинета: ?from приходит из адресной строки, и
// чужой адрес (//evil.example, https://…) или страница витрины туда не годятся.
const safeAdminPath = (from) =>
  from && (from === '/admin' || from.startsWith('/admin/') || from.startsWith('/admin?')) ? from : null;

const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const requestCode = async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setError('Введите почту');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await requestLoginCode(normalized);
      setEmail(normalized);
      setCode('');
      setStep('code');
      setResendIn(RESEND_SECONDS);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось отправить код. Попробуйте ещё раз.'));
    } finally {
      setLoading(false);
    }
  };

  // Куда вести после входа: без магазина — создавать его (онбординг), иначе —
  // туда, куда человек шёл до логина, или на аналитику.
  const resolveTarget = (me) => {
    const from = safeAdminPath(searchParams.get('from'));
    if (!me.shop) {
      // Супер-админ платформы может модерировать магазины, не заводя свою витрину
      // (AdminLayout пускает его в «Магазины» без магазина) — туда и возвращаем.
      if (me.superAdmin && from?.startsWith('/admin/shops')) return from;
      return ONBOARDING_PATH;
    }
    return from || ADMIN_HOME;
  };

  const verifyCode = async () => {
    const digits = code.replace(/\D/g, '');
    if (digits.length !== CODE_LENGTH) {
      setError('Код — 6 цифр из письма');
      return;
    }
    setLoading(true);
    setError('');
    let token;
    try {
      token = await verifyLoginCode(email, digits);
      if (!token) {
        throw new Error('В ответе сервера нет токена');
      }
    } catch (err) {
      setError(errorMessage(err, 'Неверный код. Проверьте письмо.'));
      setLoading(false);
      return;
    }
    setToken(token);
    let target;
    try {
      target = resolveTarget(await getMe());
    } catch {
      // Токен уже сохранён — вход состоялся. Если профиль не загрузился (сеть),
      // отдаём решение кабинету: AdminLayout сам перечитает /api/auth/me,
      // уведёт в онбординг или покажет «Повторить».
      target = safeAdminPath(searchParams.get('from')) || '/admin';
    }
    setLoading(false);
    navigate(target, { replace: true });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (step === 'email') {
      requestCode();
    } else {
      verifyCode();
    }
  };

  const backToEmail = () => {
    setStep('email');
    setCode('');
    setError('');
  };

  const digits = code.replace(/\D/g, '');
  const activeCell = Math.min(digits.length, CODE_LENGTH - 1);

  return (
    <div className={styles.page}>
      <SiteHeader
        logo={{
          to: '/',
          ariaLabel: `${BRAND_NAME} — на главную`,
          text: <span className={styles.brandWordmark}>{BRAND_NAME}</span>,
        }}
        rightItems={[{ key: 'home', kind: 'link', label: 'На главную', variant: 'pill', to: '/' }]}
      />

      <main className={styles.main}>
        <div className={styles.grid}>
          <section className={styles.formCard} aria-labelledby="login-title">
            <ol className={styles.steps} aria-label="Шаги входа">
              <li className={`${styles.step} ${step === 'email' ? styles.stepActive : styles.stepDone}`}>
                <span className={styles.stepNum}>01</span> почта
              </li>
              <li className={`${styles.step} ${step === 'code' ? styles.stepActive : ''}`}>
                <span className={styles.stepNum}>02</span> код
              </li>
            </ol>

            {/* key перезапускает анимацию появления при смене шага. */}
            <div key={step} className={styles.stepBody}>
              <h1 id="login-title" className={styles.title}>
                {step === 'email' ? (
                  <>
                    <span className={styles.titleLine}>Вход</span>
                    <span className={`${styles.titleLine} ${styles.titleMuted}`}>в кабинет</span>
                  </>
                ) : (
                  <>
                    <span className={styles.titleLine}>Код</span>
                    <span className={`${styles.titleLine} ${styles.titleMuted}`}>из письма</span>
                  </>
                )}
              </h1>

              <form onSubmit={handleSubmit} className={styles.form} noValidate>
                {step === 'email' ? (
                  <>
                    {/* Отдельной регистрации нет: первый вход по коду и есть регистрация. */}
                    <p className={styles.hint}>
                      Пароль не нужен — пришлём код на почту. Впервые здесь? Аккаунт
                      создастся при первом входе.
                    </p>
                    <label className={styles.field}>
                      <span className={styles.label}>Почта</span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={`${styles.input} ${error ? styles.inputError : ''}`}
                        autoComplete="email"
                        inputMode="email"
                        placeholder="you@example.com"
                        disabled={loading}
                        aria-invalid={Boolean(error)}
                        autoFocus
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <p className={styles.hint}>
                      Отправили 6 цифр на <strong className={styles.email}>{email}</strong>. Письма
                      нет — загляните в «Спам».{' '}
                      <button type="button" className={styles.linkBtn} onClick={backToEmail} disabled={loading}>
                        Другая почта
                      </button>
                    </p>
                    {/* Одно настоящее поле поверх шести ячеек: вставка из буфера и
                        автоподстановка кода из SMS/почты работают как у обычного input. */}
                    <label className={styles.codeField}>
                      <span className={styles.visuallyHidden}>Код из письма</span>
                      <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
                        className={styles.codeInput}
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={CODE_LENGTH}
                        disabled={loading}
                        aria-invalid={Boolean(error)}
                        autoFocus
                      />
                      <span className={`${styles.cells} ${error ? styles.cellsError : ''}`} aria-hidden="true">
                        {Array.from({ length: CODE_LENGTH }, (_, i) => (
                          <span
                            key={i}
                            className={[
                              styles.cell,
                              digits[i] ? styles.cellFilled : '',
                              i === activeCell ? styles.cellActive : '',
                            ].filter(Boolean).join(' ')}
                          >
                            {digits[i] || ''}
                          </span>
                        ))}
                      </span>
                    </label>
                  </>
                )}

                {error && (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                )}

                <button type="submit" className={styles.cta} disabled={loading}>
                  <span>{loading ? 'Секунду…' : step === 'email' ? 'Получить код' : 'Войти'}</span>
                  <span className={styles.ctaArrow} aria-hidden="true">
                    {loading ? <span className={styles.spinner} /> : '→'}
                  </span>
                </button>

                {step === 'code' && (
                  <button
                    type="button"
                    className={styles.resend}
                    onClick={requestCode}
                    disabled={loading || resendIn > 0}
                  >
                    {resendIn > 0 ? (
                      <>
                        Отправить ещё раз через <span className={styles.timer}>{resendIn} с</span>
                      </>
                    ) : (
                      'Отправить код ещё раз'
                    )}
                  </button>
                )}
              </form>
            </div>
          </section>

          <aside className={styles.infoCard} aria-label={`Что такое ${BRAND_NAME}`}>
            <p className={styles.infoKicker}>{BRAND_NAME}</p>
            <h2 className={styles.infoTitle}>Свой интернет-магазин за вечер</h2>
            <ul className={styles.perks}>
              {PERKS.map((perk) => (
                <li key={perk.num} className={styles.perk}>
                  <span className={styles.perkNum}>{perk.num}</span>
                  <span>
                    <span className={styles.perkTitle}>{perk.title}</span>
                    <span className={styles.perkText}>{perk.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default Login;
