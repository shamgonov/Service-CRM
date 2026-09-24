// Смоук B2 (P0): сохранность «Взять в работу», точечный viewedBy, надёжная офлайн-очередь.
// Статика по ФАКТИЧЕСКОМУ коду index.html / tools/firebase-access.js + прогон РЕАЛЬНОГО
// flushQueue (выдернут из fa) на vm-моке Firestore.
const fs=require('fs'),vm=require('vm'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const fa=fs.readFileSync(path.join(__dirname,'..','tools','firebase-access.js'),'utf8');
let fails=0;
const ok=(n,c)=>{ console.log((c?'OK  ':'FAIL')+' '+n); if(!c)fails++; };
function grab(src,name){
 const i=src.indexOf('function '+name+'(');
 if(i<0)throw new Error('not found: '+name);
 let d=0,j=src.indexOf('{',i);
 for(let k=j;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){ d--; if(!d) return src.slice(i,k+1); } }
 throw new Error('unbalanced: '+name);
}
const code=s=>s.split('\n').filter(l=>!/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'); // матчить код, не комментарии

const take=code(grab(html,'takeConfirm'));
const mv=code(code(grab(html,'markViewed')));
const fq=code(grab(fa,'flushQueue')), op=grab(fa,'orderPatch'), os=grab(fa,'orderSave');
const sm=grab(fa,'startMain'), qp=grab(fa,'queuePush');

ok('takeConfirm: markOrder(o);save()',/markOrder\(o\);\s*save\(\)/.test(take));
ok('takeConfirm: нет orderSave(/saveSettings(',!/orderSave\(|saveSettings\(/.test(take));
ok('takeConfirm: гард «уже взята»',/o\.worker&&o\.worker!==state\.user&&!uiOwner\(\)\)return alert/.test(take));
ok('markViewed: не затирает документ orderSave()',!/orderSave\(/.test(mv));
ok('markViewed: точечный orderPatch по viewedBy.<dev>',/orderPatch\(o\.id,k\)/.test(mv)&&/k\['viewedBy\.'\+devId\]=ts/.test(mv));
ok('fa: orderPatch объявлена, update а не set',/function orderPatch\(id,fields\)/.test(op)&&!/\.set\(/.test(op)&&/\.update\(patch\)/.test(op));
ok('fa: orderSave — permission-denied вне очереди',/isPermErr\(e\)\)\s*\{\s*writeDeniedBanner\(e\);\s*return;\s*\}/.test(code(os)));
ok('fa: flushQueue снимает голову перед отправкой (не снимок)',/queueSet\(cur\.slice\(1\)\)/.test(fq)&&!/var q=queueGet\(\);/.test(fq));
ok('fa: flushQueue возвращает упавший элемент в начало',/function restore\(item\)\{\s*try\{\s*var c=queueGet\(\);\s*c\.unshift\(item\);\s*queueSet\(c\);\s*\}catch\(e\)\{\}\s*\}/.test(fq)&&/netFail=function\(e\)\{\s*OFFLINE=true;\s*stopped=true;\s*restore\(e0\);\s*fin\(\);\s*\}/.test(fq));
ok('fa: flushQueue восстанавливает id из элемента',/doc\(String\(it\.id\)\)/.test(fq));
ok('fa: flushQueue знает kind:patch',/kind==='patch'/.test(fq));
ok('fa: flushQueue не трёт очередь целиком',!/queueSet\(\[\]\)/.test(fq));
ok('fa: на старте доставляем очередь',/navigator\.onLine&&queueCount\(\)/.test(sm)&&/flushQueue\(\)/.test(sm));
ok('fa: queuePush сам планирует flush',/setTimeout\(flushQueue,500\)/.test(qp));

// ── прогон РЕАЛЬНОГО flushQueue ──
const LS=()=>{const h={};return{getItem:k=>k in h?h[k]:null,setItem:(k,v)=>{h[k]=String(v)},removeItem:k=>{delete h[k]}};};
function makeSb(failAt,permAt){
 const calls=[],LSx=LS(),timers=[];
 const doc=id=>({
  set:b=>new Promise((res,rej)=>{calls.push({op:'set',id:String(id),hasId:Object.prototype.hasOwnProperty.call(b||{},'id')});failAt===String(id)?rej(new Error('unavailable')):permAt===String(id)?rej(Object.assign(new Error('denied'),{code:'permission-denied'})):res();}),
  update:p=>new Promise((res,rej)=>{calls.push({op:'update',id:String(id),keys:Object.keys(p||{})});failAt===String(id)?rej(new Error('unavailable')):permAt===String(id)?rej(Object.assign(new Error('denied'),{code:'permission-denied'})):res();})});
 const sb={console,Date,JSON,Math,String,Array,Object,Number,Promise,localStorage:LSx,
  navigator:{onLine:true},document:null,render(){},saveSettings(){},
  ordersRef(){return {doc:doc};},
  fs:{collection(){return {doc(){return {set(){return Promise.resolve();}};}};}},
  setTimeout(fn){timers.push(fn);return 0;}};
 vm.runInContext([
  'function lsGet(k,d){try{var s=localStorage.getItem(k);return s?JSON.parse(s):d;}catch(e){return d;}}',
  'function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}',
  grab(fa,'queueGet'),grab(fa,'queueSet'),grab(fa,'queueCount'),
  'function queuePush(item){var q=queueGet();q.push({t:Date.now(),item:item});queueSet(q);if(!OFFLINE&&!SYNCING)setTimeout(flushQueue);}',
  'var OFFLINE=false,SYNCING=false,SYNC_OK_TS=0;',
  grab(fa,'isPermErr'),
  'function writeDeniedBanner(e){this.__perm=(this.__perm||0)+1;}',
  'function ordersRef(){return {doc:doc};}',
  grab(fa,'flushQueue')
 ].join('\n'),vm.createContext(sb),{filename:'b2-queue.js'});
 // doc/isPermErr-баннер нужны внутри контекста
 vm.runInContext('var doc=function(id){return {set:function(b){return __set(String(id),b);},update:function(p){return __upd(String(id),p);}};};',sb);
 sb.__set=(id,b)=>new Promise((res,rej)=>{calls.push({op:'set',id:id,hasId:Object.prototype.hasOwnProperty.call(b||{},'id')});failAt===id?rej(new Error('unavailable')):permAt===id?rej(Object.assign(new Error('denied'),{code:'permission-denied'})):res();});
 sb.__upd=(id,p)=>new Promise((res,rej)=>{calls.push({op:'update',id:id,keys:Object.keys(p||{})});failAt===id?rej(new Error('unavailable')):permAt===id?rej(Object.assign(new Error('denied'),{code:'permission-denied'})):res();});
 sb.__perm=0;
 return {sb:sb,calls:calls,timers:timers};
}
const settle=async()=>{for(let i=0;i<80;i++)await Promise.resolve();await new Promise(r=>setImmediate(r));};

(async()=>{
 // 1. успех
 let m=makeSb(null,null);
 m.sb.queueSet([{t:1,item:{kind:'order',id:1,order:{status:'inwork',worker:'U'}}},
  {t:2,item:{kind:'patch',id:2,fields:{'viewedBy.dev1':'ts'}}},
  {t:3,item:{kind:'order',id:3,order:{status:'new'}}}]);
 m.sb.flushQueue(); await settle();
 ok('успех: 3 записи отправлены', m.calls.length===3);
 ok('успех: id восстановлен из элемента (1,2,3)', m.calls.map(c=>c.id).join(',')==='1,2,3');
 ok('успех: в тело set() id не попадает', m.calls.every(c=>c.op!=='set'||!c.hasId));
 ok('успех: patch→update, order→set', m.calls[0].op==='set'&&m.calls[1].op==='update'&&m.calls[2].op==='set');
 ok('успех: очередь пуста', m.sb.queueGet().length===0);
 ok('успех: SYNCING=false', m.sb.SYNCING===false);

 // 2. сетевая ошибка на 2-м → 1 снят, 2 и 3 остались
 m=makeSb('2',null);
 m.sb.queueSet([{t:1,item:{kind:'order',id:1,order:{a:1}}},{t:2,item:{kind:'order',id:2,order:{b:2}}},{t:3,item:{kind:'order',id:3,order:{c:3}}}]);
 m.sb.flushQueue(); await settle();
 ok('ошибка сети: остановка на 2-м', m.calls.length===2);
 ok('ошибка сети: упавшие ОСТАЛИСЬ в очереди (2,3)', m.sb.queueGet().map(e=>e.item.id).join(',')==='2,3');
 ok('ошибка сети: OFFLINE=true, SYNCING=false', m.sb.OFFLINE===true&&m.sb.SYNCING===false);

 // 3. permission-denied → элемент пропущен, не возвращается, OFFLINE не взведён
 m=makeSb(null,'7');
 m.sb.queueSet([{t:1,item:{kind:'order',id:7,order:{x:1}}},{t:2,item:{kind:'order',id:8,order:{y:2}}}]);
 m.sb.flushQueue(); await settle();
 ok('perm-denied: обработаны оба', m.calls.length===2);
 ok('perm-denied: баннер показан', m.sb.__perm>=1);
 ok('perm-denied: очередь пуста (не копим бессмысленное)', m.sb.queueGet().length===0);
 ok('perm-denied: OFFLINE не взведён', m.sb.OFFLINE===false);

 // 4. гонка: пока летит 1-й, в очередь добавили запись → она тоже уходит, ничего не потеряно
 m=makeSb(null,null);
 m.sb.queueSet([{t:1,item:{kind:'order',id:1,order:{a:1}}}]);
 const origSet=m.sb.__set; let pushed=false;
 m.sb.__set=(id,b)=>{const p=origSet(id,b);if(!pushed){pushed=true;m.sb.queuePush({kind:'order',id:99,order:{late:true}});}return p;};
 m.sb.flushQueue(); await settle();
 ok('гонка: хвост, добавленный во время полёта, отправлен', m.calls.map(c=>c.id).join(',')==='1,99');
 ok('гонка: очередь пуста', m.sb.queueGet().length===0);

 console.log(fails?'\nB2 SMOKE: FAILS='+fails:'\nB2 SMOKE: ALL OK');
 process.exit(fails?1:0);
})();
