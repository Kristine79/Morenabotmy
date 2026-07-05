import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import axios, { AxiosError } from "axios";
import { config } from "./config.js";
import { resolveTariff, getTariff } from "./tariffs.js";
import { sanitizeResponse } from "./sanitize.js";
import { logger } from "./logger.js";

const router: IRouter = Router();

const RK_TIMEOUT = parseInt(process.env.RK_TIMEOUT ?? "15000", 10);

const api = axios.create({
  baseURL: config.apiPrefix,
  timeout: RK_TIMEOUT,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.config?.url) {
      error.config.url = error.config.url.replace(/\/[a-f0-9-]{36}/gi, "/REDACTED");
    }
    return Promise.reject(error);
  }
);

function requireProxyAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.proxyAuthToken) {
    next();
    return;
  }
  const authHeader = req.headers["authorization"] || req.headers["x-proxy-token"];
  const auth = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (auth !== `Bearer ${config.proxyAuthToken}` && auth !== config.proxyAuthToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.use(requireProxyAuth);

function extractError(err: unknown): string {
  if (err instanceof AxiosError) {
    if (err.response) {
      const data = err.response.data as Record<string, unknown> | string;
      const detail = typeof data === "object" ? (data.detail ?? "(error)") : "(error)";
      return `RK API ${err.response.status}`;
    }
    if (err.code === "ECONNABORTED") return "Upstream timeout";
    if (err.code === "ENOTFOUND") return "DNS error";
    return "Upstream error";
  }
  return "Internal error";
}

router.get("/rk/balance", async (_req: Request, res: Response): Promise<void> => {
  try {
    const response = await api.get("/balance");
    const clean = sanitizeResponse(response.data) as Record<string, unknown>;
    res.json(clean);
  } catch (err: unknown) {
    logger.error({ err }, "GET /balance failed");
    res.status(502).json({ error: "Ошибка запроса к провайдеру" });
  }
});

router.post("/rk/users", async (req: Request, res: Response): Promise<void> => {
  try {
    const response = await api.post("/users", req.body ?? {});
    const clean = sanitizeResponse(response.data);
    res.status(201).json(clean);
  } catch (err: unknown) {
    logger.error({ err }, "POST /users failed");
    res.status(502).json({ error: "Ошибка создания пользователя" });
  }
});

router.post("/rk/users/:uuid/subscription", async (req: Request, res: Response): Promise<void> => {
  const uuidParam = req.params.uuid;
  const uuid = Array.isArray(uuidParam) ? uuidParam[0] : uuidParam;
  const { days, tariff: rawTariff } = req.body as { days?: number; tariff?: string };

  if (!days || !rawTariff) {
    res.status(400).json({ error: "Поля days и tariff обязательны" });
    return;
  }

  if (typeof days !== "number" || days < 1 || days > 365) {
    res.status(400).json({ error: "days должен быть от 1 до 365" });
    return;
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(rawTariff)) {
    res.status(400).json({ error: "Недопустимое значение tariff" });
    return;
  }

  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(uuid)) {
    res.status(400).json({ error: "Неверный формат UUID" });
    return;
  }

  try {
    const response = await api.post(`/users/${uuid}/subscription`, { days, tariff: rawTariff });
    const clean = sanitizeResponse(response.data);
    res.json(clean);
  } catch (err: unknown) {
    logger.error({ err }, "POST /users/:uuid/subscription failed");
    res.status(502).json({ error: "Ошибка создания подписки" });
  }
});

router.get("/rk/users/:uuid", async (req: Request, res: Response): Promise<void> => {
  const uuidParam = req.params.uuid;
  const uuid = Array.isArray(uuidParam) ? uuidParam[0] : uuidParam;

  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(uuid)) {
    res.status(400).json({ error: "Неверный формат UUID" });
    return;
  }

  try {
    const response = await api.get(`/users/${uuid}`);
    const clean = sanitizeResponse(response.data);
    res.json(clean);
  } catch (err: unknown) {
    logger.error({ err }, "GET /users/:uuid failed");
    res.status(502).json({ error: "Ошибка получения пользователя" });
  }
});

