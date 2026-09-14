// firebase-access.js  (админка ролей и прав v2)
var auth = firebase.auth();
var fs = firebase.firestore();
var OWNER_KEY = 'crm_owner_7f3a';
var ROLE_NAMES = {admin:'Админ',operator:'Оператор',manager:'Менеджер',worker:'Работник'};

// Каталог функционала (должен совпадать с PERMS_CATALOG в index.html)
var PERMS_CATALOG = [
 {key:'orders_view',label:'Просмотр заявок'},
 {key:'orders_create',label:'Создание заявок'},
 {key:'orders_edit',label:'Правка заявок'},
 {key:'orders_status',label:'Смена статусов'},
 {key:'orders_delete',label:'Удаление заявок'},
 {key:'calendar',label:'Календарь'},
 {key:'tasks',label:'Мои задачи'},
 {key:'shopping',label:'Закупки и материалы'},
 {key:'reports',label:'Отчёты'},
 {key:'admin_templates',label:'Шаблоны и дележка'},
 {key:'staff_manage',label:'Управление сотрудниками'},
 {key:'roles_manage',label:'Управление ролями'},
 {key:'profile_view',label:'Мой профиль'}
];
function permLabel(k){ if(k==='all')return 'Все права'; var f=PERMS_CATALOG.find(function(x){return x.key===k;}); return f?f.label:k; }
function allPermKeys(){ return PERMS_CATALOG.map(function(x){return x.key;}); }

// Встроенные роли для сида
var BUILTIN_ROLES = [
 {id:'admin', name:'Админ', builtin:true, perms:['all']},
 {id:'operator', name:'Оператор', builtin:true, perms:['orders_view','orders_create','orders_edit','orders_status','calendar','shopping','reports']},
 {id:'manager', name:'Менеджер', builtin:true, perms:['orders_view','orders_edit','orders_status','calendar','shopping']},
 {id:'worker', name:'Работник', builtin:true, perms:['orders_view','tasks','calendar','shopping']}
];
// Совместимость: старые константные права по ключу роли
var PERMS = {
 admin:['all'], operator:['orders','calendar','shopping','create','reports'],
 manager:['orders','calendar','shopping'], worker:['tasks','shopping','calendar']
};

