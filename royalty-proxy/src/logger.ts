import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["req.headers.authorization", "req.headers.cookie"],
  ...(isDev
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});
