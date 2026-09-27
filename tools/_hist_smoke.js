// смоук: 📜 История заявки свёрнута в карточке, полная история — в модалке (openHistoryModal)
// Запуск из корня: node tools/_hist_smoke.js
const fs=require('fs');
const src=fs.readFileSync('index.html','utf8');
function grab(n){const i=src.indexOf('function '+n+'(');if(i<0)return null;const j=src.indexOf('\n}',i);return j<0?null:src.slice(i,j+2);}

const escapeHtml=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const money=n=>(+n||0).toLocaleString('ru')+' ₽';
const ST={new:{t:'Новая'},inwork:{t:'В работе'},completed:{t:'Выполнена'}};
const PAY_T={full:'Полная',prepay:'Предоплата'};
const PAY_M={cash:'Наличные',card:'Карта'};
const HIST_A={create:'Создана',take:'Взят в работу',edit:'Правка заявки',payment_received:'Платёж получен'};
let fail=0;
const ok=(c,msg)=>{console.log((c?'OK   — ':'FAIL — ')+msg);if(!c)fail=1;};

// --- моки прод-окружения ---
var DB={users:[{deviceId:'u1',name:'Оля'},{deviceId:'u2',name:'Аня'},{deviceId:'u4',name:'Вася'}]};
const ORD={id:77,status:'inwork',client:'Иван',history:[
  {ts:'2026-09-20T10:00:00',action:'create',by:'u1',details:{client:'Иван',sum:15000}},
  {ts:'2026-09-21T12:30:00',action:'take',by:'u4',details:{worker:'Вася'}},
  {ts:'2026-09-22T09:15:00',action:'payment_received',by:'u2',details:{sum:5000,type:'prepay',method:'cash',note:'<b>аванс</b>'}}
]};
var byId=id=>(ORD&&ORD.id===id)?ORD:null;   // в index.html это const — grab его не берёт
var modal='',lastAlert='';
function openModal(h){modal=h;}
function closeModal(){modal='';}
function alert(m){lastAlert=m;}
var PERM=true,OWNER=false;
function can(k){return k==='orders_history'&&PERM;}
function uiOwner(){return OWNER;}

for(const n of ['userNameById','histLine','historyBlock','histRows','openHistoryModal','histToggle']){
  const f=grab(n);if(!f){console.log('MISSING',n);fail=1;continue;}
  try{eval(f);}catch(e){console.log('EVAL FAIL',n,e.message);fail=1;}
}
if(fail)process.exit(1);

// 1. карточка: свёрнутый заголовок + счётчик, строк истории нет
var b=historyBlock(ORD);
ok(b.includes('📜 История'),'есть заголовок «📜 История»');
ok(/\(\s*3\s*\)/.test(b),'счётчик записей (3)');
ok(b.includes('onclick="openHistoryModal(77)"'),'клик по заголовку открывает модалку по id');
ok(b.includes('cursor:pointer'),'заголовок кликабельный (cursor:pointer)');
ok(!b.includes('hist-details'),'в карточке НЕТ раскрытых деталей записей');
ok(!b.includes('info-row'),'в карточке НЕТ строк истории (список свёрнут)');
ok(!b.includes('Событий пока нет'),'при непустой истории заглушки нет');
ok((b.match(/<div/g)||[]).length===(b.match(/<\/div>/g)||[]).length,'баланс div в карточке');

// 2. пустая история: счётчик (0), некликабельно, заглушка
var EMPTY={id:5,status:'new',history:[]};
var byId0=byId; byId=id=>(id===5?EMPTY:byId0(id));
var b2=historyBlock(EMPTY);
ok(/\(\s*0\s*\)/.test(b2),'пустая история: счётчик (0)');
ok(!b2.includes('onclick='),'пустая история: заголовок без onclick');
ok(b2.includes('Событий пока нет'),'пустая история: «Событий пока нет»');
byId=byId0;

// 3. права в карточке
PERM=false;
ok(historyBlock(ORD)==='','без orders_history секция не рендерится');
OWNER=true;
ok(historyBlock(ORD).includes('📜 История'),'владелец видит секцию без явного права');
PERM=true;OWNER=false;

// 4. модалка: полный список + оверлей + прокрутка + закрытие
modal='';
openHistoryModal(0);
ok(modal==='','несуществующая заявка — модалка не открывается');
openHistoryModal(77);
ok(modal.includes('История заявки №77'),'заголовок модалки с номером заявки');
ok(modal.includes('Создана')&&modal.includes('Взят в работу')&&modal.includes('Платёж получен'),'все 3 записи с человеческими названиями (HIST_A)');
ok(modal.includes('аванс')&&!modal.includes('<b>аванс</b>'),'details экранированы (escapeHtml)');
ok(modal.indexOf('Платёж получен')<modal.indexOf('Создана'),'свежие записи выше старых');
ok(modal.includes('Вася'),'исполнитель из истории подставлен по имени (userNameById)');
ok(/position:fixed/.test(modal)&&/inset:0/.test(modal)&&/z-index:99/.test(modal),'модалка — fixed-оверлей на весь экран');
ok(/display:flex/.test(modal)&&/align-items:center/.test(modal)&&/justify-content:center/.test(modal),'оверлей центрирует форму');
ok(modal.includes('rgba(0,0,0,.45)'),'фон затемнён');
ok(modal.includes('max-height:85vh')&&modal.includes('overflow-y:auto'),'модалка прокручивается при длинной истории');
ok(modal.includes('onclick="closeModal()"')&&modal.includes('Закрыть'),'есть кнопка «Закрыть»');
ok(modal.includes('if(event.target===this)closeModal()'),'клик по фону закрывает');
ok(modal.includes('event.stopPropagation()'),'клик по содержимому не закрывает');
ok((modal.match(/<div/g)||[]).length===(modal.match(/<\/div>/g)||[]).length,'баланс div в модалке');

// 5. история без права — модалка не открывается (защита прямого вызова)
PERM=false;modal='';lastAlert='';
openHistoryModal(77);
ok(modal==='','без orders_history модалка не открывается');
ok(/orders_history/.test(lastAlert),'при этом объясняющее alert() про право');
PERM=true;

console.log(fail?'\nHIST SMOKE: FAILS '+fail:'\nHIST SMOKE: ALL OK');
process.exit(fail?1:0);