function deviceId(){
 var d=localStorage.getItem('crm_device');
 if(!d){d='dev-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);localStorage.setItem('crm_device',d);}
 return d;
}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function isOwner(){ return localStorage.getItem(OWNER_KEY)==='1'; }
var ME=null, TESTROLE=null, unsub=null;
var CONN_ERR=false;      // сетевая ошибка Firestore — вместо демо-входа показываем заглушку
var ROLES=[];            // кэш ролей [{id,name,perms,builtin}]
var STAFF_TAB='requests';// активная вкладка админки

// === ПРАВА ===
function roleById(id){ return ROLES.find(function(r){return r.id===id;}); }
function myPerms(){
 if(isOwner()) return ['all'];
 var src = TESTROLE ? TESTROLE : (ME?ME.role:null);
 if(!src) return [];
 var r = roleById(src);
 if(r) return r.perms||[];
 // если роль ещё не в кэше (гонка) — fallback по встроенным
 var b = BUILTIN_ROLES.find(function(x){return x.id===src;});
 return b?b.perms:[];
}
function can(p){
 if(isOwner()) return true;
 var pr = myPerms();
 if(pr.indexOf('all')>=0) return true;
 return pr.indexOf(p)>=0;
}
window.__canImpl = can;

// === ОБЛАКО (данные приложения) ===
// === УВЕДОМЛЕНИЯ ЭТАП 1: движок событий (без Blaze; FCM-пуши — в ДОЛГИ) ===
// События {type,title,body,orderId,ts,read} в crm_events (последние 50), каналы: in-app бейдж,
// системные Notification (свёрнутое приложение), Badging API, настройки profile.notify + DND.
var LAST_ORDER_TS=0;       // момент последнего снапшота (отсечение своих правок/первого снапшота)
var EVENTS=[];             // кэш событий текущего устройства
function eventsLoad(){ EVENTS=lsGet('crm_events',[]); }
function eventsSave(){ lsSet('crm_events',EVENTS.slice(-50)); }
function unreadCount(){ return EVENTS.filter(function(e){return !e.read;}).length; }
function myName(){ return (ME&&ME.name)||(state&&state.user)||''; }
function lastByDeviceId(o){ return o&&o.lastBy?o.lastBy:null; }
// настройки profile.notify: {sys:true, sound:true, vibra:true, dndFrom:'', dndTo:''}
function notifyCfg(){
 var p=(MYDOC&&MYDOC.profile)||{};
 var n=p.notify||{};
 return {sys:n.sys!==false, sound:n.sound!==false, vibra:n.vibra!==false, dndFrom:n.dndFrom||'', dndTo:n.dndTo||''};
}
function inDND(){
 var c=notifyCfg();
 if(!c.dndFrom||!c.dndTo)return false;
 var h=new Date().getHours()+new Date().getMinutes()/60;
 var from=parseFloat(c.dndFrom), to=parseFloat(c.dndTo);
 if(from<=to)return h>=from&&h<to;
 return h>=from||h<to; // через полночь
}
function beepNotify(){
 if(!notifyCfg().sound||inDND())return;
 try{
  var ctx=window.AudioContext||window.webkitAudioContext; if(!ctx)return;
  var ac=new ctx(), o=ac.createOscillator(), g=ac.createGain();
  o.connect(g); g.connect(ac.destination);
  o.type='sine'; o.frequency.value=880;
  g.gain.setValueAtTime(0.001,ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.2,ac.currentTime+0.05);
  g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+0.35);
  o.start(); o.stop(ac.currentTime+0.4);
 }catch(e){}
 try{ if(notifyCfg().vibra&&navigator.vibrate)navigator.vibrate(200); }catch(e){}
}
function updateAppBadge(){
 try{
  var n=unreadCount();
  if(n>0&&navigator.setAppBadge)navigator.setAppBadge(n);
  else if(navigator.clearAppBadge)navigator.clearAppBadge();
 }catch(e){}
}
function showSystemNotification(ev){
 if(!notifyCfg().sys||inDND())return;
 try{
  if(typeof Notification==='undefined')return;
  if(Notification.permission!=='granted')return;
  var n=new Notification(ev.title,{body:ev.body,icon:'icon.png',tag:ev.orderId+'_'+ev.type});
  n.onclick=function(){ try{ window.focus(); if(ev.orderId!=null)go('details',ev.orderId); n.close(); }catch(e){} };
 }catch(e){}
}
function pushEvent(type,title,body,orderId){
 // CAN-права: событие адресовано экрану; без права — не показываем
 var need={order:'orders_view',assigned:'orders_view',completed:'orders_view',request:'staff_manage',material:'shopping',calendar:'calendar',overdue:'orders_view'}[type];
 if(need&&!can(need))return;
 // подавление автора: свои правки не уведомляют
 var ev={type:type,title:title,body:body,orderId:orderId==null?null:orderId,ts:Date.now(),read:false};
 EVENTS.push(ev); EVENTS=EVENTS.slice(-50); eventsSave();
 if(Date.now()-LAST_ORDER_TS<3000)return; // первые 3с после своих правок/входа — тихо
 beepNotify();
 showSystemNotification(ev);
 updateAppBadge();
 if(typeof render==='function')render();
}
function markEventsRead(screen){
 var orderTypes=['order','assigned','completed','overdue'];
 var t={orders:orderTypes,details:orderTypes,tasks:orderTypes,calendar:['calendar'],shopping:['material'],staff:['request']}[screen]||null;
 var ch=false;
 if(t)EVENTS.forEach(function(e){ if(!e.read&&t.indexOf(e.type)>=0){ e.read=true; ch=true; } });
 if(ch){ eventsSave(); updateAppBadge(); if(typeof render==='function')render(); }
}
function clearOrdersBadge(){ markEventsRead('orders'); }
// экран соответствия события → пункт меню для красного бейджа
function screenForEvent(type){
 return {order:'orders',assigned:'orders',completed:'orders',overdue:'orders',request:'staff',material:'shopping',calendar:'calendar'}[type]||'orders';
}
function eventBadgeHtml(){
 var n=unreadCount();
 if(!n)return '';
 return '<div data-ev-badge="1" style="position:absolute;top:-4px;right:-6px;background:#dc2626;color:#fff;border-radius:10px;min-width:16px;height:16px;font:700 10px/16px sans-serif;text-align:center;padding:0 4px">'+n+'</div>';
}
function applyEventBadges(){
 var nav=document.getElementById('nav'); if(!nav)return;
 // глобальный бейдж на пункте «Заявки» + обновление системного бейджа
 Array.prototype.forEach.call(nav.querySelectorAll('[data-ev-badge]'),function(el){el.remove();});
 var n=unreadCount(); if(!n)return;
 var items=nav.querySelectorAll('.nav-item');
 if(items[0]){ items[0].style.position='relative'; items[0].insertAdjacentHTML('beforeend',eventBadgeHtml()); }
}
// движок: сравнение снапшотов orders
function watchNewOrders(prev, next){
 if(!prev||!next)return;
 try{
  var dev=deviceId();
  var prevById={};
  (prev.orders||[]).forEach(function(o){prevById[o.id]=o;});
  (next.orders||[]).forEach(function(o){
   var p=prevById[o.id];
   var byMe=lastByDeviceId(o)===dev;
   if(!p){ // новая заявка
    if(o.worker&&(o.worker===dev||o.worker===myName())&&o.status==='approved'&&!byMe)
     pushEvent('assigned','📋 Назначена заявка №'+o.id,'Вас назначили исполнителем: '+esc(o.client||''),o.id);
    return;
   }
   // смена исполнителя/статуса → мне-работнику
   var wasMine=p.worker&&(p.worker===dev||p.worker===myName());
   var nowMine=o.worker&&(o.worker===dev||o.worker===myName());
   if(wasMine&&!nowMine&&!byMe)
    pushEvent('order','↩️ Заявку №'+o.id+' переназначили','Заявка больше не ваша',o.id);
   if(!wasMine&&nowMine&&o.status==='approved'&&!byMe)
    pushEvent('assigned','📋 Назначена заявка №'+o.id,'Вас назначили исполнителем: '+esc(o.client||''),o.id);
   if(wasMine&&nowMine&&(p.date!==o.date||p.t1!==o.t1||p.t2!==o.t2)&&!byMe)
    pushEvent('calendar','📅 Изменён календарь — заявка №'+o.id,'Новое время: '+esc(o.date||'')+' '+esc(o.t1||'')+'–'+esc(o.t2||''),o.id);
   // завершение → владельцу и orders_view (кроме автора правки)
   if(p.status!=='completed'&&o.status==='completed'&&!byMe)
    pushEvent('completed','✅ Заявка №'+o.id+' завершена','Фотоотчёт готов, ожидает оплаты',o.id);
   // перенос/отмена
   if(p.status!=='postponed'&&o.status==='postponed'&&(wasMine||isOwner())&&!byMe)
    pushEvent('order','📅 Заявку №'+o.id+' перенесли','Статус: перенос',o.id);
   // материал «не найти» → ролям с shopping
   if(o.materials&&p.materials){
    var wasIssue=p.materials.some(function(m){return m.status==='issue';});
    var nowIssue=o.materials.some(function(m){return m.status==='issue';});
    if(!wasIssue&&nowIssue&&!byMe)
     pushEvent('material','❌ Материал не найти — заявка №'+o.id,'Требуется решение по закупке',o.id);
   }
  });
 }catch(e){ console.warn('watch err',e); }
}
// новые заявки (как раньше) — сотрудникам с orders_view
function watchAddedOrders(prev, next){
 if(!prev||!next)return;
 try{
  var prevIds={}, added=0;
  (prev.orders||[]).forEach(function(o){prevIds[o.id]=1;});
  (next.orders||[]).forEach(function(o){ if(!prevIds[o.id])added++; });
  if(added>0 && Date.now()-LAST_ORDER_TS>3000 && can('orders_view') && !isOwner()){
   for(var i=0;i<added;i++)pushEvent('order','🆕 Новая заявка','Появилась новая заявка в списке',null);
  }
 }catch(e){}
}
// новые заявки на доступ — владельцу
var KNOWN_REQUESTS=null;
function watchRequests(snap){
 try{
  if(!isOwner())return;
  var ids=[];
  snap.forEach(function(d){ if(d.data().status==='pending')ids.push(d.id); });
  if(KNOWN_REQUESTS===null){ KNOWN_REQUESTS=ids; return; }
  var fresh=ids.filter(function(id){ return KNOWN_REQUESTS.indexOf(id)<0; });
  KNOWN_REQUESTS=ids;
  fresh.forEach(function(id){
   pushEvent('request','📨 Новый запрос доступа','Кто-то просит доступ к приложению',null);
  });
 }catch(e){ console.warn(e); }
}
// просрочка: активная заявка с прошедшим t2 — раз в минуту, один раз на заявку
setInterval(function(){
 try{
  if(!DB||!DB.orders)return;
  var dev=deviceId();
  var flags=lsGet('crm_overdue_fired',{});
  var now=Date.now();
  DB.orders.forEach(function(o){
   if(!o.date||!o.t2)return;
   if(['completed','paid','canceled','postponed'].indexOf(o.status)>=0)return;
   var end=new Date(o.date+'T'+o.t2).getTime();
   if(now>end&&!flags[o.id]){
    flags[o.id]=now; lsSet('crm_overdue_fired',flags);
    var mine=o.worker&&(o.worker===dev||o.worker===myName());
    if(mine)pushEvent('overdue','⏰ Просрочка — заявка №'+o.id,'Время окончания прошло ('+esc(o.t2)+')',o.id);
    else if(isOwner())pushEvent('overdue','⏰ Просрочка — заявка №'+o.id,(esc(o.worker)||'Исполнитель')+' не уложился в срок',o.id);
   }
  });
 }catch(e){}
},60000);
function notifyNewOrders(count){
 // совместимость: старые вызовы → события «новая заявка»
 for(var i=0;i<(count||0);i++)pushEvent('order','🆕 Новая заявка','Появилась новая заявка в списке',null);
}
// при просмотре списка заявок события заявок гасятся
(function(){
 var _go=window.go;
 window.go=function(scr){
  markEventsRead(scr);
  return _go.apply(this,arguments);
 };
})();
// === ОБЛАКО: коллекция orders (по документу на заявку) + app/state (настройки) ===
var ORDERS_SUB=false;   // получен первый снапшот коллекции orders
var STATE_SUB=false;    // получен первый снапшот app/state
var ORDERS_ERR=false;   // коллекция orders не читается — фолбэк на кэш/legacy
var MIGRATION_DONE=false;
// === ОФЛАЙН-РЕЖИМ: кэш чтения + очередь записей ===
var OFFLINE=false;              // нет сети (событие/ошибка записи)
var SYNCING=false;              // идёт отправка очереди
var SYNC_OK_TS=0;               // момент показа «Синхронизировано»
function lsGet(k,d){ try{ var s=localStorage.getItem(k); return s?JSON.parse(s):d; }catch(e){ return d; } }
function lsSet(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){ console.warn('ls err',e); } }
function cacheOrders(arr){ lsSet('crm_cache_orders',arr); }
function cacheState(){ lsSet('crm_cache_state',{seq:DB.seq||270,users:DB.users||[],templates:DB.templates||[]}); }
function loadCachedData(){
 var co=lsGet('crm_cache_orders',null), cs=lsGet('crm_cache_state',null);
 if(co&&co.length&&(!DB.orders||!DB.orders.length))DB.orders=co;
 if(cs){ if(!DB.users||!DB.users.length)DB.users=cs.users||[]; if(!DB.templates||!DB.templates.length)DB.templates=cs.templates||[]; if(!DB.seq)DB.seq=cs.seq||270; }
 return !!(co&&co.length);
}
function queueGet(){ return lsGet('crm_queue',[]); }
function queueSet(q){ lsSet('crm_queue',q); }
function queuePush(item){ var q=queueGet(); q.push({t:Date.now(),item:item}); queueSet(q); }
function queueCount(){ return queueGet().length; }
function offlineBanner(){
 var n=queueCount();
 if(SYNC_OK_TS&&Date.now()-SYNC_OK_TS<3000)return '<div style="background:#d1fae5;color:#065f46;padding:8px 16px;font-size:13px;font-weight:700">✅ Синхронизировано</div>';
 if(n>0)return '<div style="background:#fef3c7;color:#92400e;padding:8px 16px;font-size:13px;font-weight:700">📴 Офлайн: изменений в очереди — '+n+'</div>';
 if(OFFLINE)return '<div style="background:#fef3c7;color:#92400e;padding:8px 16px;font-size:13px;font-weight:700">📴 Офлайн: показаны сохранённые данные</div>';
 return '';
}
// последовательная отправка очереди при восстановлении сети
function flushQueue(){
 if(SYNCING||OFFLINE)return;
 var q=queueGet();
 if(!q.length)return;
 SYNCING=true;
 var i=0;
 function next(){
  if(i>=q.length){ queueSet([]); SYNCING=false; SYNC_OK_TS=Date.now(); if(typeof render==='function')render(); return; }
  var it=q[i].item;
  var done=function(){ i++; next(); };
  if(it.kind==='order'){ orderSave(it.order); done(); }
  else if(it.kind==='photo'){
   fs.collection('photos').doc(it.docId).set(it.doc).then(done).catch(function(e){ console.warn('photo flush err',e); done(); });
  }
  else if(it.kind==='settings'){ saveSettings(); done(); }
  else done();
 }
 next();
}
(function(){
 function upd(){
  var on=navigator.onLine;
  if(on&&OFFLINE){ OFFLINE=false; flushQueue(); }
  else if(!on&&!OFFLINE){ OFFLINE=true; if(typeof render==='function')render(); }
 }
 if(typeof window.addEventListener==='function'){ window.addEventListener('online',upd); window.addEventListener('offline',upd); }
 upd();
})();
function ordersRef(){ return fs.collection('orders'); }

