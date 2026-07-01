/**
 * Bot webhook route
 * Receives Telegram updates via webhook and processes them through grammY.
 *
 * Uses the shared bot instance from @workspace/morena-vpn-bot so that
 * all commands and callback handlers registered by the bot are available
 * through the webhook endpoint.
 *
 * Telegram sends a secret token in the X-Telegram-Bot-Api-Secret-Token header
 * when the webhook was configured with secret_token. We verify it here to
 * reject requests from unauthorized sources.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { type Bot } from "grammy";
import { type Update } from "@grammyjs/types";

const router: IRouter = Router();

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// Lazy-load the configured bot instance only when BOT_TOKEN is present.
// This keeps the API server usable even if the bot package is not configured.
const botPromise: Promise<Bot | null> = BOT_TOKEN
  ? import("@workspace/morena-vpn-bot/src/botInstance.js").then(
      (module) => module.bot as Bot,
    )
  : Promise.resolve(null);

if (!BOT_TOKEN) {
  console.error("[bot] BOT_TOKEN не задан — webhook endpoint недоступен");
}

if (BOT_TOKEN && !WEBHOOK_SECRET) {
  console.warn(
    "[bot] WEBHOOK_SECRET не задан — подпись Telegram webhook не будет проверяться",
  );
}

function verifySecretToken(req: Request): boolean {
  if (!WEBHOOK_SECRET) return true; // verification disabled when secret not configured
  const header = req.headers["x-telegram-bot-api-secret-token"];
  return header === WEBHOOK_SECRET;
}

router.post("/bot/webhook", async (req: Request, res: Response): Promise<void> => {
  const bot = await botPromise;

  if (!bot) {
    res.status(503).json({ error: "Bot webhook is not configured" });
    return;
  }

  if (!verifySecretToken(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Update = req.body as any;

    if (!update || !update.update_id) {
      res.status(400).json({ error: "Invalid update" });
      return;
    }

    // Process the update through the shared grammY bot instance
    await bot.handleUpdate(update);

    // Respond immediately to Telegram (within 60s window)
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[botWebhook] Ошибка обработки обновления:", err);
    // Still return 200 to avoid Telegram retries for non-critical errors
    res.status(200).json({ ok: true });
  }
});

export default router;
