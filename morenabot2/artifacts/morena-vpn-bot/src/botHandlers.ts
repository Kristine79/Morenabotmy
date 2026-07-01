/**
 * Telegram-бот "Morena VPN"
 * Стек: grammY + Prisma (SQLite) + RoyaltyKey API + CryptoBot Pay
 *
 * Структура:
 *  - /start — приветствие + реферальная система
 *  - Главное меню: тест, покупка, профиль, промокод, инструкция
 *  - Покупка: тарифы → QR-инвойс → фоновая проверка → выдача ключа
 *  - Профиль: баланс, реферальная ссылка, список ключей
 *  - Промокоды: ввод + транзакция начисления бонуса
 *  - Админ: /addpromo
 *  - CRON: авто-уведомления об истечении
 */

import "dotenv/config";
import { Bot, InlineKeyboard, InputFile } from "grammy";
import QRCode from "qrcode";
import { prisma } from "./db.js";
import { royaltyKey } from "./royaltyKeyApi.js";
import { cryptoBot, USDT_RUB_RATE } from "./cryptoBotApi.js";
import { TARIFFS, TRIAL_TARIFF_ID, TRIAL_DURATION_DAYS, REFERRAL_BONUS } from "./tariffs.js";
import { escapeMarkdown, formatVpnKey, formatDate, subStatus } from "./helpers.js";

