// смоук пакета C: таблицы/итоги сметы и акта (grep-верифицированные копии функций из index.html)
const fs=require('fs');
const UNITS={pcs:'шт',m:'пог. м',m2:'м²',kg:'кг',l:'л',h:'час'};
const unitLabel=u=>UNITS[u]||UNITS.pcs;
const money=n=>(+n||0).toLocaleString('ru')+' ₽';
const escapeHtml=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const total=o=>{var ex=(o.extras||[]).reduce((s,e)=>s+(+e.price||0),0);var m=o.matsInTotal?(o.materials||[]).reduce((s,x)=>s+(+x.price||0),0):0;if((o.works||[]).length)return (o.works||[]).filter(x=>!x.skipped).reduce((s,x)=>s+(+x.price||0)*(+x.qty||1),0)+ex+m;return (+o.price||0)+ex+m;};
const src=fs.readFileSync('index.html','utf8');
function grab(n){const i=src.indexOf('function '+n+'(');if(i<0)return null;const j=src.indexOf('\n}',i);return j<0?null:src.slice(i,j+2);}
let fail=0;
for(const n of ['docWorksRows','docWorksRowsDone','docMatsRowsPlan','docMatsRowsFact','docActTotal','docPerm','docOrg','docCreatedTs','docCompletedTs','docSignHtml','docText','docPrint','docShare','docCopy','docDownload','saveOrg','docEstimate','docAct','docShell','docActionsHtml','docHeadHtml','docReopen']){
  const f=grab(n);
  if(!f){console.log('MISSING',n);fail=1;continue;}
  try{eval(f);}catch(e){console.log('EVAL FAIL',n,e.message);fail=1;}
}
if(fail)process.exit(1);
const state={user:'Влад',role:'owner'};
global.state=state;
const isOwner=()=>true;
const DB={settings:{org:{name:'ООО Ромашка',inn:'123',phone:'+7',signer:'Петров П.'}}};
global.DB=DB;
const o={id:5,client:'Тест',worker:'Влад',diagnostician:null,by:'Влад',phone:'+7 900',address:'ул. Ленина 1',
  works:[{title:'Плитка',qty:10,price:500,unit:'m2',done:true},{title:'Плинтус',qty:8,price:200,unit:'m',done:false},{title:'Лишнее',qty:1,price:100,unit:'pcs',skipped:true,done:false}],
  materials:[{name:'Клей',qty:2,price:300,munit:'kg',status:'bought',factPrice:350},{name:'Грунт',qty:1,price:400,munit:'l',status:'todo'}],
  matsInTotal:false,status:'completed',
  history:[{ts:'2026-09-01T10:00:00.000Z',action:'create'},{ts:'2026-09-05T10:00:00.000Z',action:'status_change',details:{from:'inwork',to:'completed'}}]};
const est=docWorksRows(o.works.filter(x=>!x.skipped));
const act=docWorksRowsDone(o);
console.log('EST rows:',(est.match(/<tr>/g)||[]).length,'| м²:',est.includes('10 м²'),'| пог. м:',est.includes('8 пог. м'),'| no skipped:',!est.includes('Лишнее'));
console.log('ACT rows:',(act.match(/<tr>/g)||[]).length,'| only done:',act.includes('Плитка')&&!act.includes('Плинтус'));
const fact=docMatsRowsFact(o);
console.log('MAT fact: only bought:',fact.includes('Клей')&&!fact.includes('Грунт'),'| factPrice 350:',fact.includes('350'));
console.log('EST total:',money(total(o)),'(ожид. 6 600 ₽):',money(total(o))==='6\u00A0600 ₽'||money(total(o))==='6 600 ₽');
console.log('ACT total:',money(docActTotal(o)),'(ожид. 5 700 ₽):',money(docActTotal(o))==='5\u00A0700 ₽'||money(docActTotal(o))==='5 700 ₽');
global.byId=id=>DB.orders.find(x=>x.id==id);
DB.orders=[o];
console.log('docPerm owner:',docPerm(o)===true);
console.log('docPerm чужой:',docPerm(Object.assign({},o,{worker:'X',by:'X',diagnostician:'X'}))===false);
console.log('docCreatedTs:',new Date(docCreatedTs(o)).toISOString().slice(0,10));
console.log('docCompletedTs:',new Date(docCompletedTs(o)).toISOString().slice(0,10));
// docText: полный прогон
state.docKind='estimate';state.docId=5;
console.log('--- docText (estimate) ---');
console.log(docText());
state.docKind='act';
console.log('--- docText (act) ---');
console.log(docText());
// docShell/docEstimate/docAct — DOM-зависимы (openModal), проверяем только что inner собирается без исключений:
// подменяем openModal
global.openModal=h=>{global.__lastModal=h;};
global.closeModal=()=>{};
docEstimate(5);console.log('docEstimate modal len:',(global.__lastModal||'').length,'| has ИТОГО:',global.__lastModal.includes('ИТОГО'));
docAct(5);console.log('docAct modal len:',(global.__lastModal||'').length,'| has Дата выполнения:',global.__lastModal.includes('Дата выполнения'),'| has Работы принял:',global.__lastModal.includes('Работы принял'));
// акт для незавершённой — не должен открывать модалку
global.__lastModal='';
docAct(6);console.log('act blocked for non-completed (no modal):',global.__lastModal==='');
