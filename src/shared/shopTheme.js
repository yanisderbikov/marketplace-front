/**
 * Тема витрины из одного цвета бренда.
 *
 * Стили витрины (перенос anyforms) читают палитру из CSS-переменных --shop-*
 * через var(…, fallback). В anyforms каждую тему рисовали руками
 * (shopThemes.module.css); здесь мерчант выбирает только цвет, а остальное
 * считаем: фон страницы, акцент для текста и кнопок, цвет текста на кнопках,
 * подложки, подвал. Контраст проверяем по WCAG, чтобы любой выбранный цвет —
 * хоть лимонный — давал читаемую витрину.
 *
 * buildShopTheme(brandColor) → {
 *   style           — объект { '--shop-…': '…' } для style корня витрины;
 *   pageBackground  — фон body (тот же цвет, что --shop-page-bg);
 *   headerFg        — цвет текста в шапке (белый или почти чёрный);
 *   headerTint      — готовый проп tint для SiteHeader
 *                     ({ background, solid, border, color, logoFont }).
 * }
 */

// Формат цвета, который принимает бэк (PUT /api/merchant/shop/design).
export const BRAND_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// Готовые цвета в онбординге и на вкладке «Дизайн».
export const BRAND_SWATCHES = [
  '#111111', // чёрный
  '#572631', // бордо
  '#d78da1', // пыльная роза
  '#c2410c', // терракота
  '#c9a227', // горчица
  '#3f6b4f', // хвоя
  '#7f95a7', // пыльно-голубой
  '#1e3a8a', // индиго
];

// Пока мерчант набирает hex вручную («#12»), превью не должно падать —
// рисуем нейтральную чёрную тему до тех пор, пока цвет не станет валидным.
const PREVIEW_FALLBACK_COLOR = '#111111';

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };
// «Почти чёрный» для текста на светлом: чистый #000 на цветном фоне режет глаз.
const INK = { r: 21, g: 21, b: 21 };
const BODY_GRAY = { r: 77, g: 77, b: 77 };
const NOTE_GRAY = { r: 68, g: 68, b: 68 };

// WCAG AA: 4.5 — обычный текст. Для основного текста берём с запасом.
const AA_TEXT = 4.5;
const BODY_TEXT = 7;

const parseHex = (value) => {
  const match = String(value ?? '').trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  const num = parseInt(match[1], 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
};

const toHex = ({ r, g, b }) =>
  `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

const rgba = ({ r, g, b }, alpha) =>
  `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;

// Смешивание в sRGB: t — доля второго цвета (0 — только a, 1 — только b).
const mix = (a, b, t) => ({
  r: a.r + (b.r - a.r) * t,
  g: a.g + (b.g - a.g) * t,
  b: a.b + (b.b - a.b) * t,
});

const channelToLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

// Относительная яркость по WCAG 2.x.
const luminance = ({ r, g, b }) =>
  0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);

const contrast = (a, b) => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

// Текст поверх фона: белый или почти чёрный — что контрастнее.
const readableOn = (bg) => (contrast(WHITE, bg) >= contrast(INK, bg) ? WHITE : INK);

// Затемняем цвет шагами к чёрному, пока он не наберёт нужный контраст с фоном.
const darkenUntil = (color, background, ratio) => {
  for (let t = 0; t <= 1; t += 0.02) {
    const candidate = mix(color, BLACK, t);
    if (contrast(candidate, background) >= ratio) return candidate;
  }
  return BLACK;
};

// Каналы целыми, как их увидит браузер после toHex: контраст считаем по тому
// цвету, который реально попадёт в CSS, а не по дробному промежуточному.
const roundRgb = ({ r, g, b }) => ({ r: Math.round(r), g: Math.round(g), b: Math.round(b) });

// Обратное к darkenUntil: «разбавляем» цвет фоном (как прозрачность поверх
// фона, но сразу непрозрачным hex) и берём самый бледный тон, который ещё
// держит нужный контраст. Так приглушённый текст остаётся приглушённым, но
// читается при любом цвете бренда.
const fadeUntil = (color, background, ratio) => {
  const bg = roundRgb(background);
  for (let t = 0.98; t > 0; t -= 0.02) {
    const candidate = roundRgb(mix(color, bg, t));
    if (contrast(candidate, bg) >= ratio) return candidate;
  }
  return roundRgb(color);
};

// Шапка — плавающая «таблетка» SiteHeader: цвет бренда с прозрачностью
// поверх блюра страницы. Глаз видит не сам бренд, а его смесь с фоном под
// шапкой (почти всегда — светлым фоном страницы), поэтому цвет текста
// подбираем по этой смеси: у средних тонов (терракота, хвоя) просвечивающий
// светлый фон съедал контраст белого текста до ~3.8:1.
const HEADER_ALPHA = 0.8;
// Плотнее не делаем: дальше пропадает «стекло» — контент под шапкой не просвечивает.
const HEADER_ALPHA_MAX = 0.92;
// Небольшой запас к AA: браузер смешивает слои в 8 бит, а блюр с saturate
// чуть сдвигает тон фона под шапкой.
const HEADER_TEXT = AA_TEXT + 0.1;