export function setupBotHandlers(bot: Bot): void {
  const ADMIN_ID = BigInt(process.env.ADMIN_TELEGRAM_ID ?? "0");

  const POLL_INTERVAL_MS = 7000;
  const POLL_MAX_MS = 3600000;
  const FALLBACK_DURATION_DAYS = 30;

  function mainMenuKeyboard(): InlineKeyboard {
    return new InlineKeyboard()
      .text("🔮 Активировать тест (24ч)", "trial").row()
      .text("⚡ Купить Morena VPN", "buy").row()
      .text("👤 Личный чертог", "profile").row()
      .text("🎟️ Активировать промокод", "promo").row()
      .text("ℹ️ Инструкция по настройке", "howto").row()
      .text("💬 Техподдержка", "support");
  }

  function mainMenuText(): string {
    return (
      `🌙 *Добро пожаловать в Morena VPN\\!*\n\n` +
      `Быстрый, безопасный и надёжный VPN для тех, кто ценит свободу в интернете\\.\n\n` +
      `Выберите действие:`
    );
  }

  bot.command("start", async (ctx) => {
    const tgUser = ctx.from;
    if (!tgUser) return;

    const userId = BigInt(tgUser.id);
    const args = ctx.match;

    let user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      let referredById: bigint | null = null;

      if (args && args.startsWith("ref_")) {
        let refId: bigint | null = null;
        if (args?.startsWith("ref_")) {
          try {
            refId = BigInt(args.slice(4));
          } catch { /* ignore malformed */ }
        }
        if (refId !== null && refId !== userId) {
          const referrer = await prisma.user.findUnique({ where: { id: refId } });
          if (referrer) {
            referredById = refId;

            await prisma.user.update({
              where: { id: refId },
              data: { balance: { increment: REFERRAL_BONUS } },
            });

            try {
              await bot.api.sendMessage(
                refId.toString(),
                `🎉 По вашей реферальной ссылке зарегистрировался новый пользователь!`,
                { parse_mode: "MarkdownV2" }
              );
            } catch (err) {
              console.warn(`[start] Не удалось уведомить реферера ${refId}:`, err);
            }
          }
        }
      }

      await prisma.user.create({
        data: {
          id: userId,
          username: tgUser.username ?? null,
          referredById,
        },
      });
    }

    if (args && args.startsWith("renew_")) {
      const subId = args.slice(6);
      await showRenewalOptions(ctx, subId);
      return;
    }

    await ctx.reply(mainMenuText(), {
      parse_mode: "MarkdownV2",
      reply_markup: mainMenuKeyboard(),
    });
  });

  bot.callbackQuery("trial", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = BigInt(ctx.from.id);

    // Атомарная проверка и установка флага — защита от race condition
    const alreadyUsed = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (user?.hasUsedTrial) return true;
      await tx.user.update({
        where: { id: userId },
        data: { hasUsedTrial: true },
      });
      return false;
    });

    if (alreadyUsed) {
      await ctx.reply(
        `⛔ Вы уже использовали пробный период\\.\n\nПриобретите подписку, чтобы продолжить пользоваться Morena VPN\\.`,
        { parse_mode: "MarkdownV2", reply_markup: new InlineKeyboard().text("⚡ Купить", "buy") }
      );
      return;
    }

    await ctx.reply("⏳ Активируем ваш пробный доступ...");

    try {
      const vpnUser = await royaltyKey.createVPNUser(TRIAL_TARIFF_ID, userId);

      const expiresAt = new Date(vpnUser.expires_at || Date.now() + TRIAL_DURATION_DAYS * 86400000);
      await prisma.subscription.create({
        data: {
          id: vpnUser.id,
          telegramUserId: userId,
          vpnKey: vpnUser.vpn_key,
          tariffId: TRIAL_TARIFF_ID,
          expiresAt,
        },
      });

      await ctx.reply(formatVpnKey(vpnUser.vpn_key), {
        parse_mode: "MarkdownV2",
        reply_markup: new InlineKeyboard().text("ℹ️ Инструкция", "howto"),
      });
    } catch (err) {
      // Откатываем флаг, т.к. создание ключа или подписки не удалось
      await prisma.user.update({
        where: { id: userId },
        data: { hasUsedTrial: false },
      });
      console.error("[trial] Ошибка активации тестового доступа:", err);
      await ctx.reply("❌ Не удалось активировать тестовый доступ. Попробуйте позже или обратитесь в поддержку.");
    }
  });

  bot.callbackQuery("buy", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = BigInt(ctx.from.id);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const bonus = user?.balance ?? 0;

    const keyboard = new InlineKeyboard();
    for (const tariff of TARIFFS) {
      const finalPrice = Math.max(0, tariff.priceRub - bonus);
      const usdtPrice = (finalPrice / USDT_RUB_RATE).toFixed(2);
      const priceText =
        bonus > 0
          ? `${tariff.label} — ${usdtPrice} USDT (скидка ${Math.min(bonus, tariff.priceRub)} ₽)`
          : `${tariff.label}`;
      keyboard.text(priceText, `buy_tariff:${tariff.id}`).row();
    }
    keyboard.text("◀️ Назад", "menu");

    const bonusText =
      bonus > 0
        ? escapeMarkdown(`\n\n💰 У вас ${bonus} ₽ бонуса — скидка применена автоматически.`)
        : "";

    await ctx.reply(`⚡ *Выберите тариф Morena VPN:*${bonusText}`, {
      parse_mode: "MarkdownV2",
      reply_markup: keyboard,
    });
  });

  bot.callbackQuery(/^buy_tariff:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const tariffId = ctx.match[1];

    const tariff = TARIFFS.find((t) => t.id === tariffId);
    if (!tariff) {
      await ctx.reply("❌ Тариф не найден.");
      return;
    }

    const keyboard = new InlineKeyboard()
      .text("⚡ CryptoBot (USDT)", `pay_crypto:${tariffId}`).row()
      .text("⭐ Telegram Stars", `pay_stars:${tariffId}`).row()
      .text("💳 Картой", `pay_card:${tariffId}`).row()
      .text("◀️ Назад", "buy");

    await ctx.reply(
      `📦 *${escapeMarkdown(tariff.label)}*\n\nВыберите способ оплаты:`,
      { parse_mode: "MarkdownV2", reply_markup: keyboard }
    );
  });

  bot.callbackQuery(/^pay_crypto:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const tariffId = ctx.match[1];
    const userId = BigInt(ctx.from.id);

    const tariff = TARIFFS.find((t) => t.id === tariffId);
    if (!tariff) { await ctx.reply("❌ Тариф не найден."); return; }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const bonus = user?.balance ?? 0;
    const discount = Math.min(bonus, tariff.priceRub);
    const finalPrice = tariff.priceRub - discount;

    await ctx.reply("⏳ Создаём счёт на оплату...");

    try {
      if (finalPrice === 0) {
        await prisma.payment.create({
          data: {
            id: `bonus_${userId}_${Date.now()}`,
            telegramUserId: userId,
            tariffId,
            amount: 0,
            status: "paid",
          },
        });
        await grantVpnAccess(ctx, userId, tariffId, discount, 0);
        return;
      }

      const payload = `buy:${tariffId}:${userId}`;
      const invoice = await cryptoBot.createCryptoInvoice(finalPrice, payload);

      await prisma.payment.create({
        data: {
          id: invoice.invoice_id.toString(),
          telegramUserId: userId,
          tariffId,
          amount: finalPrice,
          status: "pending",
        },
      });

      const qrBuffer = await QRCode.toBuffer(invoice.pay_url, {
        type: "png",
        margin: 2,
        width: 512,
        color: { dark: "#1a1a2e", light: "#ffffff" },
      });

      const usdtAmount = (finalPrice / USDT_RUB_RATE).toFixed(2);
      const priceText = discount > 0
        ? `${tariff.priceRub} ₽ − ${discount} ₽ бонус = *${usdtAmount} USDT*`
        : `*${usdtAmount} USDT* (~${escapeMarkdown(finalPrice.toString())} ₽)`;

      const keyboard = new InlineKeyboard()
        .url("💳 Оплатить", invoice.pay_url).row()
        .text("✅ Я оплатил", `check_payment:${invoice.invoice_id}`);

      await ctx.replyWithPhoto(new InputFile(qrBuffer, "qr.png"), {
        caption:
          `🧾 *Счёт на оплату через CryptoBot*\n\n` +
          `📦 Тариф: *${escapeMarkdown(tariff.label)}*\n` +
          `💰 Сумма: ${priceText}\n\n` +
          `Оплатите USDT через CryptoBot\\.`,
        parse_mode: "MarkdownV2",
        reply_markup: keyboard,
      });

      startPaymentPolling(invoice.invoice_id, userId, tariffId, discount, ctx.chat!.id);
    } catch (err) {
      console.error("[pay_crypto] Ошибка создания инвойса:", err);
      await ctx.reply("❌ Не удалось создать счёт. Попробуйте позже.");
    }
  });

  bot.callbackQuery(/^pay_stars:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const tariffId = ctx.match[1];
    const userId = BigInt(ctx.from.id);

    const tariff = TARIFFS.find((t) => t.id === tariffId);
    if (!tariff) { await ctx.reply("❌ Тариф не найден."); return; }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const bonus = user?.balance ?? 0;
    const discount = Math.min(bonus, tariff.priceRub);
    const starsPrice = Math.max(0, tariff.priceStars - Math.round(discount / 2.38));

    try {
      const payload = `stars:${tariffId}:${userId}`;
      await ctx.replyWithInvoice(tariff.label, `Morena VPN — ${tariff.label}`, payload, "XTR", [{ label: tariff.label, amount: starsPrice }]);
    } catch (err) {
      console.error("[pay_stars] Ошибка:", err);
      await ctx.reply("❌ Не удалось создать счёт. Попробуйте позже.");
    }
  });

  bot.on("pre_checkout_query", async (ctx) => {
    await ctx.answerPreCheckoutQuery(true);
  });

  bot.on("message:successful_payment", async (ctx) => {
    const msg = ctx.message;
    if (!msg.successful_payment) return;
    const userId = BigInt(ctx.from.id);
    const payload = (msg.successful_payment as any).payload || (msg.successful_payment as any).invoice_payload;
    const starsAmount = msg.successful_payment.total_amount;

    const parts = payload.split(":");
    const type = parts[0];

    if (type === "stars") {
      if (parts.length < 3) return;
      const tariffId = parts[1];

      const tariff = TARIFFS.find((t) => t.id === tariffId);
      if (!tariff) { await ctx.reply("❌ Тариф не найден."); return; }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      const bonus = user?.balance ?? 0;
      const discount = Math.min(bonus, tariff.priceRub);

      await prisma.payment.create({
        data: {
          id: `stars_${userId}_${Date.now()}`,
          telegramUserId: userId,
          tariffId,
          amount: Math.round(starsAmount * 2.38),
          status: "paid",
        },
      });

      await grantVpnAccess(ctx, userId, tariffId, discount, Math.round(starsAmount * 2.38));
    } else if (type === "renew_stars") {
      if (parts.length < 3) return;
      const subId = parts[1];
      const tariffId = parts[2];

      const tariff = TARIFFS.find((t) => t.id === tariffId);
      if (!tariff) { await ctx.reply("❌ Тариф не найден."); return; }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      const bonus = user?.balance ?? 0;
      const discount = Math.min(bonus, tariff.priceRub);

      await prisma.payment.create({
        data: {
          id: `stars_renew_${userId}_${Date.now()}`,
          telegramUserId: userId,
          tariffId,
          amount: Math.round(starsAmount * 2.38),
          status: "paid",
        },
      });

      await processRenewal(ctx, userId, subId, tariffId, discount);
    }
  });

  bot.callbackQuery(/^pay_card:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `💳 *Оплата картой*\n\nОплата картой временно недоступна\\. Скоро добавим 🙌\n\nЕсли хотите оплатить сейчас — выберите CryptoBot или Telegram Stars\\.`,
      { parse_mode: "MarkdownV2", reply_markup: new InlineKeyboard() }
    );
  });

  async function markInvoicePaid(
    invoiceId: number,
    processor: () => Promise<void>
  ): Promise<boolean> {
    try {
      const wasUpdated = await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findUnique({
          where: { id: invoiceId.toString() },
        });
        if (!payment || payment.status === "paid") {
          return false;
        }
        await tx.payment.update({
          where: { id: invoiceId.toString() },
          data: { status: "paid" },
        });
        return true;
      });

      if (wasUpdated) {
        await processor();
      } else {
        console.log(`[markInvoicePaid] Инвойс ${invoiceId} уже обработан, пропускаем`);
      }
      return wasUpdated;
    } catch (err) {
      console.error(`[markInvoicePaid] Ошибка для инвойса ${invoiceId}:`, err);
      return false;
    }
  }

  async function markInvoiceFailed(invoiceId: number): Promise<boolean> {
    try {
      const wasUpdated = await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findUnique({
          where: { id: invoiceId.toString() },
        });
        if (!payment || payment.status !== "pending") {
          return false;
        }
        await tx.payment.update({
          where: { id: invoiceId.toString() },
          data: { status: "failed" },
        });
        return true;
      });
      return wasUpdated;
    } catch (err) {
      console.error(`[markInvoiceFailed] Ошибка для инвойса ${invoiceId}:`, err);
      return false;
    }
  }

  function startPaymentPolling(
    invoiceId: number,
    userId: bigint,
    tariffId: string,
    bonusUsed: number,
    chatId: number | string
  ): void {
    const MAX_ATTEMPTS = Math.floor(POLL_MAX_MS / POLL_INTERVAL_MS);
    let attempts = 0;

    const interval = setInterval(async () => {
      attempts++;

      if (attempts > MAX_ATTEMPTS) {
        clearInterval(interval);
        console.log(`[poll] Инвойс ${invoiceId} истёк по таймауту`);
        return;
      }

      try {
        const status = await cryptoBot.getInvoiceStatus(invoiceId);

        if (status === "paid") {
          clearInterval(interval);
          console.log(`[poll] Инвойс ${invoiceId} оплачен! Выдаём ключ пользователю ${userId}`);
          await markInvoicePaid(invoiceId, async () => {
            await grantVpnAccessById(chatId, userId, tariffId, bonusUsed);
          });
        } else if (status === "expired" || status === "cancelled") {
          clearInterval(interval);
          await markInvoiceFailed(invoiceId);

          await bot.api.sendMessage(
            chatId,
            `❌ Счёт №${invoiceId} был отменён или истёк\\. Попробуйте снова\\.`,
            { parse_mode: "MarkdownV2" }
          );
        }
      } catch (err) {
        console.error(`[poll] Ошибка проверки инвойса ${invoiceId}:`, err);
      }
    }, POLL_INTERVAL_MS);
  }

  bot.callbackQuery(/^check_payment:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery("🔍 Проверяем платёж...");
    const invoiceId = parseInt(ctx.match[1]);
    const userId = BigInt(ctx.from.id);

    try {
      const status = await cryptoBot.getInvoiceStatus(invoiceId);

      if (status === "paid") {
        const payment = await prisma.payment.findUnique({ where: { id: invoiceId.toString() } });
        if (!payment) {
          await ctx.reply("❌ Платёж не найден.");
          return;
        }

        await markInvoicePaid(invoiceId, async () => {
          await grantVpnAccess(ctx, userId, payment.tariffId, 0, payment.amount);
        });
      } else if (status === "active") {
        await ctx.reply(
          `⏳ Платёж ещё не получен\\. Ожидаем подтверждения\\.\n\nПопробуйте нажать кнопку ещё раз через 30 секунд\\.`,
          { parse_mode: "MarkdownV2" }
        );
      } else {
        await ctx.reply("❌ Счёт был отменён или истёк. Создайте новый заказ.");
      }
    } catch (err) {
      console.error("[check_payment] Ошибка:", err);
      await ctx.reply("❌ Ошибка проверки платежа. Попробуйте позже.");
    }
  });

  async function grantVpnAccess(
    ctx: { reply: Function },
    userId: bigint,
    tariffId: string,
    bonusUsed: number,
    amountPaid: number
  ): Promise<void> {
    await grantVpnAccessById(ctx, userId, tariffId, bonusUsed, amountPaid);
  }

  async function grantVpnAccessById(
    target: { reply: Function } | number | string,
    userId: bigint,
    tariffId: string,
    bonusUsed: number,
    amountPaid?: number
  ): Promise<void> {
    try {
      const vpnUser = await royaltyKey.createVPNUser(tariffId, userId);

      const tariffObj = TARIFFS.find((t) => t.id === tariffId);
      const days = tariffObj?.durationDays ?? FALLBACK_DURATION_DAYS;
      const expiresAt = vpnUser.expires_at
        ? new Date(vpnUser.expires_at)
        : new Date(Date.now() + days * 86400000);

      await prisma.subscription.create({
        data: {
          id: vpnUser.id,
          telegramUserId: userId,
          vpnKey: vpnUser.vpn_key,
          tariffId,
          expiresAt,
        },
      });

      if (bonusUsed > 0) {
        await prisma.user.update({
          where: { id: userId },
          data: { balance: { decrement: bonusUsed } },
        });
      }

      const expText = escapeMarkdown(formatDate(expiresAt));
      const successText =
        `🎉 *Оплата прошла успешно\\!*\n\n` +
        `${formatVpnKey(vpnUser.vpn_key)}\n\n` +
        `📅 Действует до: *${expText}*`;

      const keyboard = new InlineKeyboard().text("ℹ️ Инструкция по настройке", "howto");

      if (typeof target === "object" && "reply" in target) {
        await (target as { reply: Function }).reply(successText, {
          parse_mode: "MarkdownV2",
          reply_markup: keyboard,
        });
      } else {
        await bot.api.sendMessage(target as number, successText, {
          parse_mode: "MarkdownV2",
          reply_markup: keyboard,
        });
      }
    } catch (err) {
      console.error("[grantVpnAccess] Ошибка выдачи ключа:", err);
      const errMsg = "❌ Оплата прошла, но ключ не удалось создать. Обратитесь в поддержку.";

      if (typeof target === "object" && "reply" in target) {
        await (target as { reply: Function }).reply(errMsg);
      } else {
        await bot.api.sendMessage(target as number, errMsg);
      }
    }
  }

  bot.callbackQuery("profile", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = BigInt(ctx.from.id);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const subs = await prisma.subscription.findMany({
      where: { telegramUserId: userId },
      orderBy: { expiresAt: "desc" },
    });

    const botUsername = (await bot.api.getMe()).username;
    const refLink = escapeMarkdown(`https://t.me/${botUsername}?start=ref_${userId}`);

    let profileText =
      `👤 *Личный чертог*\n\n` +
      `🔔 Ваш ID: \`${userId}\`\n` +
      `💰 Бонусный баланс: *${escapeMarkdown((user?.balance ?? 0).toString())} ₽*\n` +
      `🔗 Реферальная ссылка:\n\`${refLink}\`\n\n`;

    const keyboard = new InlineKeyboard();

    if (subs.length === 0) {
      profileText += `📭 У вас нет активных подписок\\.`;
    } else {
      profileText += `📋 *Ваши подписки:*\n\n`;
      subs.forEach((sub, i) => {
        const status = subStatus(sub);
        const expiry = escapeMarkdown(formatDate(new Date(sub.expiresAt)));
        profileText +=
          `${i + 1}\\. ${status}\n` +
          `   📅 До: ${expiry}\n\n`;
        keyboard.text(`🔄 Продлить #${i + 1}`, `renew_sub:${sub.id}`).row();
      });
    }

    keyboard.text("◀️ В меню", "menu");

    await ctx.reply(profileText, {
      parse_mode: "MarkdownV2",
      reply_markup: keyboard,
    });
  });

  async function showRenewalOptions(
    ctx: { reply: Function; from?: { id: number } },
    subId: string
  ): Promise<void> {
    if (!ctx.from) {
      await ctx.reply("⚠️ Не удалось определить пользователя.");
      return;
    }
    const userId = BigInt(ctx.from.id);

    const sub = await prisma.subscription.findUnique({ where: { id: subId } });
    if (!sub || sub.telegramUserId !== userId) {
      await ctx.reply("❌ Подписка не найдена.");
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const bonus = user?.balance ?? 0;

    const keyboard = new InlineKeyboard();
    for (const tariff of TARIFFS) {
      const finalPrice = Math.max(0, tariff.priceRub - bonus);
      keyboard
        .text(
          `${tariff.label} — ${finalPrice} ₽`,
          `renew_pay:${subId}:${tariff.id}`
        )
        .row();
    }
    keyboard.text("◀️ Назад", "profile");

    await ctx.reply(
      `🔄 *Продление подписки*\n\nВыберите тариф:`,
      { parse_mode: "MarkdownV2", reply_markup: keyboard }
    );
  }

  bot.callbackQuery(/^renew_sub:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showRenewalOptions(ctx, ctx.match[1]);
  });

  bot.callbackQuery(/^renew_pay:([^:]+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const subId = ctx.match[1];
    const tariffId = ctx.match[2];

    const tariff = TARIFFS.find((t) => t.id === tariffId);
    if (!tariff) { await ctx.reply("❌ Тариф не найден."); return; }

    const keyboard = new InlineKeyboard()
      .text("⚡ CryptoBot (USDT)", `renew_crypto:${subId}:${tariffId}`).row()
      .text("⭐ Telegram Stars", `renew_stars:${subId}:${tariffId}`).row()
      .text("💳 Картой", `renew_card:${subId}:${tariffId}`).row()
      .text("◀️ Назад", "profile");

    await ctx.reply(
      `🔄 *Продление подписки*\n📦 *${escapeMarkdown(tariff.label)}*\n\nВыберите способ оплаты:`,
      { parse_mode: "MarkdownV2", reply_markup: keyboard }
    );
  });

  bot.callbackQuery(/^renew_crypto:([^:]+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const subId = ctx.match[1];
    const tariffId = ctx.match[2];
    const userId = BigInt(ctx.from.id);

    const tariff = TARIFFS.find((t) => t.id === tariffId);
    if (!tariff) { await ctx.reply("❌ Тариф не найден."); return; }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const bonus = user?.balance ?? 0;
    const discount = Math.min(bonus, tariff.priceRub);
    const finalPrice = tariff.priceRub - discount;

    await ctx.reply("⏳ Создаём счёт...");

    try {
      if (finalPrice === 0) {
        await prisma.payment.create({
          data: {
            id: `bonus_renew_${userId}_${Date.now()}`,
            telegramUserId: userId,
            tariffId,
            amount: 0,
            status: "paid",
          },
        });
        await processRenewal(ctx, userId, subId, tariffId, discount);
        return;
      }

      const usdtAmount = (finalPrice / USDT_RUB_RATE).toFixed(2);
      const payload = `renew:${subId}:${tariffId}`;
      const invoice = await cryptoBot.createCryptoInvoice(finalPrice, payload);

      await prisma.payment.create({
        data: {
          id: invoice.invoice_id.toString(),
          telegramUserId: userId,
          tariffId,
          amount: finalPrice,
          status: "pending",
        },
      });

      const qrBuffer = await QRCode.toBuffer(invoice.pay_url, {
        type: "png",
        margin: 2,
        width: 512,
      });

      const keyboard = new InlineKeyboard()
        .url("💳 Оплатить", invoice.pay_url).row()
        .text("✅ Я оплатил", `check_renew:${invoice.invoice_id}:${subId}:${tariffId}`);

      await ctx.replyWithPhoto(new InputFile(qrBuffer, "qr.png"), {
        caption:
          `🧾 *Продление подписки*\n\n` +
          `📦 Тариф: *${escapeMarkdown(tariff.label)}*\n` +
          `💰 Сумма: *${usdtAmount} USDT* (~${escapeMarkdown(finalPrice.toString())} ₽)`,

        parse_mode: "MarkdownV2",
        reply_markup: keyboard,
      });

      startRenewalPolling(invoice.invoice_id, userId, subId, tariffId, discount, ctx.chat!.id);
    } catch (err) {
      console.error("[renew_crypto] Ошибка:", err);
      await ctx.reply("❌ Не удалось создать счёт. Попробуйте позже.");
    }
  });

  bot.callbackQuery(/^renew_stars:([^:]+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const subId = ctx.match[1];
    const tariffId = ctx.match[2];
    const userId = BigInt(ctx.from.id);

    const tariff = TARIFFS.find((t) => t.id === tariffId);
    if (!tariff) { await ctx.reply("❌ Тариф не найден."); return; }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const bonus = user?.balance ?? 0;
    const discount = Math.min(bonus, tariff.priceRub);
    const starsPrice = Math.max(0, tariff.priceStars - Math.round(discount / 2.38));

    try {
      const payload = `renew_stars:${subId}:${tariffId}`;
      await ctx.replyWithInvoice(`🔄 Продление ${tariff.label}`, `Morena VPN — продление`, payload, "XTR", [{ label: tariff.label, amount: starsPrice }]);
    } catch (err) {
      console.error("[renew_stars] Ошибка:", err);
      await ctx.reply("❌ Не удалось создать счёт. Попробуйте позже.");
    }
  });

  bot.callbackQuery(/^renew_card:([^:]+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const subId = ctx.match[1];
    const tariffId = ctx.match[2];
    await ctx.reply(
      `💳 *Оплата картой*\n\nОплата картой временно недоступна\\. Скоро добавим 🙌\n\nВыберите CryptoBot или Telegram Stars для оплаты сейчас\\.`,
      { parse_mode: "MarkdownV2", reply_markup: new InlineKeyboard() }
    );
  });



  function startRenewalPolling(
    invoiceId: number,
    userId: bigint,
    subId: string,
    tariffId: string,
    bonusUsed: number,
    chatId: number | string
  ): void {
    const MAX_ATTEMPTS = Math.floor(POLL_MAX_MS / POLL_INTERVAL_MS);
    let attempts = 0;

    const interval = setInterval(async () => {
      attempts++;
      if (attempts > MAX_ATTEMPTS) { clearInterval(interval); return; }

      try {
        const status = await cryptoBot.getInvoiceStatus(invoiceId);

        if (status === "paid") {
          clearInterval(interval);
          await markInvoicePaid(invoiceId, async () => {
            await processRenewal(chatId, userId, subId, tariffId, bonusUsed);
          });
        } else if (status === "expired" || status === "cancelled") {
          clearInterval(interval);
          await markInvoiceFailed(invoiceId);
        }
      } catch (err) {
        console.error(`[renew_poll] Ошибка проверки инвойса ${invoiceId}:`, err);
      }
    }, POLL_INTERVAL_MS);
  }

  bot.callbackQuery(/^check_renew:(\d+):([^:]+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery("🔍 Проверяем...");
    const invoiceId = parseInt(ctx.match[1]);
    const subId = ctx.match[2];
    const tariffId = ctx.match[3];
    const userId = BigInt(ctx.from.id);

    const status = await cryptoBot.getInvoiceStatus(invoiceId);
    if (status === "paid") {
      await markInvoicePaid(invoiceId, async () => {
        await processRenewal(ctx, userId, subId, tariffId, 0);
      });
    } else {
      await ctx.reply("⏳ Платёж ещё не получен. Попробуйте через 30 секунд.");
    }
  });

  async function processRenewal(
    target: { reply: Function } | number | string,
    userId: bigint,
    subId: string,
    tariffId: string,
    bonusUsed: number
  ): Promise<void> {
    try {
      const renewed = await royaltyKey.renewSubscription(subId, tariffId);
      const expiresAt = renewed.expires_at
        ? new Date(renewed.expires_at)
        : new Date(Date.now() + FALLBACK_DURATION_DAYS * 86400000);

      await prisma.subscription.update({
        where: { id: subId },
        data: { expiresAt, vpnKey: renewed.vpn_key, tariffId },
      });

      if (bonusUsed > 0) {
        await prisma.user.update({
          where: { id: userId },
          data: { balance: { decrement: bonusUsed } },
        });
      }

      const expText = escapeMarkdown(formatDate(expiresAt));
      const msg = `✅ *Подписка продлена\\!*\n\n📅 Действует до: *${expText}*\n\n${formatVpnKey(renewed.vpn_key)}`;

      if (typeof target === "object" && "reply" in target) {
        await (target as { reply: Function }).reply(msg, { parse_mode: "MarkdownV2" });
      } else {
        await bot.api.sendMessage(target as number, msg, { parse_mode: "MarkdownV2" });
      }
    } catch (err) {
      console.error("[processRenewal] Ошибка:", err);
    }
  }

  bot.callbackQuery("support", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `💬 *Техподдержка Morena VPN*\n\n` +
      `📬 Отвечаем быстро\\!\n\n` +
      `По всем вопросам:\n` +
      `• Технические проблемы\n` +
      `• Вопросы по оплате\n` +
      `• Проблемы с подпиской\n\n` +
      `Напишите: @morena_vpn_support`,
      { parse_mode: "MarkdownV2", reply_markup: new InlineKeyboard().text("◀️ Назад", "menu") }
    );
  });

  bot.callbackQuery("promo", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `🎟️ *Введите промокод*\n\nОтправьте промокод следующим сообщением\.`,
      { parse_mode: "MarkdownV2", reply_markup: new InlineKeyboard().text("◀️ Назад", "menu") }
    );
  });

  async function sendManual(ctx: { reply: Function }): Promise<void> {
    const keyboard = new InlineKeyboard()
      .url("📥 Скачать для Windows", "https://github.com/hiddify/hiddify-app/releases/latest")
      .row()
      .url("📥 Скачать для Android", "https://play.google.com/store/apps/details?id=app.hiddify.com")
      .row()
      .url("📥 Скачать для iOS", "https://apps.apple.com/app/hiddify/id6596777532")
      .row()
      .url("📥 Скачать для macOS", "https://github.com/hiddify/hiddify-app/releases/latest")
      .row()
      .url("📖 Полная инструкция на сайте", "https://github.com/Kristine79/morenamanualsite")
      .row()
      .text("◀️ В меню", "menu");

    await ctx.reply(
      `📖 *Инструкция по настройке Morena VPN*\n\n` +
      `\\#\\#\\#\\# 1\\. Установка приложения\n\n` +
      `Скачайте и установите *Hiddify* для вашей платформы:\n\n` +
      `• *Windows / Linux* — [GitHub Releases](https://github.com/hiddify/hiddify-app/releases)\n` +
      `• *macOS* — [GitHub Releases](https://github.com/hiddify/hiddify-app/releases)\n` +
      `• *Android* — [Google Play](https://play.google.com/store/apps/details?id=app.hiddify.com)\n` +
      `• *iOS / iPadOS* — [App Store](https://apps.apple.com/app/hiddify/id6596777532)\n\n` +
      `Альтернативные клиенты: *V2rayNG* \\(Android\\) или *V2box* \\(iOS\\)\\.\n\n` +
      `\\#\\#\\#\\# 2\\. Добавление подписки\n\n` +
      `После покупки подписки в боте вы получите ключ доступа\\.\n\n` +
      `• Откройте Hiddify\n` +
      `• Нажмите \\"\\+\\" → \\"Добавить из буфера\\"\n` +
      `• Скопируйте ключ из бота и вставьте\n\n` +
      `\\#\\#\\#\\# 3\\. Подключение\n\n` +
      `• Нажмите на добавленный профиль\n` +
      `• Нажмите \\"Подключиться\\" / \\"Connect\\"\n` +
      `• Готово — вы в Morena VPN\\!\n\n` +
      `💡 *Совет:* если не работает — попробуйте переключить протокол или сервер в настройках приложения\\.\n\n` +
      `📄 [Политика конфиденциальности](https://telegra.ph/Politika-konfidencialnosti-06-21-31)\n` +
      `📋 [Пользовательское соглашение](https://telegra.ph/Polzovatelskoe-soglashenie-04-01-19)\n\n` +
      `По вопросам: @morena_vpn_support`,
      { parse_mode: "MarkdownV2", reply_markup: keyboard }
    );
  }

  bot.callbackQuery("howto", async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendManual(ctx);
  });

  bot.callbackQuery("menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(mainMenuText(), {
      parse_mode: "MarkdownV2",
      reply_markup: mainMenuKeyboard(),
    });
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim().toLowerCase();

    if (text.startsWith("/")) return;

    if (text === "menu" || text === "главное меню") {
      await ctx.reply(mainMenuText(), {
        parse_mode: "MarkdownV2",
        reply_markup: mainMenuKeyboard(),
      });
      return;
    }

    if (text === "profile" || text === "личный кабинет") {
      const userId = BigInt(ctx.from.id);
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const subs = await prisma.subscription.findMany({
        where: { telegramUserId: userId },
        orderBy: { expiresAt: "desc" },
      });
      const botUsername = (await bot.api.getMe()).username;
      const refLink = escapeMarkdown(`https://t.me/${botUsername}?start=ref_${userId}`);

      let profileText =
        `👤 *Личный чертог*\n\n` +
        `🔔 Ваш ID: \`${userId}\`\n` +
        `💰 Бонусный баланс: *${escapeMarkdown((user?.balance ?? 0).toString())} ₽*\n` +
        `🔗 Реферальная ссылка:\n\`${refLink}\`\n\n`;

      const keyboard = new InlineKeyboard();
      if (subs.length === 0) {
        profileText += `📭 У вас нет активных подписок\\.`;
      } else {
        profileText += `📋 *Ваши подписки:*\n\n`;
        subs.forEach((sub, i) => {
          const status = subStatus(sub);
          const expiry = escapeMarkdown(formatDate(new Date(sub.expiresAt)));
          profileText += `${i + 1}\\. ${status}\n   📅 До: ${expiry}\n\n`;
          keyboard.text(`🔄 Продлить #${i + 1}`, `renew_sub:${sub.id}`).row();
        });
      }
      keyboard.text("◀️ В меню", "menu");
      await ctx.reply(profileText, { parse_mode: "MarkdownV2", reply_markup: keyboard });
      return;
    }

    if (text === "help" || text === "помощь") {
      await ctx.reply(
        `❓ *Помощь по боту Morena VPN*\n\n` +
        `Доступные команды:\n` +
        `• /start — Запустить бота\n` +
        `• /menu — Главное меню\n` +
        `• /profile — Личный кабинет\n` +
        `• /help — Помощь\n\n` +
        `По вопросам: @morena_vpn_support`,
        { parse_mode: "MarkdownV2" }
      );
      return;
    }

    const userId = BigInt(ctx.from.id);

    await prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, username: ctx.from.username ?? null },
      update: {},
    });

    try {
      const code = text.toUpperCase();
      const promo = await prisma.promocode.findUnique({ where: { id: code } });

      if (!promo) {
        await ctx.reply(
          `❌ Промокод *${escapeMarkdown(code)}* не найден\\.`,
          { parse_mode: "MarkdownV2" }
        );
        return;
      }

      if (promo.usesCount >= promo.maxUses) {
        await ctx.reply("❌ Этот промокод уже исчерпал лимит использований.");
        return;
      }

      const alreadyUsed = await prisma.usedPromocode.findUnique({
        where: { userId_promocodeId: { userId, promocodeId: code } },
      });

      if (alreadyUsed) {
        await ctx.reply("❌ Вы уже использовали этот промокод.");
        return;
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { balance: { increment: promo.bonusAmount } },
        }),
        prisma.promocode.update({
          where: { id: code },
          data: { usesCount: { increment: 1 } },
        }),
        prisma.usedPromocode.create({
          data: { userId, promocodeId: code },
        }),
      ]);

      await ctx.reply(
        `✅ Промокод *${escapeMarkdown(code)}* активирован\\!\n\n` +
          `💰 Вам начислено *${escapeMarkdown(promo.bonusAmount.toString())} ₽* бонуса\\.`,
        { parse_mode: "MarkdownV2" }
      );
    } catch (err) {
      console.error("[promo] Ошибка обработки промокода:", err);
      await ctx.reply("❌ Ошибка при активации промокода. Попробуйте позже.");
    }
  });

  bot.command("addpromo", async (ctx) => {
    const userId = BigInt(ctx.from?.id ?? 0);

    if (userId !== ADMIN_ID) {
      await ctx.reply("⛔ Эта команда доступна только администратору.");
      return;
    }

    const parts = ctx.match?.trim().split(/\s+/) ?? [];

    if (parts.length < 2) {
      await ctx.reply(
        "❌ Формат: `/addpromo КОД СУММА [МАКС_ИСПОЛЬЗОВАНИЙ]`\n\n" +
          "Пример: `/addpromo MORENA50 50 100`",
        { parse_mode: "MarkdownV2" }
      );
      return;
    }

    const [code, amountStr, maxUsesStr] = parts;
    const bonusAmount = parseInt(amountStr);
    const maxUses = parseInt(maxUsesStr ?? "1000");

    if (isNaN(bonusAmount) || bonusAmount <= 0) {
      await ctx.reply("❌ Укажите корректную сумму бонуса.");
      return;
    }

    try {
      const promo = await prisma.promocode.upsert({
        where: { id: code.toUpperCase() },
        create: {
          id: code.toUpperCase(),
          bonusAmount,
          maxUses,
          usesCount: 0,
        },
        update: { bonusAmount, maxUses },
      });

      await ctx.reply(
        `✅ Промокод *${escapeMarkdown(promo.id)}* создан:\n` +
          `💰 Бонус: *${promo.bonusAmount} ₽*\n` +
          `🔢 Макс\\. использований: *${promo.maxUses}*`,
        { parse_mode: "MarkdownV2" }
      );
    } catch (err) {
      console.error("[addpromo] Ошибка:", err);
      await ctx.reply("❌ Ошибка создания промокода.");
    }
  });

  bot.catch((err) => {
    console.error("[bot] Необработанная ошибка:", err.error);
  });

  bot.command("menu", async (ctx) => {
    await ctx.reply(mainMenuText(), {
      parse_mode: "MarkdownV2",
      reply_markup: mainMenuKeyboard(),
    });
  });

  bot.command("manual", async (ctx) => {
    await sendManual(ctx);
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      `❓ *Помощь по боту Morena VPN*\n\n` +
      `Доступные команды:\n` +
      `• /start — Запустить бота и получить меню\n` +
      `• /menu — Показать главное меню\n` +
      `• /profile — Личный кабинет\n` +
      `• /manual — Инструкция по настройке\n` +
      `• /help — Эта справка\n\n` +
      `По вопросам: @morena_vpn_support`,
      { parse_mode: "MarkdownV2" }
    );
  });
}
