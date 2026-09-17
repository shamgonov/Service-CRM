// === КОНТРАГЕНТЫ: клиентская база с историей ===
function clientByName(name){
 if(!name)return null;
 const n=name.trim().toLowerCase();
 return (DB.clients||[]).find(c=>(c.name||'').trim().toLowerCase()===n);
}

function getOrCreateClient(name,phone,address){
 if(!name)return null;
 DB.clients=DB.clients||[];
 let c=clientByName(name);
 if(!c){
  c={id:'cl'+Date.now(),name:name.trim(),phone:phone||'',address:address||'',notes:'',complaints:[]};
  DB.clients.push(c);
 }
 return c;
}

function renderClients(){
 DB.clients=DB.clients||[];
 const q=(state.clientsQuery||'').toLowerCase();
 let list=DB.clients.slice();
 if(q)list=list.filter(c=>
  (c.name||'').toLowerCase().includes(q)||
  (c.address||'').toLowerCase().includes(q)||
  (c.phone||'').toLowerCase().includes(q)
 );
 list.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
 return `
<div class="header"><h1>📇 Контрагенты</h1><span style="margin-left:auto;font-size:12px">${escapeHtml(state.user)} • <u onclick="logout()" style="cursor:pointer">выйти</u></span></div>
<div class="card">
 <div style="margin-bottom:10px"><input class="input" placeholder="🔍 Поиск по имени, адресу, телефону..." value="${escapeHtml(state.clientsQuery||'')}" oninput="state.clientsQuery=this.value;render()"></div>
 <button class="btn btn-green" style="margin-bottom:10px" onclick="addClientModal()">＋ Новый контрагент</button>
 ${list.map(c=>`<div class="mat" onclick="go('clientDetail','${c.id}')" style="cursor:pointer">
  <b>${escapeHtml(c.name)}</b>
  <div class="muted">📞 ${escapeHtml(c.phone||'—')} • 📍 ${escapeHtml(c.address||'—')}</div>
  <div class="muted" style="margin-top:4px">Заказов: ${(DB.orders||[]).filter(o=>(o.client||'').toLowerCase()===c.name.toLowerCase()).length} • Рекламаций: ${(c.complaints||[]).length}</div>
 </div>`).join('')||'<div class="muted">Контрагентов пока нет</div>'}
</div>`;
}

function renderClientDetail(id){
 DB.clients=DB.clients||[];
 const c=DB.clients.find(x=>x.id===id);
 if(!c)return '<div class="card">Контрагент не найден</div>';
 const orders=(DB.orders||[]).filter(o=>(o.client||'').toLowerCase()===c.name.toLowerCase()).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 const dateFilter=state.clientDateFilter||'';
 const filtered=dateFilter?orders.filter(o=>o.date===dateFilter):orders;
 const totalRev=orders.filter(o=>['completed','paid'].includes(o.status)).reduce((s,o)=>s+total(o),0);
 return `
<div class="header"><button class="back" onclick="go('clients')">←</button><h1>${escapeHtml(c.name)}</h1></div>
<div class="card">
 <div class="info-row"><span class="muted">Телефон</span><a href="tel:${encodeURIComponent(c.phone||'')}" style="color:var(--blue);font-weight:600">${escapeHtml(c.phone||'—')}</a></div>
 <div class="info-row"><span class="muted">Адрес</span><b style="text-align:right">${escapeHtml(c.address||'—')}</b></div>
 <div class="info-row"><span class="muted">Всего заказов</span><b>${orders.length}</b></div>
 <div class="info-row"><span class="muted">Выручка</span><b style="color:var(--green)">${money(totalRev)}</b></div>
 ${c.notes?`<div style="margin-top:10px"><b>Заметки:</b><div class="muted">${escapeHtml(c.notes)}</div></div>`:''}
 <button class="btn-sm btn-outline" style="margin-top:8px" onclick="editClientModal('${c.id}')">✏️ Редактировать</button>
</div>
<div class="card">
 <div class="sec-title">📜 Рекламации (${(c.complaints||[]).length})</div>
 ${(c.complaints||[]).length?c.complaints.map((comp,i)=>`<div class="mat" style="border-left:4px solid var(--red)">
  <b>${comp.date?comp.date.slice(8)+'.'+comp.date.slice(5,7):'—'} • ${escapeHtml(comp.title||'Рекламация')}</b>
  <div class="muted">${escapeHtml(comp.description||'')}</div>
  <div class="muted" style="font-size:11px">Добавлено: ${comp.by||'—'} • ${comp.ts?new Date(comp.ts).toLocaleString():''}</div>
  <button class="btn-sm btn-red" style="margin-top:4px" onclick="deleteComplaint('${c.id}',${i})">🗑 Удалить</button>
 </div>`).join(''):'<div class="muted">Рекламаций нет</div>'}
 <button class="btn btn-red" style="margin-top:10px" onclick="addComplaintModal('${c.id}')">＋ Добавить рекламацию</button>
</div>
<div class="card">
 <div class="sec-title">📋 История заказов (${filtered.length})</div>
 <div style="margin-bottom:10px"><input class="input" type="date" value="${dateFilter}" onchange="state.clientDateFilter=this.value;render()" placeholder="Фильтр по дате"> <button class="btn-sm btn-outline" onclick="state.clientDateFilter='';render()">Сбросить</button></div>
 ${filtered.map(o=>`<div class="mat" onclick="go('details',${o.id})" style="cursor:pointer">
  <div style="display:flex;justify-content:space-between"><b>№${o.id}</b><span class="badge" style="background:${ST[o.status].c};color:${ST[o.status].tc}">${ST[o.status].t}</span></div>
  <div class="muted">${o.date?o.date.slice(8)+'.'+o.date.slice(5,7):'—'} ${o.t1||''}–${o.t2||''}</div>
  <div class="muted">📍 ${escapeHtml(o.address||'—')}</div>
  <div style="font-weight:700;color:var(--green);margin-top:4px">${money(total(o))}</div>
 </div>`).join('')||'<div class="muted">Заказов не найдено</div>'}
</div>`;
}

