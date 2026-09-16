// Смоук: пауза полного рендера + точечные метки времени (vm + DOM-мок, временный файл)
// Проверяет реальный код из index.html (блок паузы, render(), matState, tickTimeLabels)
// и реальный фрагмент из tools/firebase-access.js (загрузка фото деталей).
const fs=require('fs');
const vm=require('vm');
const app=fs.readFileSync('index.html','utf8');
const fa=fs.readFileSync('tools/firebase-access.js','utf8');
let fails=0;
const t=(name,cond)=>{ if(!cond)fails++; console.log((cond?'OK  ':'FAIL')+' — '+name); };

// --- извлечение кода ---
function grabBalanced(src,marker){
 const at=src.indexOf(marker);
 if(at<0)throw new Error('not found: '+marker);
 let i=src.indexOf('{',at),depth=0,end=-1;
 for(;i<src.length;i++){ const c=src[i]; if(c==='{')depth++; else if(c==='}'){depth--; if(!depth){end=i+1;break}} }
 if(end<0)throw new Error('unbalanced: '+marker);
 return src.slice(at,end);
}
function grabBetween(src,startMarker,endMarker){
 const a=src.indexOf(startMarker); if(a<0)throw new Error('not found: '+startMarker);
 const b=src.indexOf(endMarker,a); if(b<0)throw new Error('not found: '+endMarker);
 return src.slice(a,b);
}

// --- DOM-мок ---
let REBUILDS=0;
function mkEl(tag,id){
 const el={tagName:tag.toUpperCase(),id:id||'',attrs:{},listeners:{},children:[],parentNode:null,
  textContent:'',value:'',style:{},checked:false,rebuilds:0,
  addEventListener(type,fn){ (el.listeners[type]=el.listeners[type]||[]).push(fn) },
  setAttribute(k,v){el.attrs[k]=String(v)},
  getAttribute(k){ return k in el.attrs?el.attrs[k]:null },
  contains(n){ let p=n; while(p){ if(p===el)return true; p=p.parentNode } return false },
  focus(){ DOC.activeElement=el },
  setSelectionRange(){},
  appendChild(c){ c.parentNode=el; el.children.push(c); return c },
  querySelectorAll(sel){
   const out=[];
   (function walk(list){ list.forEach(function(x){
    if(sel==='[data-tleft]'&&x.attrs&&'data-tleft' in x.attrs)out.push(x);
    walk(x.children||[]);
   }) })(el.children);
   return out;
  },
  dispatch(type,ev){ (el.listeners[type]||[]).forEach(function(fn){ fn(ev) }) }
 };
 Object.defineProperty(el,'innerHTML',{
  get(){ return el._html||'' },
  set(v){ el._html=String(v); el.rebuilds++; REBUILDS++ } // перезапись DOM = пересоздание детей
 });
 return el;
}
function ev(target,relatedTarget){ return {target:target,relatedTarget:relatedTarget||null} }

const APP=mkEl('div','app'), NAV=mkEl('nav','nav');
const DOC={getElementById:id=>id==='app'?APP:(id==='nav'?NAV:null),addEventListener(t2,fn){(DOC.listeners[t2]=DOC.listeners[t2]||[]).push(fn)},listeners:{},activeElement:null,
 dispatch(type,e2){ (DOC.listeners[type]||[]).forEach(function(fn){fn(e2)}) }};
const TIMERS=[];
function runTimers(){ const q=TIMERS.splice(0); q.forEach(function(fn){fn()}) }

const sb={console,Date,JSON,Math,String,Array,Object,Number,RegExp,setTimeout:(fn)=>{TIMERS.push(fn)},
 requestAnimationFrame:(fn)=>{fn()},
 state:{role:'admin',user:'Тест',screen:'orders',orderId:null,filter:'all',calDate:'2026-09-16',newMats:[],tasksTab:'free'},
 document:DOC,
 window:{scrollY:0,scrollTo:function(){},addEventListener:function(){}},
 NAVS:{admin:[['orders','📋','Заявки'],['admin','⚙️','Админ']]}};
vm.createContext(sb);
// заглушки экранов создаются ВНУТРИ контекста (иначе не видят $RENDERED)
vm.runInContext('var $RENDERED="<div class=card>LIST</div>";'+
 ['renderOrders','renderDetails','renderCreate','renderCalendar','renderTasks','renderShopping','renderReports','renderAdmin']
  .map(function(n){return 'function '+n+'(){return $RENDERED}'}).join(';'),sb);

