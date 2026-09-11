# init.ps1 - ServiceCRM automation v2
$root = $PSScriptRoot
New-Item -ItemType Directory -Force -Path "$root\tools","$root\backups" | Out-Null
function W($p,$t){ [System.IO.File]::WriteAllText($p,$t,(New-Object System.Text.UTF8Encoding $false)) }
function WB($p,$t){ [System.IO.File]::WriteAllText($p,$t,(New-Object System.Text.UTF8Encoding $true)) }
if (!(Test-Path "$root\version.json")) { W "$root\version.json" '{"version":"1.0.0","x":1,"y":0,"z":0}' }

@'
@echo off
chcp 65001 >nul
cd /d "%~dp0.."
for /f "usebackq delims=" %%i in (`powershell -NoP -c "(Get-Content version.json|ConvertFrom-Json).version"`) do set VER=%%i
:menu
cls
echo ==================================
echo    ServiceCRM   current: v%VER%
echo ==================================
echo  [1] Создать бэкап
echo  [2] Список бэкапов
echo  [3] Восстановить из бэкапа
echo  [4] Патч приложения (баннер+realtime)
echo  [5] ДЕПЛОЙ GitHub (версия +1)
echo  [6] Деплой Firebase
echo  [7] Обновить номер версии на экране
echo  [0] Выход
set /p ch=Выбор: 
if "%ch%"=="1" call tools\backup.bat create & pause & goto menu
if "%ch%"=="2" dir /b backups & pause & goto menu
if "%ch%"=="3" set /p bk=Имя папки бэкапа:  & call tools\backup.bat restore "%bk%" & pause & goto menu
if "%ch%"=="4" powershell -NoP -ExecutionPolicy Bypass -File tools\patch.ps1 & pause & goto menu
if "%ch%"=="5" call tools\deploy.bat github & goto menu
if "%ch%"=="6" call tools\deploy.bat firebase & goto menu
if "%ch%"=="7" for /f "usebackq delims=" %%i in (`powershell -NoP -c "(Get-Content version.json|ConvertFrom-Json).version"`) do set VER=%%i & goto menu
if "%ch%"=="0" exit /b
goto menu
'@ | ForEach-Object { W "$root\tools\menu.bat" $_ }

@'
@echo off
chcp 65001 >nul
cd /d "%~dp0.."
if "%1"=="create" (
 for /f %%d in ('powershell -NoP -c "Get-Date -f yyyyMMdd_HHmmss"') do set ST=%%d
 for /f "usebackq delims=" %%i in (`powershell -NoP -c "(Get-Content version.json|ConvertFrom-Json).version"`) do set VER=%%i
 robocopy . "backups\v%VER%_%ST%" /E /XD .git backups >nul
 echo Бэкап создан: backups\v%VER%_%ST%
 exit /b
)
if "%1"=="restore" (
 robocopy "backups\%~2" . /E /XD .git backups >nul
 echo Восстановлено из: %~2
 exit /b
)
'@ | ForEach-Object { W "$root\tools\backup.bat" $_ }

@'
$root = Split-Path -Parent $PSScriptRoot
$j = Get-Content "$root\version.json" -Raw | ConvertFrom-Json
$j.z++; if($j.z -ge 10){$j.z=0; $j.y++; if($j.y -ge 10){$j.y=0; $j.x++}}
$j.version = "$($j.x).$($j.y).$($j.z)"
[System.IO.File]::WriteAllText("$root\version.json", ($j | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding $false))
Write-Host "Новая версия: $($j.version)"
'@ | ForEach-Object { WB "$root\tools\bump.ps1" $_ }

