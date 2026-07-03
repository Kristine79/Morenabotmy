# Структура проекта Morena VPN

```
royaltyvpnpartn/
│
├── morenabot2/                          # Основной монорепозиторий (pnpm workspace)
│   │
│   ├── package.json                    # Корневой workspace (typecheck, build)
│   ├── pnpm-workspace.yaml             # packages: artifacts/*, lib/*, scripts
│   ├── tsconfig.base.json              # Общий TS конфиг (ES2022, strict)
│   ├── tsconfig.json                   # Проектные ссылки на lib/*
│   │
│   ├── .env                            # Переменные окружения (ключи API, токены)
│   ├── .npmrc
│   ├── replit.md                       # Документация по запуску и архитектуре
│   │
│   ├── autoconnect/                    # Сайт автоподключения (Vercel)
│   │   ├── index.html                  # Инструкция с киберпанк-стилем
│   │   └── script.js                   # Обработка ключа из URL, копирование
│   │
│   ├── artifacts/                      # Исполняемые приложения
│   │   │
│   │   ├── morena-vpn-bot/            # @workspace/morena-vpn-bot — Telegram-бот
│   │   │   ├── src/
│   │   │   │   ├── bot.ts             # Точка входа (polling / webhook)
│   │   │   │   ├── botInstance.ts     # Создание экземпляра grammY
│   │   │   │   ├── botHandlers.ts     # Все обработчики: меню, покупка, профиль
│   │   │   │   ├── royaltyKeyApi.ts   # Клиент API RoyaltyKey (создать юзера, подписку)
│   │   │   │   ├── cryptoBotApi.ts    # Клиент CryptoBot Pay (счета, проверка оплаты)
│   │   │   │   ├── tariffs.ts         # Тарифы: Классик и Цифровой камуфляж
│   │   │   │   ├── cron.ts            # CRON: напоминания об окончании подписки
│   │   │   │   ├── helpers.ts         # Форматирование, экранирование MarkdownV2
│   │   │   │   └── db.ts              # PrismaClient singleton
│   │   │   └── prisma/
│   │   │       ├── schema.prisma      # User, Subscription, Payment, Promocode
│   │   │       └── morena.db          # SQLite база данных
│   │   │
│   │   ├── api-server/               # @workspace/api-server — Express API
│   │   │   ├── src/
│   │   │   │   ├── index.ts          # Точка входа: .env + Express на PORT
│   │   │   │   ├── app.ts            # CORS, сессии, pino-http логирование
│   │   │   │   ├── routes/
│   │   │   │   │   ├── index.ts      # Агрегатор роутов
│   │   │   │   │   ├── health.ts     # GET /api/healthz
│   │   │   │   │   ├── auth.ts       # Telegram Login Widget аутентификация
│   │   │   │   │   ├── admin.ts      # Статистика, пользователи, платежи, промокоды
│   │   │   │   │   ├── reseller.ts   # Баланс реселлера, создание/продление/удаление
│   │   │   │   │   └── bot.ts        # POST /bot/webhook
│   │   │   │   ├── middleware/
│   │   │   │   │   └── requireAuth.ts # Проверка сессии
│   │   │   │   ├── lib/logger.ts     # Pino логгер
│   │   │   │   └── types/session.d.ts # Типы сессии Express
│   │   │   └── build.mjs             # esbuild конфиг
│   │   │
│   │   ├── admin-panel/             # @workspace/admin-panel — React админка
│   │   │   ├── src/pages/
│   │   │   │   ├── dashboard.tsx     # Обзор: статистика, баланс реселлера
│   │   │   │   ├── login.tsx         # Вход через Telegram Widget
│   │   │   │   ├── users.tsx         # Управление пользователями
│   │   │   │   ├── subscriptions.tsx # Подписки: фильтр, продление, удаление
│   │   │   │   ├── payments.tsx      # История платежей
│   │   │   │   ├── promocodes.tsx    # Промокоды: создание, статистика
│   │   │   │   ├── create-client.tsx # Создание клиента через RoyaltyKey
│   │   │   │   └── not-found.tsx     # 404
│   │   │   ├── src/components/ui/    # shadcn/ui (55+ компонентов)
│   │   │   ├── src/hooks/use-auth.tsx # Auth контекст
│   │   │   └── vite.config.ts        # Прокси на /api
│   │   │
│   │   ├── support-bot/             # Бот поддержки (Telegram)
│   │   │   ├── prisma/schema.prisma # Ticket, Message
│   │   │   └── src/
│   │   │       ├── bot.ts           # Точка входа
│   │   │       ├── botHandlers.ts   # Тикеты, переписка, закрытие
│   │   │       └── db.ts            # PrismaClient
│   │   │
│   │   └── mockup-sandbox/          # Песочница для прототипирования UI
│   │       └── src/                 # React + shadcn/ui
│   │
│   ├── lib/                          # Разделяемые библиотеки
│   │   ├── api-spec/                # OpenAPI + Orval codegen
│   │   ├── api-zod/                 # Сгенерированные Zod схемы
│   │   ├── api-client-react/        # Сгенерированные React Query хуки
│   │   └── db/                      # Drizzle ORM (заготовка под PostgreSQL)
│   │
│   ├── scripts/                      # Вспомогательные скрипты
│   ├── docs/                         # Документация и планы
│   └── attached_assets/             # Описания вакансий (архив)
│
├── royalty-proxy/                    # Прокси-сервер для RoyaltyKey API
│   ├── src/
│   │   ├── index.ts                 # Express сервер
│   │   ├── proxy.ts                 # Проксирование запросов с API-ключом
│   │   ├── tariffs.ts               # Определения тарифов
│   │   ├── sanitize.ts              # Санитизация ввода
│   │   ├── config.ts                # Загрузка конфигурации
│   │   └── logger.ts                # Pino логгер
│   └── .env.example
│
├── fix_markdown.py                  # Фикс экранирования Markdown в bot.ts
├── update_bot.py / .ps1             # Обновление ссылок в боте
├── test_run.ts                      # Тестовый скрипт
└── TODO.md                          # План пофиксить баги
```

## Зависимости между пакетами

```
api-spec (OpenAPI)
  └─→ api-zod (Zod)
       └─→ api-client-react (React Query)
            └─→ admin-panel, mockup-sandbox

db (Drizzle) ──→ api-server

morena-vpn-bot ──→ api-server

api-server ──→ admin-panel (через API)
```

## Основные технологии

| Компонент | Стек |
|-----------|------|
| Telegram-бот | grammY, TypeScript |
| API-сервер | Express 5, esbuild, Zod |
| Админка | React 19, Vite 7, shadcn/ui, TanStack Query |
| БД бота | SQLite + Prisma |
| БД админки | PostgreSQL + Drizzle (в разработке) |
| Платежи | CryptoBot Pay |
| VPN API | RoyaltyKey |
| Сайт инструкции | Vercel, Tailwind CSS |
