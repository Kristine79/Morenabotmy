/**
 * Конфигурация тарифов Morena VPN
 */

export interface Tariff {
  id: string;           // ID тарифа в RoyaltyKey
  label: string;        // Отображаемое название
  priceRub: number;     // Цена в рублях
  durationDays: number; // Срок действия в днях
}

export const TARIFFS: Tariff[] = [
  {
    id: "7days",
    label: "⏱ 7 дней — 119 ₽",
    priceRub: 119,
    durationDays: 7,
  },
  {
    id: "30days",
    label: "📱 30 дней — 249 ₽",
    priceRub: 249,
    durationDays: 30,
  },
  {
    id: "90days",
    label: "🔥 90 дней — 590 ₽",
    priceRub: 590,
    durationDays: 90,
  },
  {
    id: "180days",
    label: "💼 180 дней — 1190 ₽",
    priceRub: 1190,
    durationDays: 180,
  },
  {
    id: "365days",
    label: "👑 365 дней — 1990 ₽",
    priceRub: 1990,
    durationDays: 365,
  },
];

export const TRIAL_TARIFF_ID = "trial_24h";
export const TRIAL_DURATION_DAYS = 1;

// Реферальный бонус в рублях
export const REFERRAL_BONUS = 50;
