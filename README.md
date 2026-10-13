# marketplace-front

Фронтенд **marketplace** — сервиса витрин в духе Ecwid: мерчант регистрируется по почте,
создаёт магазин (название, адрес `/shop/{slug}`, цвет), ведёт каталог, настраивает оформление,
подключает свой терминал Т-Банка или магазин ЮKassa и свой аккаунт СДЭК, выбирает ПВЗ отправки. Покупатель собирает корзину на витрине,
выбирает ПВЗ и платит через терминал мерчанта. Бэкенд — `marketplace-back`.

Стек: React 18, Vite 5, react-router-dom 6, axios, jwt-decode, react-hot-toast, CSS Modules, JS/JSX, pnpm 9.

## Запуск

```bash
pnpm install
cp .env.example .env.dev   # и заполните значения
pnpm dev                   # http://localhost:3000, режим dev (.env.dev)
pnpm build                 # сборка в dist/
pnpm preview               # посмотреть собранный dist/
```

`pnpm start` — то же, что `dev`, но в режиме development (`.env.development`).

## Переменные окружения

Значений по умолчанию в коде нет — всё задаётся окружением (см. `.env.example`):

| Переменная | Что это |
| --- | --- |
| `VITE_API_URL` | origin бэкенда без слэша на конце, например `http://localhost:8090`; пусто — тот же origin (за гейтвеем, на стенде и в проде) |
| `VITE_PLATFORM_HOSTS` | хосты платформы через запятую; на любом другом хосте фронт открывает витрину магазина с этим доменом; пусто — свои домены выключены |
| `VITE_CUSTOM_DOMAIN_TARGET` | куда мерчанту направить CNAME своего домена (подсказка в «Настройках»); пусто — без подсказки |
| `VITE_PLATFORM_OPERATOR_NAME` | оператор платформы (организация или ИП) — подвал, 404, политика |
| `VITE_PLATFORM_OPERATOR_INN` | ИНН оператора |
| `VITE_PLATFORM_OPERATOR_OGRN` | ОГРН / ОГРНИП оператора |
| `VITE_PLATFORM_CONTACT_EMAIL` | почта для связи с платформой |

`VITE_*` вшиваются в бандл при сборке, поэтому в Docker они передаются build-аргументами:

```bash
docker build \
  --build-arg VITE_API_URL=https://api.example.com \
  --build-arg VITE_PLATFORM_OPERATOR_NAME="ИП Иванов Иван Иванович" \
  --build-arg VITE_PLATFORM_OPERATOR_INN=000000000000 \
  --build-arg VITE_PLATFORM_OPERATOR_OGRN=000000000000000 \
  --build-arg VITE_PLATFORM_CONTACT_EMAIL=hello@example.com \
  -t marketplace-front .
docker run -p 8080:80 marketplace-front
```

Образ — nginx со статикой; любой путь отдаёт `index.html` (SPA), `/assets/*` кэшируются на год.

## Деплой

Фронт — отдельный контейнер без публичного адреса: снаружи до него доходит только гейтвей
(`marketplace-gateway`, репозиторий `marketplace-getaway`), он же отдаёт `/api/*` бэкенду. Поэтому
`VITE_API_URL` в деплое пустой. Railway: сборка и healthcheck — в `railway.toml`, `VITE_*` — переменные
сервиса (Railway передаёт их в сборку как build-args), приватный адрес `front.railway.internal:80`
(nginx слушает и IPv6). Свой сервер — см. README гейтвея.

## Свой домен магазина

Мерчант указывает домен в «Настройках» (`PUT /api/merchant/shop/domain`). Если страница открыта не на хосте
из `VITE_PLATFORM_HOSTS` (и не на localhost), `index.jsx` до первого рендера спрашивает
`GET /api/public/domains/resolve?domain=<host>` и монтирует витрину этого магазина с корня:
`/`, `/product/:productId`, `/cart`, `/checkout`, `/success`, `/offer`, `/privacy`. Платформенных страниц
(главная, вход, кабинет) на таком домене нет. Ссылки витрины строит `shopPath(slug, sub)` из
`storefrontPaths.js` — он сам выбирает `/shop/{slug}/…` или `/…`.

## Маршруты

| Путь | Страница |
| --- | --- |
| `/` | главная платформы: оффер мерчантам и витрины магазинов |
| `/login` | вход/регистрация: почта → код из письма |
| `/privacy` | политика конфиденциальности платформы |
| `/admin/onboarding` | создание магазина (пока его нет — кабинет пускает только сюда) |
| `/admin/analytics` | аналитика продаж |
| `/admin/orders` | заказы |
| `/admin/catalog`, `/admin/catalog/:productId` | каталог и карточка товара (`new` — создание) |
| `/admin/design` | оформление витрины: цвет, логотип, фото, тексты |
| `/admin/settings` | контакты, продавец, ПВЗ отправки, плашки оплаты (Т-Банк, ЮKassa) |
| `/admin/settings/payment/:slug` | подключение платёжки (`tinkoff`, `yookassa`): инструкция, ключи, чек, выбор основной, отключение |
| `/admin/shops` | все магазины платформы (только супер-админ) |
| `/shop/:slug` | витрина; дальше `product/:productId`, `cart`, `checkout`, `success`, `offer`, `privacy` |

## Устройство

- `src/apiClient.js` — axios-инстанс: Bearer из `localStorage` (`mp_jwt`), 401 в `/admin*` → `/login?from=…`.
- `src/services/*` — все вызовы API (функции возвращают `res.data`, ошибки пробрасывают);
  текст ошибки для UI — `errorMessage(err, fallback)` из `src/shared/errors.js`.
- Деньги приходят и уходят в копейках; `src/shared/money.js` — показ и поля ввода в рублях.
- Тема витрины считается из одного цвета: `buildShopTheme(brandColor)` в `src/shared/shopTheme.js`
  выдаёт CSS-переменные `--shop-*`, которые читают стили витрины.
- Корзина — отдельно на каждый магазин (`useCart(slug)`, `localStorage` `mp_cart:{slug}`).
- `AdminLayout` грузит `me` и магазин и отдаёт страницам кабинета
  `useOutletContext()` → `{ me, refreshMe, shop, setShop, reloadShop }`.
- `StorefrontLayout` отдаёт страницам витрины `{ shop, slug }`.
- Фон `body` и заголовок вкладки для страниц платформы выставляет `App.jsx`; страница со своим
  фоном красит `body` в своём `useEffect`, витрина — по теме магазина.