function loadCloud(cb){
 if(unsub)unsub();
 var first=true;
 ORDERS_SUB=false; STATE_SUB=false; ORDERS_ERR=false;
 var maybeRender=function(){ if(ORDERS_SUB||ORDERS_ERR){ if(cb)cb(); render(); } };
 // 1) заявки — коллекция orders
 ordersRef().onSnapshot(function(snap){
  var arr=[];
  snap.forEach(function(d){ var o=d.data(); o.id=parseInt(d.id,10)||o.id; arr.push(o); });
  arr.sort(function(a,b){ return (a.id||0)-(b.id||0); });
  var prev=DB;
  DB.orders=arr;
  cacheOrders(arr);
  if(!first) watchNewOrders(prev, DB);
  if(!first) watchAddedOrders(prev, DB);
  ORDERS_SUB=true; first=false;
  maybeRender();
 }, function(err){
  console.warn('orders snapshot err',err);
  ORDERS_ERR=true; first=false;
  // фолбэк: кэш чтения → legacy app/state
  var hasCache=loadCachedData();
  if(!hasCache){
   fs.collection('app').doc('state').get().then(function(sdoc){
    if(sdoc.exists&&sdoc.data().db&&sdoc.data().db.orders){ DB.orders=sdoc.data().db.orders; }
    setTimeout(function(){ if(typeof render==='function')render(); },0);
   }).catch(function(){ setTimeout(function(){ if(typeof render==='function')render(); },0); });
  } else setTimeout(function(){ if(typeof render==='function')render(); },0);
 });
 // 2) настройки/пользователи/шаблоны — app/state (без orders)
 unsub = fs.collection('app').doc('state').onSnapshot(function(snap){
  var st=(snap.exists&&snap.data())||null;
  if(st && st.db){
   DB.users=st.db.users||DB.users||[];
   DB.templates=st.db.templates||DB.templates||[];
   DB.seq=st.db.seq||DB.seq||270;
   cacheState();
  } else if(isOwner()){
   var init=defaultData(); init.orders=[];
   fs.collection('app').doc('state').set({db:init,ordersMigrated:true});
  }
  STATE_SUB=true;
  ensureOwnerInDb();
  if(isOwner()&&fs.collection('requests')){
   fs.collection('requests').get().then(watchRequests).catch(function(){});
  }
  render();
 }, function(err){
  console.warn(err); STATE_SUB=true;
  loadCachedData();
  if(typeof render==='function')render();
 });
}
// запись настроек (users/templates/seq) — app/state БЕЗ orders
function saveSettings(){
 if(!DB)return;
 var copy={seq:DB.seq||270,users:DB.users||[],templates:DB.templates||[]};
 cacheState();
 if(OFFLINE||ORDERS_ERR&&!STATE_SUB){ queuePush({kind:'settings'}); return; }
 fs.collection('app').doc('state').set({db:copy,ordersMigrated:true}).catch(function(e){
  console.warn(e); OFFLINE=true; queuePush({kind:'settings'}); if(typeof render==='function')render();
 });
}
// запись одной заявки — только её документ; офлайн — патч в очередь
function orderSave(order){
 if(!order||order.id==null)return;
 var copy={};
 for(var k in order){ if(k!=='id')copy[k]=order[k]; }
 copy.lastBy=deviceId(); // подавление событий о собственных правках
 if(OFFLINE||ORDERS_ERR&&!ORDERS_SUB){
  queuePush({kind:'order',order:copy,id:order.id});
  // локально применяем сразу (серверный снапшот потом победит, патчи применяются поверх)
  if(typeof DB!=='undefined'&&DB.orders){
   var loc=DB.orders.find(function(x){return x.id==order.id;});
   if(loc)for(var k2 in copy)loc[k2]=copy[k2];
  }
  cacheOrders(DB.orders||[]);
  if(typeof render==='function')render();
  return;
 }
 ordersRef().doc(String(order.id)).set(copy).catch(function(e){
  console.warn('orderSave err',e);
  OFFLINE=true;
  queuePush({kind:'order',order:copy,id:order.id});
  if(typeof render==='function')render();
 });
}
function orderDelete(id){ ordersRef().doc(String(id)).delete().catch(function(e){ console.warn(e); }); }
// одноразовая миграция: app/state.db.orders → коллекция orders (только владелец, чанки по 400)
function migrateOrdersIfNeeded(){
 if(!isOwner()||MIGRATION_DONE)return;
 fs.collection('app').doc('state').get().then(function(sdoc){
  var legacy=(sdoc.exists&&sdoc.data().db&&sdoc.data().db.orders)||[];
  var migrated=sdoc.exists&&sdoc.data().ordersMigrated;
  if(!legacy.length||migrated){ MIGRATION_DONE=true; return; }
  ordersRef().limit(1).get().then(function(snap){
   if(!snap.empty){ // уже есть заявки — просто пометить
    MIGRATION_DONE=true;
    fs.collection('app').doc('state').set({db:{seq:sdoc.data().db.seq||270,users:sdoc.data().db.users||[],templates:sdoc.data().db.templates||[]},ordersMigrated:true},{merge:true});
    return;
   }
   var batch=fs.batch(), n=0, total=0;
   legacy.forEach(function(o){
    var ref=ordersRef().doc(String(o.id));
    var copy={}; for(var k in o){ if(k!=='id')copy[k]=o[k]; }
    batch.set(ref,copy); n++; total++;
    if(n>=400){ batch.commit(); batch=fs.batch(); n=0; }
   });
   if(n>0)batch.commit();
   MIGRATION_DONE=true;
   var st=sdoc.data().db||{};
   fs.collection('app').doc('state').set({db:{seq:st.seq||270,users:st.users||[],templates:st.templates||[]},ordersMigrated:true})
    .then(function(){ console.log('migrated orders:',total); })
    .catch(function(e){ console.warn(e); });
  }).catch(function(e){ console.warn('migrate check err',e); });
 }).catch(function(e){ console.warn(e); });
}
function ensureOwnerInDb(){
 if(!DB.users)DB.users=[];
 var dev=deviceId();
 if(isOwner() && !DB.users.find(function(u){return u.deviceId===dev;})){
   DB.users.push({id:'u_owner',name:'Дмитрий (владелец)',role:'admin',share:0,deviceId:dev,status:'approved',quals:[],perms:['all'],owner:true});
   saveSettings();
 }
}

// === Сид ролей + загрузка кэша ===
function ensureRolesSeeded(cb){
 fs.collection('roles').limit(1).get().then(function(snap){
   if(snap.empty){
     var tasks = BUILTIN_ROLES.map(function(r){ return fs.collection('roles').doc(r.id).set(r); });
     Promise.all(tasks).then(function(){ loadRoles(cb); }).catch(function(e){ console.warn(e); loadRoles(cb); });
   } else loadRoles(cb);
 }).catch(function(e){ console.warn('roles seed err',e); ROLES=BUILTIN_ROLES.slice(); if(cb)cb(); });
}
function loadRoles(cb){
 fs.collection('roles').get().then(function(snap){
   var arr=[]; snap.forEach(function(d){ var r=d.data(); r.id=r.id||d.id; arr.push(r); });
   // добавим отсутствующие встроенные (на случай частичной базы)
   BUILTIN_ROLES.forEach(function(b){ if(!arr.find(function(x){return x.id===b.id;})) arr.push(b); });
   ROLES=arr; if(cb)cb();
 }).catch(function(e){ console.warn('loadRoles err',e); ROLES=BUILTIN_ROLES.slice(); if(cb)cb(); });
}
function roleName(id){ var r=roleById(id); return r?r.name:(ROLE_NAMES[id]||esc(id)); }

