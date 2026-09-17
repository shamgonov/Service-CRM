// === СХЕМА ВЫПОЛНЕНИЯ: автогенерация этапов при взятии ===
function takeConfirm(id){
 const o=byId(id);if(!o)return;
 if(!showTakeBtn(o))return alert('Нет прав на взятие заявки');
 o.status='inwork';
 if(!o.worker)o.worker=state.user;
 o.takenBy=state.user;
 o.takenTs=Date.now();
 // Автогенерация 7 этапов
 const hasMats=(o.materials||[]).length>0;
 o.stages=[
  {id:'st_call',type:'custom',title:'Созвон с заказчиком',done:false},
  {id:'st_left',type:'custom',title:'Выехал',done:false},
 ];
 if(hasMats)o.stages.push({id:'st_buy',type:'custom',title:'Закупка/комплектация материалов',done:false});
 o.stages.push(
  {id:'st_arrive',type:'custom',title:'К заказчику',done:false},
  {id:'st_work',type:'custom',title:'Приступил к работе',done:false},
  {id:'st_pay',type:'custom',title:'Оплата',done:false,autoOnly:true},
  {id:'st_done',type:'custom',title:'Завершить',done:false,autoOnly:true}
 );
 logAction(o,'take',{by:state.user});
 markOrder(o);orderSave(o);saveSettings();
 closeModal();
 go('details',id);
}

// === ОКНО СХЕМЫ: открывается из карточки, сворачивается в боковой трей ===
function openSchemeTray(id){
 const o=byId(id);if(!o)return;
 state.schemeTray=id;
 render();
}
function closeSchemeTray(){
 state.schemeTray=null;
 render();
}

// === КНОПКА ЭТАПА: отметить готовым (только для этапов 1-5) ===
function stageMarkDone(id,stageId){
 const o=byId(id);if(!o)return;
 const s=(o.stages||[]).find(x=>x.id===stageId);
 if(!s||s.autoOnly)return alert('Этот этап отмечается из карточки');
 s.done=true;s.ts_done=Date.now();s.by=state.user;
 logAction(o,'stage_done',{stage:s.title});
 markOrder(o);orderSave(o);
 if(state.schemeTray===id)render();
}

// === АВТООТМЕТКА ОПЛАТЫ: вызывается из closeOrderPay/closeOrderFull/setStatus('paid') ===
function autoMarkPaymentDone(id){
 const o=byId(id);if(!o)return;
 const payStage=(o.stages||[]).find(x=>x.id==='st_pay');
 if(payStage&&!payStage.done){
  payStage.done=true;payStage.ts_done=Date.now();payStage.by=state.user;
  logAction(o,'stage_done',{stage:'Оплата (авто)'});
  markOrder(o);orderSave(o);
 }
}

// === ПРОВЕРКА: все этапы кроме последнего готовы? ===
function allStagesReadyForComplete(o){
 const st=o.stages||[];
 if(!st.length)return true;
 const allButLast=st.slice(0,-1);
 return allButLast.every(s=>s.done);
}

// === КАЛЕНДАРЬ: клик по свободному слоту → новая заявка с предзаполнением ===
var CAL_HOLD=null,CAL_SRC=null,CAL_DRAG=null;
function calSlotClick(e,si,sStart,sEnd){
 if(e.target.closest('.cal-order'))return;
 CAL_HOLD=setTimeout(()=>{CAL_HOLD=null;if(can('orders_edit')){CAL_SRC=si;render();}},400);
}
function calSlotRelease(e,si,sStart,sEnd){
 if(CAL_HOLD){
  clearTimeout(CAL_HOLD);CAL_HOLD=null;
  if(!can('orders_create'))return;
  state.calPrefill={date:state.calDate,t1:sStart,t2:sEnd};
  go('create');
 }
}
function calOrderDown(e,oid,si){
 e.stopPropagation();e.preventDefault();
 CAL_HOLD=setTimeout(()=>{CAL_HOLD=null;if(can('orders_edit')){CAL_SRC=si;CAL_DRAG=oid;render();}},400);
}
function calDrop(e,ti,tStart,tEnd){
 e.preventDefault();
 if(CAL_DRAG==null||CAL_SRC==null||CAL_SRC===ti){CAL_SRC=null;CAL_DRAG=null;render();return;}
 const src=byId(CAL_DRAG);if(!src){CAL_SRC=null;CAL_DRAG=null;render();return;}
 const tgtOrders=DB.orders.filter(o=>o.date===state.calDate&&o.t1<tEnd&&o.t2>tStart&&o.id!==CAL_DRAG);
 const swap=tgtOrders.length?tgtOrders[0]:null;
 const srcDur=(toMin(src.t2)-toMin(src.t1));
 const newT1=tStart,newT2=String(Math.floor((toMin(tStart)+srcDur)/60)).padStart(2,'0')+':'+String((toMin(tStart)+srcDur)%60).padStart(2,'0');
 let msg='<b>Перенос заявки №'+src.id+'</b><br>'+src.date+' '+src.t1+'–'+src.t2+' → '+state.calDate+' '+newT1+'–'+newT2;
 if(swap){msg+='<br><br><b>Обмен с заявкой №'+swap.id+'</b><br>'+swap.date+' '+swap.t1+'–'+swap.t2+' ↔ '+src.date+' '+src.t1+'–'+src.t2;}
 openModal('<div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99;display:flex;align-items:center;justify-content:center;padding:16px" onclick="if(event.target===this)closeModal()"><div style="background:#fff;border-radius:12px;max-width:340px;width:100%;padding:20px" onclick="event.stopPropagation()"><b style="display:block;margin-bottom:10px">📅 Подтвердите изменение</b><div style="margin-bottom:14px;font-size:14px">'+msg+'</div><div class="row2"><button class="btn" style="background:#f3f4f6;color:#374151" onclick="CAL_SRC=null;CAL_DRAG=null;closeModal();render()">Отмена</button><button class="btn btn-blue" onclick="calConfirmMove('+src.id+',\''+newT1+'\',\''+newT2+'\','+(swap?swap.id:'null')+')">Подтвердить</button></div></div></div>');
}
function calConfirmMove(oid,newT1,newT2,swapId){
 const o=byId(oid);if(!o){closeModal();return;}
 const old={date:o.date,t1:o.t1,t2:o.t2};
 if(swapId){const s=byId(swapId);if(s){const st={date:s.date,t1:s.t1,t2:s.t2};s.date=old.date;s.t1=old.t1;s.t2=old.t2;logAction(s,'edit',{fields:['date: '+st.date+'→'+s.date,'t1: '+st.t1+'→'+s.t1,'t2: '+st.t2+'→'+s.t2]});markOrder(s);orderSave(s);}}
 o.date=state.calDate;o.t1=newT1;o.t2=newT2;
 logAction(o,'edit',{fields:['date: '+old.date+'→'+o.date,'t1: '+old.t1+'→'+o.t1,'t2: '+old.t2+'→'+o.t2]});
 markOrder(o);orderSave(o);
 CAL_SRC=null;CAL_DRAG=null;closeModal();render();
 pushEvent('calendar','📅 Календарь изменён — №'+o.id,o.date+' '+o.t1+'–'+o.t2,o.id);
}