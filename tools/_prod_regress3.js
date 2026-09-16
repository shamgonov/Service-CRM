// Прод-регресс v1.6.4: версии, маркеры, пауза рендера, точечные метки времени, регресс механик
const https=require('https');
function get(url){return new Promise((res,rej)=>{https.get(url,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res({code:r.statusCode,body:d}));}).on('error',rej);});}
(async()=>{
 const B='https://shamgonov.github.io/Service-CRM/';
 let fails=0;
 const t=(n,ok)=>{console.log((ok?'OK  ':'FAIL')+' — '+n);if(!ok)fails++;};
 const vj=JSON.parse((await get(B+'version.json?c='+Date.now())).body);
 t('прод version.json 1.6.4 деплой 49', vj.version==='1.6.4'&&vj.deploy===49);
 const html=(await get(B+'index.html?c='+Date.now())).body;
 t('прод index.html APP_VERSION 1.6.4', html.includes("APP_VERSION='1.6.4'"));
 t('маркер CRM-UPDATER цел', html.includes('CRM-UPDATER'));
 t('маркер FIREBASE-ACCESS цел', html.includes('FIREBASE-ACCESS'));
 // новое: пауза полного рендера
 t('пауза: RENDER_HOLD/RENDER_PENDING объявлены', html.includes('var RENDER_HOLD=null,RENDER_PENDING=false'));
 t('пауза: гейт первым стоит в render()', /function render\(\)\{\s*if\(renderHoldGate\(\)\)return;/.test(html));
 t('пауза: focusin/focusout/change на #app', html.includes("addEventListener('focusin'")&&html.includes("addEventListener('focusout'")&&html.includes("addEventListener('change'"));
 t('пауза: переход между полями не снимает паузу', html.includes('if(renderHoldEditable(n)&&app.contains(n))return;'));
 t('пауза: клик-страховка вне полей', html.includes("if(tg==='SELECT'||tg==='INPUT'||tg==='TEXTAREA'||tg==='LABEL')return;"));
 t('метки времени: tickTimeLabels + data-tleft', html.includes('function tickTimeLabels()')&&html.includes('data-tleft=')&&html.includes("'+o.id+':'+i+'")&&html.includes("'+r.o.id+':'+r.i+'"));
 t('метки времени: тикер без полного render', html.includes('setInterval(tickTimeLabels,1000)')&&!/setInterval\([^)]*render[^)]*\)/.test(html));
 const fa=(await get(B+'tools/firebase-access.js?c='+Date.now())).body;
 t('фа: гейт паузы в обёртке window.render', /window\.render = function\(\)\{[\s\S]{0,400}renderHoldGate\(\)\)return;/.test(fa));
 t('фа: PHOTOS_SIG + разрыв цикла фото', fa.includes('var PHOTOS_SIG={}')&&fa.includes('if(PHOTOS_SIG[oid]===sig)return;'));
 t('фа: loadOrderPhotos принимает arr', fa.includes('loadOrderPhotos(oid, function(arr){'));
 // регресс: модалки вне зоны рендера, скролл/фокус, прежнее
 t('регресс: #modal-root вне #app', html.includes('<div id="app"></div>\n<div id="modal-root"></div>')||html.includes('id="modal-root"'));
 t('регресс: сохранение скролла/фокуса в render', html.includes('var _y=window.scrollY')&&html.includes('requestAnimationFrame'));
 t('регресс: deep-equal холостых снапшотов', fa.includes('function jsonEq(')&&fa.includes('LAST_ORDERS_JSON'));
 t('регресс: табы задач целы', html.includes("setTasksTab('free')")&&html.includes('crm_tasks_tab'));
 t('регресс: селект статуса + права', html.includes("can('orders_status')"));
 t('регресс: editOrderModal/doEditOrder', html.includes('function editOrderModal(')&&html.includes('function doEditOrder('));
 t('регресс: активные исполнители', html.includes('function activeWorkers(')&&html.includes('function filterWorkerSelect('));
 const sw=(await get(B+'sw.js?c='+Date.now())).body;
 t('прод sw.js 1.6.4', sw.includes("VERSION='1.6.4'"));
 console.log(fails?'\nFAILS: '+fails:'\nPROD REGRESS OK (v1.6.4)');
 process.exit(fails?1:0);
})();
