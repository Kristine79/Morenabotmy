/**
 * Модуль для работы с API RoyaltyKey
 * Документация: https://royaltykey.com/api
 *
 * Используется для управления VPN-подписками реселлера.
 */

import "dotenv/config";
import axios, { AxiosError } from "axios";

const BASE_URL = "https://royaltykey.com/api/v1";

interface RoyaltyKeyProfile {
  balance: number;
  discount: number;
}

interface RoyaltyKeyUser {
  id: string;
  vpn_key: string;
  expires_at: string;
  tariff_id: string;
}

/**
 * Обработать ошибку API и вернуть понятное сообщение
 */
function handleApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as string | { message?: string };
      
      if (status === 403) {
        return `403 Forbidden: доступ запрещён. Проверьте API ключ или свяжитесь с поддержкой RoyaltyKey.`;
      }
      if (status === 401) {
        return `401 Unauthorized: неверный API ключ. Проверьте ROYALTYKEY_API_KEY.`;
      }
      if (status === 429) {
        return `429 Too Many Requests: превышен лимит запросов. Попробуйте позже.`;
      }
      if (status >= 500) {
        return `${status} Server Error: проблема на стороне API. Попробуйте позже.`;
      }
      
      const msg = typeof data === 'object' && data?.message ? data.message : String(data);
      return `Ошибка ${status}: ${msg}`;
    }
    if (error.code === 'ECONNABORTED') {
      return "Таймаут запроса: сервер не отвечает. Проверьте интернет-соединение.";
    }
    if (error.code === 'ENOTFOUND') {
      return "DNS ошибка: не удалось найти сервер royalykey.com";
    }
    if (error.code === 'ECONNREFUSED') {
      return "Connection refused: сервер отклонил соединение";
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export class RoyaltyKeyApi {
  private readonly token: string;
  private readonly headers: Record<string, string>;
  private readonly timeout: number;
  private readonly proxyUrl: string | undefined;

  constructor() {
    const token = process.env.ROYALTYKEY_API_KEY;
    if (!token) throw new Error("ROYALTYKEY_API_KEY не задан в переменных окружения");
    this.token = token;
    this.timeout = parseInt(process.env.ROYALTYKEY_TIMEOUT ?? "10000");
    
    // Поддержка HTTP-прокси для обхода блокировок IP (опционально)
    const proxyEnv = process.env.ROYALTYKEY_PROXY;
    this.proxyUrl = proxyEnv && proxyEnv.startsWith("http") ? proxyEnv : undefined;
    
    // Полные заголовки для прохождения WAF
    this.headers = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
      "User-Agent": "MorenaVPN/1.0 (Telegram Bot)",
      "Cache-Control": "no-cache",
      "Referer": "https://royaltykey.com/",
      "Origin": "https://royaltykey.com",
    };
    
    if (this.proxyUrl) {
      console.log(`[RoyaltyKey] Используется прокси: ${this.proxyUrl}`);
    }
  }

/**
   * Построить конфигурацию прокси
   */
  private buildProxyConfig() {
    if (!this.proxyUrl) return false;
    const url = new URL(this.proxyUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 80,
      protocol: url.protocol.replace(":", ""),
    };
  }

  async getProfile(): Promise<RoyaltyKeyProfile> {
    try {
      const response = await axios.get(`${BASE_URL}/reseller/profile`, {
        headers: this.headers,
        timeout: this.timeout,
        proxy: this.buildProxyConfig(),
      });
      return response.data;
    } catch (error) {
      throw new Error(`[RoyaltyKey.getProfile] ${handleApiError(error)}`);
    }
  }

  /**
   * Создать нового VPN-пользователя и активировать тариф
   * @param tariffId - ID тарифа (например 'trial_24h', '1month', '3month')
   * @param tgUserId - Telegram ID пользователя (используется как метка)
   */
  async createVPNUser(tariffId: string, tgUserId: bigint): Promise<RoyaltyKeyUser> {
    try {
      const response = await axios.post(
        `${BASE_URL}/users`,
        {
          tariff_id: tariffId,
          external_id: tgUserId.toString(),
        },
        { 
          headers: this.headers, 
          timeout: this.timeout,
          proxy: this.buildProxyConfig(),
        }
      );
      return response.data;
    } catch (error) {
      throw new Error(`[RoyaltyKey.createVPNUser] ${handleApiError(error)}`);
    }
  }

  /**
   * Продлить существующую подписку пользователя
   * @param vpnUserId - ID пользователя в системе RoyaltyKey
   * @param tariffId - ID нового тарифа для продления
   */
  async renewSubscription(vpnUserId: string, tariffId: string): Promise<RoyaltyKeyUser> {
    try {
      const response = await axios.post(
        `${BASE_URL}/users/${vpnUserId}/renew`,
        { tariff_id: tariffId },
        { 
          headers: this.headers, 
          timeout: this.timeout,
          proxy: this.buildProxyConfig(),
        }
      );
      return response.data;
    } catch (error) {
      throw new Error(`[RoyaltyKey.renewSubscription] ${handleApiError(error)}`);
    }
  }

  /**
   * Удалить / деактивировать пользователя в RoyaltyKey
   * @param vpnUserId - ID пользователя в системе RoyaltyKey
   */
  async deleteUser(vpnUserId: string): Promise<void> {
    try {
      await axios.delete(`${BASE_URL}/users/${vpnUserId}`, {
        headers: this.headers,
        timeout: this.timeout,
        proxy: this.buildProxyConfig(),
      });
    } catch (error) {
      throw new Error(`[RoyaltyKey.deleteUser] ${handleApiError(error)}`);
    }
  }
}

export const royaltyKey = new RoyaltyKeyApi();
