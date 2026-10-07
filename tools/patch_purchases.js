// patch_purchases.js — ЗАДАЧА B: закупки — списание брака и расходы за свой счёт.
// Правки ТОЛЬКО через якоря с проверкой вхождений (!=1 -> exit 1). UTF-8.
// НЕ трогаем: матрицу прав, CSS, sched, код Задачи A.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = 'index.html';
let src = fs.readFileSync(path.join(ROOT, HTML), 'utf8');

function cnt(str) { let n = 0, p = 0; while ((p = src.indexOf(str, p)) >= 0) { n++; p += str.length; } return n; }
// index.html живёт с CRLF, поэтому якоря/вставки с переводом строки пробуем и в LF, и в CRLF.
function crlfify(t) { return t.split(String.fromCharCode(10)).join(String.fromCharCode(13, 10)); }
function rep(label, anchor, next) {
  const variants = [[anchor, next], [crlfify(anchor), crlfify(next)]];
  for (const v of variants) {
    const c = cnt(v[0]);
    if (c === 1) { src = src.split(v[0]).join(v[1]); console.log('  + ' + label); return; }
    if (c > 1) { console.error('FATAL [' + label + ']: якорь найден ' + c + ' раз (нужно ровно 1). СТОП.'); process.exit(1); }
  }
  console.error('FATAL [' + label + ']: якорь найден 0 раз (нужно ровно 1). СТОП.');
  process.exit(1);
}
const applied = [];

// B1. HIST_A — новые действия
rep('B1 HIST_A',
  "decline_helper:'Отказ соисполнителя от участия'};",
  "decline_helper:'Отказ соисполнителя от участия',purchase_spoiled:'Испорчен',purchase_refund:'Компенсация'};");
applied.push('HIST_A: purchase_spoiled / purchase_refund');

// B2. histLine — человекочитаемые строки (CRLF-safe)
rep('B2 histLine',
  " else if(h.action==='decline_helper')txt='соисполнитель '+escapeHtml(d.helper||'')+' отказался: '+escapeHtml(d.reason||'—');\n return txt;",
  " else if(h.action==='decline_helper')txt='соисполнитель '+escapeHtml(d.helper||'')+' отказался: '+escapeHtml(d.reason||'—');\n" +
  " else if(h.action==='purchase_spoiled')txt='испорчен: '+escapeHtml(d.name||'')+' — '+escapeHtml(d.reason||'');\n" +
  " else if(h.action==='purchase_refund')txt='компенсация выплачена: '+escapeHtml(d.by||'');\n" +
  " return txt;");
applied.push('histLine: purchase_spoiled / purchase_refund');

// B3. matsSpent — испорченное НЕ входит в потраченное
rep('B3 matsSpent',
  "function matsSpent(o){return (o.materials||[]).filter(function(m){return m.status==='bought';}).reduce(function(s,m){return s+(m.factPrice!=null?+m.factPrice:(+m.price||0));},0);}",
  "function matsSpent(o){return (o.materials||[]).filter(function(m){return m.status==='bought'&&!m.spoiled;}).reduce(function(s,m){return s+(m.factPrice!=null?+m.factPrice:(+m.price||0));},0);}");
applied.push('matsSpent: исключение spoiled');

// B4. #sec-money — блок «Списания и свои средства» + итог
rep('B4 sec-money',
  " <div class=\"total\"><span>Итого</span><span style=\"color:var(--green)\">${money(total(o))}</span></div>",
  " <div class=\"total\"><span>Итого</span><span style=\"color:var(--green)\">${money(total(o))}</span></div>\n" +
  " <div id=\"sec-money-extras\">${moneyExtrasBlock(o)}</div>");
applied.push('sec-money: moneyExtrasBlock(o)');

// B5. Бейджи spoiled / payer в mat-head (строка 957)
rep('B5 badges',
  "<span class=\"badge\" style=\"background:${s.c};color:${s.tc}\">${s.t}</span></span></div>",
  "<span class=\"badge\" style=\"background:${s.c};color:${s.tc}\">${s.t}</span>${m.spoiled?'<span class=\"badge\" style=\"background:#fee2e2;color:#991b1b\">⚠️ испорчен</span>':''}${m.payer&&m.payer!=='company'?`<span class=\"badge\" style=\"background:#fef3c7;color:#92400e\">💳 свои: ${escapeHtml(m.payer)}</span>`:''}</span></div>");
applied.push('badges: spoiled / payer');

