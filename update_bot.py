# -*- coding: utf-8 -*-
import re

file_path = r"c:\hp\github\royaltyvpnpartn\morenabot2\artifacts\morena-vpn-bot\src\bot.ts"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Find and replace
old_text = '`ℹ️ *Инструкция по настройке Morena VPN*\\n\\n` +'
new_text = '`ℹ️ *Инструкция по настройке Morena VPN*\\n\\n` + `📖 Подробная инструкция: [https://teletype.in/@marksteal76/QXkpHJ7Z6DH](https://teletype.in/@marksteal76/QXkpHJ7Z6DH)\\n\\n` +'

content = content.replace(old_text, new_text)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Done")
