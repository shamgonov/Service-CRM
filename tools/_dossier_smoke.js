// Смоук «Досье заявки» (P0): компактная модалка по клику в списке и в календаре.
// Статика по ФАКТИЧЕСКОМУ index.html + прогон РЕАЛЬНОГО orderDossier (выдернут из html)
// на мини-DOM-моке: проверяем содержимое, экранирование, обрезку работ, «Развернуть».
const fs=require('fs'),vm=require('vm'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
let fails=0;
const ok=(n,c)=>{ console.log((c?'OK  ':'FAIL')+' '+n); if(!c)fails++; };
function grab(src,name){
 const i=src.indexOf('function '+name+'(');
 if(i<0)throw new Error('not found: '+name);
 let d=0,j=src.indexOf('{',i);
 for(let k=j;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){ d--; if(!d) return src.slice(i,k+1); } }
 throw new Error('unbalanced: '+name);
}

// ---------- статика ----------
ok('список: карточка .ord ведёт в orderDossier, а не сразу в details',
 /<div class="ord" onclick="orderDossier\(\$\{o\.id\}\)"/.test(html));
ok('календарь: занятый слот ведёт в orderDossier с сохранением гейта CAL_HELD',
 /onclick="if\(Date\.now\(\)-\(CAL_HELD\|\|0\)<700\)return;event\.stopPropagation\(\);orderDossier\(\$\{o\.id\}\)"/.test(html));
ok('свободные слоты календаря не затронуты (calSlotClick на месте)', html.includes('function calSlotClick('));
ok('drag-обработчики слотов не затронуты (calOrderDown на месте)', html.includes('function calOrderDown('));

// ---------- sandbox с мини-DOM ----------
const root={innerHTML:''};
const sandbox={console,
 document:{getElementById:id=>id==='modal-root'?root:null,createElement:()=>({id:'',innerHTML:''}),body:{appendChild(){}}},
 DB:{orders:[
  {id:101,client:'Иван',phone:'+7 (912) 345-67-89',address:'Ленина 1',date:'2026-05-04',t1:'09:00',t2:'12:00',status:'new',worker:'Пётр',type:'standard',
   works:[{title:'Демонтаж',qty:2,price:1000,unit:'m'},{title:'Монтаж',qty:1,price:5000,unit:'pcs'},{title:'Уборка',qty:1,price:800,unit:'pcs'},
          {title:'Вывоз',qty:1,price:1500,unit:'pcs'},{title:'Финиш',qty:3,price:700,unit:'h'},{title:'Подряд',qty:1,price:900,unit:'pcs',skipped:true}]},
  {id:102,client:'Мария',phone:'',address:'',date:'2026-05-05',t1:'10:00',t2:'11:00',status:'inwork',worker:'',type:'manufacture',works:[]},
  {id:103,client:'<img src=x onerror=alert(1)>',phone:'abc123def',address:'a<b>',date:'2026-05-06',t1:'12:00',t2:'13:00',status:'new',worker:'',works:[]}
 ]},
 ST:{new:{t:'Новая',c:'#dbeafe',tc:'#1e40af'},inwork:{t:'В работе',c:'#fef3c7',tc:'#92400e'}},
 OTYPE:{standard:'Стандарт',manufacture:'С изготовлением',service:'Сервисный'},
 UNITS:{pcs:'шт',m:'пог. м',m2:'м²',kg:'кг',l:'л',h:'час'},
 state:{screen:'orders',orderId:null},
 markViewed(){},render(){},logAction(){},pushEvent(){},notifyCurrentStage(){}
};
vm.createContext(sandbox);
// зависимости объявляем ВНУТРИ vm-контекста: стрелочные функции из Node-скоупа не видят DB/UNITS
vm.runInContext(
 "const money=n=>(+n||0).toLocaleString('ru')+' ₽';"+
 "const total=o=>(o.works||[]).filter(x=>!x.skipped).reduce((s,x)=>s+(+x.price||0)*(+x.qty||1),0)+(+o.price||0);"+
 "const escapeHtml=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');"+
 "const orderType=o=>o.type||'standard';"+
 "const unitLabel=u=>UNITS[u]||UNITS.pcs;"+
 "const byId=id=>DB.orders.find(o=>o.id==id);",
 sandbox);
for(const f of ['openModal','closeModal','modalIsOpen','orderDossier']) vm.runInContext(grab(html,f),sandbox);

// ---------- поведение ----------
sandbox.orderDossier(999);
ok('несуществующая заявка: не падает и не открывает модалку', root.innerHTML==='');

sandbox.orderDossier(101);
let m=root.innerHTML;
ok('досье открылось (modal-root непустой)', sandbox.modalIsOpen());
ok('шапка: №101 и клиент', m.includes('№101')&&m.includes('Иван'));
ok('бейдж статуса «Новая»', m.includes('Новая'));
ok('телефон — tel-ссылка с нормализованным номером', m.includes('href="tel:+79123456789"'));
ok('адрес и дата в формате д.м.гггг, время', m.includes('Ленина 1')&&m.includes('04.05.2026')&&m.includes('09:00–12:00'));
ok('исполнитель указан', m.includes('Пётр'));
ok('итог = сумма непроваленных работ (2*1000+5000+800+1500+3*700=14400)', m.includes('14 400 ₽'));
ok('работ не больше четырёх + счётчик «+2 ещё»', (m.match(/Демонтаж|Монтаж|Уборка|Вывоз|Финиш/g)||[]).length===5&&m.includes('+2 ещё'));
ok('skipped-работа «Подряд» скрыта', !m.includes('Подряд'));
ok('кнопки: Позвонить + Развернуть', m.includes('Позвонить')&&m.includes('Развернуть'));
ok('«Развернуть» = closeModal + go(details,id)', m.includes("closeModal();go('details',101)"));
ok('фон-оверлей закрывает по клику мимо карточки', m.includes('event.target===this')&&m.includes('closeModal()'));

// клик по кнопке «Развернуть» — исполняем РЕАЛЬНЫЙ onclick
const btn=m.match(/onclick="closeModal\(\);go\('details',101\)"/);
if(btn){ vm.runInContext("closeModal();go('details',101)",sandbox); }
ok('после «Развернуть»: модалка закрыта, открыт полный экран details 101',
 !!btn&&root.innerHTML===''&&sandbox.state.screen==='details'&&sandbox.state.orderId===101);

sandbox.orderDossier(102); m=root.innerHTML;
ok('без телефона: «телефон не указан» и disabled-кнопка', m.includes('телефон не указан')&&m.includes('disabled'));
ok('без исполнителя: явная плашка', m.includes('исполнитель не назначен'));
ok('без работ: «работы не указаны»', m.includes('работы не указаны'));
ok('тип manufacture показан бейджем', m.includes('С изготовлением'));

sandbox.orderDossier(103); m=root.innerHTML;
ok('XSS: имя клиента экранировано (нет живого <img)', m.includes('&lt;img')&&!m.includes('<img'));
ok('XSS: адрес экранирован', m.includes('a&lt;b&gt;'));
sandbox.closeModal();

console.log(fails?('\\nDOSSIER_SMOKE_FAILED '+fails):'\\nDOSSIER_SMOKE_OK');
process.exit(fails?1:0);