// B6. Кнопки «⚠️ Испорчен» и «💳 Компенсация» в строке материала (строка 962)
rep('B6 buttons',
  "<button class=\"btn-sm btn-red\" onclick=\"matAct(${o.id},${i},'issue')\">❌ Не найти</button>",
  "<button class=\"btn-sm btn-red\" onclick=\"matAct(${o.id},${i},'issue')\">❌ Не найти</button>\n" +
  " ${(uiOwner()||['admin','operator','manager'].includes(state.role)||o.by===state.user)?`<button class=\"btn-sm btn-outline\" onclick=\"markSpoiled(${o.id},${i})\">⚠️ Испорчен</button>`:''}\n" +
  " ${m.payer&&m.payer!=='company'&&m.refund!=='paid'&&uiOwner()?`<button class=\"btn-sm btn-green\" onclick=\"refundCompensation(${o.id},${i})\">💳 Компенсация: ${m.refund==='pending'?'ожидает':'нет'}</button>`:''}");
applied.push('row: кнопки spoiled / refund');

// B7. #matform — селект «Оплачено:» (строка 972)
rep('B7 matform',
  "<select class=\"input\" id=\"mf-buyer\" style=\"margin-bottom:6px\">${Object.keys(BUYER).map(k=>`<option value=\"${k}\">${BUYER[k]}</option>`).join('')}</select>",
  "<select class=\"input\" id=\"mf-buyer\" style=\"margin-bottom:6px\">${Object.keys(BUYER).map(k=>`<option value=\"${k}\">${BUYER[k]}</option>`).join('')}</select>\n" +
  "<select class=\"input\" id=\"mf-payer\" style=\"margin-bottom:6px\"><option value=\"company\">Оплачено: Компания</option>${Object.keys(activeWorkers()).map(function(w){return '<option value=\"'+escapeHtml(w)+'\">Оплачено: '+escapeHtml(w)+'</option>';}).join('')}</select>");
applied.push('matform: payer select');

// B8. matEdit — поле payer (строка 1833, конкатенация, не template-literal)
rep('B8 matEdit',
  "'<select class=\"input\" id=\"me-buyer\" style=\"margin-bottom:6px\">'+Object.keys(BUYER).map(function(k){return '<option value=\"'+k+'\"'+((m.buyer||'worker')===k?' selected':'')+'>'+BUYER[k]+'</option>';}).join('')+'</select>'+",
  "'<select class=\"input\" id=\"me-buyer\" style=\"margin-bottom:6px\">'+Object.keys(BUYER).map(function(k){return '<option value=\"'+k+'\"'+((m.buyer||'worker')===k?' selected':'')+'>'+BUYER[k]+'</option>';}).join('')+'</select>'+\n" +
  "'<select class=\"input\" id=\"me-payer\" style=\"margin-bottom:6px\"><option value=\"company\"${m.payer==='company'?' selected':''}>Оплачено: Компания</option>'+Object.keys(activeWorkers()).map(function(w){return '<option value=\"'+escapeHtml(w)+'\"'+(m.payer===w?' selected':'')+'>Оплачено: '+escapeHtml(w)+'</option>';}).join('')+'</select>'+");
applied.push('matEdit: payer select');

// B9. matSave — сохранение payer (строка 1845)
rep('B9 matSave',
  "m.munit=g('me-munit')||m.munit||'pcs';m.buyer=g('me-buyer')||m.buyer;m.where=g('me-where');",
  "m.munit=g('me-munit')||m.munit||'pcs';m.buyer=g('me-buyer')||m.buyer;m.where=g('me-where');\n var np=g('me-payer');if(np)m.payer=np;");
applied.push('matSave: payer сохранение');

// B10. addMat — payer по умолчанию, refund=pending если свои (строка 1863)
rep('B10 addMat',
  "byId(id).materials.push({name:g('mf-name'),qty:g('mf-qty')||'1',price:+g('mf-price')||0,munit:g('mf-munit')||'pcs',buyer:g('mf-buyer'),where:g('mf-where'),deadline:+g('mf-dl')||3,unit:g('mf-unit'),status:'todo'});",
  "byId(id).materials.push({name:g('mf-name'),qty:g('mf-qty')||'1',price:+g('mf-price')||0,munit:g('mf-munit')||'pcs',buyer:g('mf-buyer'),where:g('mf-where'),deadline:+g('mf-dl')||3,unit:g('mf-unit'),status:'todo',payer:g('mf-payer')||'company',refund:(g('mf-payer')||'company')!=='company'?'pending':'none'});");
applied.push('addMat: payer/refund');

