import re

f = open("/var/www/morenabot/artifacts/morena-vpn-bot/src/bot.ts", "r")
content = f.read()
f.close()

# 1. Fix promo message - remove the backslash escape before period
old1 = 'Отправьте промокод следующим сообщением\\.'
new1 = 'Отправьте промокод следующим сообщением'
content = content.replace(old1, new1)

if old1 in content:
    print("✅ Fixed promo message escape")
else:
    print("⚠️ Promo message already fixed or pattern not found")

# Write and verify
f = open("/var/www/morenabot/artifacts/morena-vpn-bot/src/bot.ts", "w")
f.write(content)
f.close()

print("✅ Done!")