// → { color, alpha, bg, fg }: tint = rgba(color, alpha), bg — итоговый
// непрозрачный цвет таблетки поверх фона страницы, fg — текст на нём.
const headerPalette = (brand, pageBg) => {
  const over = (color, alpha) => roundRgb(mix(pageBg, color, alpha));
  // 1. Обычная прозрачность: белый или почти чёрный — что контрастнее на смеси.
  const base = over(brand, HEADER_ALPHA);
  const baseFg = readableOn(base);
  if (contrast(baseFg, base) >= HEADER_TEXT) {
    return { color: brand, alpha: HEADER_ALPHA, bg: base, fg: baseFg };
  }
  // 2. Середина шкалы яркости: ни белый, ни чёрный не набирают AA. Фон
  //    страницы светлее бренда, поэтому плотная таблетка темнее — под белый текст.
  for (let step = 1; HEADER_ALPHA + step * 0.02 <= HEADER_ALPHA_MAX + 1e-9; step += 1) {
    const alpha = Math.round((HEADER_ALPHA + step * 0.02) * 100) / 100;
    const bg = over(brand, alpha);
    if (contrast(WHITE, bg) >= HEADER_TEXT) return { color: brand, alpha, bg, fg: WHITE };
  }
  // 3. Плотности не хватило (бренд почти на границе, где белый и чёрный
  //    одинаково плохи) — затемняем сам тон шапки под белый текст.
  for (let t = 0.02; t <= 1; t += 0.02) {
    const color = roundRgb(mix(brand, BLACK, t));
    const bg = over(color, HEADER_ALPHA_MAX);
    if (contrast(WHITE, bg) >= HEADER_TEXT) {
      return { color, alpha: HEADER_ALPHA_MAX, bg, fg: WHITE };
    }
  }
  return { color: BLACK, alpha: HEADER_ALPHA_MAX, bg: over(BLACK, HEADER_ALPHA_MAX), fg: WHITE };
};

const rgbToHsl = ({ r, g, b }) => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h / 6, s, l };
};

const hueToChannel = (p, q, t) => {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
};

const hslToRgb = ({ h, s, l }) => {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hueToChannel(p, q, h + 1 / 3) * 255,
    g: hueToChannel(p, q, h) * 255,
    b: hueToChannel(p, q, h - 1 / 3) * 255,
  };
};

// Второй, приглушённый тон той же гаммы — для бейджей и состояния «в корзине»
// (в anyforms темах это был отдельный «шалфейный»/«пыльный» цвет). Белый текст
// бейджа должен читаться, поэтому опускаем светлоту до контраста AA с белым.
const mutedTone = (brand) => {
  const { h, s } = rgbToHsl(brand);
  const saturation = Math.min(s, 0.35);
  for (let l = 0.42; l >= 0; l -= 0.02) {
    const candidate = hslToRgb({ h, s: saturation, l });
    if (contrast(WHITE, candidate) >= AA_TEXT) return candidate;
  }
  return INK;
};

