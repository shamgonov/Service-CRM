// _confirm_smoke.js — смоук для ЗАДАЧИ A (соисполнитель: подтверждение участия).
// Запускается ПОСЛЕ patch_confirm_helper.js (нужен новый код в index.html).
// Node + vm: извлекаем чистые функции из index.html и гоняем логику на моках.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let fails = 0;
const t = (name, cond) => { if (!cond) { fails++; console.log('  FAIL — ' + name); } else console.log('  OK   — ' + name); };

const sandbox = {
  console, Date, JSON, Math, String, Array, Object, Number, RegExp,
  setTimeout: (fn) => { try { fn(); } catch (e) {} },
  state: { user: 'Иван', simOn: false, role: 'worker' },
  DB: { orders: [], users: [], templates: [], shopping: [] },
  escapeHtml: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  alert: m => { sandbox.__alert = String(m); },
  prompt: () => 'тест',
  isOwner: () => false,
  uiOwner: () => false,
  adminLike: () => false,
  isSim: () => false,
  can: () => false,
  isMeName: function (nm) { return !!nm && (nm === sandbox.state.user || (sandbox.isSim() && nm === 'Владелец')); },
  canTakeOrder: () => true,
  activeWorkers: () => ['Иван', 'Петр', 'Алексей', 'Сергей'],
  getUserName: (u) => u,
  // заглушки-зависимости (перезапишутся ниже)
  byId: null, logAction: null, markOrder: null, save: null, render: null, pushEvent: null,
  openModal: (h) => { sandbox.__modal = h; },
  closeModal: () => { sandbox.__modal = null; },
  __pushEvents: [], __saved: false, __rendered: false, __mutOrder: null, __modal: null
};
sandbox.byId = (id) => sandbox.DB.orders.find(o => o.id === id);
sandbox.logAction = (o, action, details) => { o.history = o.history || []; o.history.push({ ts: new Date().toISOString(), by: 'test', action, details: details || null }); };
sandbox.markOrder = (o) => { sandbox.__mutOrder = o; };
sandbox.save = () => { sandbox.__saved = true; };
sandbox.render = () => { sandbox.__rendered = true; };
sandbox.pushEvent = (type, title, body, orderId, silent) => { sandbox.__pushEvents.push({ type, title, body, orderId, silent: !!silent }); };

// --- Извлекаем чистые функции из index.html в vm-контекст (sandbox = глобал) ---
try {
  const names = ['helpersOf', 'allWorkersOf', 'isAssignedToMe', 'isHelperPending', 'showTakeBtn', 'confirmHelper', 'declineHelper', 'helperPendingModal'];
  let block = '';
  for (const name of names) {
    const i = html.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('NOT FOUND: function ' + name);
    let d = 0, j = html.indexOf('{', i), end = -1;
    for (let k = j; k < html.length; k++) { if (html[k] === '{') d++; else if (html[k] === '}') { d--; if (d === 0) { end = k + 1; break; } } }
    if (end < 0) throw new Error('NO CLOSE BRACE: ' + name);
    block += html.slice(i, end) + '\n';
  }
  const ctx = vm.createContext(sandbox);
  vm.runInContext(block, ctx, { timeout: 5000 });
  console.log('  ✓ функции извлечены из index.html');
} catch (e) { console.log('FATAL: ' + e.message); process.exit(1); }

console.log('=== ПОДТВЕРЖДЕНИЕ СОИСПОЛНИТЕЛЯ: смоук ===\n');

// helpersOf / allWorkersOf / isAssignedToMe
sandbox.DB.orders = [{ id: 1, helpers: ['Иван', 'Петр'], worker: 'Алексей', status: 'new', by: 'Сергей' }];
t('T1 helpersOf', JSON.stringify(sandbox.helpersOf(sandbox.DB.orders[0])) === JSON.stringify(['Иван', 'Петр']));
t('T2 allWorkersOf', JSON.stringify(sandbox.allWorkersOf(sandbox.DB.orders[0])) === JSON.stringify(['Алексей', 'Иван', 'Петр']));
sandbox.state.user = 'Алексей'; t('T3 isAssignedToMe (worker)', sandbox.isAssignedToMe(sandbox.DB.orders[0]) === true);
sandbox.state.user = 'Иван';   t('T4 isAssignedToMe (helper)', sandbox.isAssignedToMe(sandbox.DB.orders[0]) === true);

