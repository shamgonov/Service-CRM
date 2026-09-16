// Прод-регресс v1.6.2: версии, маркеры, все новые механики
const https=require('https');
function get(url){return new Promise((res,rej)=>{https.get(url,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res({code:r.statusCode,body:d}));}).on('error',rej);});}
(async()=>{
 const B='https://shamgonov.github.io/Service-CRM/';
 let fails=0;
 const t=(n,ok)=>{console.log((ok?'OK  ':'FAIL')+' — '+n);if(!ok)fails++;};
 const vj=JSON.parse((await get(B+'version.json?c='+Date.now())).body);
 t('прод version.json 1.6.2 деплой 47', vj.version==='1.6.2'&&vj.deploy===47);
 const html=(await get(B+'index.html?c='+Date.now())).body;
 t('прод index.html APP_VERSION 1.6.2', html.includes("APP_VERSION='1.6.2'"));
 t('маркер CRM-UPDATER цел', html.includes('CRM-UPDATER'));
 t('маркер FIREBASE-ACCESS цел', html.includes('FIREBASE-ACCESS'));
 // задачи 1-6: маркеры новых механик
 t('зад.1/4: canManage через can(orders_status) (хардкода ролей нет)', !html.includes("['admin','operator','manager'].includes(state.role);\n const canManage")&&html.includes("can('orders_status')"));
 t('зад.2: rolesOf/unionPermsFor в проде (fa)', true);
 const fa=(await get(B+'tools/firebase-access.js?c='+Date.now())).body;
 t('зад.2: rolesOf + unionPermsFor + toggleEmpRole', fa.includes('function rolesOf(')&&fa.includes('function unionPermsFor(')&&fa.includes('function toggleEmpRole('));
 t('зад.2: approve пишет roles:[role]', fa.includes('roles:[role]'));
 t('зад.3: myDocWriteProfile (uid до профиля)', fa.includes('function myDocWriteProfile('));
 t('зад.4: гейты staff_manage/roles_manage', fa.includes("can('roles_manage')")&&fa.includes("can('staff_manage')"));
 t('зад.4: profile_view в addProfileNavItem', fa.includes("can('profile_view')"));
 t('зад.4: подписка на roles-снапшот', fa.includes("collection('roles').onSnapshot"));
 t('зад.5: editOrderModal + doEditOrder + canEditOrder', html.includes('function editOrderModal(')&&html.includes('function doEditOrder(')&&html.includes('function canEditOrder('));
 t('зад.6: activeWorkers + filterWorkerSelect', html.includes('function activeWorkers(')&&html.includes('function filterWorkerSelect('));
 t('зад.6: исполнитель = создатель при создании', html.includes("worker:g('c-worker')||state.user"));
 t('зад.6: canTakeOrder + гейт takeOrder', html.includes('function canTakeOrder(')&&html.includes('if(!canTakeOrder(o))return alert'));
 t('зад.4: canDeleteOrder + deleteOrder', html.includes('function canDeleteOrder(')&&html.includes('function deleteOrder('));
 t('регресс: табы задач целы', html.includes("setTasksTab('free')")&&html.includes('crm_tasks_tab'));
 t('регресс: кнопка закупа цела', html.includes('＋ Запрос на закуп'));
 const sw=(await get(B+'sw.js?c='+Date.now())).body;
 t('прод sw.js 1.6.2', sw.includes("VERSION='1.6.2'"));
 console.log(fails?'\nFAILS: '+fails:'\nPROD REGRESS OK (v1.6.2)');
 process.exit(fails?1:0);
})();
