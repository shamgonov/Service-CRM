// === КОНТРАГЕНТЫ v2: дедупликация, множественные адреса/телефоны, создание заказа из карточки ===

// Поиск контрагента по телефону или адресу (для дедупликации)
function findClientByPhoneOrAddress(phone, address){
 DB.clients = DB.clients || [];
 const p = (phone||'').trim().toLowerCase();
 const a = (address||'').trim().toLowerCase();
 if(!p && !a) return null;
 return DB.clients.find(c => {
  const phones = (c.phones||[]).concat(c.phone?[c.phone]:[]).map(x=>(x||'').trim().toLowerCase());
  const addrs = (c.addresses||[]).concat(c.address?[c.address]:[]).map(x=>(x||'').trim().toLowerCase());
  if(p && phones.includes(p)) return true;
  if(a && addrs.includes(a)) return true;
  return false;
 });
}

// Обновлённый getOrCreateClient с миграцией старых данных
function getOrCreateClient(name, phone, address){
 if(!name) return null;
 DB.clients = DB.clients || [];
 let c = clientByName(name);
 if(!c){
  // Проверяем дедупликацию по телефону/адресу
  const existing = findClientByPhoneOrAddress(phone, address);
  if(existing){
   c = existing;
   // Добавляем новые телефон/адрес если их нет
   if(phone && !(c.phones||[]).includes(phone) && c.phone !== phone){
    c.phones = c.phones || [];
    if(c.phone && !c.phones.includes(c.phone)) c.phones.unshift(c.phone);
    c.phones.push(phone);
   }
   if(address && !(c.addresses||[]).includes(address) && c.address !== address){
    c.addresses = c.addresses || [];
    if(c.address && !c.addresses.includes(c.address)) c.addresses.unshift(c.address);
    c.addresses.push(address);
   }
   return c;
  }
  c = {id:'cl'+Date.now(), name:name.trim(), phone:phone||'', address:address||'', phones:phone?[phone]:[], addresses:address?[address]:[], notes:'', complaints:[]};
  DB.clients.push(c);
 } else {
  // Миграция: если у старого клиента нет массивов phones/addresses
  if(!c.phones && c.phone) c.phones = [c.phone];
  if(!c.addresses && c.address) c.addresses = [c.address];
  if(!c.phones) c.phones = [];
  if(!c.addresses) c.addresses = [];
  // Добавляем новые значения
  if(phone && !c.phones.includes(phone)){
   c.phones.push(phone);
   if(!c.phone) c.phone = phone;
  }
  if(address && !c.addresses.includes(address)){
   c.addresses.push(address);
   if(!c.address) c.address = address;
  }
 }
 return c;
}

// Обновлённая форма создания заявки с подсказкой дубликата
function checkClientDuplicate(){
 const phone = g('c-phone');
 const address = g('c-address');
 const name = g('c-client');
 if(!phone && !address) return;
 const dup = findClientByPhoneOrAddress(phone, address);
 if(dup && dup.name.toLowerCase() !== (name||'').toLowerCase()){
  openModal(
   '<div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99;display:flex;align-items:center;justify-content:center;padding:16px" onclick="if(event.target===this)closeModal()">'+
   '<div style="background:#fff;border-radius:12px;max-width:360px;width:100%;padding:20px" onclick="event.stopPropagation()">'+
   '<b style="display:block;margin-bottom:10px">⚠️ Найден похожий контрагент</b>'+
   '<div class="info-row"><span class="muted">Имя</span><b>'+escapeHtml(dup.name)+'</b></div>'+
   '<div class="info-row"><span class="muted">Телефон</span><b>'+escapeHtml((dup.phones||[]).join(', ')||dup.phone||'—')+'</b></div>'+
   '<div class="info-row"><span class="muted">Адреса</span><b>'+escapeHtml((dup.addresses||[]).join('; ')||dup.address||'—')+'</b></div>'+
   '<div class="row2" style="margin-top:14px">'+
   '<button class="btn" style="background:#f3f4f6;color:#374151" onclick="closeModal()">Создать нового</button>'+
   '<button class="btn btn-green" onclick="useExistingClient(\''+dup.id+'\')">Использовать этого</button>'+
   '</div></div></div>'
  );
 }
}

function useExistingClient(clientId){
 const c = (DB.clients||[]).find(x=>x.id===clientId);
 if(!c) return;
 document.getElementById('c-client').value = c.name;
 document.getElementById('c-phone').value = (c.phones&&c.phones[0]) || c.phone || '';
 document.getElementById('c-address').value = (c.addresses&&c.addresses[0]) || c.address || '';
 closeModal();
}