// === ЭКРАН ВХОДА ===
// Демо-вход (карточки «Дмитрий/Оля/Анна/Вася») недоступен: index.html отдаёт заглушку,
// здесь — панель владельца, запомненный профиль устройства или форма запроса.
function getLastUser(){
 try{ var s=localStorage.getItem('crm_last_user'); if(!s)return null;
  var o=JSON.parse(s); return (o&&o.name)?o:null; }catch(e){ return null; }
}
function renderAccess(){
 var dev=deviceId();
 var v = (typeof APP_VERSION!=='undefined')?APP_VERSION:'';
 var body;
 if(CONN_ERR){
  body='<div class="muted" style="text-align:center;padding:12px 0">Нет соединения с сервером, проверьте интернет</div>'+
   '<button class="btn btn-blue" onclick="location.reload()">🔄 Повторить</button>';
 }
 else if(isOwner()) body=ownerPanel();
 else{
  var lu=getLastUser();
  body = lu ? lastUserCard(lu,dev) : employeeOrRequest(dev);
 }
 return '<div class="header dark" style="flex-direction:column;align-items:flex-start;gap:4px">'+
   '<h1>🔧 ServiceCRM</h1><div style="font-size:12px;opacity:.8">Версия v'+v+'</div></div>'+
   '<div class="card"><div class="sec-title">Вход</div>'+body+'</div>';
}
function lastUserCard(lu,dev){
 var av=lu.avatar?'<img src="'+lu.avatar+'" style="width:56px;height:56px;border-radius:50%;object-fit:cover">':
  '<div style="width:56px;height:56px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:24px;flex:none">👤</div>';
 return '<div id="reqBox">'+
  '<div class="role-card" onclick="restoreLastUser()" style="display:flex;align-items:center;gap:12px">'+av+
   '<div><b>Войти как '+esc(lu.name)+'</b><div class="muted">'+esc(roleName(lu.role))+'</div></div></div>'+
  '<div style="border-top:1px solid #e5e5e5;margin:12px 0"></div>'+
  '<button class="btn" onclick="forgetLastUser()" style="width:100%;background:#f3f4f6;color:#374151">Запросить новый доступ</button>'+
  '<div class="muted" style="margin-top:10px">Устройство: '+dev+'</div></div>';
}
function restoreLastUser(){
 var dev=deviceId();
 fs.collection('employees').doc(dev).get().then(function(d){
  if(d.exists && d.data().status==='approved'){
   ME=d.data(); ME.deviceId=ME.deviceId||dev; MYDOC=ME;
   var pin=pinSet(ME.profile);
   if(pin && sessionStorage.getItem('crm_unlocked')!=='1'){ PIN_TRIES=0; showPinGate(); }
   else startMain();
  } else {
   localStorage.removeItem('crm_last_user');
   document.getElementById('app').innerHTML=renderAccess();
  }
 }).catch(function(e){ console.warn(e); alert('Нет соединения с сервером, проверьте интернет'); });
}
function forgetLastUser(){
 localStorage.removeItem('crm_last_user');
 document.getElementById('app').innerHTML=renderAccess();
}
function ownerPanel(){
 var dev=deviceId();
 var roles = ROLES.length?ROLES:BUILTIN_ROLES;
 return '<div class="muted" style="margin-bottom:8px">👑 Режим владельца: тест любой роли</div>'+
  roles.map(function(r){var nm=r.name||roleName(r.id);return '<div class="role-card" onclick="enterAs(\''+r.id+'\')"><b>'+esc(nm)+'</b><div class="muted">тестировать как '+esc(nm)+'</div></div>';}).join('')+
  '<div class="role-card" onclick="goAdminStaff()" style="border-color:#10b981"><b>👥 Управление сотрудниками и ролями</b><div class="muted">заявки, роли, матрица прав, права доступа</div></div>'+
  '<div class="muted" style="margin-top:10px">Устройство: '+dev+'</div>';
}
function employeeOrRequest(dev){
 return '<div id="reqBox">'+
  '<div class="muted" style="margin-bottom:8px">Это устройство ещё не одобрено. Отправьте запрос владельцу.</div>'+
  '<input class="input" id="reqName" placeholder="Ваше имя" style="margin-bottom:8px">'+
  '<button class="btn btn-blue" onclick="sendRequest()">📨 Запросить доступ</button>'+
  '<div class="muted" style="margin-top:10px">Устройство: '+dev+'<br>Статус: <span id="reqStatus">проверка...</span></div></div>';
}
function sendRequest(){
 var name=(document.getElementById('reqName').value||'').trim();
 if(!name)return alert('Введите имя');
 var dev=deviceId();
 fs.collection('requests').doc(dev).set({deviceId:dev,name:name,ts:Date.now(),status:'pending'}).then(function(){
  document.getElementById('reqBox').innerHTML='<div class="muted">✅ Запрос отправлен. Ждите подтверждения владельца.</div>';
 });
}
function enterAs(role){ TESTROLE=role; state.role=role; state.user='Владелец ('+roleName(role)+')'; state.screen=can('tasks')&&!can('orders_view')?'tasks':'orders'; render(); }
function goAdminStaff(){ TESTROLE='admin'; state.role='admin'; state.user='Владелец'; STAFF_TAB='requests'; state.screen='staff'; render(); }

// === СТАТУС ОДОБРЕНИЯ ===
function checkApproved(cb){
 var dev=deviceId();
 var uid=(auth.currentUser&&auth.currentUser.uid)||null;
 if(isOwner()){
  fs.collection('meta').doc('owner').set({deviceId:dev,uid:uid,ts:Date.now()}).catch(function(){});
  window.__accessMode=true;
  cb(true);
  return;
 }
 function proceed(){
  fs.collection('employees').doc(dev).get().then(function(doc){
   if(doc.exists && doc.data().status==='approved'){ ME=doc.data(); cb(true); }
   else cb(false);
  }).catch(function(e){ console.warn('FIRESTORE ERROR:',e); if(e && (e.code==='unavailable')) CONN_ERR=true; cb(false); });
 }
 fs.collection('meta').doc('owner').get().then(function(m){
  if(!m.exists){ fs.collection('meta').doc('owner').set({deviceId:dev,uid:(auth.currentUser&&auth.currentUser.uid)||null,ts:Date.now()}); localStorage.setItem(OWNER_KEY,'1'); window.__accessMode=true; cb(true); }
  else proceed();
 }).catch(function(){ proceed(); });
}

// === АДМИНКА (вкладки) ===
function renderStaff(){
 return '<div class="header dark"><button class="back" onclick="logout()">←</button><h1>👥 Управление</h1></div>'+
  '<div class="filters">'+
   [['requests','📨 Заявки'],['staff','👥 Сотрудники'],['roles','🏷 Роли']].map(function(t){
     return '<button class="fbtn '+(STAFF_TAB===t[0]?'active':'')+'" onclick="setStaffTab(\''+t[0]+'\')">'+t[1]+'</button>';}).join('')+
  '</div>'+
  '<div id="staffList" class="card"><div class="muted">Загрузка...</div></div>';
}
function setStaffTab(t){ STAFF_TAB=t; document.getElementById('app').innerHTML=renderStaff(); setTimeout(loadStaff,80); }

function roleOptions(sel){
 var roles = ROLES.length?ROLES:BUILTIN_ROLES;
 return roles.map(function(r){var nm=r.name||roleName(r.id);return '<option value="'+r.id+'" '+(sel===r.id?'selected':'')+'>'+esc(nm)+'</option>';}).join('');
}
function permsSummaryLine(perms){
 if(!perms||!perms.length)return '<span class="muted">— нет прав —</span>';
 if(perms.indexOf('all')>=0)return '<span class="badge" style="background:#ede9fe;color:#5b21b6">все права</span>';
 return perms.map(function(k){return '<span class="badge" style="background:#eef2ff;color:#3730a3">'+esc(permLabel(k))+'</span>';}).join('');
}

function loadStaff(){
 var wrap=document.getElementById('staffList'); if(!wrap)return;
 if(!ROLES.length){ loadRoles(function(){ loadStaff(); }); return; }
 if(STAFF_TAB==='requests') return tabRequests(wrap);
 if(STAFF_TAB==='staff') return tabStaff(wrap);
 if(STAFF_TAB==='roles') return tabRoles(wrap);
}

