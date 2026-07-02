import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getAuthConfig } from "@workspace/api-client-react";
import { Shield, Loader2, Bug, Key } from "lucide-react";

declare global {
  interface Window {
    onTelegramAuth: (user: Record<string, string | number>) => void;
  }
}

export default function Login() {
  const { login } = useAuth();
  const widgetRef = useRef<HTMLDivElement>(null);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [devId, setDevId] = useState("");

  useEffect(() => {
    getAuthConfig()
      .then((cfg) => setBotUsername(cfg.botUsername))
      .catch(() => setBotUsername("morenavpn_bot"));
  }, []);

  useEffect(() => {
    if (!botUsername || !widgetRef.current) return;

    window.onTelegramAuth = async (user) => {
      setError(null);
      setLoading(true);
      try {
        await login(user);
        setLoading(false);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Ошибка авторизации";
        setError(msg.includes("403") || msg.includes("forbidden") || msg.includes("администратором")
          ? "Доступ запрещён: вы не являетесь администратором"
          : "Ошибка авторизации. Попробуйте ещё раз.");
        setLoading(false);
      }
    };

    // Inject Telegram Login Widget script
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    script.async = true;

    widgetRef.current.innerHTML = "";
    widgetRef.current.appendChild(script);

    return () => {
      if (widgetRef.current) widgetRef.current.innerHTML = "";
    };
  }, [botUsername, login]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Логотип */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Morena VPN</h1>
            <p className="text-muted-foreground text-sm mt-1">Панель администратора</p>
          </div>
        </div>

        {/* Карточка входа */}
        <div className="rounded-xl border border-border bg-card p-8 shadow-lg space-y-6">
          <div className="text-center space-y-1">
            <h2 className="font-semibold text-lg">Вход</h2>
            <p className="text-sm text-muted-foreground">
              Войдите через Telegram для доступа к панели управления
            </p>
          </div>

          {/* Telegram Login Widget */}
          <div className="flex justify-center">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-3">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Входим...</span>
              </div>
            ) : (
              <div ref={widgetRef} className="min-h-[56px] flex items-center justify-center" />
            )}
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive text-center">
              {error}
            </div>
          )}

          <div className="text-xs text-muted-foreground text-center pt-2 space-y-1">
            <p>Доступ только для администратора</p>
            <p className="opacity-60">Бот: @{botUsername ?? "..."}</p>
          </div>

          {window.location.hostname === "localhost" && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Dev</span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Telegram ID администратора"
                    value={devId}
                    onChange={(e) => setDevId(e.target.value)}
                    className="w-full rounded-md border border-border bg-background pl-10 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!devId.trim()) { setError("Введите Telegram ID"); return; }
                    setLoading(true);
                    setError(null);
                    try {
                      const res = await fetch("/api/auth/dev-login", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: Number(devId.trim()) }),
                      });
                      if (!res.ok) throw new Error((await res.json()).error);
                      window.location.reload();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Ошибка dev-логина");
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-border bg-secondary/50 hover:bg-secondary px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <Bug className="h-4 w-4" />
                  Dev Login
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
