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
    id: "1month",
    label: "1 месяц",
    priceRub: 300,
    durationDays: 30,
  },
  {
    id: "3month",
    label: "3 месяца",
    priceRub: 800,
    durationDays: 90,
  },
];

export const TRIAL_TARIFF_ID = "trial_24h";
export const TRIAL_DURATION_DAYS = 1;

// Реферальный бонус в рублях
export const REFERRAL_BONUS = 50;
