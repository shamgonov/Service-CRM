// смоук: редактирование/удаление доп. работ и материалов + кнопка «🧩 Этапы схемы»
// Функции извлекаются из index.html по балансу скобок; DOM и права — моки.
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
let confirmAnswer=true;
global.alert=m=>{alerts.push(String(m));};
global.confirm=m=>{confirms.push(String(m));return confirmAnswer;};
// --- мок DOM: значения полей модалок ---
const FIELDS={};
global.document={getElementById:id=>({get value(){return FIELDS[id]!=null?String(FIELDS[id]):'';},set value(v){FIELDS[id]=v;},style:{},classList:{toggle(){},add(){},remove(){},contains(){return false;}},parentNode:{querySelectorAll:()=>[]}})};
// --- моки окружения (до eval) ---
const state={user:'Влад',role:'worker'};
let OWNER=false;let CANS={};
const isSim=()=>false, isOwner=()=>OWNER, uiOwner=()=>OWNER;
const can=p=>!!CANS[p];
const isOrderEditor=o=>OWNER||!!CANS.orders_edit||(o&&o.by===state.user);
const DB={orders:[]};
const byId=id=>DB.orders.find(x=>x.id==id);
const escapeHtml=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const UNITS={pcs:'шт',m:'пог. м',m2:'м²',kg:'кг',l:'л',h:'час'};
const BUYER={worker:'Работник перед выездом',manager:'Диагност/менеджер',delivery:'Доставка на адрес',stock:'Есть на складе'};
const unitLabel=u=>UNITS[u]||UNITS.pcs;
const money=n=>(+n||0).toLocaleString('ru-RU')+' ₽';
const unitSel=(id,cur)=>'<select id="'+id+'">'+Object.keys(UNITS).map(k=>'<option value="'+k+'"'+((cur||'pcs')===k?' selected':'')+'>'+UNITS[k]+'</option>').join('')+'</select>';
let modal=null;
const openModal=h=>{modal=h;}, closeModal=()=>{modal=null;};
const logSpy=[];
const logAction=(o,a,d)=>{logSpy.push({action:a,details:d});};
let saveCalls=0, renderCalls=0;
const markOrder=o=>{o.updatedTs=1;}, save=()=>{saveCalls++;}, render=()=>{renderCalls++;};
const isInwork=o=>!!o&&(o.status==='inwork'||o.status==='in_progress');
const isMyInwork=o=>!!o&&isInwork(o)&&o.worker===state.user;
const isMeName=nm=>!!nm&&nm===state.user;
const normalizeOrder=o=>{['works','extras','materials','payments','stages','history'].forEach(k=>{if(!Array.isArray(o[k]))o[k]=[];});};
for(const n of ['canEditWorks','canShopMats','extraEdit','extraSave','matEdit','matSave','matDel','toggleStages','delExtra']){
 const f=grab(n);
 if(!f){console.log('MISSING',n);fail=1;continue;}
 try{eval(f);}catch(e){console.log('EVAL FAIL',n,e.message);fail=1;}
}
if(fail)process.exit(1);
const t=(name,ok)=>{console.log((ok?'OK  ':'FAIL')+' — '+name);if(!ok)fail=1;};
const mk=over=>Object.assign({id:1,status:'inwork',worker:'Влад',by:'Клиент',works:[],
 extras:[{name:'Демонтаж',price:300,qty:2,unit:'pcs'}],
 materials:[{name:'Клей',qty:'2',price:300,munit:'kg',buyer:'worker',where:'Стройсклад',status:'todo'}],
 stages:[],history:[]},over);

// ===== extras: ✏️ модалка + сохранение =====
DB.orders=[mk({})];
CANS={};
extraEdit(1,0);
t('extras: модалка открылась у исполнителя', !!modal&&/ex-name/.test(modal||''));
t('extras: поля заполнены текущими значениями', /value="Демонтаж"/.test(modal)&&/value="2"/.test(modal)&&/value="300"/.test(modal));
t('extras: в модалке есть выбор единицы', /ex-unit/.test(modal)&&modal.includes('м²'));
FIELDS['ex-name']='Демонтаж VA-2';FIELDS['ex-qty']='3';FIELDS['ex-price']='450';FIELDS['ex-unit']='m2';
logSpy.length=0;saveCalls=0;modal='X';
extraSave(1,0);
const e0=DB.orders[0].extras[0];
t('extras: имя сохранено', e0.name==='Демонтаж VA-2');
t('extras: qty сохранено (влияет на total)', e0.qty===3);
t('extras: price сохранено', e0.price===450);
t('extras: unit сохранён', e0.unit==='m2');
t('extras: closeModal вызван', modal===null);
t('extras: save+render вызваны', saveCalls>0&&renderCalls>0);
t('extras: запись в истории', logSpy.some(l=>l.action==='edit'&&/доп\. работа изменена/.test(l.details.fields.join())));
alerts.length=0;FIELDS['ex-name']='   ';
extraSave(1,0);
t('extras: пустое имя отклонено', alerts.some(a=>/наименование/i.test(a))&&DB.orders[0].extras[0].name==='Демонтаж VA-2');
// чужая заявка без права
CANS={};
DB.orders=[mk({id:2,worker:'Петр'})];
alerts.length=0;modal=null;
extraEdit(2,0);
t('extras: чужая заявка — отказ (нет права)', modal===null&&alerts.some(a=>/orders_edit/.test(a)));
// delExtra по-прежнему работает
CANS={};
DB.orders=[mk({id:3})];
confirmAnswer=true;delExtra(3,0);
t('extras: ✕ удаляет строку', DB.orders.find(o=>o.id===3).extras.length===0);
confirmAnswer=false;
DB.orders=[mk({id:4})];
delExtra(4,0);
t('extras: ✕ с отменой confirm ничего не удалил', DB.orders.find(o=>o.id===4).extras.length===1);
confirmAnswer=true;