function addClientModal(){
 openModal(`
  <div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99;display:flex;align-items:center;justify-content:center;padding:16px" onclick="if(event.target===this)closeModal()">
   <div style="background:#fff;border-radius:12px;max-width:360px;width:100%;padding:20px" onclick="event.stopPropagation()">
    <b style="display:block;margin-bottom:10px">＋ Новый контрагент</b>
    <div class="field"><label class="label">Имя *</label><input class="input" id="cl-name" placeholder="ФИО или название"></div>
    <div class="field"><label class="label">Телефон</label><input class="input" id="cl-phone" type="tel" placeholder="+7..."></div>
    <div class="field"><label class="label">Адрес</label><input class="input" id="cl-address" placeholder="улица, дом"></div>
    <div class="field"><label class="label">Заметки</label><textarea class="input" id="cl-notes" rows="3"></textarea></div>
    <div class="row2" style="margin-top:12px">
     <button class="btn" style="background:#f3f4f6;color:#374151" onclick="closeModal()">Отмена</button>
     <button class="btn btn-green" onclick="saveNewClient()">Сохранить</button>
    </div>
   </div>
  </div>`);
}

function saveNewClient(){
 const name=g('cl-name');if(!name)return alert('Укажите имя');
 const phone=g('cl-phone');
 const address=g('cl-address');
 const notes=g('cl-notes');
 if(clientByName(name))return alert('Контрагент с таким именем уже существует');
 DB.clients=DB.clients||[];
 DB.clients.push({id:'cl'+Date.now(),name:name.trim(),phone:phone||'',address:address||'',notes:notes||'',complaints:[]});
 save();
 closeModal();
 render();
}

function editClientModal(id){
 const c=(DB.clients||[]).find(x=>x.id===id);if(!c)return;
 openModal(`
  <div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99;display:flex;align-items:center;justify-content:center;padding:16px" onclick="if(event.target===this)closeModal()">
   <div style="background:#fff;border-radius:12px;max-width:360px;width:100%;padding:20px" onclick="event.stopPropagation()">
    <b style="display:block;margin-bottom:10px">✏️ Редактировать контрагента</b>
    <div class="field"><label class="label">Имя *</label><input class="input" id="cl-name" value="${escapeHtml(c.name||'')}"></div>
    <div class="field"><label class="label">Телефон</label><input class="input" id="cl-phone" type="tel" value="${escapeHtml(c.phone||'')}"></div>
    <div class="field"><label class="label">Адрес</label><input class="input" id="cl-address" value="${escapeHtml(c.address||'')}"></div>
    <div class="field"><label class="label">Заметки</label><textarea class="input" id="cl-notes" rows="3">${escapeHtml(c.notes||'')}</textarea></div>
    <div class="row2" style="margin-top:12px">
     <button class="btn" style="background:#f3f4f6;color:#374151" onclick="closeModal()">Отмена</button>
     <button class="btn btn-green" onclick="saveEditClient('${c.id}')">Сохранить</button>
    </div>
   </div>
  </div>`);
}

function saveEditClient(id){
 const c=(DB.clients||[]).find(x=>x.id===id);if(!c)return;
 const name=g('cl-name');if(!name)return alert('Укажите имя');
 c.name=name.trim();
 c.phone=g('cl-phone')||'';
 c.address=g('cl-address')||'';
 c.notes=g('cl-notes')||'';
 save();
 closeModal();
 render();
}

function addComplaintModal(clientId){
 openModal(`
  <div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99;display:flex;align-items:center;justify-content:center;padding:16px" onclick="if(event.target===this)closeModal()">
   <div style="background:#fff;border-radius:12px;max-width:360px;width:100%;padding:20px" onclick="event.stopPropagation()">
    <b style="display:block;margin-bottom:10px">＋ Добавить рекламацию</b>
    <div class="field"><label class="label">Дата</label><input class="input" id="comp-date" type="date" value="${d0}"></div>
    <div class="field"><label class="label">Заголовок *</label><input class="input" id="comp-title" placeholder="Краткое описание"></div>
    <div class="field"><label class="label">Описание *</label><textarea class="input" id="comp-desc" rows="5" placeholder="Подробности рекламации"></textarea></div>
    <div class="row2" style="margin-top:12px">
     <button class="btn" style="background:#f3f4f6;color:#374151" onclick="closeModal()">Отмена</button>
     <button class="btn btn-red" onclick="saveComplaint('${clientId}')">Сохранить</button>
    </div>
   </div>
  </div>`);
}

function saveComplaint(clientId){
 const c=(DB.clients||[]).find(x=>x.id===clientId);if(!c)return;
 const title=g('comp-title');if(!title)return alert('Укажите заголовок');
 const desc=g('comp-desc');if(!desc)return alert('Укажите описание');
 c.complaints=c.complaints||[];
 c.complaints.push({
  date:g('comp-date')||d0,
  title:title.trim(),
  description:desc.trim(),
  by:state.user||'system',
  ts:Date.now()
 });
 save();
 closeModal();
 render();
}

function deleteComplaint(clientId,idx){
 const c=(DB.clients||[]).find(x=>x.id===clientId);if(!c)return;
 if(!confirm('Удалить эту рекламацию?'))return;
 c.complaints.splice(idx,1);
 save();
 render();
}