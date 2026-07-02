# Bot Activity Statistics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Track user activity in the Telegram bot and display visit statistics in the admin panel (DAU/WAU/MAU cards + last activity column in users table).

**Architecture:** Add `lastActivityAt` to the User model (Prisma + SQLite), update it via bot middleware on every interaction, expose via existing admin API endpoints, add UI cards and column in admin panel.

**Tech Stack:** Prisma (SQLite), grammY (bot framework), Express API, React admin panel

---

### Task 1: Add `lastActivityAt` to Prisma schema

**Files:**
- Modify: `artifacts/morena-vpn-bot/prisma/schema.prisma:20`

- [ ] **Step 1: Add field to schema**

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

- [ ] **Step 2: Push schema to SQLite**

Run: `cd artifacts/morena-vpn-bot && pnpm run db:push`

- [ ] **Step 3: Commit**

---

### Task 2: Add bot activity tracker

**Files:**
- Modify: `artifacts/morena-vpn-bot/src/botInstance.ts`

- [ ] **Step 1: Add middleware to track activity**

Add after `setupBotHandlers(bot)`:

```typescript
// Track user activity on any interaction
bot.on(["message", "callback_query"], async (ctx, next) => {
  const userId = ctx.from?.id;
  if (userId) {
    prisma.user
      .update({
        where: { id: userId },
        data: { lastActivityAt: new Date() },
      })
      .catch(() => {
        /* user may not exist yet */
      });
  }
  await next();
});
```

Note: import `prisma` from `./db`. The middleware runs on every incoming message and callback query, updates `lastActivityAt` without blocking the handler chain.

- [ ] **Step 2: Commit**

---

### Task 3: Add activity fields to Zod schema

**Files:**
- Modify: `lib/api-zod/src/generated/api.ts`

- [ ] **Step 1: Add 3 fields to `GetAdminStatsResponse`**

```typescript
export const GetAdminStatsResponse = zod.object({
  "totalUsers": zod.number(),
  "totalRevenue": zod.number(),
  "activeSubscriptions": zod.number(),
  "expiredSubscriptions": zod.number(),
  "trialUsers": zod.number(),
  "pendingPayments": zod.number(),
  "paidPayments": zod.number(),
  "revenueToday": zod.number(),
  "newUsersToday": zod.number(),
  "recentPayments": zod.array(zod.object({
    "id": zod.string(),
    "telegramUserId": zod.string(),
    "username": zod.string().nullish(),
    "tariffId": zod.string(),
    "amount": zod.number(),
    "status": zod.string()
  })),
  "activeToday": zod.number(),
  "activeWeek": zod.number(),
  "activeMonth": zod.number()
})
```

- [ ] **Step 2: Add `lastActivityAt` to `ListAdminUsersResponseItem`**

```typescript
export const ListAdminUsersResponseItem = zod.object({
  "id": zod.string(),
  "username": zod.string().nullish(),
  "balance": zod.number(),
  "hasUsedTrial": zod.boolean(),
  "referredById": zod.string().nullish(),
  "subscriptionCount": zod.number(),
  "lastActivityAt": zod.string().nullish()
})
```

- [ ] **Step 3: Commit**

---

### Task 4: Update API server — stats endpoint

**Files:**
- Modify: `artifacts/api-server/src/routes/admin.ts:46-102`

- [ ] **Step 1: Add activity queries to `/admin/stats`**

After the `paidPayments` query (line 65), add:

```typescript
const now = new Date();
const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

const activeToday = (
  db.prepare("SELECT COUNT(*) as n FROM User WHERE lastActivityAt >= ?").get(todayStart) as { n: number }
).n;
const activeWeek = (
  db.prepare("SELECT COUNT(*) as n FROM User WHERE lastActivityAt >= ?").get(weekAgo) as { n: number }
).n;
const activeMonth = (
  db.prepare("SELECT COUNT(*) as n FROM User WHERE lastActivityAt >= ?").get(monthAgo) as { n: number }
).n;
```

And add to the response object:

```typescript
res.json(GetAdminStatsResponse.parse({
  ...
  activeToday,
  activeWeek,
  activeMonth,
}));
```

- [ ] **Step 2: Commit**

---

### Task 5: Update API server — users list endpoint

**Files:**
- Modify: `artifacts/api-server/src/routes/admin.ts:128-158`

- [ ] **Step 1: Add `lastActivityAt` to users SQL query**

Change the SQL to include `u.lastActivityAt`:

```typescript
const users = db.prepare(`
  SELECT u.id, u.username, u.balance, u.hasUsedTrial, u.referredById, u.lastActivityAt,
         COUNT(s.id) as subscriptionCount
  FROM User u
  LEFT JOIN Subscription s ON s.telegramUserId = u.id
  ${where}
  GROUP BY u.id
  ORDER BY u.id DESC
  LIMIT ? OFFSET ?
`).all(...params, limit, offset) as Array<{
  id: bigint | string; username: string | null; balance: number;
  hasUsedTrial: number; referredById: bigint | string | null;
  lastActivityAt: string | null; subscriptionCount: number;
}>;
```

And map it:

```typescript
items: users.map((u) => ({
  ...
  lastActivityAt: u.lastActivityAt ?? null,
})),
```

- [ ] **Step 2: Commit**

---

### Task 6: Admin panel — dashboard activity cards

**Files:**
- Modify: `artifacts/admin-panel/src/pages/dashboard.tsx`

- [ ] **Step 1: Add 3 stat cards for activity**

After the existing stat cards grid, add a new row:

```tsx
{/* Активность */}
<div className="col-span-full grid grid-cols-3 gap-4">
  <StatsCard
    title="Активно сегодня"
    value={formatNumber(data.activeToday)}
    icon={<UserCheck className="h-4 w-4" />}
  />
  <StatsCard
    title="Активно за неделю"
    value={formatNumber(data.activeWeek)}
    icon={<Users className="h-4 w-4" />}
  />
  <StatsCard
    title="Активно за месяц"
    value={formatNumber(data.activeMonth)}
    icon={<Users className="h-4 w-4" />}
  />
</div>
```

- [ ] **Step 2: Commit**

---

### Task 7: Admin panel — activity column in users table

**Files:**
- Modify: `artifacts/admin-panel/src/pages/users.tsx`

- [ ] **Step 1: Add "Последняя активность" column**

After the "Баланс" column, add:

```tsx
<TableHead>Последняя активность</TableHead>
```

And in the row:

```tsx
<TableCell>
  {user.lastActivityAt ? formatDate(user.lastActivityAt) : "—"}
</TableCell>
```

- [ ] **Step 2: Commit**

---

### Task 8: Rebuild API server and restart

- [ ] **Step 1: Rebuild API server**

```bash
cd /repo && pnpm --filter @workspace/api-server run build
```

- [ ] **Step 2: Stop old processes and start both servers**

```bash
# Kill existing node processes
Get-Process -Name "node" | Stop-Process -Force

# Start API server on port 3000
$env:NODE_ENV="development"; $env:PORT="3000"
Start-Process powershell -ArgumentList "-NoProfile -Command cd /repo/artifacts/api-server; pnpm run start"

# Start admin panel on port 20130
$env:PORT="20130"; $env:BASE_PATH="/admin/"
Start-Process powershell -ArgumentList "-NoProfile -Command cd /repo/artifacts/admin-panel; pnpm run dev"
```

- [ ] **Step 3: Verify**

```bash
curl http://localhost:3000/api/admin/stats
# should include activeToday, activeWeek, activeMonth
```
