import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { logger } from "./logger.js";
import proxyRouter from "./proxy.js";

const app = express();

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

app.use(express.json());

app.use(proxyRouter);

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "royalty-proxy" });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
});

app.listen(config.port, () => {
  logger.info(`RoyaltyKey proxy запущен на порту ${config.port}`);
  logger.info(`Бренд RoyaltyKey скрыт для домена morenavpn.pro`);
});
