// patch_confirm_helper.js — ЗАДАЧА A: соисполнитель — подтверждение участия + уведомления.
// Правки ТОЛЬКО через якоря с проверкой вхождений (!=1 -> exit 1). UTF-8.
// ВАЖНО: гейт «Взять в работу» (showTakeBtn) НЕ меняем — добавляем ОТДЕЛЬНУЮ
// кнопку «✅ Подтвердить участие» рядом (запрет на изменение гейта/семантики worker/status).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = 'index.html';
let src = fs.readFileSync(path.join(ROOT, HTML), 'utf8');

function cnt(str) { let n = 0, p = 0; while ((p = src.indexOf(str, p)) >= 0) { n++; p += str.length; } return n; }
// index.html живёт с CRLF, поэтому якоря/вставки с переводом строки пробуем и в LF, и в CRLF.
// split/join вместо replace — чтобы $-последовательности в шаблонных вставках не интерпретировались.
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

// A1. HIST_A — новые действия
rep('A1 HIST_A',
  "late:'Задержка (звонок клиенту)',conflict_accept:'Конфликт принят'};",
  "late:'Задержка (звонок клиенту)',conflict_accept:'Конфликт принят',accept_helper:'Принято участие соисполнителя',decline_helper:'Отказ соисполнителя от участия'};");
applied.push('HIST_A: accept_helper / decline_helper');

// A2. histLine — человекочитаемые строки
rep('A2 histLine',
  " else if(h.action==='edit')txt=(d.fields||[]).join(', ');\n return txt;",
  " else if(h.action==='edit')txt=(d.fields||[]).join(', ');\n" +
  " else if(h.action==='accept_helper')txt='соисполнитель '+escapeHtml(d.helper||'')+' подтвердил участие';\n" +
  " else if(h.action==='decline_helper')txt='соисполнитель '+escapeHtml(d.helper||'')+' отказался: '+escapeHtml(d.reason||'—');\n" +
  " return txt;");
applied.push('histLine: кейсы accept_helper / decline_helper');

// A3. Вспомогательная функция isHelperPending — рядом с helpersOf
rep('A3 isHelperPending',
  "function helpersOf(o){ return Array.isArray(o.helpers)? o.helpers.slice() : []; }",
  "function helpersOf(o){ return Array.isArray(o.helpers)? o.helpers.slice() : []; }\n" +
  "// соисполнитель, ждущий подтверждения участия по этой заявке (я — он)\n" +
  "function isHelperPending(o){\n" +
  " if(!o||!Array.isArray(o.helpers))return false;\n" +
  " if(o.helpers.indexOf(state.user)<0)return false;\n" +
  " if(['completed','paid','canceled'].indexOf(o.status)>=0)return false;\n" +
  " return (o.confirm&&o.confirm[state.user])==='pending';\n" +
  "}");
applied.push('isHelperPending()');

// A4. doSaveOrder — confirm='pending' для назначенных соисполнителей
rep('A4 doSaveOrder confirm',
  "   helpers:readHelpers('c'),",
  "   helpers:readHelpers('c'),\n" +
  "   confirm:(function(){var c={};readHelpers('c').forEach(function(n){if(n)c[n]='pending';});return c;})(),");
applied.push('doSaveOrder: confirm[pending] для helpers');

// A5. doEditOrder — confirm='pending' для НОВЫХ соисполнителей
rep('A5 doEditOrder confirm',
  " o.helpers=newHelpers;\n logAction(o,'edit',{fields:changed});",
  " o.helpers=newHelpers;\n" +
  " (function(){var c=o.confirm||{};newHelpers.forEach(function(n){if(n&&c[n]!=='ok'&&c[n]!=='no')c[n]='pending';});for(var k in c){if(newHelpers.indexOf(k)<0&&c[k]==='pending')delete c[k];}o.confirm=c;})();\n" +
  " logAction(o,'edit',{fields:changed});");
applied.push('doEditOrder: confirm[pending] для новых helpers');

// A6. Отдельная кнопка «✅ Подтвердить участие» в блоке кнопок карточки (гейт не трогаем).
// Вставляем СРАЗУ ПОСЛЕ существующей строки кнопки «Взять в работу».
// Якорь: строка с hintBarHtml + кнопка «Взять в работу» (уникально для L982).
rep('A6 helper confirm button',
  "  ${hintBarHtml(o)}\n  ${showTakeBtn(o)?`<button class=\"btn btn-green\" onclick=\"takeOrder(${o.id})\">🚜 Взять в работу</button>`:''}",
  "  ${hintBarHtml(o)}\n  ${showTakeBtn(o)?`<button class=\"btn btn-green\" onclick=\"takeOrder(${o.id})\">🚜 Взять в работу</button>`:''}\n" +
  "  ${isHelperPending(o)?`<button class=\"btn btn-green\" onclick=\"confirmHelper(${o.id})\">✅ Подтвердить участие</button><button class=\"btn btn-red\" onclick=\"declineHelper(${o.id})\">🚫 Отказаться</button>`:''}");