// Создание заказа из карточки контрагента
function createOrderForClient(clientId){
 const c = (DB.clients||[]).find(x=>x.id===clientId);
 if(!c) return;
 state.calPrefill = {clientName:c.name, phone:(c.phones&&c.phones[0])||c.phone||'', address:(c.addresses&&c.addresses[0])||c.address||''};
 go('create');
}

// Обновлённый renderClientDetail с множественными адресами/телефонами и кнопкой создания заказа
function renderClientDetail(id){
 DB.clients = DB.clients || [];
 const c = DB.clients.find(x=>x.id===id);
 if(!c) return '<div class="card">Контрагент не найден</div>';
 // Миграция
 if(!c.phones && c.phone) c.phones = [c.phone];
 if(!c.addresses && c.address) c.addresses = [c.address];
 if(!c.phones) c.phones = [];
 if(!c.addresses) c.addresses = [];
 const orders = (DB.orders||[]).filter(o=>(o.client||'').toLowerCase()===c.name.toLowerCase()).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 const dateFilter = state.clientDateFilter || '';
 const filtered = dateFilter ? orders.filter(o=>o.date===dateFilter) : orders;
 const totalRev = orders.filter(o=>['completed','paid'].includes(o.status)).reduce((s,o)=>s+total(o),0);
 return `
<div class="header"><button class="back" onclick="go('clients')">←</button><h1>${escapeHtml(c.name)}</h1></div>
<div class="card">
<div class="info-row"><span class="muted">Телефоны</span><div style="text-align:right">${c.phones.length?c.phones.map(p=>'<a href="tel:'+encodeURIComponent(p)+'" style="color:var(--blue);font-weight:600;display:block">'+escapeHtml(p)+'</a>').join(''):'<span>—</span>'}</div></div>
<div class="info-row"><span class="muted">Адреса</span><div style="text-align:right">${c.addresses.length?c.addresses.map(a=>'<div>'+escapeHtml(a)+'</div>').join(''):'<span>—</span>'}</div></div>
<div class="info-row"><span class="muted">Всего заказов</span><b>${orders.length}</b></div>
<div class="info-row"><span class="muted">Выручка</span><b style="color:var(--green)">${money(totalRev)}</b></div>
${c.notes?'<div style="margin-top:10px"><b>Заметки:</b><div class="muted">'+escapeHtml(c.notes)+'</div></div>':''}
<div class="row2" style="margin-top:10px">
<button class="btn-sm btn-outline" onclick="editClientModal('${c.id}')">✏️ Редактировать</button>
<button class="btn-sm btn-green" onclick="createOrderForClient('${c.id}')">＋ Новый заказ</button>
</div>
</div>
<div class="card">
<div class="sec-title">📜 Рекламации (${(c.complaints||[]).length})</div>
${(c.complaints||[]).length?c.complaints.map((comp,i)=>'<div class="mat" style="border-left:4px solid var(--red)">'+
'<b>'+(comp.date?comp.date.slice(8)+'.'+comp.date.slice(5,7):'—')+' • '+escapeHtml(comp.title||'Рекламация')+'</b>'+
'<div class="muted">'+escapeHtml(comp.description||'')+'</div>'+
'<div class="muted" style="font-size:11px">Добавлено: '+(comp.by||'—')+' • '+(comp.ts?new Date(comp.ts).toLocaleString():'')+'</div>'+
'<button class="btn-sm btn-red" style="margin-top:4px" onclick="deleteComplaint(\''+c.id+'\','+i+')">🗑 Удалить</button>'+
'</div>').join(''):'<div class="muted">Рекламаций нет</div>'}
<button class="btn btn-red" style="margin-top:10px" onclick="addComplaintModal('${c.id}')">＋ Добавить рекламацию</button>
</div>
<div class="card">
<div class="sec-title">📋 История заказов (${filtered.length})</div>
<div style="margin-bottom:10px"><input class="input" type="date" value="${dateFilter}" onchange="state.clientDateFilter=this.value;render()" placeholder="Фильтр по дате"> <button class="btn-sm btn-outline" onclick="state.clientDateFilter='';render()">Сбросить</button></div>
${filtered.map(o=>'<div class="mat" onclick="go(\'details\','+o.id+')" style="cursor:pointer">'+
'<div style="display:flex;justify-content:space-between"><b>№'+o.id+'</b><span class="badge" style="background:'+ST[o.status].c+';color:'+ST[o.status].tc+'">'+ST[o.status].t+'</span></div>'+
'<div class="muted">'+(o.date?o.date.slice(8)+'.'+o.date.slice(5,7):'—')+' '+(o.t1||'')+'–'+(o.t2||'')+'</div>'+
'<div class="muted">📍 '+escapeHtml(o.address||'—')+'</div>'+
'<div style="font-weight:700;color:var(--green);margin-top:4px">'+money(total(o))+'</div>'+
'</div>').join('')||'<div class="muted">Заказов не найдено</div>'}
</div>`;
}

