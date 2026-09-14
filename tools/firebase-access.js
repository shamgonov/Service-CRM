// firebase-access.js
var auth = firebase.auth();
var fs = firebase.firestore();
var OWNER_KEY = 'crm_owner_7f3a';
var ROLE_NAMES = {admin:'Админ',operator:'Оператор',manager:'Менеджер',worker:'Работник'};
var PERMS = {
 admin:['all'], operator:['orders','calendar','shopping','create','reports'],
 manager:['orders','calendar','shopping'], worker:['tasks','shopping','calendar']
};
function deviceId(){
 var d=localStorage.getItem('crm_device');
 if(!d){d='dev-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);localStorage.setItem('crm_device',d);}
 return d;
}
function isOwner(){ return localStorage.getItem(OWNER_KEY)==='1'; }
var ME=null, TESTROLE=null, unsub=null;

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
 var roles=['admin','operator','manager','worker'];
 return '<div class="muted" style="margin-bottom:8px">👑 Режим владельца: тест любой роли</div>'+
  roles.map(function(r){return '<div class="role-card" onclick="enterAs(\''+r+'\')"><b>'+ROLE_NAMES[r]+'</b><div class="muted">тестировать как '+ROLE_NAMES[r]+'</div></div>';}).join('')+
  '<div class="role-card" onclick="goAdminStaff()" style="border-color:#10b981"><b>👥 Управление сотрудниками и ролями</b><div class="muted">заявки, роли, квалификации, права</div></div>'+
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
function enterAs(role){ TESTROLE=role; state.role=role; state.user='Владелец ('+ROLE_NAMES[role]+')'; state.screen=role==='worker'?'tasks':'orders'; render(); }
function goAdminStaff(){ state.role='admin'; state.user='Владелец'; state.screen='staff'; render(); }

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

function renderStaff(){
 return '<div class="header dark"><button class="back" onclick="logout()">←</button><h1>👥 Сотрудники</h1></div>'+
  '<div id="staffList" class="card"><div class="muted">Загрузка...</div></div>';
}
function loadStaff(){
 var wrap=document.getElementById('staffList'); if(!wrap)return;
 fs.collection('requests').where('status','==','pending').get().then(function(snap){
  var html='<div class="sec-title">Заявки на приём</div>';
  if(snap.empty)html+='<div class="muted">Нет заявок</div>';
  snap.forEach(function(d){var r=d.data();
   var safeName=r.name.replace(/'/g,"\\'");
   html+='<div class="mat"><b>'+r.name+'</b> <span class="muted">'+r.deviceId+'</span>'+
    '<div style="display:flex;gap:6px;margin-top:8px">'+
     '<select class="input" id="role_'+r.deviceId+'" style="flex:1">'+
      '<option value="worker">Работник</option><option value="operator">Оператор</option>'+
      '<option value="manager">Менеджер</option><option value="admin">Админ</option></select>'+
     '<button class="btn-sm btn-green" onclick="approve(\''+r.deviceId+'\',\''+safeName+'\')">Принять</button>'+
     '<button class="btn-sm btn-red" onclick="reject(\''+r.deviceId+'\')">Отклонить</button>'+
    '</div></div>';
  });
  html+='<div class="sec-title" style="margin-top:14px">Принятые сотрудники</div>';
  fs.collection('employees').get().then(function(es){
   if(es.empty)html+='<div class="muted">Пока никого</div>';
   es.forEach(function(d){var e=d.data();
    html+='<div class="mat"><b>'+e.name+'</b> — '+(ROLE_NAMES[e.role]||e.role)+
     ' <span class="badge" style="background:#d1fae5;color:#065f46">'+((e.quals||[]).join(', ')||'—')+'</span>'+
     '<div class="muted">'+e.deviceId+'</div>'+
     '<div style="display:flex;gap:6px;margin-top:6px">'+
      '<select class="input" id="q_'+e.deviceId+'" style="flex:1"><option value="">+ квалификация</option>'+
       '<option>монтажник</option><option>диагност</option><option>электрик</option><option>старший</option></select>'+
      '<button class="btn-sm btn-outline" onclick="addQual(\''+e.deviceId+'\')">+</button>'+
      '<button class="btn-sm btn-red" onclick="fireEmp(\''+e.deviceId+'\')">Уволить</button>'+
     '</div></div>';
   });
   wrap.innerHTML=html;
  });
 });
}
function approve(dev,name){
 var role=document.getElementById('role_'+dev).value;
 fs.collection('employees').doc(dev).set({deviceId:dev,name:name,role:role,status:'approved',quals:[],perms:PERMS[role]||[],ts:Date.now()});
 fs.collection('requests').doc(dev).delete();
 setTimeout(loadStaff,500);
}
function reject(dev){ fs.collection('requests').doc(dev).delete(); setTimeout(loadStaff,500); }
function addQual(dev){
 var q=document.getElementById('q_'+dev).value; if(!q)return;
 fs.collection('employees').doc(dev).get().then(function(d){var e=d.data();var qs=e.quals||[];if(qs.indexOf(q)<0)qs.push(q);
  fs.collection('employees').doc(dev).update({quals:qs});setTimeout(loadStaff,400);});
}
function fireEmp(dev){ if(confirm('Уволить сотрудника?')){fs.collection('employees').doc(dev).delete();setTimeout(loadStaff,400);} }

(function startApp(){
 auth.signInAnonymously().catch(function(e){ console.warn(e); });
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
};
window.save = function(){ saveCloud(); };
window.logout = function(){ state.role=null;state.user=null;TESTROLE=null;window.__accessMode=true;document.getElementById('nav').style.display='none';document.getElementById('app').innerHTML=renderAccess(); };