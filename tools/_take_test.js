// Смоук БЛОКА А: взятие в работу через гейт + вкладки + видимость + завершение по этапам
// (node vm + DOM-мок, временный файл). Реальный код из index.html и tools/firebase-access.js.
const fs=require('fs');
const vm=require('vm');
const app=fs.readFileSync('index.html','utf8');
const fa=fs.readFileSync('tools/firebase-access.js','utf8');
let fails=0;
const t=(name,cond)=>{ if(!cond)fails++; console.log((cond?'OK  ':'FAIL')+' — '+name); };

function grabFn(name,src){
 const i=src.indexOf('function '+name+'(');
 if(i<0)throw new Error('not found: '+name);
 let end=src.indexOf('\nfunction ',i+5);
 if(end<0)end=src.length;
 return src.slice(i,end);
}
function grabLine(name,src){ // const NAME=... (одна строка)
 const i=src.indexOf('const '+name+'=');
 if(i<0)throw new Error('not found: '+name);
 const e=src.indexOf('\n',i);
 return src.slice(i,e<0?src.length:e);
}
function grabBlock(name,src){ // const NAME={ ... };  (многострочный)
 const i=src.indexOf('const '+name+'={');
 if(i<0)throw new Error('not found: '+name);
 const e=src.indexOf('\n};',i);
 return src.slice(i,e+3);
}
function toVar(s){return s.split('const ').join('var ').split('let ').join('var ')}

// --- DOM-мок (нужен для modal-root и навбара) ---
function mkEl(tag,id){
 const el={tagName:tag.toUpperCase(),id:id||'',attrs:{},children:[],style:{},
  setAttribute(k,v){el.attrs[k]=String(v)},getAttribute(k){return k in el.attrs?el.attrs[k]:null},
  appendChild(c){el.children.push(c);return c},querySelector(){return null},querySelectorAll(){return []}};
 Object.defineProperty(el,'innerHTML',{get(){return el._html||''},set(v){el._html=String(v)}});
 return el;
}
const MODAL=mkEl('div','modal-root'), NAV=mkEl('nav','nav');

function mkSandbox(perms,opts){
 opts=opts||{};
 const sb={console,Date,JSON,Math,String,Array,Object,Number,RegExp,setTimeout:(fn)=>{fn()},
  canAddPhoto:()=>false,canShopMats:()=>false,canPhotoReport:()=>false,
  state:{role:opts.role||'worker',user:opts.user||'Иван',screen:'tasks',orderId:null,filter:'all',calDate:'2026-09-16',newMats:[],tasksTab:null},
  DB:{orders:[],users:[],templates:[],shopping:[],showTest:false,baseAddress:''},
  localStorage:{h:{},getItem(k){return this.h[k]||null},setItem(k,v){this.h[k]=v},removeItem(k){delete this.h[k]}},
  escapeHtml:s=>String(s==null?'':s),money:n=>String(n)+' ₽',d0:'2026-09-16',
  isOwner:()=>opts.owner===true,
  can:p=>opts.owner===true?true:(perms||[]).indexOf(p)>=0,
  alert:m=>{sb.__alert=String(m)},confirm:()=>true,prompt:(m,d)=>d||'',
  render:()=>{sb.__renders=(sb.__renders||0)+1},save:()=>{sb.__saved=(sb.__saved||0)+1},
  markOrder:()=>{},logAction:(o,a,d)=>{o.history=o.history||[];o.history.push({action:a,details:d,ts:1})},
  routeGenerate:o=>{o.route=o.route||[]},deviceId:()=>'dev1',saveSettings:()=>{},
  pushEvent:(ty,ti,b,id)=>{sb.__events=sb.__events||[];sb.__events.push({ty,ti,b,id})},
  openModal:h=>{MODAL.innerHTML=h;sb.__modal=MODAL.innerHTML},closeModal:()=>{MODAL.innerHTML='';sb.__modal='';sb.__modalClosed=(sb.__modalClosed||0)+1},
  go:(s,id)=>{sb.__go=[s,id]},
  document:{getElementById:id=>id==='modal-root'?MODAL:(id==='nav'?NAV:null),querySelectorAll:()=>[],createElement:()=>mkEl('div')},
  navigator:{}};
 vm.createContext(sb);
 sb.__loaded={};
 // словари из index.html (реальные)
 vm.runInContext(toVar(grabBlock('ST',app)),sb);
 ['BUYER','OTYPE','STAGE_T','PAY_T','PAY_M'].forEach(n=>vm.runInContext(toVar(grabLine(n,app)),sb));
 return sb;
}
function load(sb,names,src){
 names.forEach(n=>{
  if(sb.__loaded[n])return; sb.__loaded[n]=1;
  let code;
  try{ code=grabFn(n,src||app); }catch(e){ code=grabLine(n,src||app); }
  vm.runInContext(toVar(code),sb);
 });
}
const COMMON=['adminLike','isTest','showTest','visOrder','canTakeOrder','isInwork','canViewAllOrders',
 'hiddenTakeFromMe','showTakeBtn','orderType','orderStages','total','totalPaid','orderPayments','balance','byId'];