// === 1) блок паузы + render() из index.html ===
const holdBlock=grabBetween(app,'var RENDER_HOLD=null','\nfunction render(){');
const renderFn=grabBalanced(app,'function render(){');
vm.runInContext(holdBlock+renderFn,sb);

// 1.1 focus на select → render по снапшоту: select НЕ пересоздан
const sel=APP.appendChild(mkEl('select','d-status'));
APP.rebuilds=0;
APP.dispatch('focusin',ev(sel));
vm.runInContext('render()',sb);
t('1) при фокусе на select render() не перезаписал #app',APP.rebuilds===0);
t('2) тот же объект select (раскрытие сохранено)',APP.children[0]===sel);

// 1.2 pending применён на focusout
APP.dispatch('focusout',ev(sel,null));
runTimers();
t('3) blur применил pending-рендер (#app перерисован)',APP.rebuilds===1);

// 1.3 blur без запроса на рендер → лишней перерисовки нет (данные не менялись)
APP.dispatch('focusin',ev(sel));
APP.dispatch('focusout',ev(sel,null));
runTimers();
t('4) blur без pending → DOM не тронут',APP.rebuilds===1);

// 1.4 ввод в input во время снапшота не теряется
const inp=APP.appendChild(mkEl('input','c-fio'));
APP.dispatch('focusin',ev(inp));
inp.value='Иванов Иван';
vm.runInContext('render()',sb);
vm.runInContext('render()',sb);
t('5) ввод в input сохранён, #app не перерисован',inp.value==='Иванов Иван'&&APP.rebuilds===1&&APP.children[1]===inp);

// 1.5 change (выбор в select завершён) → pending применён следующим тиком
const sel2=APP.appendChild(mkEl('select','d-status2'));
APP.dispatch('focusin',ev(sel2));
vm.runInContext('render()',sb);           // «снапшот» пришёл, пока открыт select
t('6) до change перерисовки не было',APP.rebuilds===1);
sel2.value='in_progress';
APP.dispatch('change',ev(sel2));           // onchange-обработчик уже отработал → flush
runTimers();
t('7) change применил pending-рендер',APP.rebuilds===2);

// 1.5b после change в select пауза снята → отложенный (async) render() применяется сразу
//      (так работает смена статуса: orderHasPhotos → render уже после onchange)
APP.dispatch('focusin',ev(sel2));
vm.runInContext('render()',sb);              // выбор ещё не завершён — пауза держит
t('7b) до выбора в select — без перерисовки',APP.rebuilds===2);
APP.dispatch('change',ev(sel2));             // выбор завершён
vm.runInContext('render()',sb);              // async-рендер после change (фотоотчёт)
t('7c) async render после change применён сразу',APP.rebuilds===3);

// 1.5c change в input: значение зафиксировано → pending применён, пауза снята
const inp2=APP.appendChild(mkEl('input','c-note'));
APP.dispatch('focusin',ev(inp2));
vm.runInContext('render()',sb);
APP.dispatch('change',ev(inp2));
t('7d) до тика после change перерисовки нет',APP.rebuilds===3);
runTimers();
t('7e) change в input применил pending',APP.rebuilds===4);
vm.runInContext('render()',sb);
t('7f) после change пауза снята → render проходит',APP.rebuilds===5);
APP.dispatch('focusout',ev(inp2,null));
runTimers();
t('7g) blur без pending → лишней перерисовки нет',APP.rebuilds===5);

// 1.6 переход между полями одной формы — пауза держится
const b0=APP.rebuilds;
const i1=APP.appendChild(mkEl('input','f1')), i2=APP.appendChild(mkEl('input','f2'));
APP.dispatch('focusin',ev(i1));
APP.dispatch('focusout',ev(i1,i2));
APP.dispatch('focusin',ev(i2));
vm.runInContext('render()',sb);
t('8) focusout→focusin в другое поле внутри #app: без перерисовки',APP.rebuilds===b0);
APP.dispatch('focusout',ev(i2,null));
runTimers();
t('9) выход из поля применил pending',APP.rebuilds===b0+1);

