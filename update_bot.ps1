$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'
$file = "c:\hp\github\royaltyvpnpartn\morenabot2\artifacts\morena-vpn-bot\src\bot.ts"
$content = Get-Content $file -Raw

$search = [char]0x2132 + " *Инструкция по настройке Morena VPN*" + [char]0x0A + [char]0x0A + "` +"
$replace = [char]0x2132 + " *Инструкция по настройке Morena VPN*" + [char]0x0A + [char]0x0A + "` + " + [char]0x1F4C0 + " Подробная инструкция: [https://teletype.in/@marksteal76/QXkpHJ7Z6DH](https://teletype.in/@marksteal76/QXkpHJ7Z6DH)" + [char]0x0A + [char]0x0A + "` +"

$content = $content.Replace($search, $replace)
Set-Content -Path $file -Value $content -NoNewline
Write-Host "Updated"
