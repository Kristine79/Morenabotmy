# Morena VPN Bot

Telegram-бот для продажи VPN-подписок с интеграцией RoyaltyKey и оплатой через CryptoBot (рубли / СБП).

## Run & Operate

- `cd artifacts/morena-vpn-bot && pnpm run start` — запуск бота (через workflow "Morena VPN Bot")
- `cd artifacts/morena-vpn-bot && npx prisma db push` — применить изменения схемы к SQLite БД
- `cd artifacts/morena-vpn-bot && npx prisma generate` — перегенерировать Prisma-клиент после изменений схемы
- `pnpm run typecheck` — полная проверка типов по всем пакетам

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Бот: grammY (Telegram Bot Framework)
- БД: SQLite через Prisma ORM (`artifacts/morena-vpn-bot/prisma/morena.db`)
- Платежи: CryptoBot Pay API (рубли / СБП, QR-коды через `qrcode`)
- VPN API: RoyaltyKey
- Авто-уведомления: node-cron (каждый день в 12:00 МСК)

## Where things live

- `artifacts/morena-vpn-bot/src/bot.ts` — главный файл бота, все handlers
- `artifacts/morena-vpn-bot/src/royaltyKeyApi.ts` — клиент RoyaltyKey API
- `artifacts/morena-vpn-bot/src/cryptoBotApi.ts` — клиент CryptoBot Pay API
- `artifacts/morena-vpn-bot/src/cron.ts` — CRON-задачи для уведомлений
- `artifacts/morena-vpn-bot/src/helpers.ts` — форматирование, экранирование MarkdownV2
- `artifacts/morena-vpn-bot/src/tariffs.ts` — конфигурация тарифов
- `artifacts/morena-vpn-bot/prisma/schema.prisma` — схема БД

## Architecture decisions

- SQLite выбран для простоты деплоя без внешней БД
- Платёжный поллинг запускается фоново каждые 7 секунд (max 1 час) на каждый инвойс
- Промокоды обрабатываются транзакцией Prisma (atomic increment + защита от повторного ввода)
- Реферальная ссылка: `/start ref_USERID` — бонус 50 ₽ начисляется при первой регистрации реферала
- MarkdownV2 требует экранирования всех спецсимволов — используется `escapeMarkdown()` везде

## Product

- `/start [ref_ID]` — регистрация + реферальная система
- Тест 24ч — одноразовый пробный доступ
- Покупка тарифов (1 мес 300 ₽ / 3 мес 800 ₽) с QR-кодом и фоновой проверкой оплаты
- Профиль: баланс, реф-ссылка, список ключей с кнопками продления
- Промокоды: ввод любым сообщением, транзакция начисления бонуса
- Адмн: `/addpromo КОД СУММА [МАКС_ИСПОЛЬЗОВАНИЙ]`
- CRON: уведомления за 3 дня и за 1 день до истечения подписки

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- После изменений `prisma/schema.prisma` обязательно запускать `npx prisma generate` + `npx prisma db push`
- `escapeMarkdown()` нужно применять ко всем динамическим строкам в MarkdownV2-сообщениях
- `BigInt` не сериализуется в JSON — при отладке использовать `.toString()`
- Prisma должна быть в `onlyBuiltDependencies` в `pnpm-workspace.yaml`

## Pointers

- Тарифы меняются в `artifacts/morena-vpn-bot/src/tariffs.ts`
- Реферальный бонус (50 ₽) — константа `REFERRAL_BONUS` в `tariffs.ts`
- CryptoBot: testnet/mainnet переключается в `src/cryptoBotApi.ts` конструктором `new CryptoBotApi(false)`

## Legal Links

- [Политика конфиденциальности](https://telegra.ph/Politika-konfidencialnosti-06-21-31)
- [Пользовательское соглашение](https://telegra.ph/Polzovatelskoe-soglashenie-04-01-19)
