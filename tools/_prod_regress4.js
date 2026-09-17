// Прод-регресс v1.6.6 (деплой №51): Блок А — взятие в работу через гейт, вкладки, видимость, этапы
const https=require('https');
function get(url){return new Promise((res,rej)=>{https.get(url,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res({code:r.statusCode,body:d}));}).on('error',rej);});}
(async()=>{
 const B='https://shamgonov.github.io/Service-CRM/';
 let fails=0;
 const t=(n,ok)=>{console.log((ok?'OK  ':'FAIL')+' — '+n);if(!ok)fails++;};
 const vj=JSON.parse((await get(B+'version.json?c='+Date.now())).body);
 t('прод version.json 1.6.6 деплой 51', vj.version==='1.6.6'&&vj.deploy===51);
 const html=(await get(B+'index.html?c='+Date.now())).body;
 t('прод index.html APP_VERSION 1.6.6', html.includes("APP_VERSION='1.6.6'"));
 t('маркер CRM-UPDATER цел', html.includes('CRM-UPDATER'));
 t('маркер FIREBASE-ACCESS цел', html.includes('FIREBASE-ACCESS'));
 const fa=(await get(B+'tools/firebase-access.js?c='+Date.now())).body;
 // Блок А: права и статус
 t('А1: право orders_take в каталоге на проде', fa.includes("key:'orders_take'"));
 t('А1: право orders_view_all в каталоге на проде', fa.includes("key:'orders_view_all'"));
 t('А1: operator/manager по умолчанию с orders_take', /id:'operator'[\s\S]*?perms:\[[^\]]*orders_take/.test(fa)&&/id:'manager'[\s\S]*?perms:\[[^\]]*orders_take/.test(fa));
 t('А1: worker по умолчанию без orders_take', !/id:'worker'[\s\S]*?perms:\[[^\]]*orders_take/.test(fa));
 t('А1: inwork в статусах напоминаний', fa.includes("'approved','in_progress','inwork','new'"));
 t('А2: статус inwork в ST', /inwork:\{t:'В работе'/.test(html));
 t('А2: isInwork покрывает legacy in_progress', html.includes("o.status==='inwork'||o.status==='in_progress'"));
 t('А2: canTakeOrder = orders_take/владелец/создатель', /function canTakeOrder\(o\)\{[\s\S]{0,200}can\('orders_take'\)/.test(html));
 t('А2: showTakeBtn (статус new/approved + исполнитель пуст или создатель/owner/admin)', html.includes('function showTakeBtn(o)')&&html.includes("['new','approved'].indexOf(o.status)<0"));
 t('А2: hiddenTakeFromMe + canViewAllOrders', html.includes('function hiddenTakeFromMe(o)')&&html.includes("can('orders_view_all')"));
 // Блок А: гейт
 t('А3: гейт-модалка takeGateModal в #modal-root', html.includes('function takeGateModal(id)')&&html.includes('takeConfirm(${o.id})'));
 t('А3: подтверждение пишет worker/status/takenBy/takenTs', html.includes("o.worker=state.user;o.status='inwork';o.takenBy=state.user;o.takenTs=Date.now()"));
 t('А3: история take + событие прежнему исполнителю', html.includes("logAction(o,'take'")&&html.includes("pushEvent('assigned','🚜 Заявка №'"));
 t('А3: после подтверждения — details', /closeModal\(\);[\s\S]{0,200}go\('details',o\.id\)/.test(html));
 t('А3: takeOrder — только обёртка над гейтом', /function takeOrder\(id\)\{takeGateModal\(id\)\}/.test(html));
 t('А3: кнопка «🚜 Взять в работу» есть, отмена — через canCancel', html.includes('🚜 Взять в работу')&&html.includes('cancelOrderModal('));
 // Блок А: вкладки
 t('А4: экран переименован в «Поиск заказов»', html.includes("['tasks','🔍','Поиск заказов']")&&html.includes('🔍 Поиск заказов'));
 t('А4: три вкладки Доступные/В работе/Завершённые', html.includes("setTasksTab('free')")&&html.includes("setTasksTab('work')")&&html.includes("setTasksTab('done')"));
 t('А4: выбор вкладки в localStorage + старый ключ mine', html.includes("localStorage.setItem('crm_tasks_tab',t)")&&html.includes("tabRaw==='mine'?'work'"));
 t('А4: чужие inwork скрыты в списке заявок', html.includes('DB.orders.slice().filter(o=>visOrder(o)&&!hiddenTakeFromMe(o))'));
 t('А4: бейдж исполнителя у взятых', html.includes('🚜 ${escapeHtml(o.worker)}'));
 t('А5: завершение блокируется при незакрытых этапах (любой тип)', /function finishOrder\(id\)\{[\s\S]{0,220}\(o\.stages\|\|\[\]\)\.filter\(s=>!s\.done\)/.test(html));
 // регресс прежних механик
 t('регресс: пауза рендера цела', html.includes('var RENDER_HOLD=null,RENDER_PENDING=false')&&/function render\(\)\{\s*if\(renderHoldGate\(\)\)return;/.test(html));
 t('регресс: метки времени tickTimeLabels', html.includes('setInterval(tickTimeLabels,1000)'));
 t('регресс: editOrderModal/doEditOrder', html.includes('function editOrderModal(')&&html.includes('function doEditOrder('));
 t('регресс: активные исполнители', html.includes('function activeWorkers(')&&html.includes('function filterWorkerSelect('));
 t('регресс: модалки в #modal-root', html.includes('id="modal-root"'));
 const sw=(await get(B+'sw.js?c='+Date.now())).body;
 t('прод sw.js 1.6.6', sw.includes("VERSION='1.6.6'"));
 console.log(fails?'\nFAILS: '+fails:'\nPROD REGRESS OK (v1.6.6)');
 process.exit(fails?1:0);
})();
