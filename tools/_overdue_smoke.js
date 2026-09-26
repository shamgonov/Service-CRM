// смоук B1/B7: локальный fmt → isSlotPassed → splitOverdue (красная/жёлтая) →
// checkOverdueNotification (только красная + права + суточный лимит) → badges(⏳) → applyOverdueBadge(счётчик меню)
const fs=require('fs');
const vm=require('vm');
const src=fs.readFileSync('index.html','utf8');
// вырезать function name(...){...} по балансу скобок
function grabFn(name){
  const i=src.indexOf('function '+name+'(');
  if(i<0)throw new Error('MISSING fn '+name);
  let d=0,j=src.indexOf('{',i);
  for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1);}}
  throw new Error('UNBALANCED '+name);
}
// вырезать const name=... до конца строки
function grabConst(name){
  const re=new RegExp('const '+name+'=[^\\n]*');
  const m=src.match(re);
  if(!m)throw new Error('MISSING const '+name);
  return m[0];
}
let fail=0;
function ok(cond,msg){console.log((cond?'OK   — ':'FAIL — ')+msg);if(!cond)fail=1;}

// локальные даты (тот же алгоритм, что fmt — сверяем в тесте #1)
const loc=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const today=loc(new Date());
const yesterday=loc(new Date(Date.now()-864e5));
const tomorrow=loc(new Date(Date.now()+864e5));

// единый контекст со всеми зависимостями
const ctx={};
vm.createContext(ctx);
// реальные (проверяемые) куски из index.html
vm.runInContext(grabConst('fmt'),ctx);
vm.runInContext(grabFn('isInwork'),ctx);
vm.runInContext(grabFn('isSlotPassed'),ctx);
vm.runInContext(grabFn('splitOverdue'),ctx);
vm.runInContext(grabFn('applyOverdueBadge'),ctx);
vm.runInContext(grabFn('checkOverdueNotification'),ctx);
// стабы для badges()
vm.runInContext(`
 var ST={new:{t:'Новая',c:'#fef3c7',tc:'#92400e'},approved:{t:'Смета',c:'#ede9fe',tc:'#5b21b6'},inwork:{t:'В работе',c:'#ffedd5',tc:'#9a3412'},completed:{t:'Выполнено',c:'#d1fae5',tc:'#065f46'}};
 var isTest=o=>!!o.test;
 var escapeHtml=s=>String(s);
 var orderType=()=>'standard';
 var OTYPE={};
 var orderStages=()=>[];
 var orderPayments=()=>[];
 var money=n=>String(n);
 var balance=()=>0;
 var matState=()=>({k:'bought'});
 // прод-копия isMeName (index.html): проверка прав в checkOverdueNotification зовёт её
 var isSim=()=>false;
 var isMeName=nm=>!!nm&&nm===state.user;
`,ctx);
vm.runInContext(grabFn('badges'),ctx);

// ---------- 1) fmt локальный (B7) ----------
(function(){
  const d=new Date();
  const got=vm.runInContext('fmt(new Date('+d.getTime()+'))',ctx);
  ok(got===loc(d),'1) fmt даёт локальную дату (не UTC): '+got);
  ok(!/toISOString/.test(grabConst('fmt')),'1b) fmt не использует toISOString');
})();

// ---------- 2) isSlotPassed ----------
(function(){
  const now=new Date();
  const T=(o)=>vm.runInContext('isSlotPassed('+JSON.stringify(o)+', new Date('+now.getTime()+'))',ctx);
  ok(T({date:yesterday})===true,'2) вчера → прошёл');
  ok(T({date:tomorrow})===false,'2) завтра → не прошёл');
  ok(T({date:today,t2:'23:59'})===false,'2) сегодня, слот в будущем → не прошёл');
  ok(T({date:today,t2:'00:00'})===true,'2) сегодня, слот 00:00 → прошёл');
  ok(T({date:today})===false,'2) сегодня без t2 → не прошёл');
  ok(T(null)===false,'2) пусто → false');
})();

// ---------- 3) splitOverdue: красная/жёлтая ----------
(function(){
  const now=new Date();
  const list=[
    {id:1,status:'new',date:yesterday},           // red
    {id:2,status:'approved',date:yesterday},       // red
    {id:3,status:'inwork',date:yesterday},         // yellow
    {id:4,status:'in_progress',date:yesterday},    // yellow (legacy)
    {id:5,status:'completed',date:yesterday},      // исключён
    {id:6,status:'postponed',date:yesterday},      // исключён
    {id:7,status:'new',date:tomorrow},             // будущее → нет
    {id:8,status:'inwork',date:today,t2:'23:59'}   // сегодня слот в будущем → нет
  ];
  const r=vm.runInContext('splitOverdue('+JSON.stringify(list)+', new Date('+now.getTime()+'))',ctx);
  const ids=a=>a.map(o=>o.id).sort().join(',');
  ok(ids(r.red)==='1,2','3) красная = new+approved со слотом прошёл: ['+ids(r.red)+']');
  ok(ids(r.yellow)==='3,4','3) жёлтая = inwork(+legacy) со слотом прошёл: ['+ids(r.yellow)+']');
})();

