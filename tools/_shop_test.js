// Временные тесты: экран «Закупки» — два источника, права, цикл запроса
const fs=require('fs');
const vm=require('vm');
const app=fs.readFileSync('index.html','utf8');
let fails=0;
const t=(name,cond)=>{ if(!cond)fails++; console.log((cond?'OK  ':'FAIL')+' — '+name); };

function mkSandbox(perms){
 const sb={DB:null,state:{user:'Оля',role:'manager'},
  localStorage:{h:{},getItem(k){return this.h[k]||null},setItem(k,v){this.h[k]=v},removeItem(k){delete this.h[k]}},
  escapeHtml:s=>String(s==null?'':s),
  money:n=>String(n)+' ₽',dateStr:()=>'2026-09-15',
  isOwner:()=>false,
  can:perms?(k)=>perms.indexOf(k)>=0:(k)=>false,
  alert:m=>{sb.__alert=m},confirm:()=>true,prompt:(m,d)=>(sb.__prompt!==undefined?sb.__prompt:'650'),
  render:()=>{sb.__rendered=(sb.__rendered||0)+1},
  saveSettings:()=>{sb.__saved=(sb.__saved||0)+1},
  pushEvent:(ty,ti,b)=>{sb.__events=sb.__events||[];sb.__events.push({ty,ti,b})},
  openModal:h=>{sb.__modal=h},closeModal:()=>{sb.__modalClosed=(sb.__modalClosed||0)+1},
  document:{getElementById:id=>sb.__inputs?sb.__inputs[id]:null},
  setTimeout:()=>{},console,Date,JSON};
 vm.createContext(sb);
 sb.__loaded={};
 return sb;
}
function toVar(s){ return s.split('const ').join('var ').split('let ').join('var '); }
function loadFns(sb,fns){
 fns.forEach(f=>{
  if(sb.__loaded[f])return;
  sb.__loaded[f]=1;
  const start=app.indexOf('function '+f+'(');
  if(start>=0){
   let end=app.indexOf('\nfunction ',start+5);
   if(end<0)end=app.length;
   vm.runInContext(toVar(app.slice(start,end)),sb);
   return;
  }
  const cs=app.indexOf('const '+f+'=');
  if(cs>=0){
   const ce=app.indexOf('\n',cs);
   vm.runInContext(toVar(app.slice(cs,ce<0?app.length:ce)),sb);
   return;
  }
  throw new Error('fn not found: '+f);
 });
}
const SHOP_FNS=['renderShopping','canShoppingCreate','visOrder','adminLike','showTest','isTest','matState','dur','BUYER','total','orderType'];