// --- Вкладка Заявки ---
function tabRequests(wrap){
 fs.collection('requests').where('status','==','pending').get().then(function(snap){
  var html='<div class="sec-title">Заявки на приём</div>';
  if(snap.empty)html+='<div class="muted">Нет заявок</div>';
  snap.forEach(function(d){var r=d.data();
   var safeName=esc(r.name).replace(/'/g,"\\'");
   html+='<div class="mat"><b>'+esc(r.name)+'</b> <span class="muted">'+esc(r.deviceId)+'</span>'+
    '<div style="display:flex;gap:6px;margin-top:8px">'+
     '<select class="input" id="role_'+r.deviceId+'" style="flex:1">'+roleOptions('worker')+'</select>'+
     '<button class="btn-sm btn-green" onclick="approve(\''+r.deviceId+'\',\''+safeName+'\')">Принять</button>'+
     '<button class="btn-sm btn-red" onclick="reject(\''+r.deviceId+'\')">Отклонить</button>'+
    '</div></div>';
  });
  wrap.innerHTML=html;
 }).catch(function(e){ wrap.innerHTML='<div class="muted">Ошибка: '+esc(e.message)+'</div>'; });
}

// --- Вкладка Сотрудники ---
function tabStaff(wrap){
 fs.collection('employees').get().then(function(es){
  var html='<div class="sec-title">Принятые сотрудники</div>';
  if(es.empty)html+='<div class="muted">Пока никого</div>';
  es.forEach(function(d){var e=d.data(); e.deviceId=e.deviceId||d.id;
   var r=roleById(e.role);
   html+='<div class="mat"><b>'+esc(e.name)+'</b> — '+esc(r?r.name:(ROLE_NAMES[e.role]||e.role))+
    ' <span class="badge" style="background:#d1fae5;color:#065f46">'+((e.quals||[]).map(esc).join(', ')||'—')+'</span>'+
    '<div class="muted" style="margin:4px 0">'+esc(e.deviceId)+'</div>'+
    '<div style="margin:4px 0">'+permsSummaryLine(r?r.perms:[])+'</div>'+
    '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">'+
     '<select class="input" id="srole_'+e.deviceId+'" style="flex:1;min-width:120px">'+roleOptions(e.role)+'</select>'+
     '<button class="btn-sm btn-blue" onclick="setEmpRole(\''+e.deviceId+'\')">Роль</button>'+
    '</div>'+
    '<div style="display:flex;gap:6px;margin-top:6px">'+
     '<select class="input" id="q_'+e.deviceId+'" style="flex:1"><option value="">+ квалификация</option>'+
      '<option>монтажник</option><option>диагност</option><option>электрик</option><option>старший</option></select>'+
     '<button class="btn-sm btn-outline" onclick="addQual(\''+e.deviceId+'\')">+</button>'+
     '<button class="btn-sm btn-red" onclick="fireEmp(\''+e.deviceId+'\')">Уволить</button>'+
    '</div>'+
    '<div style="display:flex;gap:6px;margin-top:6px">'+
     '<button class="btn-sm btn-blue" onclick="viewEmpProfile(\''+e.deviceId+'\')">👤 Профиль</button>'+
     '<button class="btn-sm btn-outline" onclick="adminResetPin(\''+e.deviceId+'\')">🔑 Сбросить PIN</button>'+
    '</div></div>';
  });
  wrap.innerHTML=html;
 }).catch(function(e){ wrap.innerHTML='<div class="muted">Ошибка: '+esc(e.message)+'</div>'; });
}

// --- Вкладка Роли ---
function tabRoles(wrap){
 var html='<div class="sec-title">Роли и матрица прав</div>'+
  '<button class="btn btn-outline" onclick="createRole()">＋ Создать роль</button>';
 ROLES.forEach(function(r){
   var isAdm = r.id==='admin';
   var locked = isAdm; // admin не редактируется
   html+='<div class="mat" style="border-left:4px solid #2563eb">'+
    '<div class="mat-head"><b>'+esc(r.name||r.id)+'</b>'+
     '<span>'+(r.builtin?'<span class="badge" style="background:#f1f5f9;color:#475569">встроенная</span> ':'')+
     (!r.builtin?'<button class="btn-sm btn-red" style="flex:none;width:auto;padding:4px 8px" onclick="deleteRole(\''+r.id+'\')">Удалить</button>':'')+'</span></div>';
   if(locked){
     html+='<div class="muted" style="margin:6px 0">👑 все права (роль администратора защищена)</div>';
   } else {
     html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;margin:8px 0">'+
       PERMS_CATALOG.map(function(pc){
         var on=(r.perms||[]).indexOf(pc.key)>=0 || (r.perms||[]).indexOf('all')>=0;
         return '<label style="font-size:12px;display:flex;align-items:center;gap:6px;cursor:pointer">'+
           '<input type="checkbox" '+(on?'checked':'')+' onchange="togglePerm(\''+r.id+'\',\''+pc.key+'\',this.checked)"> '+esc(pc.label)+'</label>';
       }).join('')+'</div>'+
       '<div class="muted" style="font-size:11px">id: '+esc(r.id)+' • изменения сохраняются сразу</div>';
   }
   html+='</div>';
 });
 wrap.innerHTML=html;
}

// --- Действия админки ---
function approve(dev,name){
 var role=document.getElementById('role_'+dev).value;
 var r=roleById(role);
 fs.collection('employees').doc(dev).set({deviceId:dev,name:name,role:role,status:'approved',quals:[],perms:(r?r.perms:[])||[],ts:Date.now()});
 fs.collection('requests').doc(dev).delete();
 setTimeout(loadStaff,500);
}
function reject(dev){ fs.collection('requests').doc(dev).delete(); setTimeout(loadStaff,500); }
function setEmpRole(dev){
 var role=document.getElementById('srole_'+dev).value;
 var r=roleById(role);
 fs.collection('employees').doc(dev).update({role:role,perms:(r?r.perms:[])||[]}).then(function(){
   if(ME && ME.deviceId===dev){ ME.role=role; ME.perms=(r?r.perms:[])||[]; }
   alert('Роль обновлена'); setTimeout(loadStaff,300);
 });
}
function addQual(dev){
 var q=document.getElementById('q_'+dev).value; if(!q)return;
 fs.collection('employees').doc(dev).get().then(function(d){var e=d.data();var qs=e.quals||[];if(qs.indexOf(q)<0)qs.push(q);
  fs.collection('employees').doc(dev).update({quals:qs});setTimeout(loadStaff,400);});
}
function fireEmp(dev){ if(confirm('Уволить сотрудника?')){fs.collection('employees').doc(dev).delete();setTimeout(loadStaff,400);} }

function togglePerm(roleId,key,on){
 var r=roleById(roleId); if(!r)return;
 if(roleId==='admin')return alert('Роль администратора защищена');
 if(r.builtin===undefined)r.builtin=false;
 var perms=(r.perms||[]).slice();
 var ai=perms.indexOf('all'); if(ai>=0){perms.splice(ai,1); perms=allPermKeys().slice(); r.perms=perms;}
 var i=perms.indexOf(key);
 if(on && i<0)perms.push(key);
 if(!on && i>=0)perms.splice(i,1);
 r.perms=perms;
 fs.collection('roles').doc(roleId).update({perms:perms}).then(function(){
   if(ME && ME.role===roleId){ ME.perms=perms; }
 });
}
function createRole(){
 var name=prompt('Название новой роли:'); if(!name)return; name=name.trim(); if(!name)return;
 var id='r_'+Date.now()+'-'+Math.random().toString(36).slice(2,6);
 var obj={id:id,name:name,perms:['orders_view'],builtin:false};
 fs.collection('roles').doc(id).set(obj).then(function(){ ROLES.push(obj); setTimeout(loadStaff,300); });
}
function deleteRole(id){
 if(id==='admin')return alert('Нельзя удалить роль администратора');
 fs.collection('employees').where('role','==',id).limit(1).get().then(function(snap){
   if(!snap.empty){ alert('Сначала переведите сотрудников на другую роль'); return; }
   if(!confirm('Удалить роль?'))return;
   fs.collection('roles').doc(id).delete().then(function(){ ROLES=ROLES.filter(function(r){return r.id!==id;}); setTimeout(loadStaff,300); });
 }).catch(function(e){ alert('Ошибка проверки сотрудников: '+e.message); });
}

// === СТАРТ ===
function startMain(){
 if(ME){
  state.role=ME.role; state.user=ME.name;
  // запоминаем профиль устройства (кроме владельца — он видит панель 👑)
  if(!isOwner()){
   try{ localStorage.setItem('crm_last_user', JSON.stringify({name:ME.name||'', role:ME.role||'', avatar:(ME.profile&&ME.profile.avatar)||''})); }catch(e){}
  }
 }
 LAST_ORDER_TS=Date.now(); // первый снапшот — не считать «новыми»
 eventsLoad();
 if(!navigator.onLine){ OFFLINE=true; loadCachedData(); }
 loadCloud(function(){});
 migrateOrdersIfNeeded();
}
// Единая PIN-проверка для ВСЕХ (включая владельца): профиль читается всегда,
// гейт показывается ДО панели владельца и ДО тест-карточек ролей.
function gateThenStart(){
 getMyDoc(function(){
  var pin=pinSet(MYDOC&&MYDOC.profile);
  if(pin && sessionStorage.getItem('crm_unlocked')!=='1'){ showPinGate(); }
  else startMain();
 });
}
(function startApp(){
 auth.signInAnonymously().then(function(){
  // привязка uid: employees/{deviceId}.uid + usermap/{uid}={deviceId} — до остальных операций
  try{
   var u=auth.currentUser&&auth.currentUser.uid;
   if(u){
    var dev=deviceId();
    fs.collection('employees').doc(dev).set({uid:u},{merge:true}).catch(function(){});
    fs.collection('usermap').doc(u).set({deviceId:dev},{merge:true}).catch(function(){});
   }
  }catch(e){ console.warn('uid bind err',e); }
 }).catch(function(e){ console.warn(e); });
 ensureRolesSeeded(function(){
  checkApproved(function(ok){
   if(ok){
    gateThenStart();
   } else {
    window.__accessMode=true;
    // сотрудник не прошёл проверку (уволен/нет документа) — запомненный профиль не нужен;
    // при сетевой ошибке — не трогаем (покажем сообщение о соединении)
    if(!isOwner() && !CONN_ERR) localStorage.removeItem('crm_last_user');
    document.getElementById('app').innerHTML=renderAccess();
    document.getElementById('nav').style.display='none';
    if(!isOwner()) setTimeout(function(){
     var dev=deviceId();
     fs.collection('employees').doc(dev).get().then(function(d){
      var st=document.getElementById('reqStatus');
      if(d.exists&&d.data().status==='approved'){location.reload();}
      else if(st)st.textContent='ожидает подтверждения';
     });
    },1500);
   }
  });
 });
})();

var _origRender = window.render;
window.render = function(){
 if(pinSet(MYDOC&&MYDOC.profile) && sessionStorage.getItem('crm_unlocked')!=='1' && !state.role){
  showPinGate();
  return;
 }
 if(window.__accessMode && !state.role){
  document.getElementById('app').innerHTML=renderAccess();
  document.getElementById('nav').style.display='none';
  return;
 }
 if(state.screen==='staff'){
  document.getElementById('app').innerHTML=renderStaff();
  document.getElementById('nav').style.display='none';
  setTimeout(loadStaff,100);
  return;
 }
 if(state.screen==='profile'){
  document.getElementById('nav').style.display='flex';
  document.getElementById('app').innerHTML=renderProfile();
  addProfileNavItem();
  return;
 }
 if(_origRender)_origRender();
 addProfileNavItem();
 applyPermsUI();
 applyEventBadges();
 updateAppBadge();
 // детали заявки: подтянуть фото из коллекции photos и перерисовать галерею
 if(state.screen==='details' && state.orderId!=null && typeof fs!=='undefined' && fs){
  var oid=state.orderId;
  loadOrderPhotos(oid, function(){
   if(state.screen==='details' && state.orderId===oid && typeof render==='function'){
    setTimeout(function(){ if(state.screen==='details'&&state.orderId===oid)render(); },0);
   }
  });
 }
};
window.orderSave = orderSave;
window.saveSettings = saveSettings;
window.orderDelete = orderDelete;
// save() из index.html: мутации заявок помечены markOrder (state.__mutOrder) → пишем документ заявки;
// остальное — настройки (app/state без orders).
window.save = function(order){
 if(order && order.id!=null){ orderSave(order); return; }
 var wasOrder=false;
 try{
  if(state && state.__mutOrder){ var o=state.__mutOrder; state.__mutOrder=null; orderSave(o); wasOrder=true; }
 }catch(e){}
 if(!wasOrder) saveSettings();
};
// logout: разблокировка сбрасывается; владелец видит панель 👑,
// сотрудник — карточку «Войти как …» (или форму запроса, если профиля нет).
window.logout = function(){ state.role=null;state.user=null;TESTROLE=null;ME=null;MYDOC=null;window.__accessMode=true;document.getElementById('nav').style.display='none';
 sessionStorage.removeItem('crm_unlocked');
 document.getElementById('app').innerHTML=renderAccess(); };

// ============================================================
// ЛИЧНЫЙ КАБИНЕТ «МОЙ ПРОФИЛЬ» + PIN-ЗАЩИТА УСТРОЙСТВА
// ============================================================
var QUALS_CATALOG=['монтажник','диагност','электрик','старший'];
var MYDOC=null;               // кэш employees/{deviceId}
var AVATAR_TMP=null;          // base64 после даунскейла (до сохранения)
var PIN_TRIES=0;

// === PIN: PBKDF2-SHA-256 (100k итераций, соль 16 байт) ===
// profile.pinSalt + profile.pinHash; старый открытый pin мигрирует при первом успешном вводе.
var PIN_ITER=100000;
var subtleOK=(typeof crypto!=='undefined'&&crypto.subtle&&typeof crypto.subtle.importKey==='function');
function randSalt(){
 var a=new Uint8Array(16);
 if(typeof crypto!=='undefined'&&crypto.getRandomValues)crypto.getRandomValues(a);
 else for(var i=0;i<16;i++)a[i]=Math.floor(Math.random()*256);
 return Array.prototype.map.call(a,function(b){return ('0'+b.toString(16)).slice(-2);}).join('');
}
function pbkdf2(pin,saltHex){
 var enc=new TextEncoder();
 var salt=new Uint8Array(saltHex.match(/.{2}/g).map(function(h){return parseInt(h,16);}));
 return crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveBits'])
  .then(function(k){ return crypto.subtle.deriveBits({name:'PBKDF2',salt:salt,iterations:PIN_ITER,hash:'SHA-256'},k,256); })
  .then(function(buf){
   return Array.prototype.map.call(new Uint8Array(buf),function(b){return ('0'+b.toString(16)).slice(-2);}).join('');
  });
}
function makePinRecord(pin){
 var salt=randSalt();
 return pbkdf2(pin,salt).then(function(hash){ return {pinSalt:salt,pinHash:hash}; });
}
function verifyPin(profile,entered){
 if(!profile)return Promise.resolve(false);
 if(profile.pinHash&&profile.pinSalt){
  if(!subtleOK)return Promise.resolve(false); // хэш есть, проверить нечем — не впускаем
  return pbkdf2(entered,profile.pinSalt).then(function(h){ return h===profile.pinHash; });
 }
 if(profile.pin){ return Promise.resolve(entered===profile.pin); } // legacy
 return Promise.resolve(false); // PIN не установлен
}
function pinSet(profile){ return !!(profile&&((profile.pinHash&&profile.pinSalt)||profile.pin)); }

function myDocRef(){ return fs.collection('employees').doc(deviceId()); }

function getMyDoc(cb){
 var dev=deviceId();
 myDocRef().get().then(function(d){
   if(d.exists){ MYDOC=d.data(); MYDOC.deviceId=MYDOC.deviceId||dev; }
   else if(isOwner()){
     MYDOC={deviceId:dev,name:state.user||'Владелец',role:'admin',owner:true,status:'approved',quals:[],profile:{}};
     myDocRef().set(MYDOC).catch(function(e){console.warn(e);});
   } else MYDOC={deviceId:dev,profile:{}};
   if(cb)cb(MYDOC);
 }).catch(function(e){ console.warn(e); MYDOC=MYDOC||{deviceId:dev,profile:{}}; if(cb)cb(MYDOC); });
}

function renderProfile(){
 var p=(MYDOC&&MYDOC.profile)||{};
 var av=AVATAR_TMP||p.avatar||'';
 var nt=p.notify||{sys:true,sound:true,vibra:true,dndFrom:'',dndTo:''};
 var avHtml=av
  ?'<img src="'+av+'" style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:2px solid var(--blue)">'
  :'<div style="width:88px;height:88px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:34px">👤</div>';
 var quals=(p.spec)||[];
 return '<div class="header dark"><button class="back" onclick="go(\'orders\')">←</button><h1>👤 Мой профиль</h1></div>'+
 '<div class="card" style="text-align:center">'+avHtml+
  '<div><button class="btn-sm btn-outline" style="margin-top:8px" onclick="document.getElementById(\'avFile\').click()">📷 Загрузить фото</button>'+
  (av?'<button class="btn-sm btn-red" style="margin-top:8px" onclick="clearAvatar()">✕ Убрать</button>':'')+'</div>'+
  '<input type="file" id="avFile" accept="image/*" style="display:none" onchange="avatarPick(this)">'+
  '<div class="muted" style="margin-top:6px">'+esc((MYDOC&&MYDOC.name)||'')+' • '+esc(roleName(MYDOC&&MYDOC.role))+'</div></div>'+
 '<div class="card"><div class="sec-title">Контакты</div>'+
  '<div class="field"><label class="label">ФИО</label><input class="input" id="pf-fio" value="'+esc(p.fio||'')+'" placeholder="Фамилия Имя Отчество"></div>'+
  '<div class="field"><label class="label">Телефон</label><input class="input" id="pf-phone" type="tel" value="'+esc(p.phone||'')+'" placeholder="+7..."></div>'+
  '<div class="field"><label class="label">E-mail</label><input class="input" id="pf-email" type="email" value="'+esc(p.email||'')+'" placeholder="mail@example.com"></div>'+
  '<div class="field"><label class="label">Город / район выезда</label><input class="input" id="pf-city" value="'+esc(p.city||'')+'" placeholder="город, район"></div>'+
  '<div class="field"><label class="label">График работы</label><input class="input" id="pf-schedule" value="'+esc(p.schedule||'')+'" placeholder="напр.: пн-пт 9:00–18:00"></div>'+
 '</div>'+
 '<div class="card"><div class="sec-title">Специализация</div>'+
  '<div class="chips">'+QUALS_CATALOG.map(function(q){
   return '<span class="chip '+(quals.indexOf(q)>=0?'sel':'')+'" onclick="this.classList.toggle(\'sel\')">'+esc(q)+'</span>';}).join('')+'</div>'+
 '</div>'+
 '<div class="card"><div class="sec-title">🔔 Уведомления</div>'+
  '<label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:14px"><input type="checkbox" id="pf-nt-sys" '+(nt.sys?'checked':'')+'> Системные уведомления (когда приложение свёрнуто)</label>'+
  '<label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:14px"><input type="checkbox" id="pf-nt-sound" '+(nt.sound?'checked':'')+'> Звук</label>'+
  '<label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:14px"><input type="checkbox" id="pf-nt-vibra" '+(nt.vibra?'checked':'')+'> Вибрация</label>'+
  '<div class="muted" style="margin:8px 0 4px">Не беспокоить (в это время — только бейдж, без звука и системных):</div>'+
  '<div class="row2"><input class="input" id="pf-nt-from" type="number" min="0" max="23" step="0.5" value="'+esc(nt.dndFrom)+'" placeholder="с (ч)"><input class="input" id="pf-nt-to" type="number" min="0" max="24" step="0.5" value="'+esc(nt.dndTo)+'" placeholder="по (ч)"></div>'+
 '</div>'+
 '<div class="card"><div class="sec-title">🔑 PIN-код устройства</div>'+
  (pinSet(p)?'<div class="muted" style="margin-bottom:6px">PIN установлен (4 цифры). Введите новый, чтобы изменить.</div>':'<div class="muted" style="margin-bottom:6px">PIN не установлен. 4 цифры — защита устройства при открытии.</div>')+
  (!subtleOK&&p.pin?'<div class="muted" style="color:#b45309;margin-bottom:6px">⚠ PIN хранится без хэширования (старый WebView не поддерживает шифрование).</div>':'')+
  '<input class="input" id="pf-pin" type="password" inputmode="numeric" maxlength="4" placeholder="••••">'+
  '<div class="row2"><button class="btn-sm btn-blue" onclick="savePin()">Установить / изменить</button>'+
  (pinSet(p)?'<button class="btn-sm btn-red" onclick="resetMyPin()">Сбросить PIN</button>':'')+'</div>'+
  '<div class="muted" style="margin-top:6px">При следующем открытии приложения потребуется ввод PIN.</div>'+
 '</div>'+
 '<div style="padding:0 16px 16px"><button class="btn btn-green" onclick="saveProfile()">💾 Сохранить</button></div>';
}

function addProfileNavItem(){
 var nav=document.getElementById('nav'); if(!nav)return;
 if(nav.querySelector('[data-profile-nav]'))return;
 var d=document.createElement('div');
 d.className='nav-item'+(state.screen==='profile'?' active':'');
 d.setAttribute('data-profile-nav','1');
 d.innerHTML='<span>👤</span>Профиль';
 d.onclick=function(){ go('profile'); };
 nav.appendChild(d);
}

function avatarPick(inp){
 downscale(inp,160,0.8,true,function(dataUrl){ AVATAR_TMP=dataUrl; document.getElementById('app').innerHTML=renderProfile(); });
}
function clearAvatar(){ AVATAR_TMP=''; if(MYDOC&&MYDOC.profile)MYDOC.profile.avatar=''; document.getElementById('app').innerHTML=renderProfile(); }

// === ФОТО ЗАЯВОК: коллекция photos (без Blaze) + миграционный путь в Storage ===
// Документ: {orderId, data (base64 JPEG), ts, by}, id = {orderId}_{ts}.
// Если появится бакет Storage — новые фото уходят туда (url в data), старые читаются из photos.
var PHOTOS_CACHE={};   // orderId -> [{id,data,ts,by}]
var STOR_CHECKED=false, STOR_OK=false;
function storReady(){
 if(!STOR) return false;
 try{ STOR.ref('probe-'+Date.now()).toString(); return true; }catch(e){ return false; }
}
// одноразовая проверка бакета реальной записью при старте
function checkStorage(cb){
 if(STOR_CHECKED){ cb(STOR_OK); return; }
 if(!STOR){ STOR_CHECKED=true; cb(false); return; }
 STOR.ref('.probe/check.txt').put(new Blob(['ok'],{type:'text/plain'}))
  .then(function(){ STOR_OK=true; STOR_CHECKED=true; cb(true); })
  .catch(function(){ STOR_OK=false; STOR_CHECKED=true; cb(false); });
}
function downscale(inp, maxSide, quality, square, cb){
 var f=inp.files&&inp.files[0]; if(!f)return;
 var rd=new FileReader();
 rd.onload=function(e){
  var img=new Image();
  img.onload=function(){
   var c=document.createElement('canvas');
   if(square){ var S=maxSide; c.width=S;c.height=S;
    var side=Math.min(img.width,img.height);
    c.getContext('2d').drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,S,S);
   } else {
    var k=Math.min(1,maxSide/Math.max(img.width,img.height));
    c.width=Math.round(img.width*k); c.height=Math.round(img.height*k);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
   }
   cb(c.toDataURL('image/jpeg',quality));
  };
  img.onerror=function(){alert('Не удалось прочитать изображение');};
  img.src=e.target.result;
 };
 rd.readAsDataURL(f);
}
function dataUrlToBlob(d){
 var parts=d.split(','); var mime=parts[0].match(/:(.*?);/)[1];
 var b=atob(parts[1]); var arr=new Uint8Array(b.length);
 for(var i=0;i<b.length;i++)arr[i]=b.charCodeAt(i);
 return new Blob([arr],{type:mime});
}
function photoCount(id){
 var n=(PHOTOS_CACHE[id]||[]).length;
 var o=byId?byId(id):null;
 if(o)n+=(o.photos||[]).length;
 return n;
}
// Загрузка фото: даунскейл 1000px/0.65 (>900КБ — повторный 800px/0.6) → Storage или коллекция photos (лимит 8)
function uploadPhoto(inp, id){
 var o=byId?byId(id):null; if(!o)return;
 if(!canAddPhoto(o))return alert('Нет прав');
 if(photoCount(id)>=8)return alert('Лимит — 8 фото на заявку');
 downscale(inp,1000,0.65,false,function(dataUrl){
  var afterSize=function(url){
   var ts=Date.now();
   var doc={orderId:id, data:url, ts:ts, by:deviceId()};
   if(OFFLINE||ORDERS_ERR&&!ORDERS_SUB){
    // офлайн: base64 в очередь (отправка при сети)
    queuePush({kind:'photo',docId:id+'_'+ts,doc:doc});
    PHOTOS_CACHE[id]=(PHOTOS_CACHE[id]||[]).concat([doc]);
    go('details',id);
    return;
   }
   fs.collection('photos').doc(id+'_'+ts).set(doc).then(function(){
    PHOTOS_CACHE[id]=(PHOTOS_CACHE[id]||[]).concat([doc]);
    go('details',id);
   }).catch(function(e){
    console.warn(e); OFFLINE=true;
    queuePush({kind:'photo',docId:id+'_'+ts,doc:doc});
    PHOTOS_CACHE[id]=(PHOTOS_CACHE[id]||[]).concat([doc]);
    if(typeof render==='function')render();
   });
  };
  var finishSize=function(url){
   if(url.indexOf('data:')===0 && url.length>900*1024/3*4){
    downscale(inp,800,0.6,false,afterSize);
   } else afterSize(url);
  };
  checkStorage(function(ok){
   if(ok){
    STOR.ref().child('orders/'+id+'/'+Date.now()+'.jpg').put(dataUrlToBlob(dataUrl))
     .then(function(s){ return s.ref.getDownloadURL(); })
     .then(function(url){ finishSize(url); })
     .catch(function(e){ console.warn('storage err',e); finishSize(dataUrl); });
   } else finishSize(dataUrl);
  });
 });
}
// галерея: документы photos по orderId + старые фото из документа заявки
function loadOrderPhotos(id, cb){
 fs.collection('photos').where('orderId','==',id).get().then(function(snap){
  var arr=[];
  snap.forEach(function(d){ var p=d.data(); p.id=d.id; arr.push(p); });
  arr.sort(function(a,b){ return (a.ts||0)-(b.ts||0); });
  PHOTOS_CACHE[id]=arr;
  cb(arr);
 }).catch(function(e){
  console.warn(e);
  // офлайн: фото из очереди (base64) для этой заявки
  var queued=queueGet().filter(function(q){ return q.item&&q.item.kind==='photo'&&q.item.doc&&q.item.doc.orderId===id; }).map(function(q){ return q.item.doc; });
  PHOTOS_CACHE[id]=(PHOTOS_CACHE[id]||[]).concat(queued);
  cb(PHOTOS_CACHE[id]);
 });
}
function orderHasPhotos(id, cb){
 var o=byId?byId(id):null;
 if(o&&o.photos&&o.photos.length){ cb(true); return; }
 if(queueGet().some(function(q){ return q.item&&q.item.kind==='photo'&&q.item.doc&&q.item.doc.orderId===id; })){ cb(true); return; }
 fs.collection('photos').where('orderId','==',id).limit(1).get().then(function(snap){
  cb(!snap.empty);
 }).catch(function(){ cb(false); });
}
function canDeletePhotoDoc(p){
 if(isOwner())return true;
 if(typeof can==='function'&&can('orders_delete'))return true;
 return p && p.by===deviceId();
}