export const buildShopTheme = (brandColor) => {
  const brand = parseHex(brandColor) ?? parseHex(PREVIEW_FALLBACK_COLOR);

  // Фон страницы — цвет бренда, разбавленный белым (~94%): витрина «в цвет»,
  // но фото товаров и текст остаются на почти белом.
  const pageBg = mix(brand, WHITE, 0.94);
  // Подложка под фото, пока оно грузится: чуть насыщеннее фона.
  const photoBg = mix(brand, WHITE, 0.88);

  // Акцент красит текст (цены, ссылки) и кнопки, поэтому светлый бренд
  // (жёлтый, пастель) затемняем до контраста AA с фоном страницы.
  const accent = darkenUntil(brand, pageBg, AA_TEXT);
  const accentFg = readableOn(accent);
  // Почти чёрный акцент затемнять некуда — на hover его высветляем
  // (как чёрная кнопка anyforms сереет при наведении), остальные темнеют.
  const accentHover =
    luminance(accent) < 0.025 ? mix(accent, WHITE, 0.2) : mix(accent, BLACK, 0.18);
  const accentHoverFg = readableOn(accentHover);

  // Цвет текста шапки — по итоговому цвету таблетки (бренд поверх фона
  // страницы), а не по сплошному бренду, см. headerPalette.
  const header = headerPalette(brand, pageBg);
  const headerFg = header.fg;
  const headerTint = rgba(header.color, header.alpha);
  const headerBorder = headerFg === WHITE ? 'rgba(255, 255, 255, 0.22)' : 'rgba(17, 17, 17, 0.14)';

  // Основной текст — тёплый/холодный серый с ноткой бренда, с запасом по контрасту.
  const text = darkenUntil(mix(BODY_GRAY, brand, 0.18), pageBg, BODY_TEXT);

  // Подвал — на фоне страницы. Тоны «разбавленного» основного текста (раньше
  // это была прозрачность 0.78/0.66/0.5), но не бледнее AA: прозрачный текст
  // давал 3.2–3.6:1 у реквизитов и ссылок на оферту и ~2.3–2.5:1 у копирайта
  // и «Сделано на» — а это мелкий текст, ему нужно 4.5:1.
  const footerHeading = fadeUntil(text, pageBg, 6);
  const footerText = fadeUntil(text, pageBg, 5.2);
  const footerMuted = fadeUntil(text, pageBg, AA_TEXT + 0.1);

  const muted = mutedTone(brand);
  const mutedHover = mix(muted, BLACK, 0.15);
  const noteBg = mix(muted, WHITE, 0.9);
  const noteBorder = mix(muted, WHITE, 0.7);
  const noteFg = darkenUntil(muted, noteBg, 6);
  const noteText = darkenUntil(mix(muted, NOTE_GRAY, 0.5), noteBg, 6.5);

  const style = {
    // Непрозрачный цвет шапки, каким его видно на витрине (бренд поверх фона
    // страницы): на нём --shop-header-fg гарантированно держит AA — бейджи
    // шапки и мок-шапки на главной рисуют этой парой.
    '--shop-header-bg': toHex(header.bg),
    // Полупрозрачный тон шапки поверх блюра (общая SiteHeader).
    '--shop-header-tint': headerTint,
    '--shop-header-fg': toHex(headerFg),
    '--shop-page-bg': toHex(pageBg),
    '--shop-accent': toHex(accent),
    '--shop-accent-hover': toHex(accentHover),
    '--shop-btn-hover-fg': toHex(accentHoverFg),
    // Шрифт не настраивается — только цвет: заголовки наследуют шрифт страницы.
    '--shop-title-font': 'inherit',
    '--shop-badge-bg': toHex(muted),
    '--shop-added-bg': toHex(muted),
    '--shop-added-bg-hover': toHex(mutedHover),
    '--shop-note-bg': toHex(noteBg),
    '--shop-note-border': toHex(noteBorder),
    '--shop-note-fg': toHex(noteFg),
    '--shop-note-text': toHex(noteText),
    '--shop-text': toHex(text),
    '--shop-photo-bg': toHex(photoBg),
    // Подвал сливается с фоном: отделён тонкой линией в цвет бренда, текст
    // приглушённый — реквизиты видны, но не бросаются в глаза. Все текстовые
    // цвета подвала — непрозрачные и не ниже AA к --shop-footer-bg (см. выше).
    '--shop-footer-bg': toHex(pageBg),
    '--shop-footer-border': rgba(brand, 0.3),
    '--shop-footer-heading': toHex(footerHeading),
    '--shop-footer-text': toHex(footerText),
    '--shop-footer-link': toHex(footerHeading),
    // Подчёркивание ссылки — декоративная линия, не текст: прозрачность оставляем.
    '--shop-footer-link-border': rgba(text, 0.28),
    '--shop-footer-link-hover': toHex(accent),
    '--shop-footer-muted': toHex(footerMuted),
    // Чекаут-флоу: заголовки нормального регистра в цвет акцента, CTA-пилюля акцентом.
    '--shop-heading': toHex(accent),
    '--shop-title-transform': 'none',
    '--shop-tagline-transform': 'none',
    '--shop-cta-bg': toHex(accent),
    '--shop-cta-fg': toHex(accentFg),
    '--shop-cta-hover-bg': toHex(accentHover),
    '--shop-cta-hover-fg': toHex(accentHoverFg),
    // Переменные, которые в anyforms нужны были тёмным темам и иконкам шапки:
    // у нас фон всегда светлый, поэтому акцент на фоне = общий акцент.
    '--shop-page-accent': toHex(accent),
    '--shop-page-cta-fg': toHex(accentFg),
    '--shop-cart-badge-bg': toHex(accent),
    '--shop-preorder-badge-fg': toHex(text),
  };

  return {
    style,
    pageBackground: toHex(pageBg),
    headerFg: toHex(headerFg),
    headerTint: {
      background: headerTint,
      // Без backdrop-filter SiteHeader рисует непрозрачный фон — тот же
      // итоговый цвет, по которому подобран текст.
      solid: toHex(header.bg),
      border: headerBorder,
      color: toHex(headerFg),
      logoFont: 'inherit',
    },
  };
};