// 1.7 страховка: тап по кнопке/пункту меню (без событий focus на мобильных)
const b1=APP.rebuilds;
const sel3=APP.appendChild(mkEl('select','d-status3'));
APP.dispatch('focusin',ev(sel3));
vm.runInContext('render()',sb);
DOC.dispatch('click',ev(mkEl('div','nav-item')));
runTimers();
t('10) клик вне поля применил pending-рендер',APP.rebuilds===b1+1);
// клик по самому полю pending не применяет
APP.dispatch('focusin',ev(sel3));
vm.runInContext('render()',sb);
DOC.dispatch('click',ev(sel3));
runTimers();
t('11) клик по select не снимает паузу',APP.rebuilds===b1+1);
APP.dispatch('focusout',ev(sel3,null));
runTimers();

// 1.8 гейт в обёртке render() (firebase-access): экран staff/profile тоже под паузой
const wrapper=grabBetween(fa,'window.render = function(){','\n};');
t('12) гейт паузы стоит ДО первой записи DOM в обёртке window.render',
 wrapper.indexOf('renderHoldGate()')>=0 && wrapper.indexOf('renderHoldGate()')<wrapper.indexOf('innerHTML'));

// === 2) метки относительного времени: точечное обновление без полного render() ===
const timeBlock=grabBalanced(app,'function dur(')+'\n'+grabBalanced(app,'function matState(')+'\n'+grabBalanced(app,'function tickTimeLabels()');
vm.runInContext('var DB={orders:[{id:7,client:"Иван",date:"2099-01-01",t1:"10:00",status:"new",materials:[{name:"Цепь",qty:"1 шт",status:"todo",deadline:1,unit:"h"}]}]}',sb);
vm.runInContext(timeBlock,sb);
const b=mkEl('b'); b.setAttribute('data-tleft','7:0'); b.textContent='осталось 0 ч 0 мин';
APP.appendChild(b);
const before=APP.rebuilds;
vm.runInContext('tickTimeLabels()',sb);
t('13) метка времени обновлена',/осталось \d+/.test(b.textContent)&&b.textContent!=='осталось 0 ч 0 мин');
t('14) метка обновлена без полного render()',APP.rebuilds===before);
// просроченная заявка → текст меняется на «просрочен на»
vm.runInContext('DB.orders[0].date="2020-01-01";tickTimeLabels()',sb);
t('15) просроченный дедлайн: метка переключилась на «просрочен»',/просрочен на/.test(b.textContent)&&APP.rebuilds===before);
// несуществующая заявка/материал — без падения
const b2=mkEl('b'); b2.setAttribute('data-tleft','999:5'); b2.textContent='метка';
APP.appendChild(b2);
vm.runInContext('tickTimeLabels()',sb);
t('16) битая ссылка data-tleft — без падения, текст не тронут',b2.textContent==='метка');

// === 3) разрыв цикла render→loadOrderPhotos→render (реальный фрагмент firebase-access.js) ===
t('17) в firebase-access.js объявлен PHOTOS_SIG',/var PHOTOS_SIG=\{\}/.test(fa));
{
 const start=fa.indexOf(" // детали заявки: подтянуть фото");
 const srcFa=fa.slice(start,fa.indexOf('\n }\n};',start)+3);
 let renders=0;
 const sb2={console,setTimeout:(fn)=>{fn()},state:{screen:'details',orderId:7},
  PHOTOS_SIG:{},render:()=>{renders++},
  fs:{collection:()=>({})},
  loadOrderPhotos:(id,cb)=>{ cb(sb2.__arr) }};
 vm.createContext(sb2);
 vm.runInContext('var renderHoldGate=function(){return false}',sb2);
 sb2.__arr=[];
 vm.runInContext(srcFa,sb2);            // 1-й рендер: фото подтянуты, набора раньше не было
 t('18) первая загрузка фото → перерисовка галереи',renders===1);
 vm.runInContext(srcFa,sb2);            // тот же набор → перерисовки нет (цикл разорван)
 vm.runInContext(srcFa,sb2);
 t('19) тот же набор фото → полного render нет (цикл разорван)',renders===1);
 sb2.__arr=[{id:'7_1'},{id:'7_2'}];     // добавили фото → одна перерисовка
 vm.runInContext(srcFa,sb2);
 t('20) новые фото → ровно одна перерисовка',renders===2);
 sb2.state.screen='orders';             // ушли с экрана — перерисовки нет
 vm.runInContext(srcFa,sb2);
 t('21) не экран details → перерисовки нет',renders===2);
}

console.log(fails?'\nПРОВАЛОВ: '+fails:'\nВСЕ '+ (fails===0?'ТЕСТЫ ПРОЙДЕНЫ':''));
process.exit(fails?1:0);