// ===== materials: ✏️ модалка + сохранение =====
DB.orders=[mk({id:5})];
CANS={};
matEdit(5,0);
t('материалы: модалка открылась', !!modal&&/me-name/.test(modal||''));
t('материалы: поля заполнены', /value="Клей"/.test(modal)&&/value="2"/.test(modal)&&/value="300"/.test(modal)&&/Стройсклад/.test(modal));
t('материалы: есть поставщик (buyer)', /me-buyer/.test(modal)&&modal.includes('Доставка на адрес'));
FIELDS['me-name']='Клей супер';FIELDS['me-qty']='5';FIELDS['me-price']='350';FIELDS['me-munit']='l';FIELDS['me-buyer']='delivery';FIELDS['me-where']='База';
logSpy.length=0;modal='X';
matSave(5,0);
const m0=DB.orders.find(o=>o.id===5).materials[0];
t('материалы: имя сохранено', m0.name==='Клей супер');
t('материалы: qty сохранено', String(m0.qty)==='5');
t('материалы: price сохранено', m0.price===350);
t('материалы: munit сохранён', m0.munit==='l');
t('материалы: поставщик сохранён', m0.buyer==='delivery');
t('материалы: where сохранён', m0.where==='База');
t('материалы: closeModal вызван', modal===null);
t('материалы: запись в истории', logSpy.some(l=>l.action==='edit'&&/материал изменён/.test(l.details.fields.join())));
CANS={};
DB.orders=[mk({id:6,worker:'Петр'})];
alerts.length=0;modal=null;
matEdit(6,0);
t('материалы: чужая заявка без shopping — отказ', modal===null&&alerts.some(a=>/shopping/.test(a)));

// ===== materials: ✕ удаление =====
CANS={};
DB.orders=[mk({id:7})];
alerts.length=0;matDel(7,0);
t('материалы: ✕ удалил todo-материал', DB.orders.find(o=>o.id===7).materials.length===0);
DB.orders=[mk({id:8,materials:[{name:'Купленный',qty:'1',price:100,munit:'pcs',buyer:'worker',status:'bought',factPrice:120}]})];
alerts.length=0;matDel(8,0);
t('материалы: bought удалить нельзя', DB.orders.find(o=>o.id===8).materials.length===1);
t('материалы: алерт про «уже в факте»', alerts.some(a=>/факт/i.test(a)));
confirmAnswer=false;
DB.orders=[mk({id:9})];
matDel(9,0);
t('материалы: ✕ с отменой confirm ничего не удалил', DB.orders.find(o=>o.id===9).materials.length===1);
confirmAnswer=true;

// ===== кнопка «🧩 Этапы схемы» =====
DB.orders=[mk({id:9,state:undefined})];
const o9=DB.orders.find(o=>o.id===9);
t('этапы: toggleStages открывает', (function(){state.stagesOpen=null;toggleStages(9);return state.stagesOpen===9;})());
t('этапы: повторный клик закрывает', (function(){toggleStages(9);return state.stagesOpen===null;})());
t('этапы: другой id переключает фокус', (function(){state.stagesOpen=9;toggleStages(10);return state.stagesOpen===10;})());

// ===== целостность суммы после правки =====
DB.orders=[mk({id:11,works:[{title:'Плитка',qty:10,price:500,unit:'m2'}],extras:[{name:'Демонтаж',price:300,qty:2,unit:'pcs'}]})];
const totalLocal=o=>(o.works||[]).filter(x=>!x.skipped).reduce((s,x)=>s+(+x.price||0)*(+x.qty||1),0)+(o.extras||[]).reduce((s,x)=>s+(+x.price||0)*(+x.qty||1),0);
const before=totalLocal(DB.orders.find(o=>o.id===11));
FIELDS['ex-name']='Демонтаж';FIELDS['ex-qty']='4';FIELDS['ex-price']='300';FIELDS['ex-unit']='pcs';
extraSave(11,0);
const after=totalLocal(DB.orders.find(o=>o.id===11));
t('сумма: до правки 5600', before===5600);
t('сумма: после qty 2→4 стало 6200', after===6200);

console.log(fail?'\nEDIT SMOKE: FAIL':'\nEDIT SMOKE: ALL OK');
process.exit(fail?1:0);