// Обновлённая форма редактирования с множественными телефонами/адресами
function editClientModal(id){
 const c = (DB.clients||[]).find(x=>x.id===id); if(!c) return;
 if(!c.phones && c.phone) c.phones = [c.phone];
 if(!c.addresses && c.address) c.addresses = [c.address];
 if(!c.phones) c.phones = [];
 if(!c.addresses) c.addresses = [];
 openModal(
  '<div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99;display:flex;align-items:center;justify-content:center;padding:16px" onclick="if(event.target===this)closeModal()">'+
  '<div style="background:#fff;border-radius:12px;max-width:400px;width:100%;padding:20px;max-height:90vh;overflow-y:auto" onclick="event.stopPropagation()">'+
  '<b style="display:block;margin-bottom:10px">✏️ Редактировать контрагента</b>'+
  '<div class="field"><label class="label">Имя *</label><input class="input" id="cl-name" value="'+escapeHtml(c.name||'')+'"></div>'+
  '<div class="field"><label class="label">Телефоны (по одному на строку)</label><textarea class="input" id="cl-phones" rows="3">'+escapeHtml((c.phones||[]).join('\n'))+'</textarea></div>'+
  '<div class="field"><label class="label">Адреса (по одному на строку)</label><textarea class="input" id="cl-addresses" rows="3">'+escapeHtml((c.addresses||[]).join('\n'))+'</textarea></div>'+
  '<div class="field"><label class="label">Заметки</label><textarea class="input" id="cl-notes" rows="3">'+escapeHtml(c.notes||'')+'</textarea></div>'+
  '<div class="row2" style="margin-top:12px">'+
  '<button class="btn" style="background:#f3f4f6;color:#374151" onclick="closeModal()">Отмена</button>'+
  '<button class="btn btn-green" onclick="saveEditClientV2(\''+c.id+'\')">Сохранить</button>'+
  '</div></div></div>'
 );
}

function saveEditClientV2(id){
 const c = (DB.clients||[]).find(x=>x.id===id); if(!c) return;
 const name = g('cl-name'); if(!name) return alert('Укажите имя');
 c.name = name.trim();
 const phonesRaw = g('cl-phones')||'';
 c.phones = phonesRaw.split('\n').map(s=>s.trim()).filter(Boolean);
 c.phone = c.phones[0]||'';
 const addrsRaw = g('cl-addresses')||'';
 c.addresses = addrsRaw.split('\n').map(s=>s.trim()).filter(Boolean);
 c.address = c.addresses[0]||'';
 c.notes = g('cl-notes')||'';
 save(); closeModal(); render();
}

// Обновлённая форма создания контрагента с множественными полями
function addClientModal(){
 openModal(
  '<div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99;display:flex;align-items:center;justify-content:center;padding:16px" onclick="if(event.target===this)closeModal()">'+
  '<div style="background:#fff;border-radius:12px;max-width:400px;width:100%;padding:20px;max-height:90vh;overflow-y:auto" onclick="event.stopPropagation()">'+
  '<b style="display:block;margin-bottom:10px">＋ Новый контрагент</b>'+
  '<div class="field"><label class="label">Имя *</label><input class="input" id="cl-name" placeholder="ФИО или название"></div>'+
  '<div class="field"><label class="label">Телефоны (по одному на строку)</label><textarea class="input" id="cl-phones" rows="2" placeholder="+7..."></textarea></div>'+
  '<div class="field"><label class="label">Адреса (по одному на строку)</label><textarea class="input" id="cl-addresses" rows="2" placeholder="улица, дом"></textarea></div>'+
  '<div class="field"><label class="label">Заметки</label><textarea class="input" id="cl-notes" rows="3"></textarea></div>'+
  '<div class="row2" style="margin-top:12px">'+
  '<button class="btn" style="background:#f3f4f6;color:#374151" onclick="closeModal()">Отмена</button>'+
  '<button class="btn btn-green" onclick="saveNewClientV2()">Сохранить</button>'+
  '</div></div></div>'
 );
}

function saveNewClientV2(){
 const name = g('cl-name'); if(!name) return alert('Укажите имя');
 const phonesRaw = g('cl-phones')||'';
 const phones = phonesRaw.split('\n').map(s=>s.trim()).filter(Boolean);
 const addrsRaw = g('cl-addresses')||'';
 const addresses = addrsRaw.split('\n').map(s=>s.trim()).filter(Boolean);
 const notes = g('cl-notes')||'';
 if(clientByName(name)) return alert('Контрагент с таким именем уже существует');
 DB.clients = DB.clients || [];
 DB.clients.push({id:'cl'+Date.now(), name:name.trim(), phone:phones[0]||'', address:addresses[0]||'', phones:phones, addresses:addresses, notes:notes, complaints:[]});
 save(); closeModal(); render();
}