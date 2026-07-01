# Code Review Fix Plan - Morena VPN Bot

## 🔴 CRITICAL ISSUES (Must Fix)

### 1. BigInt → Number Precision Loss in Telegram API
**File:** `cron.ts:64`
- **Current:** `await bot.api.sendMessage(Number(sub.telegramUserId), ...)`
- **Fix:** Use `.toString()` instead: `await bot.api.sendMessage(sub.telegramUserId.toString(), ...)`

**Also applies to:**
- `botHandlers.ts:69` - `BigInt(args.slice(4))` for referral parsing

### 2. Missing Bonus Deduction on Paid Payment  
**File:** `botHandlers.ts:385` (in `grantVpnAccessById`)
- **Issue:** `bonusUsed` is passed but never deducted from user balance
- **Current code already has deduction logic (lines ~408-412):**
  ```typescript
  if (bonusUsed > 0) {
    await prisma.user.update({
      where: { id: userId },
      data: { balance: { decrement: bonusUsed } },
    });
  }
  ```
- **Verification needed:** Confirm this logic is correctly placed

---

## 🟠 HIGH ISSUES

### 3. Unguarded BigInt Parsing — Potential Crash
**File:** `botHandlers.ts:69`
- **Current:** `BigInt(args.slice(4))` throws on non-numeric input
- **Fix:**
  ```typescript
  let refId: bigint | null = null;
  if (args?.startsWith("ref_")) {
    try {
      refId = BigInt(args.slice(4));
    } catch { /* ignore malformed */ }
  }
  ```

### 4. Hardcoded Bot Username Fallback
**File:** `cron.ts:60`
- **Current:** `process.env.BOT_USERNAME ?? "morena_vpn_bot"`
- **Fix:** Fetch dynamically on startup or validate env var:
  ```typescript
  const botInfo = await bot.api.getMe();
  const botUsername = process.env.BOT_USERNAME ?? botInfo.username;
  ```

### 5. Race Condition in Trial Activation
**File:** `botHandlers.ts:120-156`
- **Issue:** `hasUsedTrial` check and update not in transaction
- **Fix:** Wrap in `prisma.$transaction`:
  ```typescript
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (user?.hasUsedTrial) { /* ... */ }
    await tx.user.update({ where: { id: userId }, data: { hasUsedTrial: true } });
  });
  ```

---

## 🟡 MEDIUM ISSUES

### 6. Double Command Registration
**Files:** `bot.ts:13-27` AND `botHandlers.ts:1041-1055`
- **Issue:** Duplicate `registerMenuCommands()` - one in bot.ts, one defined inside `setupBotHandlers()`
- **Fix:** Remove duplicate function in `botHandlers.ts` (around line 1041), keep the one in `bot.ts`

### 7. Hardcoded Linux Path in Windows Script
**File:** `fix_markdown.py:3`
- **Current:** `open("/var/www/morenabot/...")`
- **Fix:** Use configurable path or environment variable

### 8. deleteWebhook Calls Wrong Endpoint
**File:** `cryptoBotApi.ts:100-113`
- **Issue:** Uses `setWebhooks` with empty URL instead of proper delete
- **Fix:** Verify CryptoBot API has proper delete method, or confirm empty URL works

---

## 🔵 CLEANUP / STYLE

### 9. Unused export
**File:** `tariffs.ts:28`
- **Issue:** `TRIAL_DURATION_DAYS` exported but never imported
- **Fix:** Remove unused export or use it

### 10. Synchronous file I/O
**File:** `fix_markdown.py:3-5`
- **Fix:** Use context manager: `with open() as f:`

### 11. No file existence check
**File:** `fix_markdown.py:3`
- **Fix:** Add check before opening

### 12. bot.catch swallows error
**File:** `botHandlers.ts:1035-1037`
- **Issue:** Uses `err.error` instead of `err`
- **Fix:** Use `err` directly

---

## Implementation Order

1. ✅ Fix Critical Issue #1 (BigInt in cron.ts and botHandlers.ts)
2. ✅ Verify Critical Issue #2 (bonus deduction - may already be fixed)
3. ✅ Fix High Issue #3 (unguarded BigInt parsing)
4. ✅ Fix High Issue #4 (hardcoded username)
5. ✅ Fix High Issue #5 (race condition in trial)
6. ✅ Fix Medium Issue #6 (duplicate command registration)
7. ✅ Fix Medium Issue #7 (hardcoded path)  
8. ✅ Verify Medium Issue #8 (deleteWebhook)
9. ✅ Fix Cleanup Issues #9-12
