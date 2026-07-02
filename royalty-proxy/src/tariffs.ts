export interface TariffMapping {
  localId: string;
  label: string;
  apiTariff: "regular" | "lte";
  apiDays: number;
}

const TARIFFS: TariffMapping[] = [
  { localId: "trial_24h",    label: "Пробный 24ч",        apiTariff: "regular", apiDays: 1 },
  { localId: "classic_7days", label: "Классик 7 дней",    apiTariff: "regular", apiDays: 7 },
  { localId: "1month",        label: "1 месяц",            apiTariff: "regular", apiDays: 30 },
  { localId: "classic_30days",label: "Классик 30 дней",    apiTariff: "regular", apiDays: 30 },
  { localId: "3month",        label: "3 месяца",           apiTariff: "regular", apiDays: 90 },
  { localId: "classic_90days",label: "Классик 90 дней",    apiTariff: "regular", apiDays: 90 },
  { localId: "classic_180days",label: "Классик 180 дней",  apiTariff: "regular", apiDays: 180 },
  { localId: "classic_365days",label: "Классик 365 дней",  apiTariff: "regular", apiDays: 365 },
  { localId: "obhod_7days",   label: "Обход LTE 7 дней",   apiTariff: "lte",     apiDays: 7 },
  { localId: "obhod_30days",  label: "Обход LTE 30 дней",  apiTariff: "lte",     apiDays: 30 },
  { localId: "obhod_90days",  label: "Обход LTE 90 дней",  apiTariff: "lte",     apiDays: 90 },
  { localId: "obhod_180days", label: "Обход LTE 180 дней", apiTariff: "lte",     apiDays: 180 },
  { localId: "obhod_365days", label: "Обход LTE 365 дней", apiTariff: "lte",     apiDays: 365 },
];

const byLocal = new Map(TARIFFS.map((t) => [t.localId, t]));

export function getTariff(localId: string): TariffMapping | undefined {
  return byLocal.get(localId);
}

export function resolveTariff(localId: string): { tariff: string; days: number } | null {
  const t = byLocal.get(localId);
  if (!t) return null;
  return { tariff: t.apiTariff, days: t.apiDays };
}
