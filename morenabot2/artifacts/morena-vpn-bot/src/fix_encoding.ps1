$ErrorActionPreference = 'Stop'
$file = "C:\hp\github\royaltyvpnpartn\morenabot2\artifacts\morena-vpn-bot\src\botHandlers.ts"
$bytes = [System.IO.File]::ReadAllBytes($file)
$content = [System.Text.Encoding]::UTF8.GetString($bytes)
$orig = $content
$count = 0

# Fix 1: startPaymentPolling paid - use markInvoicePaid
$old1 = 'if (status === "paid") {
          clearInterval(interval);
          console.log(`[poll] Инвойс ${invoiceId} оплачен! Выдаём ключ пользователю ${userId}`);

          // Обновляем статус платежа в БД
          await prisma.payment.update({
            where: { id: invoiceId.toString() },
            data: { status: "paid" },
          });

          // Выдаём VPN-доступ
          await grantVpnAccessById(chatId, userId, tariffId, bonusUsed);'

$new1 = 'if (status === "paid") {
          clearInterval(interval);
          console.log(`[poll] Инвойс ${invoiceId} оплачен! Выдаём ключ пользователю ${userId}`);

          await markInvoicePaid(invoiceId, async () => {
            await grantVpnAccessById(chatId, userId, tariffId, bonusUsed);
          });'

if ($content.Contains($old1)) { $content = $content.Replace($old1, $new1); $count++ }

Write-Host "Fix 1: $count"

# Fix 2: startPaymentPolling expired/cancelled - use markInvoiceFailed
$old2 = '} else if (status === "expired" || status === "cancelled") {
          clearInterval(interval);

          // Обновляем статус
          await prisma.payment.update({
            where: { id: invoiceId.toString() },
            data: { status: "failed" },
          });

          await bot.api.sendMessage('

$new2 = '} else if (status === "expired" || status === "cancelled") {
          clearInterval(interval);
          await markInvoiceFailed(invoiceId);
          await bot.api.sendMessage('

if ($content.Contains($old2)) { $content = $content.Replace($old2, $new2); $count++ }

Write-Host "Fix 2: $count"

# Fix 3: check_payment paid - use markInvoicePaid
$old3 = 'if (status === "paid") {
        const payment = await prisma.payment.findUnique({ where: { id: invoiceId.toString() } });
        if (!payment) {
          await ctx.reply(`❌ Платёж не найден.`);
          return;
        }

        // Предотвращаем двойную выдачу ключа
        if (payment.status === "paid") {
          await ctx.reply(`✅ Этот платёж уже обработан. Проверьте раздел «Личный чертог».`);
          return;
        }

        await prisma.payment.update({
          where: { id: invoiceId.toString() },
          data: { status: "paid" },
        });

        await grantVpnAccess(ctx, userId, payment.tariffId, 0, payment.amount);'

$new3 = 'if (status === "paid") {
        const payment = await prisma.payment.findUnique({ where: { id: invoiceId.toString() } });
        if (!payment) {
          await ctx.reply(`❌ Платёж не найден.`);
          return;
        }

        await markInvoicePaid(invoiceId, async () => {
          await grantVpnAccess(ctx, userId, payment.tariffId, 0, payment.amount);
        });'

if ($content.Contains($old3)) { $content = $content.Replace($old3, $new3); $count++ }

Write-Host "Fix 3: $count"

# Fix 4: check_renew paid - use markInvoicePaid
$old4 = 'if (status === "paid") {
      await prisma.payment.update({
        where: { id: invoiceId.toString() },
        data: { status: "paid" },
      });
      await processRenewal(ctx, userId, subId, tariffId, 0);'

$new4 = 'if (status === "paid") {
      await markInvoicePaid(invoiceId, async () => {
        await processRenewal(ctx, userId, subId, tariffId, 0);
      });'

if ($content.Contains($old4)) { $content = $content.Replace($old4, $new4); $count++ }

Write-Host "Fix 4: $count"

# Fix 5: startRenewalPolling paid - use markInvoicePaid
$old5 = 'if (status === "paid") {
          clearInterval(interval);
          await prisma.payment.update({
            where: { id: invoiceId.toString() },
            data: { status: "paid" },
          });
          await processRenewal(chatId, userId, subId, tariffId, bonusUsed);'

$new5 = 'if (status === "paid") {
          clearInterval(interval);
          await markInvoicePaid(invoiceId, async () => {
            await processRenewal(chatId, userId, subId, tariffId, bonusUsed);
          });'

if ($content.Contains($old5)) { $content = $content.Replace($old5, $new5); $count++ }

Write-Host "Fix 5: $count"

# Fix 6: startRenewalPolling expired/cancelled - use markInvoiceFailed
$old6 = '} else if (status === "expired" || status === "cancelled") {
          clearInterval(interval);
          await prisma.payment.update({
            where: { id: invoiceId.toString() },
            data: { status: "failed" },
          });'

$new6 = '} else if (status === "expired" || status === "cancelled") {
          clearInterval(interval);
          await markInvoiceFailed(invoiceId);'

if ($content.Contains($old6)) { $content = $content.Replace($old6, $new6); $count++ }

Write-Host "Fix 6: $count"

# Fix 7: Убрать unused import isActive
$old7 = 'import { escapeMarkdown, formatVpnKey, formatDate, isActive, subStatus } from "./helpers.js";'
$new7 = 'import { escapeMarkdown, formatVpnKey, formatDate, subStatus } from "./helpers.js";'
if ($content.Contains($old7)) { $content = $content.Replace($old7, $new7); $count++ }

Write-Host "Fix 7: $count"

if ($content -ne $orig) {
    [System.IO.File]::WriteAllBytes($file, [System.Text.Encoding]::UTF8.GetBytes($content))
    Write-Host "All $count fixes applied. File written!"
} else {
    Write-Host "No changes detected."
}
