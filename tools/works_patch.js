// === СМЕТА: строки работ, автосумма, память пресетов, факт материалов ===
function worksMemory(title,price){
if(!title)return;
var t=(DB.templates||[]).find(function(x){return x.name.toLowerCase()===String(title).toLowerCase();});
if(!t&&confirm('Сохранить услугу «'+title+'» с ценой '+(+price||0)+' ₽ в шаблоны?')){DB.templates=DB.templates||[];DB.templates.push({id:'t'+Date.now(),name:title,price:+price||0});save();}
}
function worksAddTpl(i){var t=DB.templates[i];if(!t)return;state.newWorks=state.newWorks||[];var ex=state.newWorks.find(function(x){return x.title===t.name;});if(ex){state.newWorks=state.newWorks.filter(function(x){return x!==ex;});}else{state.newWorks.push({id:'w'+Date.now(),title:t.name,qty:1,price:+t.price||0,done:false,skipped:false});}worksRenderCreate();}
function worksAddManual(){var g=function(x){return (document.getElementById(x)||{value:''}).value;};var ti=g('nw-title').trim();if(!ti)return alert('Укажите наименование');var q=+g('nw-qty')||1;var p=+g('nw-price')||0;worksMemory(ti,p);state.newWorks=state.newWorks||[];state.newWorks.push({id:'w'+Date.now(),title:ti,qty:q,price:p,done:false,skipped:false});document.getElementById('nw-title').value='';document.getElementById('nw-price').value='';document.getElementById('nw-qty').value='1';worksRenderCreate();}
function worksDelNew(i){state.newWorks.splice(i,1);worksRenderCreate();}
function worksRenderCreate(){var el=document.getElementById('newworks');if(!el)return;var w=state.newWorks||[];el.innerHTML=w.map(function(x,i){return '<div class="info-row"><span>'+escapeHtml(x.title)+(x.qty&&x.qty!=1?' ×'+x.qty:'')+'</span><span style="display:flex;gap:8px;align-items:center"><b>'+money((+x.price||0)*(+x.qty||1))+'</b><span style="cursor:pointer;color:var(--red)" onclick="worksDelNew('+i+')">✕</span></span></div>';}).join('')+(w.length?'<div class="total"><span>Сумма сметы</span><span style="color:var(--green)">'+money(w.filter(function(x){return !x.skipped;}).reduce(function(s,x){return s+(+x.price||0)*(+x.qty||1);},0))+'</span></div>':'');}
function worksCard(o){
var canEd=(typeof isOrderEditor==='function'&&isOrderEditor(o))||(o.worker&&o.worker===state.user&&isInwork(o));
var w=o.works||[];
if(!w.length&&!canEd)return '';
var html='<div class="card"><div class="sec-title">🔧 Работы (смета/факт)</div>';
html+=w.map(function(x,i){return '<div class="info-row" style="align-items:center"><span style="'+(x.skipped?'text-decoration:line-through;color:#999':'')+'">'+(x.done?'✅ ':x.skipped?'⛔ ':'◻ ')+escapeHtml(x.title)+(x.qty&&x.qty!=1?' ×'+x.qty:'')+'</span><span style="display:flex;gap:6px;align-items:center"><b>'+money((+x.price||0)*(+x.qty||1))+'</b>'+(canEd?'<span style="cursor:pointer" onclick="worksDone('+o.id+','+i+')">'+(x.done?'↩':'✅')+'</span><span style="cursor:pointer;color:var(--red)" onclick="worksSkip('+o.id+','+i+')">'+(x.skipped?'↩':'')+'</span><span style="cursor:pointer;color:var(--red)" onclick="worksDel('+o.id+','+i+')">✕</span>':'')+'</span></div>';}).join('');
html+='<div class="total"><span>Итого</span><span style="color:var(--green)">'+money(total(o))+'</span></div>';
if(canEd)html+='<div class="row2" style="margin-top:6px"><input class="input" id="wa-title" placeholder="Работа (доп)"><input class="input" id="wa-qty" value="1" style="max-width:60px"><input class="input" id="wa-price" type="number" placeholder="Цена ₽"><button class="btn-sm btn-green" style="flex:none" onclick="worksAddTo('+o.id+')">＋</button></div>';
return html+'</div>';
}
function worksDone(id,i){var o=byId(id);if(!o)return;var x=(o.works||[])[i];if(!x)return;x.done=!x.done;x.ts=x.done?Date.now():null;markOrder(o);save();render();}
function worksSkip(id,i){var o=byId(id);if(!o)return;var x=(o.works||[])[i];if(!x)return;x.skipped=!x.skipped;markOrder(o);save();render();}
function worksDel(id,i){var o=byId(id);if(!o)return;if(!confirm('Удалить строку сметы?'))return;o.works.splice(i,1);markOrder(o);save();render();}
function worksAddTo(id){var o=byId(id);if(!o)return;var g=function(x){return (document.getElementById(x)||{value:''}).value;};var ti=g('wa-title').trim();if(!ti)return alert('Укажите наименование');var q=+g('wa-qty')||1;var p=+g('wa-price')||0;worksMemory(ti,p);o.works=o.works||[];o.works.push({id:'w'+Date.now(),title:ti,qty:q,price:p,done:false,skipped:false});markOrder(o);save();render();}
function worksSummary(o){
var w=o.works||[];
if(!w.length)return '<div class="info-row"><span>Основная работа</span><b>'+money(o.price)+'</b></div>';
return w.map(function(x){return '<div class="info-row"><span style="'+(x.skipped?'text-decoration:line-through;color:#999':'')+'">'+(x.skipped?'⛔ ':x.done?'✅ ':'◻ ')+escapeHtml(x.title)+(x.qty&&x.qty!=1?' ×'+x.qty:'')+'</span><b>'+money((+x.price||0)*(+x.qty||1))+'</b></div>';}).join('');
}
function matsSpent(o){return (o.materials||[]).filter(function(m){return m.status==='bought';}).reduce(function(s,m){return s+(m.factPrice!=null?+m.factPrice:(+m.price||0));},0);}
function profitOf(o){return total(o)-matsSpent(o);}