// B11. addNewMat — payer по умолчанию, refund=pending если свои (строка 1868)
rep('B11 addNewMat',
  "state.newMats.push({name:g('nm-name'),qty:g('nm-qty')||'1',price:+g('nm-price')||0,munit:g('nm-munit')||'pcs',buyer:g('nm-buyer'),where:g('nm-where'),deadline:+g('nm-dl')||3,unit:g('nm-unit'),status:'todo'});",
  "state.newMats.push({name:g('nm-name'),qty:g('nm-qty')||'1',price:+g('nm-price')||0,munit:g('nm-munit')||'pcs',buyer:g('nm-buyer'),where:g('nm-where'),deadline:+g('nm-dl')||3,unit:g('nm-unit'),status:'todo',payer:g('nm-payer')||'company',refund:(g('nm-payer')||'company')!=='company'?'pending':'none'});");
applied.push('addNewMat: payer/refund');

// B12. Функции: moneyExtrasBlock, markSpoiled, refundCompensation
rep('B12 functions',
  "// === СОИСПОЛНИТЕЛЬ: конец ===\nfunction renderCreate(){",
  "// === СОИСПОЛНИТЕЛЬ: конец ===\n" +
  "// === ЗАКУПКИ: брак и свои средства ===\n" +
  "function moneyExtrasBlock(o){\n" +
  " var spoiled=[],other=[],totalRef=0;\n" +
  " (o.materials||[]).forEach(function(m){if(m.spoiled)spoiled.push(m);else if(m.payer&&m.payer!=='company'&&m.refund!=='paid')other.push(m);});\n" +
  " if(!spoiled.length&&!other.length)return '';\n" +
  " var rows='<div class=\"muted\" style=\"margin-top:6px\">';\n" +
  " spoiled.forEach(function(m){rows+='⚠️ '+escapeHtml(m.name)+' — '+escapeHtml(m.spoiled.reason)+'<br>';});\n" +
  " other.forEach(function(m){rows+='💳 '+escapeHtml(m.name)+' (свои: '+escapeHtml(m.payer)+') — '+money(m.price)+'<br>'; totalRef+=+m.price;});\n" +
  " rows+='</div>';\n" +
  " return '<div style=\"margin-top:8px;padding:8px;background:rgba(255,255,255,.04);border-radius:6px\">'+rows+'<b>К компенсации: '+money(totalRef)+' ₽</b></div>'\n" +
  "}\n" +
  "function markSpoiled(id,i){\n" +
  " var o=byId(id);if(!o)return;\n" +
  " if(!uiOwner()&&!(typeof can!=='function'&&['admin','operator','manager'].includes(state.role))&&!(o.by&&o.by===state.user))return alert('Нет права');\n" +
  " var reason=prompt('Причина брака (обязательна):');if(!reason||!reason.trim())return alert('Укажите причину');\n" +
  " o.materials[i].spoiled={reason:reason.trim(),dt:new Date().toISOString(),by:state.user};\n" +
  " logAction(o,'purchase_spoiled',{name:o.materials[i].name,reason:reason.trim()});\n" +
  " markOrder(o);save();render();\n" +
  "}\n" +
  "function refundCompensation(id,i){\n" +
  " var o=byId(id);if(!o)return;\n" +
  " if(!uiOwner()&&!(typeof can!=='function'&&['admin','operator','manager'].includes(state.role)))return alert('Нет права');\n" +
  " var m=(o.materials||[])[i];if(!m||!m.payer||m.payer==='company')return;\n" +
  " m.refund='paid';\n" +
  " logAction(o,'purchase_refund',{by:m.payer});\n" +
  " markOrder(o);save();render();\n" +
  "}\n" +
  "// === ЗАКУПКИ: конец ===\n" +
  "function renderCreate(){");
applied.push('functions: moneyExtrasBlock / markSpoiled / refundCompensation');

fs.writeFileSync(path.join(ROOT, HTML), src, 'utf8');
console.log('\n✓ patch_purchases.js применён к index.html:');
applied.forEach(function(x){ console.log('  • ' + x); });
console.log('\nПримечания:');
console.log('  • matsSpent исключает spoiled (логика profitOf не ломается).');
console.log('  • moneyExtrasBlock показывает испорченные + свои средства; итог «К компенсации» считает только refund!=="paid".');
console.log('  • Бейджи и кнопки добавлены в строку материала без изменения структуры карточки.');
console.log('  • create/edit заявок автоматически ставят payer="company" и refund="pending" если выбран сотрудник.');