import { logger } from "./logger.js";

function env(name: string, fallback?: string): string {
  const val = process.env[name] ?? fallback;
  if (!val) {
    logger.fatal(`Переменная окружения ${name} не задана`);
    process.exit(1);
  }
  return val;
}

export const config = {
  port: parseInt(process.env.PORT ?? "4000", 10),

  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "https://morenavpn.pro").split(","),

  royaltyKey: {
    baseUrl: env("ROYALTYKEY_BASE_URL", "https://api.royaltykey.ru"),
    apiKey: env("ROYALTYKEY_API_KEY"),
  },

  get apiPrefix() {
    return `${this.royaltyKey.baseUrl}/${this.royaltyKey.apiKey}`;
  },
};
