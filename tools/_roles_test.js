// Смоук: мультироли, права-матрица, редактирование заявки, исполнитель (vm, временный)
const fs=require('fs');
const vm=require('vm');
const app=fs.readFileSync('index.html','utf8');
const fa=fs.readFileSync('tools/firebase-access.js','utf8');
let fails=0;
const t=(name,cond)=>{ if(!cond)fails++; console.log((cond?'OK  ':'FAIL')+' — '+name); };

// --- извлечение функций из index.html ---
function grabFn(name,src){
 const i=src.indexOf('function '+name+'(');
 if(i<0)throw new Error('not found: '+name);
 let end=src.indexOf('\nfunction ',i+5);
 if(end<0)end=src.length;
 return src.slice(i,end);
}
function grabConst(name,src){
 const i=src.indexOf('const '+name+'=');
 if(i<0)throw new Error('not found: '+name);
 const e=src.indexOf('\n',i);
 return src.slice(i,e<0?src.length:e);
}
function mkSandbox(){
 const sb={console,Date,JSON,
  state:{role:null,user:null,screen:'orders',orderId:null,filter:'all',calDate:'2026-09-16',newMats:[]},
  localStorage:{h:{},getItem(k){return this.h[k]||null},setItem(k,v){this.h[k]=v},removeItem(k){delete this.h[k]}},
  escapeHtml:s=>String(s==null?'':s),money:n=>String(n),d0:'2026-09-16',
  isOwner:()=>sb.__owner===true,
  can:p=>{if(sb.__owner)return true;return (sb.__perms||[]).indexOf(p)>=0;},
  alert:m=>{sb.__alert=String(m)},confirm:()=>true,prompt:(m,d)=>sb.__prompt!==undefined?sb.__prompt:(d||''),
  render:()=>{sb.__renders=(sb.__renders||0)+1},save:()=>{},routeGenerate:()=>{},markOrder:()=>{},
  logAction:(o,a,d)=>{o.history=o.history||[];o.history.push({action:a,details:d});},
  deviceId:()=>'dev-test',pushEvent:()=>{},saveSettings:()=>{},
  document:{getElementById:id=>sb.__els[id]||null,querySelectorAll:()=>[],createElement:()=>({setAttribute(){},})},
  openModal:h=>{sb.__modal=h},closeModal:()=>{sb.__modalClosed=true},
  setTimeout:()=>{},navigator:{}};
 vm.createContext(sb);
 return sb;
}
function load(sb,items){
 items.forEach(it=>{
  if(sb.__loaded[it])return; sb.__loaded[it]=1;
  let code;
  try{ code=grabFn(it,app); }catch(e){ code=grabConst(it,app); }
  vm.runInContext(code.split('const ').join('var ').split('let ').join('var '),sb);
 });
}
sb0=null;
// 1) isOrderEditor/canEditOrder
{
 const sb=mkSandbox(); sb.__loaded={}; sb.__owner=false; sb.__perms=['orders_edit'];
 load(sb,['isOrderEditor','canEditOrder','byId']);
 vm.runInContext('var sb_o={status:"new",by:"Анна",history:[]};DB={orders:[sb_o],users:[],templates:[]};state.user="Анна";',sb);
 t('1) создатель может редактировать свою заявку (без orders_edit)',vm.runInContext('canEditOrder(sb_o)',sb)===true);
 sb.__perms=[];
 vm.runInContext('state.user="Чужой"',sb);
 t('2) не создатель без orders_edit — не может',vm.runInContext('canEditOrder(sb_o)',sb)===false);
 sb.__perms=['orders_edit'];
 vm.runInContext('state.user="Анна"',sb);
 vm.runInContext('sb_o.status="completed"',sb);
 t('3) completed без owner — не может',vm.runInContext('canEditOrder(sb_o)',sb)===false);
 sb.__owner=true;
 t('4) completed + владелец — может',vm.runInContext('canEditOrder(sb_o)',sb)===true);
}
// 2) doEditOrder: поля применяются, лог было→стало
{
 const sb=mkSandbox(); sb.__loaded={}; sb.__owner=true;
 load(sb,['isOrderEditor','canEditOrder','doEditOrder','byId','findConflicts','toMin','orderType']);
 vm.runInContext('var sb_o={id:9,status:"new",by:"Коля",client:"Иван",phone:"+7",address:"А",date:"2026-09-16",t1:"10:00",t2:"12:00",price:1000,desc:"д",worker:null,type:"standard",photoReport:false,test:false,extras:[],materials:[],payments:[],history:[]};DB={orders:[sb_o],users:[],templates:[]};',sb);
 sb.__els={'e-client':{value:'Иван 2'},'e-phone':{value:'+7'},'e-address':{value:'А2'},'e-date':{value:'2026-09-17'},'e-t1':{value:'11:00'},'e-t2':{value:'13:00'},'e-price':{value:'2000'},'e-desc':{value:'д2'},'e-type':{value:'new'},'e-otype':{value:'manufacture'},'e-worker':{value:''},'e-photo':{checked:true},'e-test':{checked:false}};
 vm.runInContext('doEditOrder(9)',sb);
 const r=vm.runInContext('sb_o',sb);
 t('5) doEditOrder применяет все поля (клиент/адрес/цена/тип/фото)',r.client==='Иван 2'&&r.address==='А2'&&r.price===2000&&r.type==='manufacture'&&r.photoReport===true&&r.date==='2026-09-17');
 t('6) лог edit: было→стало в details.fields',(r.history||[]).some(h=>h.action==='edit'&&JSON.stringify(h.details||{}).includes('Иван')));
}
// 3) canTakeOrder/takeOrder: создатель, владелец, orders_edit; исполнитель=создатель при создании
{
 const sb=mkSandbox(); sb.__loaded={}; sb.__perms=[]; sb.__owner=false;
 load(sb,['canTakeOrder','takeOrder','canCancel','canDeleteOrder','canShopMats','byId']);
 vm.runInContext('var sb_o={id:5,status:"approved",by:"Оля",worker:null,history:[]};DB={orders:[sb_o],users:[]};state.user="Оля";',sb);
 t('7) создатель может «взять в работу»',vm.runInContext('canTakeOrder(sb_o)',sb)===true);
 vm.runInContext('state.user="Друг"',sb);
 t('8) не создатель без прав — не может',vm.runInContext('canTakeOrder(sb_o)',sb)===false);
 sb.__perms=['orders_edit'];
 t('9) с orders_edit — может',vm.runInContext('canTakeOrder(sb_o)',sb)===true);
 vm.runInContext('takeOrder(5)',sb);
 t('10) takeOrder назначил исполнителя и статус approved',sb.DB.orders[0].worker==='Друг'&&sb.DB.orders[0].status==='approved');
 sb.__perms=[]; sb.state.user='Кто-то';
 vm.runInContext('takeOrder(5)',sb);
 t('11) повторное взятие без права — блокировано «Нет прав»',(sb.__alert||'').includes('Нет прав'));
}
// 4) активные сотрудники: уволенные исключены
{
 const sb=mkSandbox(); sb.__loaded={};
 load(sb,['activeWorkers']);
 vm.runInContext('DB={users:[{name:"А",status:"approved"},{name:"Б",status:"fired"},{name:"В"},{name:"Г",status:"quit"}],templates:[]};',sb);
 const w=vm.runInContext('activeWorkers().map(u=>u.name)',sb);
 t('12) activeWorkers: без уволенных/ушедших',JSON.stringify(w)==='["А","В"]');
}
// 5) мультироли: union прав (firebase-access.js)
{
 // роли в песочнице
 const sb=mkSandbox(); sb.__loaded={};
 vm.runInContext('var ROLES=[{id:"r1",name:"Мастер",perms:["orders_view","tasks","calendar"]},{id:"r2",name:"Снабженец",perms:["shopping","shopping_create","orders_status"]}];var BUILTIN_ROLES=[];',sb);
 vm.runInContext(grabFn('roleById',fa),sb);
 vm.runInContext(grabFn('rolesOf',fa),sb);
 vm.runInContext(grabFn('unionPermsFor',fa),sb);
 vm.runInContext(grabFn('myPerms',fa),sb);
 vm.runInContext('var ME={name:"Тест",role:"r1",roles:["r1","r2"]};var TESTROLE=null;var OWNER_KEY="x";var localStorage={getItem:()=>null};',sb);
 vm.runInContext('var isOwner=function(){return false};',sb);
 const perms=vm.runInContext('myPerms()',sb);
 t('13) union прав двух ролей (orders_view+tasks+calendar+shopping+shopping_create+orders_status)',
  ['orders_view','tasks','calendar','shopping','shopping_create','orders_status'].every(p=>perms.indexOf(p)>=0));
 t('14) дублей прав в union нет',perms.length===new Set(perms).size);
 vm.runInContext('var ME={name:"Старый",role:"r2"};',sb); // без roles → миграция role→[role]
 const p2=vm.runInContext('myPerms()',sb);
 t('15) миграция при чтении: старый role → права роли',JSON.stringify(p2.sort())===JSON.stringify(['orders_status','shopping','shopping_create'].sort()));
}
// 6) владелец — все права
{
 const sb=mkSandbox(); sb.__loaded={}; sb.__owner=true; sb.__perms=[];
 load(sb,['canCancel','canDeleteOrder','canTakeOrder','canEditOrder','byId']);
 vm.runInContext('var sb_o={id:1,status:"completed",by:"никто",worker:"x",history:[]};DB={orders:[sb_o],users:[]};state.user="Владелец";',sb);
 t('16) владелец: canCancel=true на любой заявке',vm.runInContext('canCancel()',sb)===true);
 t('17) владелец: canDeleteOrder=true',vm.runInContext('canDeleteOrder()',sb)===true);
 t('18) владелец: canTakeOrder=true (взять себе)',vm.runInContext('canTakeOrder(sb_o)',sb)===true);
 t('19) владелец: canEditOrder=true на completed',vm.runInContext('canEditOrder(sb_o)',sb)===true);
}
// 7) shopping_close/create гейты
{
 const sb=mkSandbox(); sb.__loaded={}; sb.__perms=['shopping','shopping_create'];
 load(sb,['canShoppingCreate','canShoppingClose','shoppingBuy','byId']);
 vm.runInContext('var DB={orders:[],shopping:[{id:"s1",status:"new",name:"Кран",qty:"1",unit:"шт",ts:1}]};',sb);
 t('20) shopping_create есть, shopping_close нет → кнопка формы да, закрытие нет',
  vm.runInContext('canShoppingCreate()',sb)===true&&vm.runInContext('canShoppingClose()',sb)===false);
 sb.__prompt='';
 vm.runInContext('shoppingBuy("s1")',sb);
 t('21) закрытие без права — «Нет прав»',(sb.__alert||'').includes('Нет прав')&&sb.DB.shopping[0].status==='new');
}
console.log(fails?'\nFAILS: '+fails:'\nALL PASS');
process.exit(fails?1:0);