// 1) Нет демо-каталога закупок: shopping нигде не инициализируется демо-данными
t('1) демо-каталога закупок нет (ни seeded-элементов, ни DEMO-констант)',
 (()=>{ const seeded=/shopping\s*:\s*\[\s*\{/.test(app); const demo=/DEMO_SHOP|ДЕМО_ЗАКУП/.test(app); return !seeded&&!demo; })());

// 2) shopping в персистентности
t('2) shopping в cache/save/snapshot',
 (()=>{ const f=fs.readFileSync('tools/firebase-access.js','utf8');
  return f.includes('shopping:DB.shopping||[]')&&f.includes('DB.shopping=ns.shopping'); })());

// 3) Пустой экран без демо-данных
{
 const sb=mkSandbox(['shopping']);
 sb.DB={orders:[],shopping:[],showTest:false};
 loadFns(sb,SHOP_FNS);
 const h=vm.runInContext('renderShopping()',sb);
 t('3) пустая база → «Все материалы закуплены», кнопки запроса нет',
  h.includes('Все материалы закуплены')&&!h.includes('＋ Запрос на закуп'));
}

// 4) Материалы реальных заявок видны, из test-заявки — нет
{
 const sb=mkSandbox(['shopping']);
 sb.DB={shopping:[],showTest:false,orders:[
  {id:1,client:'Реальный',status:'approved',date:'2026-09-16',t1:'10:00',t2:'12:00',price:5000,extras:[],worker:null,photos:[],type:'standard',payments:[],history:[],
   materials:[{name:'Кабель',qty:'10 м',price:100,buyer:'worker',where:'',deadline:3,unit:'h',status:'todo'}]},
  {id:2,client:'Тест',status:'approved',date:'2026-09-16',t1:'10:00',t2:'12:00',price:1,extras:[],worker:null,photos:[],type:'standard',payments:[],history:[],test:true,
   materials:[{name:'СекретныйМат',qty:'1',price:1,buyer:'worker',where:'',deadline:1,unit:'h',status:'todo'}]}]};
 loadFns(sb,SHOP_FNS);
 const h=vm.runInContext('renderShopping()',sb);
 t('4) материалы из реальной заявки показаны, из test — скрыты',
  h.includes('Кабель')&&h.includes('Заявка №1')&&!h.includes('СекретныйМат'));
}

// 5-6) Без права shopping_create
{
 const sb=mkSandbox(['shopping']);
 sb.DB={orders:[],shopping:[],showTest:false};
 sb.__inputs={'sq-name':'Хак'};
 loadFns(sb,SHOP_FNS.concat(['shoppingForm','shoppingCreate','shoppingBuy','shoppingCancel']));
 const h2=vm.runInContext('renderShopping()',sb);
 t('11) запрос в списке: бейдж «отдельный запрос» + кнопки Закуплено/Отменить',
  h2.includes('отдельный запрос')&&h2.includes("shoppingBuy('"+rec.id+"')")&&h2.includes("shoppingCancel('"+rec.id+"')"));
 sb.__inputs={'sq-name':'  '};
 const n=(sb.DB.shopping||[]).length;
 vm.runInContext('shoppingCreate()',sb);
 t('12) пустое имя — новая запись не создана',(sb.DB.shopping||[]).length===n);
 sb.__prompt='650';
 vm.runInContext("shoppingBuy('"+rec.id+"')",sb);
 t('13) «Закуплено»: bought, factPrice=650, дата, закрыл',
  rec.status==='bought'&&rec.factPrice===650&&rec.dateBought==='2026-09-15'&&rec.closedBy==='Оля');
 sb.DB.shopping.push({id:'sq-x',source:'manual',status:'new',name:'Хомуты',qty:'10',unit:'шт',ts:1});
 sb.__prompt='';
 vm.runInContext("shoppingBuy('sq-x')",sb);
 t('14) «Закуплено» без цены — factPrice не проставлен',sb.DB.shopping[1].status==='bought'&&sb.DB.shopping[1].factPrice===undefined);
 vm.runInContext("shoppingCancel('sq-x')",sb);
 t('15) «Отменено»: canceled + закрыл',sb.DB.shopping[1].status==='canceled'&&sb.DB.shopping[1].closedBy==='Оля');
 const before=JSON.stringify(sb.DB.shopping[1]);
 vm.runInContext("shoppingBuy('sq-x')",sb);
 t('16) закрытый запрос повторно не закрывается',JSON.stringify(sb.DB.shopping[1])===before);
}

// 17) Запросы не влияют на финансы/отчётов заявок
{
 const sb=mkSandbox(['shopping']);
 loadFns(sb,['isTest','total']);
 vm.runInContext('function bizOrder(o){return !isTest(o)}',sb);
 t('17) bizOrder/total завязаны только на orders (shopping их не касается)',
  vm.runInContext('bizOrder({id:1})',sb)===true&&vm.runInContext('bizOrder({id:1,test:true})',sb)===false&&
  !app.includes('DB.shopping.reduce')&&!app.includes('shopping.forEach'));
}

console.log(fails?'\nFAILS: '+fails:'\nALL PASS');
process.exit(fails?1:0);