// === 1) право orders_take в каталоге и в матрице ролей (firebase-access.js) ===
t('1) orders_take есть в PERMS_CATALOG',/key:'orders_take'/.test(fa));
t('2) orders_view_all есть в PERMS_CATALOG',/key:'orders_view_all'/.test(fa));
{
 const m=fa.match(/var BUILTIN_ROLES = \[[\s\S]*?\];/)[0];
 const oper=m.match(/id:'operator'[\s\S]*?perms:\[([^\]]*)\]/)[1];
 const mana=m.match(/id:'manager'[\s\S]*?perms:\[([^\]]*)\]/)[1];
 const work=m.match(/id:'worker'[\s\S]*?perms:\[([^\]]*)\]/)[1];
 t('3) operator по умолчанию с orders_take',oper.includes('orders_take'));
 t('4) manager по умолчанию с orders_take',mana.includes('orders_take'));
 t('5) worker по умолчанию БЕЗ orders_take (только неявно у создателя)',!work.includes('orders_take'));
 t('6) статус inwork добавлен в ST',/inwork:\{t:'В работе'/.test(app));
}

// === 2) гейт-модалка: отмена НЕ берёт заявку, подтверждение берёт и открывает details ===
{
 const sb=mkSandbox(['orders_take','orders_view'],{user:'Пётр'});
 load(sb,COMMON.concat(['takeGateModal','takeConfirm','takeOrder','routeGenerate','logAction']));
 vm.runInContext('DB.orders=[{id:5,status:"approved",worker:null,by:"Оля",client:"Иван",phone:"1",address:"Ленина 1",desc:"р",date:"2026-09-16",t1:"10:00",t2:"12:00",price:5000,extras:[],materials:[],photos:[],payments:[],history:[],type:"service",stages:[{title:"Замер",done:true},{title:"Монтаж",done:false}]}];',sb);
 vm.runInContext('takeGateModal(5)',sb);
 const modal=sb.__modal||'';
 t('7) гейт показал клиента, адрес, дату, сумму, тип и этапы',
  modal.includes('Иван')&&modal.includes('Ленина 1')&&modal.includes('16.09')&&modal.includes('Сервисный')&&modal.includes('Отмена')&&modal.includes('Подтвердить'));
 t('8) до подтверждения заявка не взята (worker пуст, статус approved, takenBy нет)',
  sb.DB.orders[0].worker===null&&sb.DB.orders[0].status==='approved'&&!sb.DB.orders[0].takenBy);
 vm.runInContext('closeModal()',sb); // «Отмена» в модалке
 t('9) отмена в гейте не меняет заявку',sb.DB.orders[0].worker===null&&sb.DB.orders[0].status==='approved');
 vm.runInContext('takeGateModal(5);takeConfirm(5)',sb);
 const o=sb.DB.orders[0];
 t('10) подтверждение: worker=я, status=inwork, takenBy, takenTs',
  o.worker==='Пётр'&&o.status==='inwork'&&o.takenBy==='Пётр'&&!!o.takenTs);
 t('11) история: «Взят в работу»',o.history.some(h=>h.action==='take'&&(h.details||{}).worker==='Пётр'));
 t('12) после подтверждения открыт экран заявки (details)',String(sb.__go)==='details,5');
 t('13) схема маршрута построена при взятии',(o.route||[]).length>0);
}

