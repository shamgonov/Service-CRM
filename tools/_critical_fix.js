'use strict';
// _critical_fix.js — три критических фикса (2026-10-11). Якорная замена, фатал при !=1 совпадении.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const st = {
  html: fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'),
  acc: fs.readFileSync(path.join(ROOT, 'tools/firebase-access.js'), 'utf8')
};
const B = String.fromCharCode(96);
const D = String.fromCharCode(36) + '{';
function cnt(hay, needle){ let n=0,p=0; while((p=hay.indexOf(needle,p))>=0){n++;p+=needle.length;} return n; }
function rep(label, key, anchor, next){
  const variants=[[anchor,next],[anchor.split('\n').join('\r\n'),next.split('\n').join('\r\n')]];
  for(const v of variants){
    const c=cnt(st[key],v[0]);
    if(c===1){ st[key]=st[key].split(v[0]).join(v[1]); console.log('  + '+label); return; }
    if(c>1){ console.error('FATAL ['+label+']: якорь найден '+c+' раз. СТОП.'); process.exit(1); }
  }
  console.error('FATAL ['+label+']: якорь найден 0 раз. СТОП.'); process.exit(1);
}

// ===== П1.1 canEditOrder =====
rep('P1.1 canEditOrder','html',
"function canEditOrder(o){\n if(typeof isOwner==='function'&&uiOwner())return true;\n if(o.status==='completed'||o.status==='paid')return false;\n return isOrderEditor(o);\n}",
"// Контроль редактирования карточки: владелец/контролирующий (adminLike, canViewAllOrders)\n"+
"// ИЛИ назначенный (worker+helpers — isAssignedToMe), ИЛИ создатель заявки.\n"+
"// isOrderEditor остаётся источником права orders_edit для прочих гейтов (матрицу не трогаем).\n"+
"function canEditOrder(o){\n"+
" if(typeof isOwner==='function'&&uiOwner())return true;\n"+
" if(o.status==='completed'||o.status==='paid')return false;\n"+
" var ctrl=(typeof adminLike==='function'&&adminLike())||(typeof canViewAllOrders==='function'&&canViewAllOrders());\n"+
" if(ctrl)return true;\n"+
" if(typeof isAssignedToMe==='function'&&isAssignedToMe(o))return true;\n"+
" return !!(o&&o.by&&o.by===state.user);\n"+
"}");

// ===== П1.2/1.3 alert =====
rep('P1.2 editOrderModal alert','html',
"if(!canEditOrder(o))return alert(o.status==='completed'||o.status==='paid'?'Завершённую заявку может редактировать только владелец':'Нет права orders_edit');",
"if(!canEditOrder(o))return alert(o.status==='completed'||o.status==='paid'?'Завершённую заявку может редактировать только владелец':'Редактировать могут исполнитель, соисполнитель, создатель заявки или руководитель');");
rep('P1.3 doEditOrder alert','html',
"function doEditOrder(id){\n const o=byId(id);if(!o)return;\n if(!canEditOrder(o))return alert('Нет права orders_edit');",
"function doEditOrder(id){\n const o=byId(id);if(!o)return;\n if(!canEditOrder(o))return alert('Редактировать могут исполнитель, соисполнитель, создатель заявки или руководитель');");

