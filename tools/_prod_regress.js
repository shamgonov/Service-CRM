// Регресс прода: версия, маркеры, критичные фиксы
const https=require('https');
function get(url){return new Promise((res,rej)=>{https.get(url,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res({code:r.statusCode,body:d}));}).on('error',rej);});}
(async()=>{
 const B='https://shamgonov.github.io/Service-CRM/';
 let fails=0;
 const t=(n,ok)=>{console.log((ok?'OK  ':'FAIL')+' — '+n);if(!ok)fails++;};
 const vj=JSON.parse((await get(B+'version.json?c='+Date.now())).body);
 t('прод version.json 1.6.1 деплой 46', vj.version==='1.6.1'&&vj.deploy===46);
 const html=(await get(B+'index.html?c='+Date.now())).body;
 t('прод index.html APP_VERSION 1.6.1', html.includes("APP_VERSION='1.6.1'"));
 t('маркер CRM-UPDATER цел', html.includes('CRM-UPDATER'));
 t('маркер FIREBASE-ACCESS цел', html.includes('FIREBASE-ACCESS'));
 // критичный фикс 1: табы задач
 t('фикс 1: табы Доступные/Мои на проде', html.includes("setTasksTab('free')")&&html.includes("setTasksTab('mine')"));
 t('фикс 1: localStorage-таб crm_tasks_tab', html.includes('crm_tasks_tab'));
 // критичный фикс 2: кнопка запроса на закуп
 t('фикс 2: кнопка «＋ Запрос на закуп»', html.includes('＋ Запрос на закуп'));
 t('фикс 2: shoppingForm/shoppingCreate', html.includes('function shoppingForm')&&html.includes('function shoppingCreate'));
 // доп фиксы
 t('фикс 3: право shopping_close', html.includes('canShoppingClose'));
 const fa=(await get(B+'tools/firebase-access.js?c='+Date.now())).body;
 t('фикс 3: shopping_close в PERMS_CATALOG прода', fa.includes("key:'shopping_close'"));
 t('фикс 1: startMain tasksTab=free', fa.includes("state.tasksTab='free'"));
 const sw=(await get(B+'sw.js?c='+Date.now())).body;
 t('прод sw.js 1.6.1', sw.includes("VERSION='1.6.1'"));
 console.log(fails?'\nFAILS: '+fails:'\nPROD REGRESS OK');
 process.exit(fails?1:0);
})();
