/**
 * Configured Bot instance for use in both the standalone bot process
 * and the API-server webhook handler.
 */

import "dotenv/config";
import { Bot } from "grammy";
import { setupBotHandlers } from "./botHandlers.js";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error("BOT_TOKEN РЅРµ Р·Р°РґР°РЅ");

export const bot = new Bot(BOT_TOKEN);
setupBotHandlers(bot);