// ===== П2 список =====
rep('P2.1 filter button','html',
" "+D+"[['all','Все'],['today','Сегодня'],['active','Активные'],['done','Завершенные']].map(f=>",
" "+D+"[['all','Все'],['today','Сегодня'],['active','Активные'],['done','Завершенные'],['mine','👷 Мои']].map(f=>");
rep('P2.2 mine filter','html',
" if(state.filter==='done')list=list.filter(o=>['completed','paid'].includes(o.status));",
" if(state.filter==='done')list=list.filter(o=>['completed','paid'].includes(o.status));\n if(state.filter==='mine')list=list.filter(o=>isAssignedToMe(o));");
// Ключ: после каждой интерполяции стоит закрывающая }
rep('P2.3 my highlight','html',
"style=\""+D+"urgentSoon(o)?'background:#fef9c3;border-left:4px solid #f59e0b;':''}"+D+"o.status==='canceled'?'opacity:.55;filter:grayscale(.8)':''}\">",
"style=\""+D+"urgentSoon(o)?'background:#fef9c3;border-left:4px solid #f59e0b;':''}"+D+"isAssignedToMe(o)?'background:#fff8e1;border-left:4px solid #fbbf24;':''}"+D+"o.status==='canceled'?'opacity:.55;filter:grayscale(.8)':''}\">");
const badgeHead="function badges(o){\n let b="+B+'<span class="badge" style="background:'+D+'ST[o.status].c};color:'+D+'ST[o.status].tc}">'+D+'ST[o.status].t}</span>'+B+';';
rep('P2.4 badges my/overdue','html', badgeHead,
badgeHead+"\n if(isAssignedToMe(o))b+="+B+'<span class="badge" style="background:#dbeafe;color:#1e40af">'+D+"(o.worker&&isMeName(o.worker))?'👷 мой':'👥 соисполнитель'}</span>"+B+';'+
"\n if(isOverdue(o))b+="+B+'<span class="badge" style="background:#fee2e2;color:#991b1b">⚠️ просрочка</span>'+B+';');

// ===== П3.1 isOverdue =====
rep('P3.1 isOverdue','html',
"// «горение»: inwork, от начала интервала >30 мин, и за 30 мин в истории нет",
"// «Просрочка»: активная (не completed/paid/canceled/postponed) заявка с датой раньше сегодня.\n"+
"// Визуальный критерий списка/бейджей; сетевые события считает свой интервал в firebase-access.js.\n"+
"function isOverdue(o){\n"+
" return !!o&&!!o.date&&o.date<localToday()&&['new','inspection','approved','in_progress','inwork','waiting','paused'].indexOf(o.status)>=0;\n"+
"}\n"+
"// «горение»: inwork, от начала интервала >30 мин, и за 30 мин в истории нет");

// ===== П3.2 событие просрочки =====
rep('P3.2 overdue event','acc',
"   if(p.status!=='postponed'&&o.status==='postponed'&&(wasMine||isOwner())&&!byMe)\n    pushEvent('order','📅 Заявку №'+o.id+' перенесли','Статус: перенос',o.id);",
"   if(p.status!=='postponed'&&o.status==='postponed'&&(wasMine||isOwner())&&!byMe)\n    pushEvent('order','📅 Заявку №'+o.id+' перенесли','Статус: перенос',o.id);\n"+
"   // просрочка: дата прошла, заявка всё ещё активна — переход не-просрочка → просрочка\n"+
"   var OD_ST=['new','inspection','approved','in_progress','inwork','waiting','paused'];\n"+
"   var _tn=new Date(),_td=_tn.getFullYear()+'-'+String(_tn.getMonth()+1).padStart(2,'0')+'-'+String(_tn.getDate()).padStart(2,'0');\n"+
"   var wasOd=p.date&&p.date<_td&&OD_ST.indexOf(p.status)>=0;\n"+
"   var nowOd=o.date&&o.date<_td&&OD_ST.indexOf(o.status)>=0;\n"+
"   if(nowOd&&!wasOd&&!byMe&&(wasMine||nowMine||isOwner())){\n"+
"    var _st=(typeof ST!=='undefined'&&ST[o.status])?ST[o.status].t:o.status;\n"+
"    pushEvent('overdue','⏰ Просрочка — заявка №'+o.id,'Дата '+esc(o.date)+' прошла, статус: '+esc(_st),o.id);\n"+
"   }");

fs.writeFileSync(path.join(ROOT,'index.html'), st.html);
fs.writeFileSync(path.join(ROOT,'tools/firebase-access.js'), st.acc);
console.log('  ✓ записаны index.html и tools/firebase-access.js');
console.log('OK');
