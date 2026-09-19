// смоук: showAppNotif (SW-шторка / fallback / ошибки) + testNotif-ветки + DND боевого пути
const fs=require('fs');
const src=fs.readFileSync('tools/firebase-access.js','utf8');
function grab(n){const i=src.indexOf('function '+n+'(');if(i<0)return null;let d=0,j=src.indexOf('{',i);for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1);}}return null;}
let fail=0;
for(const n of ['askNotifPerm','notifTestPlay','notifPermLabel','notifPermRefresh','notifInfoModal','notifPermDenied','testNotif','showAppNotif','pageNotifFallback','showSystemNotification']){
  const f=grab(n);if(!f){console.log('MISSING',n);fail=1;continue;}
  try{eval(f);}catch(e){console.log('EVAL FAIL',n,e.message);fail=1;}
}
if(fail)process.exit(1);
var log=[];
var notifyCfg=()=>({sys:true,sound:true,vibra:true,dndFrom:'',dndTo:''});
var inDND=()=>false;
var beepNotify=()=>log.push('beep');
var openModal=h=>log.push('MODAL['+(h.includes('Повторить тест')?'retry':'plain')+'] '+(h.match(/🔕 ([^<]+)/)||[,'?'])[1]);
var closeModal=()=>{};
var OUT=(s)=>process.stdout.write(s+'\n'); // без console (переопределяется ниже)
var console={warn:(m)=>log.push('warn:'+m)};
let navigator={userAgent:'Mozilla/5.0 (Linux; Android 13) Chrome',vibrate:()=>log.push('vibrate'),platform:'Linux'};
function mkNotif(perm){
  var F=function(t,o){log.push('NOTIF['+(o&&o.tag)+']('+t+')');};
  F.permission=perm;
  F.requestPermission=function(cb){log.push('askPermission');var p=(perm==='default')?'granted':'denied';var pr=Promise.resolve(p);if(cb)pr.then(cb);return pr;};
  return F;
}
function withSw(mode){ // 'ok' | 'throw' | 'none' | 'noreg'
  if(mode==='none'){delete navigator.serviceWorker;return;}
  navigator.serviceWorker={getRegistration:()=>{
    if(mode==='throw')return Promise.reject(new Error('sw fail'));
    if(mode==='noreg')return Promise.resolve(undefined);
    return Promise.resolve({showNotification:(t,o)=>{log.push('SW_NOTIF['+o.tag+']('+t+'|'+o.body.slice(0,24)+'|icon='+o.icon+'|url='+o.data.url+(o.data.orderId!=null?'|ord='+o.data.orderId:'')+')');return Promise.resolve();}});
  }};
}
async function run(name,fn){
  log=[];
  await fn();
  await new Promise(r=>setTimeout(r,15));
  OUT(name+' → '+(log.join(' | ')||'(пусто)'));
}
(async function(){
 global.Notification=mkNotif('granted');
 withSw('ok');
 await run('1) тест: SW есть → шторка',async()=>{notifTestPlay();});
 await run('2) тест: SW бросает → fallback',async()=>{withSw('throw');notifTestPlay();withSw('ok');});
 await run('3) тест: нет SW → fallback (десктоп)',async()=>{withSw('none');notifTestPlay();withSw('ok');});
 await run('4) тест: reg=undefined → fallback',async()=>{withSw('noreg');notifTestPlay();withSw('ok');});
 await run('5) боевое: событие по заявке 77',async()=>{showSystemNotification({title:'🚜 Вам назначена заявка',body:'Заявка №77',orderId:77,type:'assigned'});});
 await run('6) боевое: DND → шторка молчит',async()=>{inDND=()=>true;showSystemNotification({title:'X',body:'Y',orderId:5,type:'assigned'});inDND=()=>false;});
 await run('7) боевое: sys=выкл',async()=>{var _n=notifyCfg;notifyCfg=()=>({sys:false,sound:true,vibra:true});showSystemNotification({title:'X',body:'Y',orderId:5,type:'assigned'});notifyCfg=_n;});
 await run('8) событие без заявки',async()=>{showSystemNotification({title:'📦 Новый товар',body:'В список',orderId:null,type:'shopping'});});
 // testNotif-ветки (прежний регресс)
 await run('9) testNotif default',async()=>{global.Notification=mkNotif('default');testNotif();});
 await run('10) testNotif denied android',async()=>{global.Notification=mkNotif('denied');testNotif();});
 await run('11) testNotif unsupported',async()=>{global.Notification=undefined;testNotif();});
 global.Notification=mkNotif('granted');
 OUT('label granted: '+notifPermLabel());
})();