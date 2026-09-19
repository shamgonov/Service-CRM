const VERSION='2.1.9';const CACHE='crm-'+VERSION;const CORE=['./','index.html','manifest.json','icon.png','icon-192.png','version.json'];
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
// B4: тап по уведомлению — открыть карточку заявки (или фокус на открытое окно)
self.addEventListener('notificationclick',e=>{
 e.notification.close();
 const n=e.notification;const oid=n&&n.data&&n.data.orderId;
 const url='./'+(oid?'?order='+oid:'');
 e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>{
  for(var i=0;i<ws.length;i++){var w=ws[i];if(w&&w.focus){if(oid&&w.navigate){try{w.navigate(url);}catch(err){}}return w.focus();}}
  return clients.openWindow(url);
 }));
});