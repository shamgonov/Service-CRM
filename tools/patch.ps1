param([string]$Version)
$root = Split-Path -Parent $PSScriptRoot
$noBom = New-Object System.Text.UTF8Encoding $false
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
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