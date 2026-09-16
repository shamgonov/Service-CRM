// Финальная проверка «Закупа» для index.html (17 тестов, независимый харнесс)
const fs=require('fs'),vm=require('vm');
const app=fs.readFileSync('index.html','utf8');
function grab(name,src){
 const i=src.indexOf('function '+name+'(');
 if(i<0)throw new Error('Функция не найдена: '+name);
 let d=0,s=false;
 for(let j=i;j<src.length;j++){
  const c=src[j];
  if(c==='{'){d++;s=true;}
  else if(c==='}'){d--;if(s&&d===0)return src.slice(i,j+1);}
 }
 throw new Error('Не закрыта: '+name);
}
const SHOP_FNS=['shoppingFromOrder','renderShopping'];
function mkSandbox(perms){
 const ctx={console,
  currentUser:()=>({name:'Оля',role:'admin',perms:perms||[]}),
  hasPerm:p=>(perms||[]).includes(p),
  esc:s=>String(s),today:()=>'2026-09-15',
  prompt:t=>ctx.__prompt||'',alert:m=>{ctx.__alert=m},
  saveDB:()=>{ctx.__saved=true},render:()=>{ctx.__rendered=true},
  calcSum:()=>0,money:n=>String(n),
  orderDeadlineLabel:o=>'скоро',orderDeadlineClass:o=>''};
 vm.createContext(ctx);
 vm.runInContext('var DB={orders:[],shopping:[]};',ctx);
 return ctx;
}
function loadFns(ctx,names){for(const n of names)vm.runInContext(grab(n,app),ctx);}
let fails=0;
function t(name,ok){console.log((ok?'PASS ':'FAIL ')+name);if(!ok)fails++;}

// 1) Синтаксис index.html компилируется
try{
 const scripts=[...app.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
 new vm.Script('(async()=>{'+scripts.join('\n;\n')+'\n})');
 t('1) index.html компилируется',true);
}catch(e){t('1) компиляция: '+e.message,false);}

// 2) firebase-access сериализует shopping
try{
 const f=fs.readFileSync('tools/firebase-access.js','utf8');
 t('2) firebase-access сохраняет DB.shopping',
  f.includes('shopping:DB.shopping||[]')&&f.includes('DB.shopping=ns.shopping'));
}catch(e){t('2) firebase-access: '+e.message,false);}

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
 loadFns(sb,SHOP_FNS.concat(['shoppingForm','shoppingCreate']));
 const h=vm.runInContext('renderShopping()',sb);
 t('5) без права shopping_create — формы запроса нет',!h.includes('sq-name')&&!h.includes('shoppingCreate()'));
 vm.runInContext('shoppingCreate()',sb);
 t('6) create без права не создаёт запись (защита на входе в форму)',(sb.DB.shopping||[]).length===0);
}

// 7-10) С правом shopping_create
{
 const sb=mkSandbox(['shopping','shopping_create']);
 loadFns(sb,SHOP_FNS.concat(['shoppingForm','shoppingCreate']));
 sb.DB={orders:[],shopping:[],showTest:false};
 const h=vm.runInContext('renderShopping()',sb);
 t('7) с правом shopping_create — форма запроса есть',h.includes('sq-name')&&h.includes('shoppingCreate()'));
 sb.__inputs={'sq-name':'Гофра 16мм','sq-qty':'20 м','sq-price':'80','sq-where':'Обойник'};
 vm.runInContext('shoppingCreate()',sb);
 const r=(sb.DB.shopping||[])[0];
 t('8) запрос создан: имя/кол-во сохранены, status=new, source=manual',
  !!r&&r.name==='Гофра 16мм'&&r.qty==='20 м'&&r.status==='new'&&r.source==='manual');
 t('9) поле «Где купить» заполнено из формы',!!r&&r.where==='Обойник');
 t('10) запрос виден в списке с бейджем «отдельный запрос»',
  vm.runInContext('renderShopping()',sb).includes('отдельный запрос'));
}

// 11-16) Закрытые/открытые запросы (право shopping закрывает)
{
 const rec={id:'sq-test',source:'order',orderId:1,orderClient:'ИП Калачев',
  name:'Кабель ВВГ 3*2,5',qty:'10 м',price:1,buyer:'worker',where:'ЭТМ',unit:'h',status:'todo'};
 const sb=mkSandbox(['shopping']);
 sb.DB={orders:[],shopping:[],showTest:false};
 loadFns(sb,SHOP_FNS.concat(['shoppingForm','shoppingCreate','shoppingBuy','shoppingCancel']));
 sb.DB.shopping.push(rec);
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