// ---------- 4) checkOverdueNotification: только красная ----------
function runNotif(orders,opts){
  opts=opts||{};
  const alerts=[],notifs=[];
  const LS=new Map(Object.entries(opts.local||{}));
  const SS=new Map(Object.entries(opts.session||{}));
  Object.assign(ctx,{
    DB:{orders:orders},
    state:{user:'boss'},
    can:opts.can||(()=>true),
    alert:m=>alerts.push(m),
    Notification:{permission:opts.perm||'denied'},
    showAppNotif:(t,o)=>notifs.push(o.tag),
    localStorage:{getItem:k=>LS.has(k)?LS.get(k):null,setItem:(k,v)=>LS.set(k,v)},
    sessionStorage:{getItem:k=>SS.has(k)?SS.get(k):null,setItem:(k,v)=>SS.set(k,v)}
  });
  vm.runInContext('checkOverdueNotification()',ctx);
  return {alerts:alerts,notifs:notifs,ls:LS};
}
(function(){
  const orders=[
    {id:1,status:'new',date:yesterday},          // red → считаем
    {id:3,status:'inwork',date:yesterday},       // yellow → НЕ в уведомлении
    {id:9,status:'new',date:yesterday,test:true} // red но тест → отброшен
  ];
  const r=runNotif(orders);
  ok(r.alerts.length===1&&/:\s*1\./.test(r.alerts[0]),'4) уведомл. только по красной (1), жёлтая/тест не учтены: '+JSON.stringify(r.alerts));
  ok(r.ls.get('crm_overdue_notif')===today,'4) суточный лимит записан в localStorage');
})();
// 5) суточный лимит: уже отправляли сегодня → молчим
(function(){
  const orders=[{id:1,status:'new',date:yesterday}];
  const r=runNotif(orders,{local:{crm_overdue_notif:today}});
  ok(r.alerts.length===0,'5) повтор в тот же день → без уведомл. (лимит)');
})();
// 6) права: чужая назначенная (approved+worker) без orders_view → отброшена
(function(){
  const orders=[{id:1,status:'approved',date:yesterday,worker:'other',by:'other'}];
  const r=runNotif(orders,{can:()=>false});
  ok(r.alerts.length===0,'6) чужая заявка без права orders_view → не пушится');
  // но НЕ взятая (new без worker) видна всем — приходит
  const r2=runNotif([{id:2,status:'new',date:yesterday}],{can:()=>false});
  ok(r2.alerts.length===1,'6b) не взятая new — пушится даже без orders_view');
})();

// ---------- 7) badges(): жёлтый маркер «Слот прошёл» только для inwork ----------
(function(){
  const mk=(o)=>vm.runInContext('badges('+JSON.stringify(Object.assign({materials:[]},o))+')',ctx);
  ok(/Слот прошёл/.test(mk({status:'inwork',date:yesterday})),'7) inwork + слот прошёл → маркер «Слот прошёл»');
  ok(!/Слот прошёл/.test(mk({status:'new',date:yesterday})),'7) new + слот прошёл → БЕЗ маркера (это красная, не жёлтая)');
  ok(!/Слот прошёл/.test(mk({status:'inwork',date:tomorrow})),'7) inwork + будущее → БЕЗ маркера');
})();

// ---------- 8) applyOverdueBadge(): счётчик на пункте ⏰ ----------
function mkNav(navKeys){
  const els=navKeys.map(k=>({nav:k,html:'',style:{},insertAdjacentHTML:function(p,h){this.html+=h;}}));
  return {
    _els:els,
    querySelectorAll:sel=>sel==='[data-ov-badge]'?[]:[],
    querySelector:sel=>{const m=/data-nav="(.+?)"/.exec(sel);return m?(els.find(e=>e.nav===m[1])||null):null;}
  };
}
(function(){
  // red=1 + yellow=2 → 3
  vm.runInContext('var visibleOrders=()=>['+
    '{status:"new",date:"'+yesterday+'"},'+
    '{status:"inwork",date:"'+yesterday+'"},'+
    '{status:"approved",date:"'+yesterday+'"}'+'];',ctx);
  const nav=mkNav(['orders','overdue','calendar']);
  ctx.document={getElementById:id=>id==='nav'?nav:null};
  vm.runInContext('applyOverdueBadge()',ctx);
  const ov=nav._els.find(e=>e.nav==='overdue');
  ok(/data-ov-badge="1">3</.test(ov.html),'8) счётчик ⏰ = red+yellow = 3: '+ov.html);
  const cal=nav._els.find(e=>e.nav==='calendar');
  ok(cal.html==='','8) на других пунктах бейджа нет');
  // ролей без overdue — не падает
  const nav2=mkNav(['orders','calendar']);
  ctx.document={getElementById:id=>id==='nav'?nav2:null};
  let threw=false;try{vm.runInContext('applyOverdueBadge()',ctx);}catch(e){threw=true;}
  ok(!threw,'8) роль без пункта overdue → без падения');
  // пусто → не вставляем
  vm.runInContext('var visibleOrders=()=>[];',ctx);
  const nav3=mkNav(['overdue']);
  ctx.document={getElementById:id=>id==='nav'?nav3:null};
  vm.runInContext('applyOverdueBadge()',ctx);
  ok(nav3._els[0].html==='','8) просрочки нет → счётчик не вставляется');
})();

console.log(fail?'\n== SMOKE FAIL ==':'\n== SMOKE PASS ==');
process.exit(fail?1:0);
