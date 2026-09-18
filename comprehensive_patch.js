// === 1. КОНТРАГЕНТЫ: множественные телефоны/адреса + дедупликация ===
function findClientByPhone(phone){
if(!phone)return null;
const p=phone.trim().replace(/\D/g,'');
return (DB.clients||[]).find(c=>{
if(!c.phone)return false;
const cp=String(c.phone).replace(/\D/g,'');
return cp && cp.includes(p) || p.includes(cp);
});
}
function findClientByAddress(address){
if(!address)return null;
const a=address.trim().toLowerCase();
return (DB.clients||[]).find(c=>{
if(!c.address)return false;
return String(c.address).toLowerCase().includes(a) || a.includes(String(c.address).toLowerCase());
});
}
function getOrCreateClientEnhanced(name,phone,address){
if(!name)return null;
DB.clients=DB.clients||[];
let c=clientByName(name);
if(c){
// Обновляем телефоны/адреса если новые
if(phone&&(!c.phones||!c.phones.includes(phone))){
c.phones=c.phones||[c.phone].filter(Boolean);
if(!c.phones.includes(phone))c.phones.push(phone);
}
if(address&&(!c.addresses||!c.addresses.includes(address))){
c.addresses=c.addresses||[c.address].filter(Boolean);
if(!c.addresses.includes(address))c.addresses.push(address);
}
c.phone=c.phone||phone||'';
c.address=c.address||address||'';
return c;
}
// Проверка дублей
const byPhone=findClientByPhone(phone);
const byAddress=findClientByAddress(address);
const duplicate=byPhone||byAddress;
if(duplicate){
// Возвращаем null — сигнал показать модалку
return null;
}
c={id:'cl'+Date.now(),name:name.trim(),phone:phone||'',phones:phone?[phone]:[],address:address||'',addresses:address?[address]:[],notes:'',complaints:[],orders:[]};
DB.clients.push(c);
return c;
}
function showDuplicateModal(name,phone,address,duplicate){
openModal(`
<div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99;display:flex;align-items:center;justify-content:center;padding:16px" onclick="if(event.target===this)closeModal()">
<div style="background:#fff;border-radius:12px;max-width:380px;width:100%;padding:20px">
<b style="display:block;margin-bottom:10px">⚠️ Найден похожий контрагент</b>
<div class="muted" style="margin-bottom:10px">По телефону или адресу найден существующий контрагент:</div>
<div class="mat" style="background:#f0f9ff;border-left:4px solid #2563eb;margin-bottom:12px">
<b>${escapeHtml(duplicate.name)}</b>
<div class="muted"> ${escapeHtml(duplicate.phone||'—')}</div>
<div class="muted"> ${escapeHtml(duplicate.address||'—')}</div>
</div>
<div style="margin-bottom:12px"><b>Данные из формы:</b></div>
<div class="muted" style="margin-bottom:12px">
<div>📞 ${escapeHtml(phone||'—')}</div>
<div> ${escapeHtml(address||'—')}</div>
</div>
<div class="row2">
<button class="btn" style="background:#f3f4f6;color:#374151" onclick="createNewClient('${name}','${phone||''}','${address||''}')">Создать нового</button>
<button class="btn btn-green" onclick="useExistingClient('${duplicate.id}','${name}','${phone||''}','${address||''}')">Использовать существующего</button>
</div>
</div>
</div>`);
}
function createNewClient(name,phone,address){
closeModal();
DB.clients=DB.clients||[];
const c={id:'cl'+Date.now(),name:name.trim(),phone:phone||'',phones:phone?[phone]:[],address:address||'',addresses:address?[address]:[],notes:'',complaints:[],orders:[]};
DB.clients.push(c);
save();
window._pendingClient=c;
}
function useExistingClient(clientId,name,phone,address){
closeModal();
const c=(DB.clients||[]).find(x=>x.id===clientId);
if(!c)return;
// Добавляем новые телефоны/адреса
if(phone&&(!c.phones||!c.phones.includes(phone))){
c.phones=c.phones||[c.phone].filter(Boolean);
if(!c.phones.includes(phone))c.phones.push(phone);
}
if(address&&(!c.addresses||!c.addresses.includes(address))){
c.addresses=c.addresses||[c.address].filter(Boolean);
if(!c.addresses.includes(address))c.addresses.push(address);
}
c.phone=c.phone||phone||'';
c.address=c.address||address||'';
save();
window._pendingClient=c;
}
// === 2. Обновлённый renderClientDetail с кнопкой "Новый заказ" ===
function renderClientDetailEnhanced(id){
DB.clients=DB.clients||[];
const c=DB.clients.find(x=>x.id===id);
if(!c)return '<div class="card">Контрагент не найден</div>';
const orders=(DB.orders||[]).filter(o=>{
const oc=(o.client||'').toLowerCase();
const cn=(c.name||'').toLowerCase();
return oc===cn;
}).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
const dateFilter=state.clientDateFilter||'';
const filtered=dateFilter?orders.filter(o=>o.date===dateFilter):orders;
const totalRev=orders.filter(o=>['completed','paid'].includes(o.status)).reduce((s,o)=>s+total(o),0);
const allPhones=[c.phone,...(c.phones||[])].filter((v,i,a)=>v&&a.indexOf(v)===i);
const allAddresses=[c.address,...(c.addresses||[])].filter((v,i,a)=>v&&a.indexOf(v)===i);
return `
<div class="header"><button class="back" onclick="go('clients')">←</button><h1>${escapeHtml(c.name)}</h1></div>
<div class="card">
<div class="info-row"><span class="muted">Телефоны</span><div style="text-align:right">${allPhones.length?allPhones.map(p=>`<a href="tel:${encodeURIComponent(p)}" style="color:var(--blue);font-weight:600;display:block">${escapeHtml(p)}</a>`).join(''):'—'}</div></div>
<div class="info-row"><span class="muted">Адреса</span><div style="text-align:right;max-width:60%">${allAddresses.length?allAddresses.map(a=>`<div>${escapeHtml(a)}</div>`).join(''):'—'}</div></div>
<div class="info-row"><span class="muted">Всего заказов</span><b>${orders.length}</b></div>
<div class="info-row"><span class="muted">Выручка</span><b style="color:var(--green)">${money(totalRev)}</b></div>
${c.notes?`<div style="margin-top:10px"><b>Заметки:</b><div class="muted">${escapeHtml(c.notes)}</div></div>`:''}
<button class="btn btn-green" style="margin-top:10px" onclick="newOrderFromClient('${c.id}')">＋ Новый заказ</button>
<button class="btn-sm btn-outline" style="margin-top:8px" onclick="editClientModal('${c.id}')">️ Редактировать</button>
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
<div class="sec-title"> История заказов (${filtered.length})</div>
<div style="margin-bottom:10px"><input class="input" type="date" value="${dateFilter}" onchange="state.clientDateFilter=this.value;render()" placeholder="Фильтр по дате"> <button class="btn-sm btn-outline" onclick="state.clientDateFilter='';render()">Сбросить</button></div>
${filtered.map(o=>`<div class="mat" onclick="go('details',${o.id})" style="cursor:pointer">
<div style="display:flex;justify-content:space-between"><b>№${o.id}</b><span class="badge" style="background:${ST[o.status].c};color:${ST[o.status].tc}">${ST[o.status].t}</span></div>
<div class="muted">${o.date?o.date.slice(8)+'.'+o.date.slice(5,7):'—'} ${o.t1||''}–${o.t2||''}</div>
<div class="muted">📍 ${escapeHtml(o.address||'—')}</div>
<div style="font-weight:700;color:var(--green);margin-top:4px">${money(total(o))}</div>
</div>`).join('')||'<div class="muted">Заказов не найдено</div>'}
</div>`;
}
function newOrderFromClient(clientId){
const c=(DB.clients||[]).find(x=>x.id===clientId);
if(!c)return;
state.newOrderClient={name:c.name,phone:c.phone,address:c.address};
go('create');
}
// === 3. Просроченные заказы ===
function renderOverdue(){
const today=d0;
const overdue=DB.orders.filter(o=>{
return o.date<today&&!['completed','paid','canceled'].includes(o.status)&&visOrder(o);
}).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
return `
<div class="header"><h1>⏰ Просроченные заказы</h1><span style="margin-left:auto;font-size:12px">${escapeHtml(state.user)} • <u onclick="logout()" style="cursor:pointer">выйти</u></span></div>
<div class="card">
${overdue.length?`<div class="muted" style="margin-bottom:10px">Найдено просроченных заказов: <b style="color:var(--red)">${overdue.length}</b></div>`:''}
${overdue.map(o=>`<div class="mat" style="border-left:4px solid var(--red)">
<div style="display:flex;justify-content:space-between;margin-bottom:6px">
<b>№${o.id} • ${escapeHtml(o.client)}</b>
<span class="badge" style="background:${ST[o.status].c};color:${ST[o.status].tc}">${ST[o.status].t}</span>
</div>
<div class="muted">📅 ${o.date?o.date.slice(8)+'.'+o.date.slice(5,7):'—'} ${o.t1||''}–${o.t2||''}</div>
<div class="muted">📍 ${escapeHtml(o.address||'—')}</div>
<div style="font-weight:700;color:var(--green);margin:6px 0">${money(total(o))}</div>
<div class="row2" style="margin-top:8px">
<button class="btn-sm btn-blue" onclick="rescheduleOverdue(${o.id})">📅 Перенести</button>
<button class="btn-sm btn-red" onclick="deleteOverdue(${o.id})">🗑 Удалить</button>
<button class="btn-sm btn-outline" onclick="go('details',${o.id})">ℹ️ Открыть</button>
</div>
</div>`).join('')||'<div class="muted">Просроченных заказов нет ✓</div>'}
</div>`;
}
function rescheduleOverdue(id){
const o=byId(id);if(!o)return;
state.calDate=o.date;
go('calendar');
}
function deleteOverdue(id){
if(!confirm('Удалить просроченный заказ №'+id+'?'))return;
const o=byId(id);if(!o)return;
DB.orders=DB.orders.filter(x=>x.id!==id);
if(typeof orderDelete==='function')orderDelete(id);
save();
render();
}
// === 4. Уведомление о просрочке ===
function checkOverdueNotification(){
const today=d0;
const overdue=DB.orders.filter(o=>o.date<today&&!['completed','paid','canceled'].includes(o.status)&&o.worker===state.user);
if(overdue.length&&!sessionStorage.getItem('overdue_notified_'+today)){
if(typeof Notification!=='undefined'&&Notification.permission==='granted'){
new Notification('⚠️ Просроченные заказы',{body:`У вас ${overdue.length} невыполненных заказов. Проверьте календарь!`,icon:'icon.png'});
sessionStorage.setItem('overdue_notified_'+today,'1');
}
}
}
// === 5. Модификация saveOrder для работы с дублями ===