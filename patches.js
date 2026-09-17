function renderProfile(){
 const pr=(MYDOC&&MYDOC.profile)||{};
 const sch=pr.schedule||{days:[],from:'09:00',to:'18:00'};
 const notify=pr.notify||{sys:true,sound:true,vibra:true,dndFrom:'',dndTo:''};
 const specs=DB.specializations||[];
 const mySpecs=pr.specs||pr.spec||[];
 const pinSet=!!(pr.pinHash||(pr.pin&&pr.pin.length));
 return `
<div class="header"><h1>👤 Профиль</h1><span style="margin-left:auto;font-size:13px">${escapeHtml(state.user)} • <u onclick="logout()" style="cursor:pointer">выйти</u></span></div>
<div class="card"><div class="sec-title">🔐 PIN-код</div>
 <div class="muted" style="margin-bottom:8px">${pinSet?'PIN установлен. Используется при входе в приложение.':'PIN не задан. Рекомендуем установить для защиты входа.'}</div>
 <button class="btn btn-outline" onclick="changePinFlow()">${pinSet?'🔄 Сменить PIN':'➕ Установить PIN'}</button>
 <button class="btn-sm btn-red" style="margin-top:8px;margin-left:6px" onclick="if(confirm('Сбросить PIN? После сброса вход без PIN.'))resetMyPinLocal()">🗑 Сбросить</button>
</div>
<div class="card"><div class="sec-title">🛠 Специализация</div>
 ${specs.length?`<div style="display:flex;flex-wrap:wrap;gap:6px">${specs.map(s=>{const on=mySpecs.indexOf(s)>=0;return `<button class="btn-sm ${on?'btn-green':'btn-outline'}" onclick="toggleSpec('${s.replace(/'/g,"\\'")}')">${escapeHtml(s)}</button>`;}).join('')}</div>`:'<div class="muted">Справочник пуст — владелец добавит специализации в админке</div>'}
 ${(mySpecs.filter(s=>specs.indexOf(s)<0).length)?`<div style="margin-top:10px"><div class="muted" style="margin-bottom:6px">Вне справочника (можно удалить):</div>${mySpecs.filter(s=>specs.indexOf(s)<0).map(s=>`<span class="btn-sm btn-outline" style="opacity:.6;margin-right:6px">${escapeHtml(s)} <span style="cursor:pointer;color:var(--red)" onclick="toggleSpec('${s.replace(/'/g,"\\'")}')">✕</span></span>`).join('')}</div>`:''}
</div>
<div class="card"><div class="sec-title">⏰ График работы</div>
 <div style="margin-bottom:10px"><b>Дни работы:</b></div>
 <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">
  ${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((d,i)=>`<label style="display:flex;align-items:center;gap:5px;font-size:14px;padding:6px 10px;border:1px solid ${sch.days.indexOf(i)>=0?'var(--green)':'#ddd'};border-radius:8px;background:${sch.days.indexOf(i)>=0?'#f0fdf4':'#fff'};cursor:pointer"><input type="checkbox" ${sch.days.indexOf(i)>=0?'checked':''} onchange="schedToggleDay(${i},this.checked)" style="margin:0"> ${d}</label>`).join('')}
 </div>
 <div style="display:flex;gap:14px;align-items:center">
  <span style="font-weight:500">С:</span><button class="btn-sm btn-outline" onclick="openClockPicker('from')" style="min-width:74px;font-weight:600">🕐 ${sch.from}</button>
  <span style="font-weight:500">По:</span><button class="btn-sm btn-outline" onclick="openClockPicker('to')" style="min-width:74px;font-weight:600">🕐 ${sch.to}</button>
 </div>
 <div id="clockPickerRoot"></div>
</div>
<div class="card"><div class="sec-title">🔔 Уведомления</div>
 <div class="tgl"><span style="font-size:14px">Системные уведомления</span><label class="switch"><input type="checkbox" ${notify.sys!==false?'checked':''} onchange="setNotify('sys',this.checked)"><span class="slider"></span></label></div>
 <div class="tgl"><span style="font-size:14px">Звук</span><label class="switch"><input type="checkbox" ${notify.sound!==false?'checked':''} onchange="setNotify('sound',this.checked)"><span class="slider"></span></label></div>
 <div class="tgl"><span style="font-size:14px">Вибрация</span><label class="switch"><input type="checkbox" ${notify.vibra!==false?'checked':''} onchange="setNotify('vibra',this.checked)"><span class="slider"></span></label></div>
 <div style="margin-top:10px"><div class="muted" style="margin-bottom:6px">Не беспокоить (часы, например 22 и 7 — с 22:00 до 07:00):</div>
  <div class="row2"><input class="input" type="number" min="0" max="23" value="${notify.dndFrom||''}" placeholder="с (ч)" onchange="setNotify('dndFrom',this.value)"><input class="input" type="number" min="0" max="23" value="${notify.dndTo||''}" placeholder="по (ч)" onchange="setNotify('dndTo',this.value)"></div></div>
</div>`;}
function toggleSpec(s){MYDOC.profile=MYDOC.profile||{};let arr=MYDOC.profile.specs||MYDOC.profile.spec||[];const i=arr.indexOf(s);if(i>=0)arr.splice(i,1);else arr.push(s);MYDOC.profile.specs=arr;MYDOC.profile.spec=arr;saveProfile();render();}
function setNotify(k,v){MYDOC.profile=MYDOC.profile||{};MYDOC.profile.notify=MYDOC.profile.notify||{};MYDOC.profile.notify[k]=v;saveProfile();}
function changePinFlow(){const p=prompt('Новый PIN (4+ цифр):');if(!p||p.length<4)return alert('Минимум 4 символа');const p2=prompt('Повторите PIN:');if(p!==p2)return alert('PIN не совпадает');savePinLocal(p);}
function savePinLocal(pin){if(typeof makePinRecord==='function'){makePinRecord(pin).then(function(rec){MYDOC.profile=MYDOC.profile||{};MYDOC.profile.pinSalt=rec.salt;MYDOC.profile.pinHash=rec.hash;delete MYDOC.profile.pin;saveProfile();alert('PIN установлен');render();});}else{MYDOC.profile=MYDOC.profile||{};MYDOC.profile.pin=pin;saveProfile();alert('PIN сохранён (без хэша)');render();}}
function resetMyPinLocal(){MYDOC.profile=MYDOC.profile||{};delete MYDOC.profile.pin;delete MYDOC.profile.pinSalt;delete MYDOC.profile.pinHash;saveProfile();alert('PIN сброшен');render();}
function schedToggleDay(i,on){MYDOC.profile.schedule=MYDOC.profile.schedule||{days:[],from:'09:00',to:'18:00'};const d=MYDOC.profile.schedule.days||[];if(on&&d.indexOf(i)<0)d.push(i);if(!on){const j=d.indexOf(i);if(j>=0)d.splice(j,1);}MYDOC.profile.schedule.days=d.sort(function(a,b){return a-b;});saveProfile();render();}
function openClockPicker(field){const cur=(MYDOC.profile.schedule||{})[field]||'09:00';const pp=cur.split(':');let h=+pp[0]||0,m=+pp[1]||0;window._clk={field:field,h:h,m:m};drawClock();}
function drawClock(){const c=window._clk;if(!c)return;const root=document.getElementById('clockPickerRoot');if(!root)return;const ha=(c.h*30-90)*Math.PI/180,ma=(c.m*6-90)*Math.PI/180;let marks='';for(let i=0;i<12;i++){const a=(i*30-90)*Math.PI/180;const x=100+75*Math.cos(a),y=100+75*Math.sin(a);marks+='<text x="'+x+'" y="'+(y+5)+'" text-anchor="middle" font-size="14" fill="#374151">'+(i||12)+'</text>';}root.innerHTML='<div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99;display:flex;align-items:center;justify-content:center" onclick="if(event.target===this)closeClockPicker()"><div style="background:#fff;border-radius:14px;padding:20px;text-align:center" onclick="event.stopPropagation()"><b style="display:block;margin-bottom:12px">'+(c.field==='from'?'Начало':'Конец')+' рабочего дня</b><svg width="200" height="200" viewBox="0 0 200 200" style="cursor:pointer" onclick="clockTap(event)"><circle cx="100" cy="100" r="90" fill="#f3f4f6" stroke="#e5e7eb" stroke-width="2"/>'+marks+'<line x1="100" y1="100" x2="'+(100+50*Math.cos(ha))+'" y2="'+(100+50*Math.sin(ha))+'" stroke="#2563eb" stroke-width="3" stroke-linecap="round"/><line x1="100" y1="100" x2="'+(100+70*Math.cos(ma))+'" y2="'+(100+70*Math.sin(ma))+'" stroke="#10b981" stroke-width="2" stroke-linecap="round"/><circle cx="100" cy="100" r="4" fill="#2563eb"/></svg><div style="font-size:24px;font-weight:700;margin:10px 0">'+String(c.h).padStart(2,'0')+':'+String(c.m).padStart(2,'0')+'</div><div class="row2"><button class="btn" style="background:#f3f4f6;color:#374151" onclick="closeClockPicker()">Отмена</button><button class="btn btn-blue" onclick="saveClockPicker()">OK</button></div></div></div>';}
function clockTap(e){const svg=e.currentTarget,rect=svg.getBoundingClientRect();const x=(e.clientX-rect.left)*(200/rect.width)-100,y=(e.clientY-rect.top)*(200/rect.height)-100;const dist=Math.sqrt(x*x+y*y);let ang=Math.atan2(y,x)*180/Math.PI+90;if(ang<0)ang+=360;if(dist<55){window._clk.h=Math.round(ang/30)%12;}else{window._clk.m=Math.round(ang/6/5)*5%60;}drawClock();}
function saveClockPicker(){const c=window._clk;if(!c)return;MYDOC.profile.schedule=MYDOC.profile.schedule||{days:[],from:'09:00',to:'18:00'};MYDOC.profile.schedule[c.field]=String(c.h).padStart(2,'0')+':'+String(c.m).padStart(2,'0');saveProfile();closeClockPicker();render();}
function closeClockPicker(){window._clk=null;const r=document.getElementById('clockPickerRoot');if(r)r.innerHTML='';}