// смоук честной симуляции роли: uiOwner/isSim/isMyInwork/canEditWorks/canCancel/visOrder/canShopMats + честный can/myPerms (fa)
const fs=require('fs');
const src=fs.readFileSync('index.html','utf8');
const fa=fs.readFileSync('tools/firebase-access.js','utf8');
// grab: многострочная функция до '\n}'
function grab(n){const i=src.indexOf('function '+n+'(');if(i<0)return null;const j=src.indexOf('\n}',i);return j<0?null:src.slice(i,j+2);}
// grab1: однострочная функция до '\n'
function grab1(n){const i=src.indexOf('function '+n+'(');if(i<0)return null;const j=src.indexOf('\n',i);return src.slice(i,j);}
function grabFa(n){const i=fa.indexOf('function '+n+'(');if(i<0)return null;const j=fa.indexOf('\n}',i);return j<0?null:fa.slice(i,j+2);}
let fail=0;
const code=[
 grab1('isSim'),grab1('uiOwner'),grab1('adminLike'),grab('isMyInwork'),
 grab1('isMeName'),grab1('canEditWorks'),grab1('canEditClient'),grab1('canCreateOrder'),
 grab('canCancel'),grab1('visOrder'),grab1('showTest'),grab1('isTest'),grab1('isInwork'),
 grab1('canShopMats'),grab('isOrderEditor'),grab1('docPerm'),
 grabFa('myPerms'),grabFa('can')
];
for(const c of code){if(!c){console.log('MISSING fn');fail=1;continue;}
 try{eval(c);}catch(e){console.log('EVAL FAIL:',c.slice(0,50),e.message);fail=1;}}