function saveProfile(){
 if(!MYDOC){alert('Профиль не загружен');return;}
 var g=function(id){var el=document.getElementById(id);return el?el.value.trim():'';};
 var spec=[];
 document.querySelectorAll('.card .chip.sel').forEach(function(c){ if(QUALS_CATALOG.indexOf(c.textContent)>=0)spec.push(c.textContent); });
 var old=MYDOC.profile||{};
 var p={fio:g('pf-fio'),phone:g('pf-phone'),email:g('pf-email'),city:g('pf-city'),schedule:g('pf-schedule'),
  spec:spec,avatar:(AVATAR_TMP!==null?AVATAR_TMP:(old.avatar||'')),
  pin:old.pin||'',pinSalt:old.pinSalt||'',pinHash:old.pinHash||'',
  notify:{sys:document.getElementById('pf-nt-sys')?document.getElementById('pf-nt-sys').checked:(old.notify&&old.notify.sys!==false),
   sound:document.getElementById('pf-nt-sound')?document.getElementById('pf-nt-sound').checked:(old.notify&&old.notify.sound!==false),
   vibra:document.getElementById('pf-nt-vibra')?document.getElementById('pf-nt-vibra').checked:(old.notify&&old.notify.vibra!==false),
   dndFrom:g('pf-nt-from'),dndTo:g('pf-nt-to')}};
 // включение системных уведомлений — запрос разрешения сразу
 if(p.notify.sys&&typeof Notification!=='undefined'&&Notification.permission==='default'){
  try{ Notification.requestPermission(); }catch(e){}
 }
 var doSave=function(){ MYDOC.profile=p; AVATAR_TMP=null;
  myDocRef().update({profile:p}).then(function(){ alert('Профиль сохранён'); render(); })
   .catch(function(e){ alert('Ошибка сохранения: '+e.message); }); };
 // новый аватар уходит в Storage avatars/{deviceId}.jpg; base64 — фолбэк (старые продолжают читаться)
 if(AVATAR_TMP && storReady()){
  STOR.ref().child('avatars/'+deviceId()+'.jpg').put(dataUrlToBlob(AVATAR_TMP))
   .then(function(s){ return s.ref.getDownloadURL(); })
   .then(function(url){ p.avatar=url; doSave(); })
   .catch(function(e){ console.warn('storage err',e); doSave(); });
 } else doSave();
}
function savePin(){
 var v=(document.getElementById('pf-pin').value||'').trim();
 if(!/^\d{4}$/.test(v))return alert('PIN — ровно 4 цифры');
 if(!MYDOC)return alert('Профиль не загружен');
 if(!subtleOK){ MYDOC.profile=MYDOC.profile||{}; MYDOC.profile.pin=v;
  myDocRef().update({profile:MYDOC.profile}).then(function(){ sessionStorage.setItem('crm_unlocked','1'); alert('PIN установлен (без хэширования — старый WebView)'); render(); })
   .catch(function(e){ alert('Ошибка: '+e.message); });
  return; }
 makePinRecord(v).then(function(rec){
  MYDOC.profile=MYDOC.profile||{};
  MYDOC.profile.pinSalt=rec.pinSalt; MYDOC.profile.pinHash=rec.pinHash; delete MYDOC.profile.pin;
  myDocRef().update({profile:MYDOC.profile}).then(function(){ sessionStorage.setItem('crm_unlocked','1'); alert('PIN установлен'); render(); })
   .catch(function(e){ alert('Ошибка: '+e.message); });
 }).catch(function(){ alert('Не удалось установить PIN (нет поддержки шифрования)'); });
}
function resetMyPin(){
 if(!confirm('Убрать PIN с этого устройства?'))return;
 if(!MYDOC)return;
 MYDOC.profile=MYDOC.profile||{}; delete MYDOC.profile.pin; delete MYDOC.profile.pinHash; delete MYDOC.profile.pinSalt;
 myDocRef().update({profile:MYDOC.profile}).then(function(){ sessionStorage.setItem('crm_unlocked','1'); render(); });
}

