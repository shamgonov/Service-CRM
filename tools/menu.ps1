$root = Split-Path -Parent $PSScriptRoot
function GetVer { (Get-Content "$root\version.json" -Raw | ConvertFrom-Json).version }
while($true){
 $v = GetVer
 Clear-Host
 Write-Host "=================================="
 Write-Host "   ServiceCRM   current: v$v"
 Write-Host "=================================="
 Write-Host " [1] Создать бэкап"
 Write-Host " [2] Список бэкапов"
 Write-Host " [3] Восстановить из бэкапа"
 Write-Host " [4] Патч приложения: баннер и realtime"
 Write-Host " [5] ДЕПЛОЙ GitHub: версия +1"
 Write-Host " [6] Деплой Firebase"
 Write-Host " [0] Выход"
 $ch = Read-Host "Выбор"
 switch($ch){
  '1'{ $st=Get-Date -f yyyyMMdd_HHmmss; $vv=GetVer; robocopy $root "$root\backups\v${vv}_$st" /E /XD .git backups | Out-Null; Write-Host "Бэкап создан: backups\v${vv}_$st"; Read-Host "Enter" }
  '2'{ Get-ChildItem "$root\backups" -Name; Read-Host "Enter" }
  '3'{ $bk=Read-Host "Имя папки бэкапа"; robocopy "$root\backups\$bk" $root /E /XD .git backups | Out-Null; Write-Host "Восстановлено: $bk"; Read-Host "Enter" }
  '4'{ & "$root\tools\patch.ps1"; Read-Host "Enter" }
  '5'{ & "$root\tools\bump.ps1"; & "$root\tools\patch.ps1"
       if(!(Get-Command git -ErrorAction SilentlyContinue)){ Write-Host "Установи Git: git-scm.com"; Read-Host "Enter"; break }
       Push-Location $root
       if(!(Test-Path .git)){ git init | Out-Null; git branch -M main; git remote add origin https://github.com/shamgonov/Service-CRM.git }
       git add -A
       git commit -m ("deploy v"+(GetVer)) | Out-Null
       git pull origin main --allow-unrelated-histories --no-edit 2>&1 | Out-Null
       git push -u origin main
       Write-Host "ДЕПЛОЙ ГОТОВ: v$(GetVer)"; Pop-Location; Read-Host "Enter" }
  '6'{ if(!(Get-Command firebase -ErrorAction SilentlyContinue)){ Write-Host "Нужно: npm i -g firebase-tools, затем firebase init hosting" } else { firebase deploy --only hosting }; Read-Host "Enter" }
  '0'{ exit }
 }
}