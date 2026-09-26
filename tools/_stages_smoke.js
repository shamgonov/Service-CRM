// смоук пакета F1/F2/F3: права исполнителя своей inwork, защита схемы этапов, возврат этапа
// Функции извлекаются из index.html по балансу скобок; зависимости — моки.
const fs=require('fs');
const src=fs.readFileSync('index.html','utf8');
function grab(n){
 const i=src.indexOf('function '+n+'(');if(i<0)return null;
 let d=0,k=src.indexOf('{',i);
 for(;k<src.length;k++){const c=src[k];if(c==='{')d++;else if(c==='}'){d--;if(!d)break;}}
 return k>=src.length?null:src.slice(i,k+1);
}
let fail=0;
const alerts=[],confirms=[];
global.alert=m=>{alerts.push(String(m));};
global.confirm=m=>{confirms.push(String(m));return true;};
global.prompt=()=>null;
// --- моки окружения (до eval) ---
const state={user:'Влад',role:'worker'};
let SIM=false,OWNER=false,EDITOR=false;
let CANS={};
const isSim=()=>SIM, isOwner=()=>OWNER, uiOwner=()=>OWNER&&!SIM;
const can=p=>!!CANS[p];
const isOrderEditor=()=>EDITOR;
const DB={orders:[]};
const byId=id=>DB.orders.find(x=>x.id==id);
const escapeHtml=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const STAGE_T={measure:'Замер',make:'Изготовление',install:'Монтаж',service:'Выезд'};
const hintCls=()=>'', hintData=()=>'';
const logSpy=[];
const logAction=(o,a,d)=>{logSpy.push({action:a,details:d});};
let saveCalls=0;
const markOrder=o=>{o.updatedTs=1;}, save=()=>{saveCalls++;}, render=()=>{};
for(const n of ['isInwork','isMeName','isMyInwork','canEditWorks','canEditRoute','orderStages','stageDueLabel','stageTimeline','stageDel','stageUndone']){
 const f=grab(n);
 if(!f){console.log('MISSING',n);fail=1;continue;}
 try{eval(f);}catch(e){console.log('EVAL FAIL',n,e.message);fail=1;}
}
if(fail)process.exit(1);
const t=(name,ok)=>{console.log((ok?'OK  ':'FAIL')+' — '+name);if(!ok)fail=1;};
const mk=over=>Object.assign({id:1,status:'inwork',worker:'Влад',by:'Клиент',works:[],extras:[],materials:[],stages:[],history:[]},over);
const st=(o)=>o.stages;

// ===== F1: canEditWorks =====
EDITOR=false;
t('F1 исполнитель своей inwork', canEditWorks(mk({status:'inwork',worker:'Влад'}))===true);
t('F1 legacy in_progress тоже', canEditWorks(mk({status:'in_progress',worker:'Влад'}))===true);
t('F1 чужая inwork — нет права', canEditWorks(mk({status:'inwork',worker:'Петр'}))===false);
t('F1 completed своего — нет права', canEditWorks(mk({status:'completed',worker:'Влад'}))===false);
t('F1 null-safe', canEditWorks(null)===false);
EDITOR=true;
t('F1 редактор заявок — полный доступ', canEditWorks(mk({status:'new',worker:'Петр'}))===true);
EDITOR=false;

