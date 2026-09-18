// === ПАТЧ v2: Контрагенты + Просроченные + Уведомления ===

// 1. Поиск дублей по телефону/адресу
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

// 2. Создание/получение клиента с миграцией
function getOrCreateClient(name, phone, address){
    if(!name) return null;
    DB.clients = DB.clients || [];
    let c = clientByName(name);
    if(!c){
        const existing = findClientByPhoneOrAddress(phone, address);
        if(existing){
            c = existing;
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
        if(!c.phones && c.phone) c.phones = [c.phone];
        if(!c.addresses && c.address) c.addresses = [c.address];
        if(!c.phones) c.phones = [];
        if(!c.addresses) c.addresses = [];
        if(phone && !c.phones.includes(phone)){ c.phones.push(phone); if(!c.phone) c.phone = phone; }
        if(address && !c.addresses.includes(address)){ c.addresses.push(address); if(!c.address) c.address = address; }
    }
    return c;
}

// 3. Проверка дублей при вводе
function checkClientDuplicate(){
    const phone = document.getElementById('c-phone').value;
    const address = document.getElementById('c-address').value;
    const name = document.getElementById('c-client').value;
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

// 4. Создание заказа из карточки клиента
function createOrderForClient(clientId){
    const c = (DB.clients||[]).find(x=>x.id===clientId);
    if(!c) return;
    state.calPrefill = {clientName:c.name, phone:(c.phones&&c.phones[0])||c.phone||'', address:(c.addresses&&c.addresses[0])||c.address||''};
    go('create');
}

// 5. Просроченные заказы
function renderOverdue(){
    const now = new Date(); const today = fmt(now);
    const overdue = (DB.orders||[]).filter(o => {
        if(['completed','paid','canceled'].includes(o.status) || !o.date) return false;
        if(o.date < today) return true;
        if(o.date === today && o.t2){ const [h,m] = o.t2.split(':').map(Number); if(now.getHours() > h || (now.getHours() === h && now.getMinutes() > m)) return true; }
        return false;
    }).sort((a,b)=>String(a.date).localeCompare(String(b.date)) || (a.t1||'').localeCompare(b.t1||''));
    
    return `<div class="header"><h1>⏰ Просроченные</h1><span style="margin-left:auto;font-size:12px">${escapeHtml(state.user)} • <u onclick="logout()" style="cursor:pointer">выйти</u></span></div>
    <div class="card">${overdue.length?overdue.map(o=>`<div class="mat" style="border-left:4px solid var(--red)">
        <div style="display:flex;justify-content:space-between"><b>№${o.id} • ${escapeHtml(o.client)}</b><span class="badge" style="background:${ST[o.status].c};color:${ST[o.status].tc}">${ST[o.status].t}</span></div>
        <div class="muted">📍 ${escapeHtml(o.address)} • ⏰ ${o.date.slice(8)}.${o.date.slice(5,7)} ${o.t1}–${o.t2}</div>
        <div class="row2" style="margin-top:8px">
        <button class="btn-sm btn-outline" onclick="go('details',${o.id})">Открыть</button>
        <button class="btn-sm btn-blue" onclick="rescheduleOrder(${o.id})">Перенести</button>
        <button class="btn-sm btn-red" onclick="cancelOrderFromOverdue(${o.id})">Отменить</button>
        </div></div>`).join(''):'<div class="muted">Просроченных заказов нет 🎉</div>'}</div>`;
}

function rescheduleOrder(id){
    const o=byId(id); if(!o) return;
    state.calDate=o.date;
    go('calendar');
}

function cancelOrderFromOverdue(id){
    if(!confirm('Отменить этот заказ?')) return;
    const o=byId(id); if(!o) return;
    o.status='canceled'; o.cancelBy=state.user; o.cancelTs=Date.now();
    logAction(o,'cancel',{reason:'Отменён из просроченных'});
    markOrder(o); save(); render();
}

// 6. Уведомление о просрочке
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

// 7. Обновлённый renderClientDetail
function renderClientDetail(id){
    DB.clients = DB.clients || [];
    const c = DB.clients.find(x=>x.id===id);
    if(!c) return '<div class="card">Контрагент не найден</div>';
    if(!c.phones && c.phone) c.phones = [c.phone];
    if(!c.addresses && c.address) c.addresses = [c.address];
    if(!c.phones) c.phones = []; if(!c.addresses) c.addresses = [];
    
    const orders = (DB.orders||[]).filter(o=>(o.client||'').toLowerCase()===c.name.toLowerCase()).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    const dateFilter = state.clientDateFilter || '';
    const filtered = dateFilter ? orders.filter(o=>o.date===dateFilter) : orders;
    const totalRev = orders.filter(o=>['completed','paid'].includes(o.status)).reduce((s,o)=>s+total(o),0);
    
    return `<div class="header"><button class="back" onclick="go('clients')">←</button><h1>${escapeHtml(c.name)}</h1></div>
    <div class="card">
        <div class="info-row"><span class="muted">Телефоны</span><div style="text-align:right">${c.phones.length?c.phones.map(p=>'<a href="tel:'+encodeURIComponent(p)+'" style="color:var(--blue);font-weight:600;display:block">'+escapeHtml(p)+'</a>').join(''):'<span>—</span>'}</div></div>
        <div class="info-row"><span class="muted">Адреса</span><div style="text-align:right">${c.addresses.length?c.addresses.map(a=>'<div>'+escapeHtml(a)+'</div>').join(''):'<span>—</span>'}</div></div>
        <div class="info-row"><span class="muted">Всего заказов</span><b>${orders.length}</b></div>
        <div class="info-row"><span class="muted">Выручка</span><b style="color:var(--green)">${money(totalRev)}</b></div>
        ${c.notes?'<div style="margin-top:10px"><b>Заметки:</b><div class="muted">'+escapeHtml(c.notes)+'</div></div>':''}
        <div class="row2" style="margin-top:10px"><button class="btn-sm btn-outline" onclick="editClientModal('${c.id}')">✏️ Редактировать</button><button class="btn-sm btn-green" onclick="createOrderForClient('${c.id}')">＋ Новый заказ</button></div>
    </div>
    <div class="card"><div class="sec-title">📜 Рекламации (${(c.complaints||[]).length})</div>
        ${(c.complaints||[]).length?c.complaints.map((comp,i)=>'<div class="mat" style="border-left:4px solid var(--red)"><b>'+(comp.date?comp.date.slice(8)+'.'+comp.date.slice(5,7):'—')+' • '+escapeHtml(comp.title||'Рекламация')+'</b><div class="muted">'+escapeHtml(comp.description||'')+'</div><button class="btn-sm btn-red" style="margin-top:4px" onclick="deleteComplaint(\''+c.id+'\','+i+')"> Удалить</button></div>').join(''):'<div class="muted">Рекламаций нет</div>'}
        <button class="btn btn-red" style="margin-top:10px" onclick="addComplaintModal('${c.id}')">＋ Добавить рекламацию</button></div>
    <div class="card"><div class="sec-title">📋 История заказов (${filtered.length})</div>
        <div style="margin-bottom:10px"><input class="input" type="date" value="${dateFilter}" onchange="state.clientDateFilter=this.value;render()" placeholder="Фильтр по дате"> <button class="btn-sm btn-outline" onclick="state.clientDateFilter='';render()">Сбросить</button></div>
        ${filtered.map(o=>'<div class="mat" onclick="go(\'details\','+o.id+')" style="cursor:pointer"><div style="display:flex;justify-content:space-between"><b>№'+o.id+'</b><span class="badge" style="background:'+ST[o.status].c+';color:'+ST[o.status].tc+'">'+ST[o.status].t+'</span></div><div class="muted">'+(o.date?o.date.slice(8)+'.'+o.date.slice(5,7):'—')+' '+(o.t1||'')+'–'+(o.t2||'')+'</div><div class="muted">📍 '+escapeHtml(o.address||'—')+'</div><div style="font-weight:700;color:var(--green);margin-top:4px">'+money(total(o))+'</div></div>').join('')||'<div class="muted">Заказов не найдено</div>'}
    </div>`;
}