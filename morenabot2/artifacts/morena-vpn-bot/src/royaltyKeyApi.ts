/**
 * Модуль для работы с API RoyaltyKey VPN
 * Документация: https://api.royaltykey.ru/docs
 * 
 * API ключ передается в URL: https://api.royaltykey.ru/{api_key}/...
 * 
 * Два тарифа:
 * - "regular" — Классик (безлимитный трафик, только быстрые серверы)
 * - "lte" — Цифровой камуфляж / Обход LTE (все серверы, лимит ГБ)
 */

import "dotenv/config";
import axios, { AxiosError } from "axios";

const BASE_URL = "https://api.royaltykey.ru";

export interface RoyaltyKeyUser {
  uuid: string;
  username: string;
  subscription_url: string;
}

export interface RoyaltyKeyUserDetails extends RoyaltyKeyUser {
  status: "ACTIVE" | "EXPIRED" | "DISABLED";
  expire_at: string;
  created_at: string;
  traffic: {
    used_bytes: number;
    lifetime_used_bytes: number;
  };
}

export interface RoyaltyKeySubscriptionResult {
  success: boolean;
  days_added: number;
  price: number;
  new_balance: number;
}

export interface RoyaltyKeyBalance {
  balance: number;
  subscriptions: {
    "1d": number;
    "7d": number;
    "30d": number;
    "90d": number;
    "180d": number;
    "365d": number;
  };
  prices: {
    "7d": { base: number; current: number };
    "30d": { base: number; current: number };
    "90d": { base: number; current: number };
    "180d": { base: number; current: number };
    "365d": { base: number; current: number };
  };
}

function handleApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as { detail?: string } | string;
      const msg = typeof data === 'object' && data?.detail ? data.detail : String(data);
      
      if (status === 400) return `400 Bad Request: ${msg}`;
      if (status === 402) return `402 Payment Required: ${msg}`;
      if (status === 403) return `403 Forbidden: API ключ не найден, деактивирован или неверный формат`;
      if (status === 404) return `404 Not Found: ${msg}`;
      if (status === 409) return `409 Conflict: ${msg}`;
      if (status >= 500) return `${status} Server Error: ${msg}`;
      return `Ошибка ${status}: ${msg}`;
    }
    if (error.code === 'ECONNABORTED') return "Таймаут запроса: сервер не отвечает";
    if (error.code === 'ENOTFOUND') return "DNS ошибка: не удалось найти сервер api.royaltykey.ru";
    if (error.code === 'ECONNREFUSED') return "Connection refused: сервер отклонил соединение";
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export class RoyaltyKeyApi {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly proxyUrl: string | undefined;

  constructor() {
    const apiKey = process.env.ROYALTYKEY_API_KEY;
    if (!apiKey) throw new Error("ROYALTYKEY_API_KEY не задан в переменных окружения");
    this.apiKey = apiKey;
    this.baseUrl = `${BASE_URL}/${apiKey}`;
    this.timeout = parseInt(process.env.ROYALTYKEY_TIMEOUT ?? "10000");
    
    const proxyEnv = process.env.ROYALTYKEY_PROXY;
    this.proxyUrl = proxyEnv && proxyEnv.startsWith("http") ? proxyEnv : undefined;
    
    if (this.proxyUrl) {
      console.log(`[RoyaltyKey] Используется прокси: ${this.proxyUrl}`);
    }
  }

  private buildProxyConfig() {
    if (!this.proxyUrl) return false;
    const url = new URL(this.proxyUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 80,
      protocol: url.protocol.replace(":", ""),
    };
  }

  /**
   * Создать нового VPN пользователя (бесплатно)
   * Не списывает средства с баланса
   * Возвращает uuid и subscription_url для подключения клиента
   */
  async createUser(): Promise<RoyaltyKeyUser> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/users`,
        {},
        { 
          timeout: this.timeout,
          proxy: this.buildProxyConfig(),
        }
      );
      return response.data;
    } catch (error) {
      throw new Error(`[RoyaltyKey.createUser] ${handleApiError(error)}`);
    }
  }

  /**
   * Добавить подписку пользователю (списывает средства с баланса API ключа)
   * @param vpnUuid - UUID пользователя из createUser
   * @param days - Период: 1, 7, 30, 90, 180, 365
   * @param tariff - Тариф: "regular" (Классик) или "lte" (Цифровой камуфляж/Обход LTE)
   */
  async addSubscription(
    vpnUuid: string, 
    days: number, 
    tariff: "regular" | "lte"
  ): Promise<RoyaltyKeySubscriptionResult> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/users/${vpnUuid}/subscription`,
        { days, tariff },
        { 
          timeout: this.timeout,
          proxy: this.buildProxyConfig(),
        }
      );
      return response.data;
    } catch (error) {
      throw new Error(`[RoyaltyKey.addSubscription] ${handleApiError(error)}`);
    }
  }

  /**
   * Получить детали пользователя включая трафик
   */
  async getUser(vpnUuid: string): Promise<RoyaltyKeyUserDetails> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/users/${vpnUuid}`,
        { 
          timeout: this.timeout,
          proxy: this.buildProxyConfig(),
        }
      );
      return response.data;
    } catch (error) {
      throw new Error(`[RoyaltyKey.getUser] ${handleApiError(error)}`);
    }
  }

  /**
   * Получить список всех пользователей
   */
  async listUsers(): Promise<{ users: RoyaltyKeyUserDetails[]; total: number }> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/users`,
        { 
          timeout: this.timeout,
          proxy: this.buildProxyConfig(),
        }
      );
      return response.data;
    } catch (error) {
      throw new Error(`[RoyaltyKey.listUsers] ${handleApiError(error)}`);
    }
  }

  /**
   * Удалить пользователя (необратимо)
   */
  async deleteUser(vpnUuid: string): Promise<{ success: boolean; deleted_uuid: string }> {
    try {
      const response = await axios.delete(
        `${this.baseUrl}/users/${vpnUuid}`,
        { 
          timeout: this.timeout,
          proxy: this.buildProxyConfig(),
        }
      );
      return response.data;
    } catch (error) {
      throw new Error(`[RoyaltyKey.deleteUser] ${handleApiError(error)}`);
    }
  }

  /**
   * Получить баланс, цены и статистику
   */
  async getBalance(): Promise<RoyaltyKeyBalance> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/balance`,
        { 
          timeout: this.timeout,
          proxy: this.buildProxyConfig(),
        }
      );
      return response.data;
    } catch (error) {
      throw new Error(`[RoyaltyKey.getBalance] ${handleApiError(error)}`);
    }
  }
}

export const royaltyKey = new RoyaltyKeyApi();