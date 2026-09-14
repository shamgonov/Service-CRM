const VERSION='1.3.4';const CACHE='crm-'+VERSION;const CORE=['./','index.html','manifest.json','icon.png','icon-192.png','version.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);
if(u.pathname.endsWith('version.json')){e.respondWith(fetch(e.request,{cache:'no-store'}));return;}
if(e.request.method!=='GET'){return;}
if(u.origin!==self.location.origin){return;}
const net=fetch(e.request).then(resp=>{if(resp&&resp.ok){const cp=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));}return resp;});
if(e.request.mode==='navigate'||u.pathname.endsWith('/')||u.pathname.endsWith('index.html')){e.respondWith(net.catch(()=>caches.match(e.request)||caches.match('./')));return;}
e.respondWith(net.catch(()=>caches.match(e.request)));});