'use strict';
// _critical_fix_smoke.js — смоук трёх критических фиксов (2026-10-11).
// Функции вырезаются из index.html и выполняются в vm с моками — без браузера.
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const acc=fs.readFileSync(path.join(ROOT,'tools/firebase-access.js'),'utf8');
let pass=0,fail=0;
function t(name,ok){ if(ok){pass++;console.log('OK   — '+name);} else {fail++;console.log('FAIL — '+name);} }
function cut(name){ // function name(...){...} — баланс скобок
  const i=html.indexOf('function '+name+'(');
  if(i<0)throw new Error('не найдена функция '+name);
  let j=html.indexOf('{',i),d=0,k=j;
  for(;k<html.length;k++){ if(html[k]==='{')d++; else if(html[k]==='}'){d--; if(!d){k++;break;}} }
  return html.slice(i,k);
}
const src=['isSim','adminLike','isMeName','helpersOf','isAssignedToMe','isInwork','localToday','isOverdue','isBurning','canEditOrder']
  .map(cut).join('\n');
const sandbox={state:null,can:()=>false,isOwner:()=>false,uiOwner:()=>false,console,Date,String,Array,Object,JSON};
vm.createContext(sandbox);
vm.runInContext(src,sandbox);
const g=sandbox;

// ===== P1: canEditOrder =====
// оператор (can=true, не назначен, не создатель) — раньше мог всё, теперь нет
g.state={user:'Оператор',role:'operator',simOn:false};
g.can=()=>true; g.canViewAllOrders=()=>false;
t('P1: посторонний оператор → false (было: баг true)', g.canEditOrder({worker:'Мастер',status:'inwork',by:'Кто-то'})===false);
t('P1: назначенный исполнитель → true', g.canEditOrder({worker:'Оператор',status:'inwork'})===true);
t('P1: соисполнитель (helper) → true', g.canEditOrder({worker:'Мастер',helpers:['Оператор'],status:'inwork'})===true);
t('P1: создатель заявки → true', g.canEditOrder({worker:'Мастер',status:'approved',by:'Оператор'})===true);
t('P1: completed → false', g.canEditOrder({worker:'Оператор',status:'completed'})===false);
// админ (adminLike через state.user='Владелец')
g.state={user:'Владелец',role:'admin',simOn:false};
t('P1: adminLike → true', g.canEditOrder({worker:'Мастер',status:'inwork'})===true);
// canViewAllOrders=true (право orders_view_all)
g.state={user:'Оператор',role:'operator',simOn:false};
g.canViewAllOrders=()=>true;
t('P1: canViewAllOrders → true', g.canEditOrder({worker:'Мастер',status:'inwork'})===true);

// ===== P2: подсветка/фильтр =====
g.state={user:'Мастер',role:'worker',simOn:false};
t('P2: isAssignedToMe worker → true', g.isAssignedToMe({worker:'Мастер'})===true);
t('P2: isAssignedToMe helper → true', g.isAssignedToMe({worker:'Друг',helpers:['Мастер']})===true);
t('P2: isAssignedToMe посторонний → false', g.isAssignedToMe({worker:'Друг',helpers:['Третий']})===false);
const list=[{id:1,worker:'Мастер'},{id:2,worker:'Друг'},{id:3,worker:'Друг',helpers:['Мастер']}];
const mine=list.filter(o=>g.isAssignedToMe(o));
t('P2: mine-фильтр оставляет только мои (2 из 3)', mine.length===2&&mine.map(o=>o.id).join()==='1,3');
t('P2: фильтр «Мои» в шапке (статически)', /'mine','👷 Мои'/.test(html));
t('P2: подсветка #fff8e1 по isAssignedToMe (статически)', /isAssignedToMe\(o\)\?'background:#fff8e1/.test(html));
t('P2: бейдж «👷 мой»/«👥 соисполнитель» (статически)', /👷 мой':'👥 соисполнитель/.test(html));

// ===== P3: isOverdue / isBurning =====
const today=g.localToday();
const yest=(()=>{const d=new Date(Date.now()-864e5);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})();
t('P3: вчера+inwork → просрочка', g.isOverdue({date:yest,status:'inwork'})===true);
t('P3: вчера+new → просрочка', g.isOverdue({date:yest,status:'new'})===true);
t('P3: сегодня → не просрочка', g.isOverdue({date:today,status:'inwork'})===false);
t('P3: вчера+completed → не просрочка', g.isOverdue({date:yest,status:'completed'})===false);
t('P3: вчера+canceled → не просрочка', g.isOverdue({date:yest,status:'canceled'})===false);
t('P3: вчера+postponed → не просрочка', g.isOverdue({date:yest,status:'postponed'})===false);
// isBurning не изменена — сравнение тела с эталоном до фикса
const burnSrc=cut('isBurning');
t('P3: isBurning не изменена (inwork+30мин+history)', /if\(!isInwork\(o\)\|\|!o\.date\|\|!o\.t1\)return false;/.test(burnSrc)&&/s\+30/.test(burnSrc)&&/enroute','late','enroute_cancel','conflict_accept/.test(burnSrc));
// событие просрочки в watchNewOrders (переход не→да)
t('P3: событие overdue в watchNewOrders', /wasOd&&!wasOd|nowOd&&!wasOd/.test(acc)&&acc.includes("pushEvent('overdue','⏰ Просрочка — заявка"));
t('P3: бейдж «⚠️ просрочка» в badges (статически)', html.includes("⚠️ просрочка"));

console.log('PASS '+pass+' FAIL '+fail);
process.exit(fail?1:0);
