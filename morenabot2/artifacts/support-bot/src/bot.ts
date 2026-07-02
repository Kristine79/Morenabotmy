import "dotenv/config";
import { bot } from "./botHandlers.js";

bot.api.setMyCommands([
  { command: "start", description: "Главное меню" },
]);

bot.catch((err) => {
  console.error("[support-bot] Error:", err);
});

bot.start();
console.log("✅ Support bot started");