applied.push('карточка: кнопка «✅ Подтвердить участие» (рядом, гейт не изменён)');

// A7. Новые функции + одноразовый автопоказ окна при входе
rep('A7 confirmHelper/declineHelper/helperPendingModal',
  "function renderCreate(){",
  "// === СОИСПОЛНИТЕЛЬ: подтверждение / отказ ===\n" +
  "function confirmHelper(id){\n" +
  " var o=byId(id);if(!o)return;\n" +
  " if(!isHelperPending(o))return alert('Нет ожидающего подтверждения по этой заявке');\n" +
  " var c=o.confirm||{};c[state.user]='ok';o.confirm=c;\n" +
  " logAction(o,'accept_helper',{helper:state.user});\n" +
  " markOrder(o);save();\n" +
  " if(typeof pushEvent==='function')pushEvent('helper_accept','✅ Подтверждено участие в заявке №'+o.id,state.user+' подтвердил участие',o.id);\n" +
  " render();\n" +
  "}\n" +
  "function declineHelper(id){\n" +
  " var o=byId(id);if(!o)return;\n" +
  " if(!isHelperPending(o))return alert('Нет ожидающего подтверждения по этой заявке');\n" +
  " var reason=prompt('Причина отказа (обязательна):');\n" +
  " if(!reason||!reason.trim())return alert('Укажите причину отказа');\n" +
  " o.helpers=helpersOf(o).filter(function(h){return h!==state.user;});\n" +
  " var c=o.confirm||{};c[state.user]='no';o.confirm=c;\n" +
  " logAction(o,'decline_helper',{helper:state.user,reason:reason.trim()});\n" +
  " markOrder(o);save();\n" +
  " if(typeof pushEvent==='function')pushEvent('helper_decline','❌ Отказ от участия в заявке №'+o.id,state.user+': '+reason.trim(),o.id);\n" +
  " render();\n" +
  "}\n" +
  "function helperPendingModal(){\n" +
  " if(!state||!state.user||typeof DB==='undefined'||!DB||!DB.orders)return;\n" +
  " var pend=DB.orders.filter(function(o){return isHelperPending(o);});\n" +
  " if(!pend.length)return;\n" +
  " var rows=pend.map(function(o){\n" +
  "  return '<div class=\"mat\" style=\"margin-bottom:8px\"><b>№'+o.id+' • '+escapeHtml(o.client||'')+'</b>'+((o.date)?('<div class=\"muted\">'+o.date.slice(8)+'.'+o.date.slice(5,7)+' '+(o.t1||'')+'–'+(o.t2||'')+'</div>'):'')+((o.address)?('<div class=\"muted\">'+escapeHtml(o.address)+'</div>'):'')+'<div class=\"row2\" style=\"margin-top:6px\"><button class=\"btn-sm btn-green\" onclick=\"closeModal();confirmHelper('+o.id+')\">✅ Принять</button><button class=\"btn-sm btn-red\" onclick=\"closeModal();declineHelper('+o.id+')\">🚫 Отказаться</button></div></div>';\n" +
  " }).join('');\n" +
  " openModal('<div style=\"position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto\" onclick=\"if(event.target===this)closeModal()\"><div class=\"card\" style=\"max-width:420px;width:100%;margin:0\" onclick=\"event.stopPropagation()\"><div class=\"sec-title\">👥 Подтвердите участие</div>'+rows+'</div></div>');\n" +
  "}\n" +
  "// автопоказ окна один раз за сессию, когда данные готовы\n" +
  "(function(){var done=false,n=0;\n" +
  " if(typeof setInterval==='undefined')return;\n" +
  " var iv=setInterval(function(){n++;\n" +
  "  try{\n" +
  "   if(!done&&typeof state!=='undefined'&&state&&state.user&&typeof DB!=='undefined'&&DB&&Array.isArray(DB.orders)){\n" +
  "    done=true;clearInterval(iv);\n" +
  "    try{ if(typeof openModal==='function') helperPendingModal(); }catch(e){}\n" +
  "   }\n" +
  "  }catch(e){}\n" +
  "  if(done||n>40)clearInterval(iv);\n" +
  " },500);\n" +
  "})();\n" +
  "// === СОИСПОЛНИТЕЛЬ: конец ===\n" +
  "function renderCreate(){");
applied.push('confirmHelper / declineHelper / helperPendingModal + автопоказ при входе');

fs.writeFileSync(path.join(ROOT, HTML), src, 'utf8');
console.log('\n✓ patch_confirm_helper.js применён к index.html:');
applied.forEach(function(x){ console.log('  • ' + x); });
console.log('\nПримечания:');
console.log('  • Гейт «Взять в работу» (showTakeBtn) и семантика o.worker/o.status НЕ изменены.');
console.log('  • assignWorkerApply НЕ трогает helpers — там подтверждение не ставится.');
console.log('  • Назначение соисполнителей живёт в doSaveOrder/doEditOrder — там confirm[pending].');
