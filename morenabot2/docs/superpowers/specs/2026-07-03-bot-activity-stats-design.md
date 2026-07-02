# Bot Activity Statistics — Design Doc

## Goal
Track user activity in the Telegram bot and show visit statistics in the admin panel.

## Phases
Phase 1+2 combined per user request.

## Schema Change

Add `lastActivityAt` to `User` model in `artifacts/morena-vpn-bot/prisma/schema.prisma`:

```prisma
model User {
  id             BigInt  @id
  username       String?
  balance        Int     @default(0)
  referredById   BigInt?
  hasUsedTrial   Boolean @default(false)
  lastActivityAt DateTime?   // NEW
  subscriptions  Subscription[]
  payments       Payment[]
  usedPromocodes UsedPromocode[]
}
```

The column is nullable (`DateTime?`) — existing users get `null` until their next interaction.

## Bot Tracking

**File:** `artifacts/morena-vpn-bot/src/botInstance.ts`

Add a `bot.use()` filter that runs on every message and callback query:

```
bot.on(["message", "callback_query"], async (ctx) => {
  const userId = ctx.from?.id;
  if (userId) {
    await prisma.user.update({
      where: { id: BigInt(userId) },
      data: { lastActivityAt: new Date() },
    }).catch(() => {}); // ignore if user not in DB
  }
});
```

This captures any interaction (text, commands, button clicks) without blocking handlers.

## API Changes

**File:** `artifacts/api-server/src/routes/admin.ts` — modify `GET /admin/stats`

Add 3 new queries alongside existing ones:

| Field | SQL |
|---|---|
| `activeToday` | Pass JS ISO string: `todayStart.toISOString()` → `SELECT COUNT(*) FROM User WHERE lastActivityAt >= ?` |
| `activeWeek` | Pass JS ISO string: `weekAgo.toISOString()` |
| `activeMonth` | Pass JS ISO string: `monthAgo.toISOString()` |

Return them in `GetAdminStatsResponse`.

**File:** `lib/api-zod/src/generated/api.ts` — add 3 fields to `GetAdminStatsResponse`.

**File:** `artifacts/api-server/src/routes/admin.ts` — users list endpoint: expose `lastActivityAt` in the response.

Add `lastActivityAt` to `ListAdminUsersResponse` Zod schema, and include it in the SQL query for `/admin/users`.

## Admin Panel Changes

**Dashboard** (`artifacts/admin-panel/src/pages/dashboard.tsx`):
- Add 3 new stat cards: "Активно сегодня", "Активно за неделю", "Активно за месяц"
- Use `formatNumber` for display

**Users page** (`artifacts/admin-panel/src/pages/users.tsx`):
- Add column "Последняя активность" showing `formatDate(lastActivityAt)` or `—` if null
- Make column sortable

## DB Migration

After schema change, run:
```bash
cd artifacts/morena-vpn-bot
pnpm run db:push
```

This adds the column to the existing SQLite DB without data loss.

## Open Questions (resolved)
- What counts as activity? → Any message/callback_query
- Separate endpoint or extend existing? → Extend existing `/admin/stats` + existing `/admin/users`
- Handle null dates? → Show `—` in UI, count as 0 in stats