// === 3) перехват чужой заявки (владелец): отметка о смене исполнителя + событие прежнему ===
{
 const sb=mkSandbox(['orders_take','orders_view'],{user:'Владелец',role:'admin',owner:true});
 load(sb,COMMON.concat(['takeGateModal','takeConfirm','logAction']));
 vm.runInContext('DB.orders=[{id:6,status:"approved",worker:"Сидоров",by:"Оля",client:"К",address:"А",date:"2026-09-16",t1:"10:00",t2:"12:00",price:1000,extras:[],materials:[],photos:[],payments:[],history:[]}]',sb);
 vm.runInContext('takeGateModal(6);takeConfirm(6)',sb);
 const o=sb.DB.orders[0];
 t('14) исполнитель заменён на взявшего',o.worker==='Владелец'&&o.status==='inwork');
 t('15) в истории есть прежний исполнитель',o.history.some(h=>h.action==='take'&&(h.details||{}).from==='Сидоров'));
 t('16) прежнему исполнителю отправлено событие',(sb.__events||[]).some(e=>e.ty==='assigned'&&String(e.ti).includes('6')));
}

// === 4) без права orders_take кнопку не видно, прямой вызов заблокирован ===
{
 const sb=mkSandbox(['orders_view','tasks'],{user:'Пётр'});
 load(sb,COMMON.concat(['takeGateModal','takeConfirm','renderTasks']));
 vm.runInContext('DB.orders=[{id:7,status:"new",worker:null,by:"Оля",client:"К",address:"А",desc:"d",date:"2026-09-16",t1:"10:00",t2:"12:00",price:100,extras:[],materials:[],photos:[],payments:[],history:[]}]',sb);
 t('17) без orders_take showTakeBtn=false',vm.runInContext('showTakeBtn(DB.orders[0])',sb)===false);
 const html=vm.runInContext('renderTasks()',sb);
 t('18) в списке «Доступные» кнопки взятия нет',!html.includes('takeGateModal'));
 sb.__alert=''; vm.runInContext('takeConfirm(7)',sb);
 t('19) прямой вызов без права — «Нет права orders_take», заявка не взята',
  String(sb.__alert).includes('orders_take')&&sb.DB.orders[0].worker===null);
}

// === 5) неявное право создателя: свою заявку беру без orders_take ===
{
 const sb=mkSandbox(['orders_view','tasks'],{user:'Оля'});
 load(sb,COMMON.concat(['takeGateModal','takeConfirm']));
 vm.runInContext('DB.orders=[{id:8,status:"new",worker:null,by:"Оля",client:"К",address:"А",date:"2026-09-16",t1:"10:00",t2:"12:00",price:100,extras:[],materials:[],photos:[],payments:[],history:[]}]',sb);
 t('20) создатель видит кнопку без права orders_take',vm.runInContext('showTakeBtn(DB.orders[0])',sb)===true);
 vm.runInContext('takeGateModal(8);takeConfirm(8)',sb);
 t('21) создатель взял свою заявку',sb.DB.orders[0].worker==='Оля'&&sb.DB.orders[0].status==='inwork');
}