// ===== F2: защита схемы этапов =====
CANS={orders_edit:true};
DB.orders=[mk({stages:[{id:'a',title:'Единственный',done:false}]})];
alerts.length=0;stageDel(1,0);
t('F2 единственный этап не удалён', st(DB.orders[0]).length===1);
t('F2 алерт про единственный этап', alerts.some(a=>/единственный этап/i.test(a)));
DB.orders=[mk({stages:[{id:'a',title:'Первый',done:false},{id:'b',title:'Второй',done:false}]})];
alerts.length=0;stageDel(1,1);
t('F2 из двух этапов удалить можно', st(DB.orders[0]).length===1&&st(DB.orders[0])[0].id==='a');
DB.orders=[mk({stages:[{id:'a',title:'Готовый',done:true,ts_done:123},{id:'b',title:'Второй',done:false}]})];
alerts.length=0;stageDel(1,0);
t('F2 готовый этап не удаляется', st(DB.orders[0]).length===2&&st(DB.orders[0])[0].done===true);
t('F2 алерт готовый → «Вернуть»', alerts.some(a=>/Вернуть/.test(a)));
CANS={};
DB.orders=[mk({stages:[{id:'a',title:'Первый',done:false},{id:'b',title:'Второй',done:false}]})];
stageDel(1,1);
t('F2 без orders_edit — удаление запрещено', st(DB.orders[0]).length===2);
CANS={orders_edit:true};
DB.orders=[mk({stages:[{id:'a',title:'Готовый',done:true,ts_done:123},{id:'b',title:'Следующий',done:false}]})];
let html=stageTimeline(DB.orders[0],true);
t('F2/F3 для готового — кнопка «↩ Вернуть»', html.includes('↩ Вернуть')&&html.includes('stageUndone(1,0)'));
t('F3 для готового нет ✕, для активного есть', !html.includes('stageDel(1,0)')&&html.includes('stageDel(1,1)'));
t('F2 read-only рендер без кнопок', !stageTimeline(DB.orders[0],false).includes('stageDel('));

// ===== F3: возврат готового этапа =====
DB.orders=[mk({status:'inwork',worker:'Влад',stages:[{id:'a',title:'Готовый',done:true,ts_done:123}]})];
logSpy.length=0;saveCalls=0;confirms.length=0;
stageUndone(1,0);
t('F3 done сброшен', st(DB.orders[0])[0].done===false);
t('F3 ts_done обнулён', st(DB.orders[0])[0].ts_done===null);
t('F3 confirm запрошен', confirms.some(c=>/Вернуть этап/.test(c)));
t('F3 запись stage_reopen', logSpy.some(l=>l.action==='stage_reopen'&&l.details.stageTitle==='Готовый'));
t('F3 сохранение вызвано', saveCalls>0);
CANS={};
DB.orders=[mk({status:'completed',worker:'Влад',stages:[{id:'a',title:'Готовый',done:true,ts_done:123}]})];
alerts.length=0;stageUndone(1,0);
t('F3 completed без orders_edit — отказ', st(DB.orders[0])[0].done===true);
CANS={orders_edit:true};
DB.orders=[mk({status:'completed',worker:'Влад',stages:[{id:'a',title:'Готовый',done:true,ts_done:123}]})];
alerts.length=0;stageUndone(1,0);
t('F3 completed оператору — отказ + алерт', st(DB.orders[0])[0].done===true&&alerts.some(a=>/владелец/i.test(a)));
DB.orders=[mk({status:'paid',worker:'Влад',stages:[{id:'a',title:'Готовый',done:true,ts_done:123}]})];
stageUndone(1,0);
t('F3 paid оператору — отказ', st(DB.orders[0])[0].done===true);
OWNER=true;
DB.orders=[mk({status:'completed',worker:'Влад',stages:[{id:'a',title:'Готовый',done:true,ts_done:123}]})];
stageUndone(1,0);
t('F3 владельцу в completed — разрешено', st(DB.orders[0])[0].done===false);
OWNER=false;
DB.orders=[mk({status:'inwork',worker:'Петр',stages:[{id:'a',title:'Готовый',done:true,ts_done:123}]})];
CANS={};stageUndone(1,0);
t('F3 чужая заявка без права — отказ', st(DB.orders[0])[0].done===true);
t('F3 идемпотентен для недоделанного этапа', (function(){DB.orders=[mk({stages:[{id:'a',title:'Не готов',done:false}]})];stageUndone(1,0);return st(DB.orders[0])[0].done===false;})());

console.log(fail?'\nSTAGES SMOKE: FAIL':'\nSTAGES SMOKE: ALL OK');
process.exit(fail?1:0);

