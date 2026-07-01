/**
 * Telegram-бот "Morena VPN"
 * Стек: grammY + Prisma (SQLite) + RoyaltyKey API + CryptoBot Pay
 *
 * Запуск бота: long polling или webhook-режим.
 */

import "dotenv/config";
import { bot } from "./botInstance.js";
import { cryptoBot } from "./cryptoBotApi.js";
import { startCronJobs } from "./cron.js";

async function registerMenuCommands(): Promise<void> {
  const commands = [
    { command: "start", description: "🚀 Запустить бота" },
    { command: "menu", description: "📋 Главное меню" },
    { command: "profile", description: "👤 Личный кабинет" },
    { command: "help", description: "❓ Помощь" },
    { command: "manual", description: "📖 Инструкция по настройке" },
    { command: "admin", description: "🛠 Админ-панель" },
  ];

  try {
    await bot.api.setMyCommands(commands);
    console.log("✅ Команды меню зарегистрированы");
  } catch (err) {
    console.error("[bot] Ошибка регистрации команд:", err);
  }
}

async function main(): Promise<void> {
  console.log("🌙 Morena VPN Bot стартует...");

  // Регистрируем команды меню (Bot Menu Button)
  await registerMenuCommands();

  // Запускаем CRON-задачи уведомлений
  startCronJobs(bot);

  const WEBHOOK_URL = process.env.WEBHOOK_URL;
  const CRYPTO_WEBHOOK_URL = process.env.CRYPTO_WEBHOOK_URL;

  // Webhook-режим: Telegram-обновления приходят на WEBHOOK_URL (обычно API-сервер).
  // Long polling нельзя запускать одновременно с webhook — это приводит к конфликту.
  if (WEBHOOK_URL) {
    try {
      const secretToken = process.env.WEBHOOK_SECRET;
      await bot.api.setWebhook(WEBHOOK_URL, {
        secret_token: secretToken,
      });
      console.log(`✅ Telegram Webhook зарегистрирован: ${WEBHOOK_URL}`);
      if (!secretToken) {
        console.warn("⚠️ WEBHOOK_SECRET не задан — подпись webhook не проверяется.");
      }
      console.log("🔸 Bot работает в webhook-режиме (long polling отключён).");
    } catch (err) {
      console.error("[bot] Ошибка регистрации Telegram webhook:", err);
      process.exit(1);
    }
  } else {
    // Polling-режим: бот сам опрашивает Telegram
    console.log("🔄 Bot работает в режиме long polling.");
    await bot.start({
      onStart: (info) => {
        console.log(`✅ Бот @${info.username} успешно запущен!`);
      },
    });
  }

  // CryptoBot webhook конфигурируется независимо от Telegram webhook/polling
  if (CRYPTO_WEBHOOK_URL) {
    try {
      await cryptoBot.setWebhook(CRYPTO_WEBHOOK_URL);
      console.log(`✅ CryptoBot Webhook зарегистрирован: ${CRYPTO_WEBHOOK_URL}`);
    } catch (err) {
      console.error("[bot] Ошибка регистрации CryptoBot webhook:", err);
    }
  }

  // В webhook-режиме процесс должен оставаться живым, чтобы CRON и другие фоновые задачи продолжали работу.
  if (WEBHOOK_URL) {
    await new Promise(() => {});
  }
}

main().catch((err) => {
  console.error("Критическая ошибка при запуске бота:", err);
  process.exit(1);
});