// --- PIN-экран при старте ---
function renderPin(){
 var locked=PIN_TRIES>=3;
 if(locked)return '<div class="header dark"><h1>🔒 ServiceCRM</h1></div>'+
  '<div class="card" style="text-align:center;padding:28px 16px"><div style="font-size:40px">🔒</div>'+
  '<div style="font-weight:700;margin:10px 0">Устройство заблокировано</div>'+
  '<div class="muted">Слишком много неверных попыток.<br>Обратитесь к владельцу — он может сбросить PIN в админке.</div></div>';
 return '<div class="header dark"><h1>🔒 ServiceCRM</h1></div>'+
  '<div class="card" style="text-align:center;padding:24px 16px">'+
  '<div style="font-size:38px">🔑</div>'+
  '<div style="font-weight:700;margin:10px 0">Введите PIN</div>'+
  '<div class="muted" style="margin-bottom:12px">Устройство защищено. Осталось попыток: '+(3-PIN_TRIES)+'</div>'+
  '<input class="input" id="pinInput" type="password" inputmode="numeric" maxlength="4" placeholder="••••" style="text-align:center;font-size:24px;letter-spacing:12px;max-width:200px;margin:0 auto">'+
  '<button class="btn btn-blue" style="max-width:200px;margin:12px auto 0" onclick="pinSubmit()">Войти</button>'+
  '<div id="pinErr" class="muted" style="color:var(--red);margin-top:10px"></div></div>';
}
function pinSubmit(){
 var v=(document.getElementById('pinInput').value||'').trim();
 if(!v)return;
 var prof=MYDOC&&MYDOC.profile;
 verifyPin(prof,v).then(function(ok){
  if(!ok){
   PIN_TRIES++;
   document.getElementById('app').innerHTML=renderPin();
   if(PIN_TRIES>=3){ return; }
   var err=document.getElementById('pinErr'); if(err)err.textContent='Неверный PIN';
   var i=document.getElementById('pinInput'); if(i){i.focus();}
   return;
  }
  sessionStorage.setItem('crm_unlocked','1'); PIN_TRIES=0;
  var finish=function(){ startMain(); };
  // мягкая миграция: старый открытый pin → {pinSalt,pinHash} при первом успешном вводе
  if(prof&&prof.pin&&!prof.pinHash&&subtleOK){
   makePinRecord(prof.pin).then(function(rec){
    MYDOC.profile.pinSalt=rec.pinSalt; MYDOC.profile.pinHash=rec.pinHash; delete MYDOC.profile.pin;
    myDocRef().update({profile:MYDOC.profile}).then(finish).catch(finish);
   }).catch(finish);
  } else finish();
 });
}
function showPinGate(){
 document.getElementById('app').innerHTML=renderPin();
 document.getElementById('nav').style.display='none';
 var i=document.getElementById('pinInput'); if(i){ i.focus(); i.addEventListener('keydown',function(e){if(e.key==='Enter')pinSubmit();}); }
}

