param([string]$Version)
$root = Split-Path -Parent $PSScriptRoot
$noBom = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
if(!$Version){ $Version = (Get-Content "$root\version.json" -Raw | ConvertFrom-Json).version }
$sw = @"
const VERSION='$Version';const CACHE='crm-'+VERSION;const CORE=['./','index.html','manifest.json','icon.png','icon-192.png','version.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);
if(u.pathname.endsWith('version.json')){e.respondWith(fetch(e.request,{cache:'no-store'}));return;}
if(e.request.method!=='GET'){return;}
e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{const cp=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return resp}).catch(()=>caches.match('./'))))});
"@
[System.IO.File]::WriteAllText("$root\sw.js", $sw, $noBom)
if(!(Test-Path "$root\manifest.json")){
$m = @"
{"name":"ServiceCRM","short_name":"ServiceCRM","start_url":"./","scope":"./","display":"standalone","background_color":"#f5f5f5","theme_color":"#2563eb","icons":[{"src":"icon-192.png","sizes":"192x192","type":"image/png","purpose":"any maskable"},{"src":"icon.png","sizes":"512x512","type":"image/png","purpose":"any maskable"}]}
"@
[System.IO.File]::WriteAllText("$root\manifest.json", $m, $noBom) }
$h = Get-Content "$root\index.html" -Raw -Encoding UTF8
$block = @"
<!-- CRM-UPDATER -->
<div id="updBanner" style="display:none;position:fixed;top:0;left:0;right:0;max-width:430px;margin:0 auto;background:#10b981;color:#fff;padding:12px 16px 10px;font:14px sans-serif;z-index:99;box-shadow:0 2px 8px rgba(0,0,0,.3)">
 <div id="updText" style="font-weight:600;margin-bottom:8px;white-space:pre-line"></div>
 <div style="display:flex;gap:8px">
  <button id="updNow" style="flex:1;padding:9px;border:none;border-radius:7px;background:#fff;color:#065f46;font-weight:700;cursor:pointer">Обновить</button>
  <button id="updLate" style="flex:1;padding:9px;border:none;border-radius:7px;background:rgba(255,255,255,.25);color:#fff;font-weight:600;cursor:pointer">Обновить позже</button>
 </div>
</div>
<script>
const APP_VERSION='$Version';
(function(){
 var cur=null;
 function show(v){
  cur=v;
  var t=(v.text&&v.text.length)?v.text:('Плановое обновление №'+v.deploy+' от '+v.dt);
  document.getElementById('updText').textContent=t+' (v'+v.version+')';
  document.getElementById('updBanner').style.display='block';
 }
 function check(){
  fetch('version.json?'+Date.now(),{cache:'no-store'}).then(function(r){return r.json()}).then(function(v){
   var ack=+(localStorage.getItem('crm_ack')||0);
   if((v.deploy||0)>ack){ if(document.getElementById('updBanner').style.display!=='block') show(v); }
  }).catch(function(){});
 }
 document.getElementById('updNow').onclick=function(){
  if(cur)localStorage.setItem('crm_ack',cur.deploy);
  if('serviceWorker' in navigator){navigator.serviceWorker.getRegistration().then(function(r){if(r)r.update()});}
  setTimeout(function(){location.reload()},1200);
 };
 document.getElementById('updLate').onclick=function(){document.getElementById('updBanner').style.display='none'};
 if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js');
 check();setInterval(check,30000);
})();
</script>
"@
$marker = '<!-- CRM-UPDATER -->'
$i = $h.IndexOf($marker); $j = $h.IndexOf('</body>')
if($i -ge 0 -and $j -gt $i){ $h = $h.Substring(0,$i) + $block + "`n" + $h.Substring($j) }
elseif($j -ge 0){ $h = $h.Substring(0,$j) + $block + "`n" + $h.Substring($j) }
if($h -notmatch 'rel="manifest"'){
 $head = "<link rel=`"manifest`" href=`"manifest.json`">`n<meta name=`"theme-color`" content=`"#2563eb`">`n<link rel=`"apple-touch-icon`" href=`"icon.png`">`n</head>"
 $h = $h.Replace('</head>', $head)
}
[System.IO.File]::WriteAllText("$root\index.html", $h, $noBom)
Write-Host "Патч применён: v$Version"