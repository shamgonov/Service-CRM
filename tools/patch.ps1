param([string]$Version)
$root = Split-Path -Parent $PSScriptRoot
$noBom = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
if(!$Version){ $Version = (Get-Content "$root\version.json" -Raw -Encoding UTF8 | ConvertFrom-Json).version }
$sw = @"
const VERSION='$Version';const CACHE='crm-'+VERSION;const CORE=['./','index.html','manifest.json','icon.png','icon-192.png','version.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);
if(u.pathname.endsWith('version.json')){e.respondWith(fetch(e.request,{cache:'no-store'}));return;}
if(e.request.method!=='GET'){return;}
if(u.origin!==self.location.origin){return;}
const OFFLINE='<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Нет соединения</title></head><body style="font-family:sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="background:#fff;border-radius:12px;padding:28px 20px;max-width:340px;text-align:center"><div style="font-size:40px">📡</div><div style="font-weight:700;margin:10px 0">Нет соединения</div><div style="color:#666;font-size:14px">Проверьте интернет и перезагрузите страницу.</div><button onclick="location.reload()" style="margin-top:14px;padding:10px 22px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer">🔄 Перезагрузить</button></div></body></html>';
const offlineResp=new Response(OFFLINE,{headers:{'Content-Type':'text/html; charset=utf-8'}});
if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).then(resp=>{if(resp&&resp.ok){const cp=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));}return resp;}).catch(()=>caches.match(e.request).then(m=>m||caches.match('./')).then(m=>m||offlineResp)));return;}
const net=fetch(e.request).then(resp=>{if(resp&&resp.ok){const cp=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));}return resp;});
e.respondWith(net.catch(()=>caches.match(e.request)));});
"@
[System.IO.File]::WriteAllText("$root\sw.js", $sw, $noBom)
$h = Get-Content "$root\index.html" -Raw -Encoding UTF8
$h = $h -replace 'Версия v[0-9]+\.[0-9]+\.[0-9]+', ('Версия v'+$Version)
$block = @"
<!-- CRM-UPDATER -->
<div id="updStrip" onclick="updOpenModal()" style="display:none;position:fixed;top:0;left:0;right:0;max-width:430px;margin:0 auto;background:#10b981;color:#fff;padding:9px 16px;font:600 13px sans-serif;z-index:98;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.25)">🔄 Доступно обновление — нажмите для подробностей</div>
<div id="updOverlay" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:99;align-items:center;justify-content:center">
 <div style="background:#fff;border-radius:14px;max-width:360px;width:88%;padding:18px;box-shadow:0 8px 30px rgba(0,0,0,.3)">
  <div id="updMTitle" style="font-weight:700;font-size:16px;margin-bottom:10px"></div>
  <div id="updMText" style="font-size:14px;color:#333;white-space:pre-line;max-height:50vh;overflow:auto;margin-bottom:14px"></div>
  <div id="updMBtns" style="display:flex;gap:8px">
   <button id="updNow" style="flex:1;padding:11px;border:none;border-radius:8px;background:#10b981;color:#fff;font-weight:700;cursor:pointer">Обновить</button>
   <button id="updLate" style="flex:1;padding:11px;border:none;border-radius:8px;background:#e5e7eb;color:#374151;font-weight:600;cursor:pointer">Обновить позже</button>
  </div>
  <button id="updMOk" style="display:none;width:100%;padding:11px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer">Понятно</button>
 </div>
</div>
<script>
const APP_VERSION='$Version';
function updNote(v){return (v.text&&v.text.length)?v.text:('Плановое обновление №'+v.deploy+' от '+v.dt);}
function updStrip(on){document.getElementById('updStrip').style.display=on?'block':'none';document.body.style.paddingTop=on?'38px':'0';}
function updOpenModal(){var v=window.__updCur;if(!v)return;
 document.getElementById('updMTitle').textContent='Что нового? v'+v.version;
 document.getElementById('updMText').textContent='Обновление №'+v.deploy+' от '+v.dt+'\n\n'+updNote(v);
 document.getElementById('updMBtns').style.display='flex';
 document.getElementById('updMOk').style.display='none';
 document.getElementById('updOverlay').style.display='flex';}
function updCloseModal(){document.getElementById('updOverlay').style.display='none';}
(function(){
 document.getElementById('updNow').onclick=function(){var v=window.__updCur;if(v)localStorage.setItem('crm_ack',v.deploy);
  if('serviceWorker' in navigator){navigator.serviceWorker.getRegistration().then(function(r){if(r)r.update()});}
  setTimeout(function(){location.reload()},1200);};
 document.getElementById('updLate').onclick=function(){updCloseModal()};
 document.getElementById('updMOk').onclick=function(){updCloseModal()};
 document.getElementById('updOverlay').onclick=function(e){if(e.target===this)updCloseModal()};
 function check(){fetch('version.json?'+Date.now(),{cache:'no-store'}).then(function(r){return r.json()}).then(function(v){
  var ack=+(localStorage.getItem('crm_ack')||0), inf=+(localStorage.getItem('crm_info')||0);
  if((v.deploy||0)>ack){window.__updCur=v;updStrip(true);}
  else{updStrip(false);
   if((v.deploy||0)>inf){localStorage.setItem('crm_info',v.deploy);window.__updCur=v;
    document.getElementById('updMTitle').textContent='Что нового? v'+v.version;
    document.getElementById('updMText').textContent='Обновление №'+v.deploy+' от '+v.dt+'\n\n'+updNote(v);
    document.getElementById('updMBtns').style.display='none';
    document.getElementById('updMOk').style.display='block';
    document.getElementById('updOverlay').style.display='flex';}}
 }).catch(function(){});}
 if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js');
 check();setInterval(check,30000);
})();
</script>
"@
$marker = '<!-- CRM-UPDATER -->'
$i = $h.IndexOf($marker); $j = $h.IndexOf('</body>')
if($i -ge 0){ $k = $h.IndexOf("</script>", $i); if($k -ge 0){ $k = $k + 9 } else { $k = $i }; $h = $h.Substring(0,$i) + $block + "`n" + $h.Substring($k) }
if($h -notmatch 'rel="manifest"'){
 $head = "<link rel=`"manifest`" href=`"manifest.json`">`n<meta name=`"theme-color`" content=`"#2563eb`">`n<link rel=`"apple-touch-icon`" href=`"icon.png`">`n</head>"
 $h = $h.Replace('</head>', $head)
}
[System.IO.File]::WriteAllText("$root\index.html", $h, $noBom)
Write-Host "Патч применён: v$Version"
