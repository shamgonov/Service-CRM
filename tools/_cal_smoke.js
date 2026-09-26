// смоук B6/B7: карточка заявки ровно в одном слоте (calHomeSlot) + локальная дата fmt/calDate
const fs=require('fs');
const vm=require('vm');
const src=fs.readFileSync('index.html','utf8');
function grabFn(name){
  const i=src.indexOf('function '+name+'(');
  if(i<0)throw new Error('MISSING fn '+name);
  let d=0,j=src.indexOf('{',i);
  for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1);}}
  throw new Error('UNBALANCED '+name);
}
function grabConst(name){
  const m=src.match(new RegExp('const '+name+'=[^\\n]*'));
  if(!m)throw new Error('MISSING const '+name);
  return m[0];
}
let fail=0;
function ok(cond,msg){console.log((cond?'OK   — ':'FAIL — ')+msg);if(!cond)fail=1;}

// реальный список слотов берём из index.html (первое вхождение), чтобы тест не разъехался с кодом
const slotsLit=(src.match(/const slots=(\['[^\]]*\])/)||[])[1];
if(!slotsLit){console.log('FAIL — не найден литерал const slots=[...] в index.html');process.exit(1);}

const ctx={};
vm.createContext(ctx);
vm.runInContext('var SLOTS='+slotsLit+';',ctx);
vm.runInContext(grabConst('fmt'),ctx);
vm.runInContext(grabFn('calHomeSlot'),ctx);
const SLOTS=vm.runInContext('SLOTS',ctx);
const bounds=SLOTS.map(s=>s.split('\u2013'));
ok(Array.isArray(SLOTS)&&SLOTS.length>0,'0) SLOTS взят из index.html: '+JSON.stringify(SLOTS));

// place(o) → inSlot = СТАРОЕ условие рендера (любое пересечение), shown = новое (домашний слот)
function place(o){
  const inSlot=[],shown=[];
  bounds.forEach(function(p,si){
    if(o.t1<p[1]&&o.t2>p[0]){inSlot.push(si);if(vm.runInContext('calHomeSlot(SLOTS,'+si+','+JSON.stringify(o)+')',ctx))shown.push(si);}
  });
  return {inSlot:inSlot,shown:shown};
}

// ---------- 1) заявка через границу часа: раньше ДВЕ карточки, теперь ОДНА ----------
(function(){
  const r=place({t1:'09:00',t2:'11:00'});
  ok(r.inSlot.join(',')==='0,1','1) старое условие (пересечение) даёт два слота: ['+r.inSlot.join(',')+'] = дубль');
  ok(r.shown.join(',')==='0','1) calHomeSlot оставляет ровно один (первый): ['+r.shown.join(',')+']');
})();
// ---------- 2) длинная заявка через несколько границ ----------
(function(){
  const r=place({t1:'09:00',t2:'15:00'});
  ok(r.inSlot.length===4,'2) 09:00–15:00 пересекала 4 слота (08-10,10-12,12-14,14-16): '+r.inSlot.length);
  ok(r.shown.join(',')==='0','2) рисуется только в домашнем: ['+r.shown.join(',')+']');
})();
// ---------- 3) заявки точно в границах слота — поведение не изменилось ----------
(function(){
  ok(place({t1:'10:00',t2:'12:00'}).shown.join(',')==='1','3) 10:00–12:00 → слот 1');
  ok(place({t1:'18:00',t2:'20:00'}).shown.join(',')==='5','3) 18:00–20:00 → слот 5');
  ok(place({t1:'12:00',t2:'14:00'}).shown.join(',')==='2','3) 12:00–14:00 → слот 2');
})();
// ---------- 4) владение: домашний si=true, продолжение si=false ----------
(function(){
  const o=JSON.stringify({t1:'09:00',t2:'11:00'});
  ok(vm.runInContext('calHomeSlot(SLOTS,0,'+o+')',ctx)===true,'4) домашний (si=0) → true');
  ok(vm.runInContext('calHomeSlot(SLOTS,1,'+o+')',ctx)===false,'4) продолжение (si=1) → false, дубль не печатаем');
})();
// ---------- 5) сумма карточек = числу заявок (без потерь и без дублей) ----------
(function(){
  const list=[{t1:'09:00',t2:'11:00'},{t1:'10:00',t2:'12:00'},{t1:'13:00',t2:'14:00'},{t1:'19:00',t2:'20:00'}];
  let total=0;
  list.forEach(o=>{total+=place(o).shown.length;});
  ok(total===list.length,'5) карточек в календаре: '+total+' = заявок '+list.length);
})();
// ---------- 6) B7: fmt локальный, без UTC-сдвига ----------
(function(){
  ok(!/toISOString|getUTC/.test(grabConst('fmt')),'6) fmt локальный (без toISOString/getUTC)');
  const d=new Date(2026,0,5,0,30); // локальная полночь: в UTC тот же миг = 04.01
  const got=vm.runInContext('fmt(new Date('+d.getTime()+'))',ctx);
  ok(got==='2026-01-05','6) fmt(локальные 00:30 05.01.2026) = '+got+' (не 2026-01-04)');
})();
// ---------- 7) B7: calDate по умолчанию — локальная дата ----------
(function(){
  const m=src.match(/calDate\s*:\s*[^,}\n]*/);
  ok(!!m,'7) найден state.calDate: '+(m?m[0]:'—'));
  ok(!!m&&!/toISOString|getUTC/.test(m[0]),'7) calDate инициализирован без UTC-сдвига');
})();

console.log(fail?'\n== SMOKE FAIL ==':'\n== SMOKE PASS ==');
process.exit(fail?1:0);