router.get("/rk/users", async (_req: Request, res: Response): Promise<void> => {
  try {
    const response = await api.get("/users");
    const clean = sanitizeResponse(response.data);
    res.json(clean);
  } catch (err: unknown) {
    logger.error({ err }, "GET /users failed");
    res.status(502).json({ error: "Ошибка списка пользователей" });
  }
});

router.delete("/rk/users/:uuid", async (req: Request, res: Response): Promise<void> => {
  const uuidParam = req.params.uuid;
  const uuid = Array.isArray(uuidParam) ? uuidParam[0] : uuidParam;

  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(uuid)) {
    res.status(400).json({ error: "Неверный формат UUID" });
    return;
  }

  try {
    const response = await api.delete(`/users/${uuid}`);
    const clean = sanitizeResponse(response.data);
    res.json(clean);
  } catch (err: unknown) {
    logger.error({ err }, "DELETE /users/:uuid failed");
    res.status(502).json({ error: "Ошибка удаления пользователя" });
  }
});

router.post("/rk/subscriptions", async (req: Request, res: Response): Promise<void> => {
  const { tariffId } = req.body as { tariffId?: string };
  if (!tariffId) {
    res.status(400).json({ error: "Поле tariffId обязательно" });
    return;
  }

  if (typeof tariffId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(tariffId)) {
    res.status(400).json({ error: "Недопустимое значение tariffId" });
    return;
  }

  const mapped = resolveTariff(tariffId);
  if (!mapped) {
    res.status(400).json({ error: `Неизвестный тариф: ${tariffId}` });
    return;
  }

  try {
    const userRes = await api.post("/users", {});
    const user = userRes.data as { uuid: string };

    const subRes = await api.post(`/users/${user.uuid}/subscription`, mapped);
    const sub = subRes.data as { success: boolean; days_added: number; price: number; new_balance: number };

    const tariffInfo = getTariff(tariffId);
    const clean = sanitizeResponse({
      uuid: user.uuid,
      tariffId,
      tariffLabel: tariffInfo?.label ?? tariffId,
      daysAdded: sub.days_added,
      price: sub.price,
      newBalance: sub.new_balance,
    });

    res.status(201).json(clean);
  } catch (err: unknown) {
    logger.error({ err, tariffId }, "POST /rk/subscriptions failed");
    res.status(502).json({ error: "Ошибка создания подписки" });
  }
});

router.post("/rk/users/:uuid/buy-traffic", async (req: Request, res: Response): Promise<void> => {
  const uuidParam = req.params.uuid;
  const uuid = Array.isArray(uuidParam) ? uuidParam[0] : uuidParam;
  const gb = parseInt(req.query.gb as string);

  if (![10, 20, 30, 50].includes(gb)) {
    res.status(400).json({ error: "Неверный размер пакета. Допустимо: 10, 20, 30, 50" });
    return;
  }

  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(uuid)) {
    res.status(400).json({ error: "Неверный формат UUID" });
    return;
  }

  try {
    const response = await api.post(`/users/${uuid}/buy-traffic?gb=${gb}`);
    const clean = sanitizeResponse(response.data);
    res.json(clean);
  } catch (err: unknown) {
    logger.error({ err }, "POST /rk/users/:uuid/buy-traffic failed");
    res.status(502).json({ error: "Ошибка покупки трафика" });
  }
});

router.get("/rk/plans", async (_req: Request, res: Response): Promise<void> => {
  try {
    const response = await api.get("/balance");
    const data = response.data as {
      prices?: Record<string, { base: number; current: number }>;
    };

    const prices = data.prices ?? {};
    const plans = Object.entries(prices).map(([days, price]) => ({
      days: Number(days.replace("d", "")),
      basePrice: price.base,
      currentPrice: price.current,
    }));

    res.json(sanitizeResponse(plans));
  } catch (err: unknown) {
    logger.error({ err }, "GET /rk/plans failed");
    res.status(502).json({ error: "Ошибка получения тарифов" });
  }
});

export default router;
