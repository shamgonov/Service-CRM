$root = Split-Path -Parent $PSScriptRoot
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$UTF8 = [System.Text.Encoding]::UTF8
function GetVer { ([System.IO.File]::ReadAllText("$root\version.json", $UTF8) | ConvertFrom-Json).version }

# запись в CONTEXT.md (до коммита, чтобы попала в деплой)
$inc = @"

### 14.09.2026 — ReferenceError dev in ownerPanel
- **Проблема**: панель владельца падала с Uncaught ReferenceError: dev is not defined, приложение откатывалось на демо-вход
- **Причина**: переменная dev не объявлена внутри ownerPanel()
- **Фикс**: var dev=deviceId() первой строкой ownerPanel; ревизия областей видимости во всём firebase-access.js; CRM-DBG удалён из прода
"@
Add-Content -Path "$root\CONTEXT.md" -Value $inc -Encoding UTF8
Write-Host "CONTEXT.md обновлён"

# ниже — логика пункта [5] menu.ps1 без изменений
$html = [System.IO.File]::ReadAllText("$root\index.html", $UTF8)
if($html -match '<<<<<<<'){ Write-Host "ОШИБКА: маркеры конфликта в index.html — деплой остановлен"; exit 1 }
$vj = [System.IO.File]::ReadAllText("$root\version.json", $UTF8) | ConvertFrom-Json
$dep = 1; if($vj.deploy){ $dep = [int]$vj.deploy + 1 }
$dt = Get-Date -Format "dd.MM.yyyy HH:mm"
$text = ""
if(Test-Path "$root\tools\release_notes.txt"){ $text = [System.IO.File]::ReadAllText("$root\tools\release_notes.txt", $UTF8).Trim(); Remove-Item "$root\tools\release_notes.txt" }
$obj = [ordered]@{version=$vj.version; x=$vj.x; y=$vj.y; z=$vj.z; deploy=$dep; dt=$dt; text=$text}
[System.IO.File]::WriteAllText("$root\version.json", ($obj | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding $false))
Push-Location $root
git config --local core.autocrlf false
git add -A
git commit -m ("деплой №$dep v"+(GetVer))
Write-Host "PUSH_RESULT:"
git push -u origin main --force-with-lease
Pop-Location
Write-Host "ДЕПЛОЙ №$dep ГОТОВ: v$(GetVer)"