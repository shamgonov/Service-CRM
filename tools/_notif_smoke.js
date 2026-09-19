// смоук: testNotif — ветки permission (granted/default/denied/unsupported), Notification-заглушка
const fs=require('fs');
const src=fs.readFileSync('tools/firebase-access.js','utf8');
function grab(n){const i=src.indexOf('function '+n+'(');if(i<0)return null;let d=0,j=src.indexOf('{',i);for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1);}}return null;}
let fail=0;
for(const n of ['askNotifPerm','notifTestPlay','notifPermLabel','notifPermRefresh','notifInfoModal','notifPermDenied','testNotif']){
  const f=grab(n);if(!f){console.log('MISSING',n);fail=1;continue;}
  try{eval(f);}catch(e){console.log('EVAL FAIL',n,e.message);fail=1;}
}
if(fail)process.exit(1);
var log=[];
var notifyCfg=()=>({sys:true,sound:true,vibra:true,dndFrom:'',dndTo:''});
var inDND=()=>false;
var beepNotify=()=>log.push('beep');
var openModal=h=>log.push('MODAL['+(h.includes('Повторить тест')?'retry':'plain')+'] '+(h.match(/🔕 ([^<]+)/)||[,'?'])[1]+' :: '+(h.match(/line-height:1.45">([^<]{0,60})/)||[,'?'])[1]);
var closeModal=()=>log.push('closeModal');
var navigator={userAgent:'Mozilla/5.0 (Linux; Android 13) Chrome',vibrate:(x)=>log.push('vibrate'),platform:'Linux'};
function mkNotif(perm){
  var F=function(t,o){log.push('NOTIF('+o.body+')');};
  F.permission=perm;
  F.requestPermission=function(cb){log.push('askPermission');var p=(perm==='default')?'granted':'denied';var pr=Promise.resolve(p);if(cb)pr.then(cb);return pr;};
  return F;
}
async function run(name,perm,ua){
  log=[];
  global.Notification=perm==='none'?undefined:mkNotif(perm);
  if(ua)navigator.userAgent=ua;
  testNotif();
  await new Promise(r=>setTimeout(r,10)); // ждём промис requestPermission
  console.log(name+' → '+(log.join(' | ')||'(пусто)'));
}
(async function(){
 await run('1) granted','granted');                                   // ож.: vibrate|beep|NOTIF
 await run('2) default','default');                                   // ож.: askPermission → vibrate|beep|NOTIF
 await run('3) denied android','denied');                             // ож.: MODAL retry + Android-текст
 await run('4) denied iOS','denied','Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
 await run('5) unsupported','none');                                  // ож.: MODAL plain «недоступны»
 // регресс: DND → без beep, но вибрация и уведомление есть
 var _dnd=inDND; inDND=()=>true; await run('6) granted+DND','granted'); inDND=_dnd;
 global.Notification=mkNotif('granted');console.log('label granted:',notifPermLabel());
 global.Notification=mkNotif('denied');console.log('label denied:',notifPermLabel());
 global.Notification=mkNotif('default');console.log('label default:',notifPermLabel());
 global.Notification=undefined;console.log('label none:',notifPermLabel());
})();