// showTakeBtn
sandbox.state.user = 'Петр';
sandbox.DB.orders[0] = { id: 1, worker: 'Алексей', status: 'new', by: 'Сергей' };
t('T5 showTakeBtn (worker занят, не создатель)', sandbox.showTakeBtn(sandbox.DB.orders[0]) === false);
sandbox.DB.orders[0].worker = null;
t('T6 showTakeBtn (пул)', sandbox.showTakeBtn(sandbox.DB.orders[0]) === true);

// isHelperPending
sandbox.state.user = 'Иван';
sandbox.DB.orders[0] = { id: 1, helpers: [], confirm: {}, status: 'new' };
t('T7 isHelperPending (пусто)', sandbox.isHelperPending(sandbox.DB.orders[0]) === false);
sandbox.DB.orders[0] = { id: 1, helpers: ['Иван'], confirm: {}, status: 'new' };
t('T8 isHelperPending (нет confirm)', sandbox.isHelperPending(sandbox.DB.orders[0]) === false);
sandbox.DB.orders[0] = { id: 1, helpers: ['Иван'], confirm: { 'Иван': 'pending' }, status: 'new' };
t('T9 isHelperPending (pending)', sandbox.isHelperPending(sandbox.DB.orders[0]) === true);
sandbox.DB.orders[0].confirm = { 'Иван': 'ok' };
t('T10 isHelperPending (ok)', sandbox.isHelperPending(sandbox.DB.orders[0]) === false);
sandbox.DB.orders[0].confirm = { 'Иван': 'pending' }; sandbox.DB.orders[0].status = 'completed';
t('T11 isHelperPending (completed)', sandbox.isHelperPending(sandbox.DB.orders[0]) === false);

// confirmHelper
sandbox.DB.orders[0] = { id: 1, helpers: ['Иван'], confirm: { 'Иван': 'pending' }, status: 'new', history: [] };
sandbox.__pushEvents = []; sandbox.__saved = false; sandbox.__rendered = false; sandbox.__mutOrder = null;
sandbox.confirmHelper(1);
t('T13 confirm=ok', sandbox.DB.orders[0].confirm['Иван'] === 'ok');
t('T13 history accept_helper', sandbox.DB.orders[0].history[0].action === 'accept_helper');
t('T13 pushEvent helper_accept', sandbox.__pushEvents[0].type === 'helper_accept');
t('T13 saved', sandbox.__saved === true);
t('T13 rendered', sandbox.__rendered === true);

// declineHelper
sandbox.DB.orders[0] = { id: 1, helpers: ['Иван', 'Петр'], confirm: { 'Иван': 'pending' }, status: 'new', history: [] };
sandbox.__pushEvents = []; sandbox.__saved = false; sandbox.__rendered = false;
sandbox.prompt = () => 'не могу приехать';
sandbox.declineHelper(1);
t('T14 helpers без Ивана', JSON.stringify(sandbox.DB.orders[0].helpers) === JSON.stringify(['Петр']));
t('T14 confirm=no', sandbox.DB.orders[0].confirm['Иван'] === 'no');
t('T14 history decline_helper', sandbox.DB.orders[0].history[0].action === 'decline_helper');
t('T14 pushEvent helper_decline', sandbox.__pushEvents[0].type === 'helper_decline');
t('T14 saved', sandbox.__saved === true);

// declineHelper с пустой причиной — отказ
sandbox.DB.orders[0] = { id: 1, helpers: ['Иван'], confirm: { 'Иван': 'pending' }, status: 'new', history: [] };
sandbox.prompt = () => '   ';
sandbox.__alert = null;
sandbox.declineHelper(1);
t('T14b пустая причина → alert', /причин/i.test(sandbox.__alert || '') && sandbox.DB.orders[0].confirm['Иван'] === 'pending');

// helperPendingModal
sandbox.DB.orders = [{ id: 1, helpers: ['Иван'], confirm: { 'Иван': 'pending' }, status: 'new', client: 'ООО Тест', date: '2026-09-20', t1: '10:00', t2: '12:00', address: 'Лена, 1' }];
sandbox.state.user = 'Иван';
sandbox.__modal = null;
sandbox.helperPendingModal();
t('T15 modal открыта', !!sandbox.__modal && sandbox.__modal.includes('Подтвердите участие'));
t('T15 modal содержит №1', !!sandbox.__modal && sandbox.__modal.includes('№1'));
sandbox.DB.orders[0].confirm = { 'Иван': 'ok' };
sandbox.__modal = null;
sandbox.helperPendingModal();
t('T16 modal не открыта (нет pending)', sandbox.__modal === null);

console.log('\n' + (fails === 0 ? '✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ' : '❌ FAIL: ' + fails));
process.exit(fails);