// === 6) вкладки: Взятая ушла из «Доступные» в «В работе»; можно взять несколько ===
{
 const sb=mkSandbox(['orders_take','orders_view','tasks'],{user:'Пётр'});
 load(sb,COMMON.concat(['takeGateModal','takeConfirm','renderTasks','setTasksTab','badges','stageTimeline','matState','dur','stageDueLabel']));
 vm.runInContext('DB.orders=['+
  '{id:11,status:"approved",worker:null,by:"Оля",client:"A",address:"A",desc:"d",date:"2026-09-16",t1:"10:00",t2:"12:00",price:1,extras:[],materials:[],photos:[],payments:[],history:[]},'+
  '{id:12,status:"new",worker:null,by:"Оля",client:"B",address:"B",desc:"d",date:"2026-09-17",t1:"10:00",t2:"12:00",price:1,extras:[],materials:[],photos:[],payments:[],history:[]},'+
  '{id:13,status:"completed",worker:"Пётр",by:"Оля",client:"C",address:"C",desc:"d",date:"2026-09-15",t1:"10:00",t2:"12:00",price:1,extras:[],materials:[],photos:[],payments:[],history:[]},'+
  '{id:14,status:"paid",worker:"Пётр",by:"Оля",client:"D",address:"D",desc:"d",date:"2026-09-14",t1:"10:00",t2:"12:00",price:1,extras:[],materials:[],photos:[],payments:[],history:[]}'+
  ']',sb);
 const free0=vm.runInContext('renderTasks()',sb);
 t('22) вкладка «Доступные»: 2 заявки, есть «В работе (0)» и «Завершённые (2)»',
  free0.includes('Доступные (2)')&&free0.includes('В работе (0)')&&free0.includes('Завершённые (2)'));
 vm.runInContext('takeGateModal(11);takeConfirm(11);takeGateModal(12);takeConfirm(12)',sb);
 vm.runInContext('state.tasksTab="free"',sb);
 const free1=vm.runInContext('renderTasks()',sb);
 t('23) взятые ушли из «Доступные» (0), в «В работе» 2 (можно несколько сразу)',
  free1.includes('Доступные (0)')&&free1.includes('В работе (2)'));
 vm.runInContext('state.tasksTab="work"',sb);
 const work=vm.runInContext('renderTasks()',sb);
 t('24) обе взятые в «В работе»',work.includes('№11')&&work.includes('№12')&&work.includes('Мои заказы в работе'));
 vm.runInContext('state.tasksTab="done"',sb);
 t('25) «Завершённые» — мои completed/paid',vm.runInContext('renderTasks()',sb).includes('Завершённые (2)'));
 t('26) выбор вкладки сохранён в localStorage',vm.runInContext('(setTasksTab("done"),localStorage.getItem("crm_tasks_tab"))',sb)==='done');
 vm.runInContext('state.tasksTab=null;localStorage.removeItem("crm_tasks_tab")',sb);
 t('27) посадка после входа — «Доступные»',vm.runInContext('renderTasks()',sb).includes('fbtn active" onclick="setTasksTab(\'free\')"'));
 t('28) пункт меню переименован в «Поиск заказов»',/worker:\[\['tasks','🔍','Поиск заказов'/.test(app)&&vm.runInContext('renderTasks()',sb).includes('Поиск заказов'));
 t('29) старый ключ вкладки «mine» читается как «В работе»',
  (vm.runInContext('localStorage.setItem("crm_tasks_tab","mine");renderTasks()',sb)).includes('fbtn active" onclick="setTasksTab(\'work\')"'));
}

// === 7) регресс: старый in_progress без takenBy виден у своего worker в «В работе» ===
{
 const sb=mkSandbox(['orders_view','tasks'],{user:'Пётр'});
 load(sb,COMMON.concat(['renderTasks','badges','stageTimeline','matState','dur','stageDueLabel']));
 vm.runInContext('DB.orders=[{id:21,status:"in_progress",worker:"Пётр",by:"Оля",client:"Legacy",address:"A",desc:"d",date:"2026-09-16",t1:"10:00",t2:"12:00",price:1,extras:[],materials:[],photos:[],payments:[],history:[]}]',sb);
 t('30) legacy in_progress показан в «В работе» без takenBy',
  vm.runInContext('state.tasksTab="work";renderTasks()',sb).includes('Legacy'));
 t('31) isInwork покрывает оба статуса',vm.runInContext('isInwork({status:"in_progress"})&&isInwork({status:"inwork"})&&!isInwork({status:"new"})',sb)===true);
}

// === 8) видимость чужих inwork в списке заявок ===
{
 const mk=(perms,opts)=>{
  const sb=mkSandbox(perms,opts);
  load(sb,COMMON.concat(['renderOrders','badges','stageTimeline','matState','dur','stageDueLabel']));
  vm.runInContext('DB.orders=[{id:31,status:"inwork",worker:"Сидоров",takenBy:"Сидоров",by:"Оля",client:"Скрытая",address:"A",desc:"d",date:"2026-09-16",t1:"10:00",t2:"12:00",price:1,extras:[],materials:[],photos:[],payments:[],history:[]}]',sb);
  return sb;
 };
 const w=mk(['orders_view','tasks'],{user:'Пётр',role:'worker'});
 t('32) без orders_view_all чужая inwork скрыта из списка заявок',!vm.runInContext('renderOrders()',w).includes('Скрытая'));
 const a=mk(['orders_view','orders_view_all'],{user:'Пётр',role:'worker'});
 const ha=vm.runInContext('renderOrders()',a);
 t('33) с orders_view_all видна и есть бейдж исполнителя',ha.includes('Скрытая')&&ha.includes('🚜'));
 const o=mk([],{user:'Владелец',role:'admin',owner:true});
 t('34) владельцу видна всегда',vm.runInContext('renderOrders()',o).includes('Скрытая'));
 const self=mk(['orders_view'],{user:'Сидоров',role:'worker'});
 t('35) свою взятую заявку исполнитель видит всегда',vm.runInContext('renderOrders()',self).includes('Скрытая'));
}

// === 9) завершение блокируется при незакрытых этапах (любой тип заявки) ===
{
 const sb=mkSandbox(['orders_take','orders_status'],{user:'Пётр'});
 load(sb,COMMON.concat(['finishOrder','doCompleteOrder','orderType']));
 vm.runInContext('DB.orders=[{id:41,status:"inwork",worker:"Пётр",price:1000,extras:[],payments:[],materials:[],history:[],type:"service",stages:[{title:"Замер",done:true},{title:"Монтаж",done:false},{title:"Уборка",done:false}]}]',sb);
 vm.runInContext('finishOrder(41)',sb);
 t('36) service с незакрытыми этапами — завершение заблокировано, список остатка в предупреждении',
  sb.DB.orders[0].status==='inwork'&&String(sb.__alert).includes('Монтаж')&&String(sb.__alert).includes('осталось 2'));
 vm.runInContext('DB.orders[0].stages[1].done=true;finishOrder(41)',sb);
 t('37) пока есть хотя бы один незакрытый этап — блокировка сохраняется',sb.DB.orders[0].status==='inwork');
 vm.runInContext('DB.orders[0].stages[2].done=true;DB.orders[0].price=0;finishOrder(41)',sb);
 t('38) все этапы закрыты → завершение прошло',sb.DB.orders[0].status==='completed');
 vm.runInContext('DB.orders=[{id:42,status:"inwork",worker:"Пётр",price:0,extras:[],payments:[],materials:[],history:[],type:"standard"}]',sb);
 vm.runInContext('finishOrder(42)',sb);
 t('39) заявка без этапов завершается как раньше',sb.DB.orders[0].status==='completed');
}

// === 10) кнопка «Взять в работу» стоит ВЫШЕ кнопки «Отменить заказ» ===
{
 const sb=mkSandbox(['orders_take','orders_cancel','orders_status'],{user:'Пётр',role:'manager'});
 load(sb,COMMON.concat(['renderDetails','badges','stageTimeline','matState','dur','stageDueLabel','canEditOrder','isOrderEditor','canDeleteOrder','canCancel','canFinance','paymentsBlock','historyBlock','histLine','routeTimeline','canEditRoute','canDoRoute','routeProgress','routeDone','routeTemp', 'orderPayments','totalPaid','materialsPaid','routeNavLinks']));
 vm.runInContext('DB.orders=[{id:51,status:"approved",worker:null,by:"Оля",client:"Иван",phone:"1",address:"А",desc:"d",date:"2026-09-16",t1:"10:00",t2:"12:00",price:1,extras:[],materials:[],photos:[],payments:[],history:[],route:[]}];state.orderId=51',sb);
 const html=vm.runInContext('renderDetails(51)',sb);
 const iT=html.indexOf('takeGateModal('), iC=html.indexOf('cancelOrderModal(');
 t('40) кнопка взятия есть и стоит выше кнопки отмены',iT>=0&&iC>=0&&iT<iC);
 t('41) кнопка подписана «🚜 Взять в работу»',html.includes('🚜 Взять в работу'));
}

// === 11) старый takeOrder больше не берёт заявку напрямую (только через гейт) ===
t('42) takeOrder — обёртка над гейтом, прямого изменения статуса нет',
 /function takeOrder\(id\)\{takeGateModal\(id\)\}/.test(app));

console.log(fails?'\nПРОВАЛОВ: '+fails:'\nALL PASS');
process.exit(fails?1:0);
