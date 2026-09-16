// Аудит-хелпер: проверка дублей функций и ключевых идентификаторов (временный, не коммитить)
const fs = require('fs');
const h = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const fa = fs.readFileSync(__dirname + '/../tools/firebase-access.js', 'utf8');
const sw = fs.readFileSync(__dirname + '/../sw.js', 'utf8');
const names = ['renderTasks','renderShopping','renderOrders','renderDetails','startMain','takeOrder','visOrder','canShoppingCreate','shoppingForm','shoppingCreate','shoppingBuy','shoppingCancel','setTasksTab','matState','renderStaff','pushEvent','defaultData','openModal','closeModal','logAction','markDemoOrdersOnce','flushQueue','renderCalendar','tabRoles','csvExport','conflictCheck'];
console.log('=== function defs (index.html | firebase-access.js) ===');
for (const n of names) {
  const re = new RegExp('function\\s+' + n + '\\s*\\(', 'g');
  const inH = (h.match(re) || []).length;
  const inF = (fa.match(re) || []).length;
  console.log(n.padEnd(22), 'html:' + inH, 'fa:' + inF);
}
console.log('\n=== ключевые идентификаторы в index.html ===');
const keys = ['APP_VERSION','shopping_create','orders_cancel','orders_history','tasksTab','crm_tasks_tab','Доступные','Запрос на закуп','storageEnabled','showTest','PBKDF2','badging','setAppBadge','DND','doNotDisturb','Notification','network-first','boot-guard','bootGuard','flushQueue','crm_queue','photos','photoReport','manufacture','dueMode','advance','cancelReason','specializations','CSV','Финансы','conflict','override','route','ARRIVED','прибыл'];
for (const k of keys) {
  const inH = h.split(k).length - 1;
  const inF = fa.split(k).length - 1;
  console.log(k.padEnd(20), 'html:' + inH, 'fa:' + inF);
}
console.log('\nsw.js:', sw.split('navigate').length - 1, 'navigate refs; version line:', (sw.match(/VERSION\s*=\s*'[^']*'/) || sw.match(/CACHE[^=]*=\s*'[^']*'/) || ['?'])[0]);
