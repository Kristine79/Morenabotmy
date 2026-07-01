#!/usr/bin/env python3
import re

with open('botHandlers.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the broken section and fix it
output = []
i = 0
while i < len(lines):
    line = lines[i]

    # Fix the broken sendMessage continuation (lines 85-91)
    if 'sendMessage(' in line and i >= 84:
        # Output the opening of sendMessage
        output.append(line)
        i += 1
        # Output the Number(refId), line
        output.append(lines[i])
        i += 1
        # Fix the template string continuation (combine lines 85-86)
        output.append('                `🎉 По вашей реферальной ссылке зарегистрировался новый пользователь\\\\!\\n` +\n')
        i += 1  # skip the old broken continuation
        output.append('                  `Вам начислено *${REFERRAL_BONUS} ₽* бонуса\\.`,\n')
        i += 1  # skip the broken { parse_mode line
        # Output the parse_mode object
        output.append('                { parse_mode: "MarkdownV2" }\n')
        i += 1  # skip the broken line
        # Output the closing ) and ;
        output.append('              );\n')
        # Keep the catch block as-is
        output.append(lines[i])  # } catch (err) {
        i += 1
        output.append(lines[i])  # comment
        i += 1
        output.append(lines[i])  # console.warn
        i += 1
        output.append(lines[i])  # }
        i += 1
        # Now we need to close the if blocks and add the user.create
        output.append('          }\n')
        output.append('        }\n')
        output.append('      }\n')
        output.append('\n')
        output.append('      user = await prisma.user.create({\n')
        output.append('        data: {\n')
        output.append('          id: userId,\n')
        # Skip the orphaned lines (92-96)
        while i < len(lines) and ('username' in lines[i] or 'referredById' in lines[i] or lines[i].strip() == '},' or lines[i].strip() == '});'):
            if 'username' in lines[i]:
                output.append(lines[i])
            i += 1
        output.append(lines[i])  # referredById,
        i += 1
        output.append(lines[i])  # },
        i += 1
        output.append(lines[i])  # });
        i += 1
        continue

    output.append(line)
    i += 1

with open('botHandlers.ts', 'w', encoding='utf-8') as f:
    f.writelines(output)

print("Fixed!")