// --- просмотр профилей в админке ---
function viewEmpProfile(dev){
 fs.collection('employees').doc(dev).get().then(function(d){
  var e=d.data()||{}; var p=e.profile||{};
  var av=p.avatar?'<img src="'+p.avatar+'" style="width:80px;height:80px;border-radius:50%;object-fit:cover">':'<div style="width:80px;height:80px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:30px">👤</div>';
  var rows=[['ФИО',p.fio],['Телефон',p.phone],['E-mail',p.email],['Город/район',p.city],['График',p.schedule],['Специализация',(p.spec||[]).join(', ')],['PIN',pinSet(p)?'установлен':'не установлен']];
  var html='<div class="header dark"><button class="back" onclick="setStaffTab(\''+STAFF_TAB+'\')">←</button><h1>👤 '+esc(e.name||dev)+'</h1></div>'+
   '<div class="card" style="text-align:center">'+av+'</div>'+
   '<div class="card">'+rows.map(function(r){return '<div class="info-row"><span class="muted">'+r[0]+'</span><b style="text-align:right;max-width:60%">'+esc(r[1]||'—')+'</b></div>';}).join('')+'</div>'+
   '<div style="padding:0 16px"><button class="btn btn-red" onclick="adminResetPin(\''+dev+'\')">🔑 Сбросить PIN</button></div>';
  document.getElementById('app').innerHTML=html;
 });
}
function adminResetPin(dev){
 if(!confirm('Сбросить PIN сотрудника? Он сможет войти без PIN и установить новый.'))return;
 fs.collection('employees').doc(dev).get().then(function(d){
  var e=d.data()||{}; var p=e.profile||{};
  delete p.pin; delete p.pinHash; delete p.pinSalt;
  fs.collection('employees').doc(dev).update({profile:p}).then(function(){ alert('PIN сброшен'); });
 });
}

// ============================================================
// ИНТЕГРАЦИЯ ПРАВ С index.html (обёртки функций приложения)
// ============================================================
// Глобальный can() для index.html (если сам index его не задал)
if(typeof window.can!=='function'){ window.can = can; }
if(typeof window.isOwner!=='function'){ window.isOwner = isOwner; }
if(typeof window.deviceId!=='function'){ window.deviceId = deviceId; }

// Маппинг экран -> требуемое право (для навигации и go)
var SCREEN_PERM = {
 create:'orders_create', calendar:'calendar', tasks:'tasks',
 shopping:'shopping', reports:'reports', admin:'admin_templates',
 staff:'staff_manage', orders:'orders_view'
};

// Guard перехода на экран
(function(){
 var _go = window.go;
 window.go = function(scr){
   var need = SCREEN_PERM[scr];
   if(need && !can(need)){ alert('Нет прав'); return; }
   if(_go) return _go.apply(this, arguments);
 };
})();

// Guard функций-действий (нельзя удалить/создать/сменить статус без права)
function wrapGuard(name, perm){
 var f = window[name];
 if(typeof f!=='function') return;
 window[name] = function(){
   if(!can(perm)){ alert('Нет прав'); return; }
   return f.apply(this, arguments);
 };
}
['deleteOrder','removeOrder','delOrder'].forEach(function(n){ wrapGuard(n,'orders_delete'); });
['setStatus','changeStatus','nextStatus'].forEach(function(n){ wrapGuard(n,'orders_status'); });
['editOrder','saveOrderEdit'].forEach(function(n){ wrapGuard(n,'orders_edit'); });
if(typeof window.createOrder==='function') wrapGuard('createOrder','orders_create');
if(typeof window.saveOrder==='function') wrapGuard('saveOrder','orders_create');
if(typeof window.setStatus==='function') wrapGuard('setStatus','orders_status');

// Скрытие элементов UI без права: по навигации и кнопкам создания
function applyPermsUI(){
 if(window.__accessMode && !state.role) return;
 var nav=document.getElementById('nav');
 if(nav){
   Array.prototype.forEach.call(nav.querySelectorAll('.nav-item'), function(el){
     if(el.hasAttribute('data-profile-nav')){ el.style.display=''; return; } // профиль доступен всем
     var oc=(el.getAttribute('onclick')||'')+ (el.querySelector('span')?el.querySelector('span').getAttribute('onclick')||'':'');
     var m=oc.match(/go\(['"](\w+)['"]\)/);
     if(m){ var need=SCREEN_PERM[m[1]]; if(need && !can(need)) el.style.display='none'; }
   });
 }
 // кнопки, ведущие на запрещённые экраны (создание заявки)
 var app=document.getElementById('app');
 if(app){
   Array.prototype.forEach.call(app.querySelectorAll('[onclick]'), function(el){
     var oc=el.getAttribute('onclick')||'';
     if(/go\(['"]create['"]\)/.test(oc) && !can('orders_create')) el.style.display='none';
     if(/deleteOrder\(|removeOrder\(|delOrder\(/.test(oc) && !can('orders_delete')) el.style.display='none';
   });
 }
}