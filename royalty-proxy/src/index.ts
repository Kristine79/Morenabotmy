import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { logger } from "./logger.js";
import proxyRouter from "./proxy.js";
import { rateLimiter } from "./rateLimit.js";

const app = express();

app.set("trust proxy", 1);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.allowedOrigins.some((o) => origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed`));
    }
  },
  credentials: true,
}));

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Powered-By", "");
  res.removeHeader("X-Powered-By");
  next();
});

app.use("/rk", rateLimiter);

app.use(express.json({ limit: config.jsonBodyLimit }));

app.use(proxyRouter);

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "royalty-proxy" });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if ((err as unknown as Record<string, unknown>).type === "entity.too.large") {
    res.status(413).json({ error: "Payload too large" });
    return;
  }
  if (err.message?.startsWith("Origin")) {
    res.status(403).json({ error: "Origin not allowed" });
    return;
  }
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
});

app.listen(config.port, () => {
  logger.info(`RoyaltyKey proxy запущен на порту ${config.port}`);
  if (!config.proxyAuthToken) {
    logger.warn("PROXY_AUTH_TOKEN не задан — маршруты /rk/* НЕ защищены авторизацией");
  }
});