if(fail)process.exit(1);
// === мок окружения ===
var OWNER=true; function isOwner(){return OWNER;}
var TESTROLE=null;
var ME=null;
var ROLES=[{id:'admin',perms:['all']},{id:'operator',perms:['orders_view','orders_create','orders_edit','orders_status','orders_take','calendar','shopping','shopping_close','reports']},{id:'manager',perms:['orders_view','orders_edit','orders_status','orders_take','calendar','shopping','shopping_create','shopping_close']},{id:'worker',perms:['orders_view','tasks','calendar','shopping']}];
function roleById(id){return ROLES.find(r=>r.id===id);}
function unionPermsFor(ids){var out=[];(ids||[]).forEach(id=>{var r=roleById(id);if(r)(r.perms||[]).forEach(p=>{if(out.indexOf(p)<0)out.push(p);});});return out;}
function rolesOf(e){if(!e)return [];if(Array.isArray(e.roles))return e.roles.filter(Boolean);return e.role?[e.role]:[];}
var DB={showTest:false,orders:[]};
var state={role:null,user:null,simOn:false};
function enterAs(role){TESTROLE=role;state.simOn=true;state.role=role;state.user='Владелец ('+role+')';}
function exitSim(){TESTROLE=null;state.simOn=false;state.role='admin';state.user='Владелец';}
const t=(name,cond)=>{console.log((cond?'PASS':'FAIL')+' — '+name);if(!cond)fail=1;};
// заявки
const otherApproved={id:1,status:'approved',worker:null,by:'Оператор',test:false,diagnostician:'Диагност',materials:[],extras:[],works:[]};
const mineInwork={id:2,status:'inwork',worker:'Владелец (worker)',by:'Оператор',test:false,materials:[],extras:[],works:[]};
const mineInworkOwnerName={id:3,status:'inwork',worker:'Владелец',by:'Оператор',test:false,materials:[],extras:[],works:[]};
const myNew={id:4,status:'new',worker:null,by:'Владелец (worker)',test:false,materials:[],extras:[],works:[]};
const testOrder={id:5,status:'new',worker:null,by:'Оператор',test:true,materials:[],extras:[],works:[]};
// --- С0: реальный владелец вне симуляции (всё видно) ---
exitSim();
t('S0 uiOwner=true',uiOwner()===true);
t('S0 can(finance_edit)=true',can('finance_edit')===true);
t('S0 visOrder(test)=true',visOrder(testOrder)===true);
t('S0 canEditWorks(чужая approved)=true',canEditWorks(otherApproved)===true);
t('S0 canEditClient=true',canEditClient()===true);
// --- С1: симуляция worker ---
enterAs('worker');
t('S1 isSim=true',isSim()===true);
t('S1 uiOwner=false',uiOwner()===false);
t('S1 can(finance_edit)=false',can('finance_edit')===false);
t('S1 can(staff_manage)=false',can('staff_manage')===false);
t('S1 can(orders_edit)=false',can('orders_edit')===false);
t('S1 myPerms=worker (не all)',myPerms().join(',')==='orders_view,tasks,calendar,shopping');
t('S1 adminLike=false',adminLike()===false);
// --- С2: чужая approved в симуляции worker — пусто по контролам ---
t('S2 canCancel=false',canCancel(otherApproved)===false);
t('S2 canEditWorks=false (доп. работа/смета скрыты)',canEditWorks(otherApproved)===false);
t('S2 isMyInwork=false (этапы не для него)',isMyInwork(otherApproved)===false);
t('S2 docPerm=false (📄 Смета скрыта)',docPerm(otherApproved)===false);
t('S2 canEditClient=false',canEditClient()===false);
// --- С3: своя inwork в симуляции worker — этапы/куплено/допродажа есть ---
t('S3 isMyInwork=true',isMyInwork(mineInwork)===true);
t('S3 canEditWorks=true (доп-строка по спеке)',canEditWorks(mineInwork)===true);
t('S3 canShopMats=true (Куплено/Не найти)',canShopMats(mineInwork)===true);
// заявка, назначенная на «Владелец», в симуляции = своя
t('S3 isMyInwork(worker=Владелец)=true',isMyInwork(mineInworkOwnerName)===true);
// --- С4: simOn off — всё вернулось ---
exitSim();
t('S4 после exitSim uiOwner=true',uiOwner()===true);
t('S4 canCancel(чужая approved)=true',canCancel(otherApproved)===true);
t('S4 isMyInwork(worker=Владелец)=true (заявка владельца — своя)',isMyInwork(mineInworkOwnerName)===true);
// --- С5: тест-заявки ---
enterAs('worker');DB.showTest=false;
t('S5 worker showTest=off: visOrder(test)=false',visOrder(testOrder)===false);
DB.showTest=true;
t('S5 worker showTest=on: adminLike=false → visOrder=false',visOrder(testOrder)===false);
exitSim();DB.showTest=false;
t('S5 владелец вне сим: visOrder(test)=true',visOrder(testOrder)===true);
// --- С6: оператор orders_edit правит смету чужой approved ---
enterAs('operator');
t('S6 operator can(orders_edit)=true',can('orders_edit')===true);
t('S6 canEditWorks(чужая approved)=true',canEditWorks(otherApproved)===true);
t('S6 canCancel(чужая)=false (нет orders_cancel)',canCancel(otherApproved)===false);
t('S6 canEditClient=true',canEditClient()===true);
// --- С7: создатель может отменить свою new/approved ---
t('S7 оператор-создатель new: canCancel=true',canCancel({id:9,status:'new',by:'Владелец (operator)',test:false})===true);
t('S7 создатель inwork: canCancel=false',canCancel({id:9,status:'inwork',by:'Владелец (operator)',test:false})===false);
enterAs('worker');
t('S7 worker-создатель new: canCancel=true',canCancel(myNew)===true);
// --- С8: честный worker (не владелец, ME с ролью worker) — та же картина, что С2/С3 ---
OWNER=false;TESTROLE=null;state.simOn=false;state.role='worker';state.user='Иван';ME={name:'Иван',roles:['worker']};
t('S8 uiOwner=false',uiOwner()===false);
t('S8 can(orders_edit)=false',can('orders_edit')===false);
t('S8 canCancel=false',canCancel(otherApproved)===false);
t('S8 isMyInwork(своя)=false (worker=Владелец(worker))',isMyInwork(mineInwork)===false);
const ivanInwork={id:10,status:'inwork',worker:'Иван',by:'Оператор',test:false,materials:[],extras:[],works:[]};
t('S8 isMyInwork(Иван)=true',isMyInwork(ivanInwork)===true);
t('S8 canEditWorks(своя inwork)=true',canEditWorks(ivanInwork)===true);
t('S8 docPerm(своя inwork)=true (рабочему свои документы можно)',docPerm(ivanInwork)===true);
console.log(fail?'\nSIM_SMOKE_FAIL':'\nSIM_SMOKE_OK');
process.exit(fail?1:0);
