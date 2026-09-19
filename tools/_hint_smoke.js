// смоук пакета D: nextActionHint/чек-лист/пульс по сценариям валидации
const fs=require('fs');
const src=fs.readFileSync('index.html','utf8');
function grab(n){const i=src.indexOf('function '+n+'(');if(i<0)return null;const j=src.indexOf('\n}',i);return j<0?null:src.slice(i,j+2);}
const money=n=>(+n||0).toLocaleString('ru')+' ₽';
const escapeHtml=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const total=o=>{var ex=(o.extras||[]).reduce((s,e)=>s+(+e.price||0),0);var m=o.matsInTotal?(o.materials||[]).reduce((s,x)=>s+(+x.price||0),0):0;if((o.works||[]).length)return (o.works||[]).filter(x=>!x.skipped).reduce((s,x)=>s+(+x.price||0)*(+x.qty||1),0)+ex+m;return (+o.price||0)+ex+m;};
const totalPaid=o=>(o.payments||[]).filter(p=>p.type!=='materials').reduce((s,p)=>s+(+p.sum||0),0);
const rewardOf=o=>({type:'percent',value:10,sum:Math.round(total(o)*10/100)});
let fail=0;
for(const n of ['hintsOn','nextActionHint','hintCls','hintData','hintBarHtml','finishChecklistRows']){
  const f=grab(n);if(!f){console.log('MISSING',n);fail=1;continue;}
  try{eval(f);}catch(e){console.log('EVAL FAIL',n,e.message);fail=1;}
}
if(fail)process.exit(1);
// окружение
var ME={profile:{hints:true}};
var state={user:'Влад'};
var isInwork=o=>o.status==='inwork';
var orderType=o=>o.type||'standard';
const mk=()=>({id:9,status:'inwork',worker:'Влад',type:'standard',price:10000,
  stages:[{id:'st_call',title:'Созвон',done:true},{id:'st_left',title:'Выехал',done:false},{id:'st_pay',title:'Оплата',done:false,autoOnly:true},{id:'st_done',title:'Завершить',done:false,autoOnly:true}],
  materials:[{name:'Клей',qty:1,price:500,status:'todo'}],payments:[]});
// С1: открытый этап → stage-0
let o=mk();
console.log('1) этап открыт → hint:',JSON.stringify(nextActionHint(o).k),nextActionHint(o).txt,'| pulse stage-0:',hintCls(o,'stage',1).trim()==='hint-pulse');
// (индекс этапа в o.stages: st_left = 1)
console.log('   data-hint:',JSON.stringify(hintData(o,'stage',1)));
// С2: закрыть этап → mat-0 «Куплено»
o.stages[1].done=true;
console.log('2) этап закрыт → hint:',nextActionHint(o).k,'| pulse mat-0:',hintCls(o,'mat',0).trim()==='hint-pulse');
// С3: закупить → pay
o.materials[0].status='bought';
console.log('3) закушено → hint:',nextActionHint(o).k,'| pulse pay:',hintCls(o,'pay',0).trim()==='hint-pulse','|',nextActionHint(o).txt);
// С4: оплатить полностью → done
o.payments.push({sum:10000,type:'full'});
console.log('4) оплачено → hint:',nextActionHint(o).k,'| pulse done:',hintCls(o,'done',0).trim()==='hint-pulse','|',nextActionHint(o).txt);
// С5: чек-лист при незакрытом
o=mk();
let rows=finishChecklistRows(o);
console.log('5) чек-лист warn:',rows.warn.map(w=>w.t).join(','),'| ok:',rows.ok.map(t=>t).join(','));
// всё готово → warn пуст
o.stages.forEach(s=>{if(!s.autoOnly)s.done=true;});o.materials[0].status='bought';o.payments.push({sum:10000,type:'full'});
rows=finishChecklistRows(o);
console.log('6) всё готово → warn:',rows.warn.length,'(ожид.0) ok:',rows.ok.length,'(ожид.4)');
// С6: hints выкл → тишина
ME.profile.hints=false;
console.log('7) hints=off → bar:',JSON.stringify(hintBarHtml(o)),'| pulse:','"'+hintCls(o,'done',0)+'"');
ME.profile.hints=true;
// не inwork / чужой → тишина
o.status='completed';
console.log('8) completed → bar:',JSON.stringify(hintBarHtml(o)));
o.status='inwork';o.worker='Чужой';
console.log('9) чужой worker → bar:',JSON.stringify(hintBarHtml(o)));
// reward не рассчитан → warn
o=mk();o.worker='Влад';
const r2=finishChecklistRows(o);
console.log('10) reward warn есть:',r2.warn.some(w=>w.t==='Вознаграждение'));