@'
@echo off
chcp 65001 >nul
cd /d "%~dp0.."
if "%1"=="github" (
 powershell -NoP -ExecutionPolicy Bypass -File tools\bump.ps1
 powershell -NoP -ExecutionPolicy Bypass -File tools\patch.ps1
 git --version >nul 2>&1 || (echo Установи Git: git-scm.com & pause & exit /b)
 if not exist .git ( git init & git branch -M main & git remote add origin https://github.com/shamgonov/Service-CRM.git )
 for /f "usebackq delims=" %%i in (`powershell -NoP -c "(Get-Content version.json|ConvertFrom-Json).version"`) do set VER=%%i
 git add -A
 git commit -m "deploy v%VER%"
 git pull origin main --allow-unrelated-histories --no-edit >nul 2>&1
 git push -u origin main
 echo ДЕПЛОЙ ГОТОВ: v%VER%
 pause & exit /b
)
if "%1"=="firebase" (
 where firebase >nul 2>&1 || (echo Нужно: npm i -g firebase-tools, затем firebase init hosting & pause & exit /b)
 firebase deploy --only hosting
 pause & exit /b
)
'@ | ForEach-Object { W "$root\tools\deploy.bat" $_ }

@'
param([string]$Version)
$root = Split-Path -Parent $PSScriptRoot
$noBom = New-Object System.Text.UTF8Encoding $false
if(!$Version){ $Version = (Get-Content "$root\version.json" -Raw | ConvertFrom-Json).version }
$sw = @"
const VERSION='$Version';const CACHE='crm-'+VERSION;const CORE=['./','index.html','manifest.json','icon.png','version.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);
if(u.pathname.endsWith('version.json')){e.respondWith(fetch(e.request,{cache:'no-store'}));return;}
e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{if(resp.ok&&u.origin===location.origin){const cp=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,cp))}return resp}).catch(()=>caches.match('./'))))});
"@
[System.IO.File]::WriteAllText("$root\sw.js", $sw, $noBom)
if(!(Test-Path "$root\manifest.json")){
$m = @"
{"name":"ServiceCRM","short_name":"ServiceCRM","start_url":"./","scope":"./","display":"standalone","background_color":"#f5f5f5","theme_color":"#2563eb","icons":[{"src":"icon.png","sizes":"512x512","type":"image/png","purpose":"any"}]}
"@
[System.IO.File]::WriteAllText("$root\manifest.json", $m, $noBom) }
$h = Get-Content "$root\index.html" -Raw -Encoding UTF8
if($h -notmatch 'CRM-UPDATER'){
$block = @"
<!-- CRM-UPDATER -->
<div id="updBanner" style="display:none;position:fixed;top:0;left:0;right:0;max-width:430px;margin:0 auto;background:#10b981;color:#fff;padding:10px 16px;font:600 14px sans-serif;z-index:99;box-shadow:0 2px 8px rgba(0,0,0,.3)">&#128260; Обновление v<span id="updVer"></span> — применяю...</div>
<script>
const APP_VERSION='$Version';
(function(){
 if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js');navigator.serviceWorker.addEventListener('controllerchange',function(){location.reload()});}
 function check(){fetch('version.json?'+Date.now(),{cache:'no-store'}).then(function(r){return r.json()}).then(function(v){
  if(v.version!==APP_VERSION){document.getElementById('updVer').textContent=v.version;document.getElementById('updBanner').style.display='block';
   if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').then(function(r){r.update()});}
 }).catch(function(){});}
 check();setInterval(check,30000);
})();
</script>
"@
 $h = $h.Replace('</body>', $block + "</body>")
} else {
 $h = [regex]::Replace($h, "const APP_VERSION='[^']*", "const APP_VERSION='$Version'")
}
if($h -notmatch 'rel="manifest"'){
 $head = "<link rel=`"manifest`" href=`"manifest.json`">`n<meta name=`"theme-color`" content=`"#2563eb`">`n<link rel=`"apple-touch-icon`" href=`"icon.png`">`n</head>"
 $h = $h.Replace('</head>', $head)
}
[System.IO.File]::WriteAllText("$root\index.html", $h, $noBom)
Write-Host "Патч применён: v$Version"
'@ | ForEach-Object { WB "$root\tools\patch.ps1" $_ }

powershell -NoP -ExecutionPolicy Bypass -File "$root\tools\patch.ps1"
Write-Host "GOTOVO. Zapuskay tools\menu.bat"