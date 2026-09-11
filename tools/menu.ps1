$root = Split-Path -Parent $PSScriptRoot
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$UTF8 = [System.Text.Encoding]::UTF8
function GetVer { ([System.IO.File]::ReadAllText("$root\version.json", $UTF8) | ConvertFrom-Json).version }
while($true){
 $v = GetVer
 Clear-Host
 Write-Host "=================================="
 Write-Host "   ServiceCRM   v$v   (menu v4.1)"
 Write-Host "=================================="
 Write-Host " [1] Создать бэкап"
 Write-Host " [2] Список бэкапов"
 Write-Host " [3] Восстановить из бэкапа"
 Write-Host " [4] Патч приложения: баннер и realtime"
 Write-Host " [5] ДЕПЛОЙ GitHub: версия +1"
 Write-Host " [6] Деплой Firebase"
 Write-Host " [7] Подключить Firebase базу"
 Write-Host " [0] Выход"
 $ch = Read-Host "Выбор"
 switch($ch){
  '1'{ $st=Get-Date -f yyyyMMdd_HHmmss; $vv=GetVer; robocopy $root "$root\backups\v${vv}_$st" /E /XD .git backups | Out-Null; Write-Host "Бэкап создан: backups\v${vv}_$st"; Read-Host "Enter" }
  '2'{ Get-ChildItem "$root\backups" -Name; Read-Host "Enter" }
  '3'{ $bk=Read-Host "Имя папки бэкапа"; if(Test-Path "$root\backups\$bk"){ robocopy "$root\backups\$bk" $root /E /XD .git backups | Out-Null; Write-Host "Восстановлено: $bk" } else { Write-Host "Не найдено: $bk" }; Read-Host "Enter" }
  '4'{ & "$root\tools\patch.ps1"; Read-Host "Enter" }
  '5'{ & "$root\tools\bump.ps1"; & "$root\tools\patch.ps1"
       $html = [System.IO.File]::ReadAllText("$root\index.html", $UTF8)
       if($html -match '<<<<<<<'){ Write-Host "ОШИБКА: маркеры конфликта в index.html — деплой остановлен"; Read-Host "Enter"; break }
       if(!(Get-Command git -ErrorAction SilentlyContinue)){ Write-Host "Установи Git: git-scm.com"; Read-Host "Enter"; break }
       $vj = [System.IO.File]::ReadAllText("$root\version.json", $UTF8) | ConvertFrom-Json
       $dep = 1; if($vj.deploy){ $dep = [int]$vj.deploy + 1 }
       $dt = Get-Date -Format "dd.MM.yyyy HH:mm"
       $text = ""
       if(Test-Path "$root\tools\release_notes.txt"){ $text = [System.IO.File]::ReadAllText("$root\tools\release_notes.txt", $UTF8).Trim(); Remove-Item "$root\tools\release_notes.txt" }
       $obj = [ordered]@{version=$vj.version; x=$vj.x; y=$vj.y; z=$vj.z; deploy=$dep; dt=$dt; text=$text}
       [System.IO.File]::WriteAllText("$root\version.json", ($obj | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding $false))
       Push-Location $root
       git config --local core.autocrlf false
       if(!(Test-Path .git)){ git init | Out-Null; git branch -M main; git remote add origin https://github.com/shamgonov/Service-CRM.git }
       git add -A
       git commit -m ("деплой №$dep v"+(GetVer)) 2>&1 | Out-Null
       git push -u origin main --force-with-lease 2>&1 | Out-Null
       Pop-Location
       Write-Host "ДЕПЛОЙ №$dep ГОТОВ: v$(GetVer)"
       Read-Host "Enter" }
  '6'{ if(!(Get-Command firebase -ErrorAction SilentlyContinue)){ Write-Host "Нужно: npm i -g firebase-tools, затем firebase init hosting" } else { firebase deploy --only hosting }; Read-Host "Enter" }
  '7'{ & "$root\tools\fbpatch.ps1"; Read-Host "Enter" }
  '0'{ exit }
 }
}