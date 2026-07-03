import "dotenv/config";
import { logger } from "./logger.js";

const REQUIRED_VARS = ["ROYALTYKEY_API_KEY"] as const;

for (const name of REQUIRED_VARS) {
  if (!process.env[name]) {
    logger.fatal(`Переменная окружения ${name} не задана`);
    process.exit(1);
  }
}

export const config = {
  port: (() => {
    const p = parseInt(process.env.PORT ?? "4000", 10);
    if (isNaN(p) || p < 1 || p > 65535) {
      logger.fatal("PORT должен быть числом от 1 до 65535");
      process.exit(1);
    }
    return p;
  })(),

  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "https://morenavpn.pro").split(",").filter(Boolean),

  royaltyKey: {
    baseUrl: process.env.ROYALTYKEY_BASE_URL ?? "https://api.royaltykey.ru",
    apiKey: process.env.ROYALTYKEY_API_KEY!,
  },

  proxyAuthToken: process.env.PROXY_AUTH_TOKEN ?? "",

  get apiPrefix() {
    return `${this.royaltyKey.baseUrl}/${this.royaltyKey.apiKey}`;
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "60000", 10),
    max: parseInt(process.env.RATE_LIMIT_MAX ?? "100", 10),
  },

  jsonBodyLimit: process.env.MAX_BODY_SIZE ?? "100kb",
};
