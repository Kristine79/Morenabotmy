import { Router, type IRouter, type Request, type Response } from "express";
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

function extractError(err: unknown): string {
  if (err instanceof AxiosError) {
    if (err.response) {
      const data = err.response.data as Record<string, unknown> | string;
      const detail = typeof data === "object" ? (data.detail ?? JSON.stringify(data)) : data;
      return `RK API ${err.response.status}: ${detail}`;
    }
    return err.code ?? err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

// ── GET /rk/balance ──────────────────────────────────────────────────────

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

// ── POST /rk/users ───────────────────────────────────────────────────────

router.post("/rk/users", async (req: Request, res: Response): Promise<void> => {
  try {
    const response = await api.post("/users", req.body ?? {});
    const clean = sanitizeResponse(response.data);
    res.status(201).json(clean);
  } catch (err: unknown) {
    logger.error({ err, body: req.body }, "POST /users failed");
    const msg = extractError(err);
    res.status(502).json({ error: "Ошибка создания пользователя", detail: msg });
  }
});

// ── POST /rk/users/:uuid/subscription ───────────────────────────────────

router.post("/rk/users/:uuid/subscription", async (req: Request, res: Response): Promise<void> => {
  const { uuid } = req.params;
  const { days, tariff: rawTariff } = req.body as { days?: number; tariff?: string };

  if (!days || !rawTariff) {
    res.status(400).json({ error: "Поля days и tariff обязательны" });
    return;
  }

  try {
    const response = await api.post(`/users/${uuid}/subscription`, { days, tariff: rawTariff });
    const clean = sanitizeResponse(response.data);
    res.json(clean);
  } catch (err: unknown) {
    logger.error({ err, uuid, days, tariff: rawTariff }, "POST /users/:uuid/subscription failed");
    const msg = extractError(err);
    res.status(502).json({ error: "Ошибка создания подписки", detail: msg });
  }
});

// ── GET /rk/users/:uuid ─────────────────────────────────────────────────

router.get("/rk/users/:uuid", async (req: Request, res: Response): Promise<void> => {
  const { uuid } = req.params;
  try {
    const response = await api.get(`/users/${uuid}`);
    const clean = sanitizeResponse(response.data);
    res.json(clean);
  } catch (err: unknown) {
    logger.error({ err, uuid }, "GET /users/:uuid failed");
    const msg = extractError(err);
    res.status(502).json({ error: "Ошибка получения пользователя", detail: msg });
  }
});

// ── GET /rk/users ───────────────────────────────────────────────────────

router.get("/rk/users", async (_req: Request, res: Response): Promise<void> => {
  try {
    const response = await api.get("/users");
    const clean = sanitizeResponse(response.data);
    res.json(clean);
  } catch (err: unknown) {
    logger.error({ err }, "GET /users failed");
    const msg = extractError(err);
    res.status(502).json({ error: "Ошибка списка пользователей", detail: msg });
  }
});

// ── DELETE /rk/users/:uuid ──────────────────────────────────────────────

router.delete("/rk/users/:uuid", async (req: Request, res: Response): Promise<void> => {
  const { uuid } = req.params;
  try {
    const response = await api.delete(`/users/${uuid}`);
    const clean = sanitizeResponse(response.data);
    res.json(clean);
  } catch (err: unknown) {
    logger.error({ err, uuid }, "DELETE /users/:uuid failed");
    const msg = extractError(err);
    res.status(502).json({ error: "Ошибка удаления пользователя", detail: msg });
  }
});

// ── POST /rk/subscriptions ──────────────────────────────────────────────
// Упрощённый эндпоинт: принимает localId и создаёт юзера + подписку

router.post("/rk/subscriptions", async (req: Request, res: Response): Promise<void> => {
  const { tariffId } = req.body as { tariffId?: string };
  if (!tariffId) {
    res.status(400).json({ error: "Поле tariffId обязательно" });
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
    const msg = extractError(err);
    res.status(502).json({ error: "Ошибка создания подписки", detail: msg });
  }
});

// ── GET /rk/plans ───────────────────────────────────────────────────────
// Возвращает список тарифов — без упоминания RoyaltyKey

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
    const msg = extractError(err);
    res.status(502).json({ error: "Ошибка получения тарифов", detail: msg });
  }
});

export default router;
