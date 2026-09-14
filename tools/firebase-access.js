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
 {key:'roles_manage',label:'Управление ролями'}
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
function loadCloud(cb){
 if(unsub)unsub();
 unsub = fs.collection('app').doc('state').onSnapshot(function(snap){
   if(snap.exists && snap.data().db){ DB=snap.data().db; }
   else { DB=defaultData(); fs.collection('app').doc('state').set({db:DB}); }
   ensureOwnerInDb();
   if(cb)cb(); render();
 }, function(err){ console.warn(err); });
}
function saveCloud(){ if(DB) fs.collection('app').doc('state').set({db:DB}).catch(function(e){ console.warn(e); }); }
function ensureOwnerInDb(){
 if(!DB.users)DB.users=[];
 var dev=deviceId();
 if(isOwner() && !DB.users.find(function(u){return u.deviceId===dev;})){
   DB.users.push({id:'u_owner',name:'Дмитрий (владелец)',role:'admin',share:0,deviceId:dev,status:'approved',quals:[],perms:['all'],owner:true});
   saveCloud();
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
function renderAccess(){
 var dev=deviceId();
 var v = (typeof APP_VERSION!=='undefined')?APP_VERSION:'';
 return '<div class="header dark" style="flex-direction:column;align-items:flex-start;gap:4px">'+
   '<h1>🔧 ServiceCRM</h1><div style="font-size:12px;opacity:.8">Версия v'+v+'</div></div>'+
   '<div class="card"><div class="sec-title">Вход</div>'+
   (isOwner()?ownerPanel():employeeOrRequest(dev))+'</div>';
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
 if(isOwner()){
  fs.collection('meta').doc('owner').set({deviceId:dev,ts:Date.now()}).catch(function(){});
  window.__accessMode=true;
  cb(true);
  return;
 }
 function proceed(){
  fs.collection('employees').doc(dev).get().then(function(doc){
   if(doc.exists && doc.data().status==='approved'){ ME=doc.data(); cb(true); }
   else cb(false);
  }).catch(function(e){ console.warn('FIRESTORE ERROR:',e); cb(false); });
 }
 fs.collection('meta').doc('owner').get().then(function(m){
  if(!m.exists){ fs.collection('meta').doc('owner').set({deviceId:dev,ts:Date.now()}); localStorage.setItem(OWNER_KEY,'1'); window.__accessMode=true; cb(true); }
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
(function startApp(){
 auth.signInAnonymously().catch(function(e){ console.warn(e); });
 ensureRolesSeeded(function(){
  checkApproved(function(ok){
   if(ok){
    if(ME){ state.role=ME.role; state.user=ME.name; }
    loadCloud(function(){});
   } else {
    window.__accessMode=true;
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
 if(_origRender)_origRender();
 applyPermsUI();
};
window.save = function(){ saveCloud(); };
window.logout = function(){ state.role=null;state.user=null;TESTROLE=null;window.__accessMode=true;document.getElementById('nav').style.display='none';document.getElementById('app').innerHTML=renderAccess(); };

// ============================================================
// ИНТЕГРАЦИЯ ПРАВ С index.html (обёртки функций приложения)
// ============================================================
// Глобальный can() для index.html (если сам index его не задал)
if(typeof window.can!=='function'){ window.can = can; }

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