/**
 * Конфигурация тарифов Morena VPN
 */

export interface Tariff {
  id: string;           // ID тарифа в RoyaltyKey
  label: string;        // Отображаемое название
  priceRub: number;     // Цена в рублях (для бонусов и USDT)
  priceStars: number;   // Цена в Telegram Stars
  durationDays: number; // Срок действия в днях
}

export const CLASSIC_TARIFFS: Tariff[] = [
  {
    id: "classic_7days",
    label: "⏱ 7 дней — 119 ₽",
    priceRub: 119,
    priceStars: 50,
    durationDays: 7,
  },
  {
    id: "classic_30days",
    label: "📱 30 дней — 249 ₽",
    priceRub: 249,
    priceStars: 100,
    durationDays: 30,
  },
  {
    id: "classic_90days",
    label: "🔥 90 дней — 590 ₽",
    priceRub: 590,
    priceStars: 250,
    durationDays: 90,
  },
  {
    id: "classic_180days",
    label: "💼 180 дней — 1190 ₽",
    priceRub: 1190,
    priceStars: 500,
    durationDays: 180,
  },
  {
    id: "classic_365days",
    label: "👑 365 дней — 1990 ₽",
    priceRub: 1990,
    priceStars: 800,
    durationDays: 365,
  },
];

export const OBHOD_TARIFFS: Tariff[] = [
  {
    id: "obhod_7days",
    label: "⏱ 7 дней — 149 ₽",
    priceRub: 149,
    priceStars: 0,
    durationDays: 7,
  },
  {
    id: "obhod_30days",
    label: "📱 30 дней — 390 ₽",
    priceRub: 390,
    priceStars: 0,
    durationDays: 30,
  },
  {
    id: "obhod_90days",
    label: "🔥 90 дней — 790 ₽",
    priceRub: 790,
    priceStars: 0,
    durationDays: 90,
  },
  {
    id: "obhod_180days",
    label: "💼 180 дней — 1490 ₽",
    priceRub: 1490,
    priceStars: 0,
    durationDays: 180,
  },
  {
    id: "obhod_365days",
    label: "👑 365 дней — 2990 ₽",
    priceRub: 2990,
    priceStars: 0,
    durationDays: 365,
  },
];

export const TARIFFS: Tariff[] = [...CLASSIC_TARIFFS, ...OBHOD_TARIFFS];

export const TRIAL_TARIFF_ID = "trial24h";
export const TRIAL_DURATION_DAYS = 1;

// Реферальный бонус в рублях
export const REFERRAL_BONUS = 50;
