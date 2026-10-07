// _purchase_smoke.js — смоук для ЗАДАЧИ B (закупки: брак spoiled + свои средства payer/refund).
// Запускается ПОСЛЕ patch_purchases.js + _fix_mepayer.js + _fix_gates.js + _fix_ruble.js.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let fails = 0;
const t = (name, cond) => { if (!cond) { fails++; console.log('  FAIL — ' + name); } else console.log('  OK   — ' + name); };

const sandbox = {
  console, Date, JSON, Math, String, Array, Object, Number, RegExp,
  setTimeout: (fn) => { try { fn(); } catch (e) {} },
  state: { user: 'Иван', simOn: false, role: 'admin' },
  DB: { orders: [], users: [], templates: [], shopping: [] },
  escapeHtml: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  // как в index.html: money() УЖЕ добавляет « ₽»
  money: n => (+n || 0).toLocaleString('ru') + ' ₽',
  isOwner: () => false,
  uiOwner: () => false,
  // права даём — проверяем бизнес-логику, а не матрицу прав
  can: () => true,
  isSim: () => false,
  isMeName: nm => !!nm && nm === sandbox.state.user,
  canShopMats: () => true,
  canEditOrder: () => true,
  prompt: () => 'тест',
  alert: (m) => { sandbox.__alerts.push(String(m)); },
  __alerts: [],
  byId: null, logAction: null, markOrder: null, save: null, render: null, pushEvent: null,
  openModal: (h) => { sandbox.__modal = h; },
  closeModal: () => { sandbox.__modal = null; },
  __pushEvents: [], __saved: false, __rendered: false, __mutOrder: null, __modal: null
};
sandbox.byId = (id) => sandbox.DB.orders.find(o => o.id === id);
sandbox.logAction = (o, action, details) => {
  o.history = o.history || [];
  o.history.push({ ts: new Date().toISOString(), by: 'test', action, details: details || null });
};
sandbox.markOrder = (o) => { sandbox.__mutOrder = o; };
sandbox.save = () => { sandbox.__saved = true; };
sandbox.render = () => { sandbox.__rendered = true; };
sandbox.pushEvent = (type, title, body, orderId, silent) => {
  sandbox.__pushEvents.push({ type, title, body, orderId, silent: !!silent });
};

// Извлекаем функции из index.html в единый vm-контекст
try {
  const names = ['matsSpent', 'moneyExtrasBlock', 'canSpoilGate', 'canRefundGate', 'markSpoiled', 'refundCompensation'];
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

console.log('=== ЗАКУПКИ (брак / свои средства): смоук ===\n');

// Подготовка заказа
const o = {
  id: 1, status: 'approved', worker: 'Петр', by: 'Сергей',
  materials: [
    { name: 'Клей', qty: 2, price: 500, munit: 'pcs', buyer: 'worker', where: 'Леруа', deadline: 3, unit: 'd', status: 'bought', factPrice: 480 },
    { name: 'Пена', qty: 1, price: 300, munit: 'pcs', buyer: 'worker', where: 'Строитель', deadline: 2, unit: 'd', status: 'todo' },
    { name: 'Дрель', qty: 1, price: 1000, munit: 'pcs', buyer: 'company', where: '', deadline: 1, unit: 'd', status: 'bought', factPrice: 950 }
  ],
  extras: [], works: [], history: []
};
sandbox.DB.orders = [o];

// B1. matsSpent: испорченное НЕ входит в расход
o.materials[0].spoiled = { reason: 'повреждена упаковка', dt: '2026-10-05T10:00:00Z', by: 'Иван' };
const spent = sandbox.matsSpent(o);
t('B1 spoiled исключён из расхода', spent === 950); // только дрель (950), клей (480) — брак
t('B1 matsSpent — число', typeof spent === 'number');

// B2. Бейдж spoiled присутствует в разметке
t('B2 spoiled badge в коде', html.indexOf('m.spoiled') >= 0);

// B3. payer != company → бейдж
t('B3 payer badge в коде', html.indexOf('m.payer&&m.payer!=="company"') >= 0 || html.indexOf("m.payer&&m.payer!=='company'") >= 0);

// B4. refundCompensation: pending → paid
o.materials[1].payer = 'Иван'; o.materials[1].refund = 'pending';
o.materials[1].status = 'bought'; o.materials[1].factPrice = 300;
sandbox.__saved = false; sandbox.__rendered = false; sandbox.__mutOrder = null; sandbox.__alerts = [];
sandbox.refundCompensation(1, 1);
t('B4 refund → paid', o.materials[1].refund === 'paid');
t('B4 refund history', o.history.length > 0 && o.history[o.history.length - 1].action === 'purchase_refund');
t('B4 refund saved+rendered', sandbox.__saved === true && sandbox.__rendered === true);
t('B4 refund без alert', sandbox.__alerts.length === 0);

// B4b. Компенсация уже paid — повторно не срабатывает (не дёргает save)
sandbox.__saved = false; sandbox.__alerts = [];
const histLen = o.history.length;
sandbox.refundCompensation(1, 1);
t('B4b повтор paid — без изменений', o.materials[1].refund === 'paid' && o.history.length === histLen);

// B5. markSpoiled: устанавливает spoiled с причиной
o.materials[1] = { name: 'Пена', qty: 1, price: 300, munit: 'pcs', buyer: 'company', where: '', deadline: 2, unit: 'd', status: 'bought', factPrice: 290 };
sandbox.__saved = false; sandbox.__rendered = false; sandbox.__mutOrder = null; sandbox.__alerts = [];
sandbox.markSpoiled(1, 1);
t('B5 spoiled — объект', !!o.materials[1].spoiled);
t('B5 spoiled reason', o.materials[1].spoiled.reason === 'тест');
t('B5 spoiled history', o.history.length > 0 && o.history[o.history.length - 1].action === 'purchase_spoiled');
t('B5 spoiled saved+rendered', sandbox.__saved === true && sandbox.__rendered === true);

// B5b. markSpoiled без причины — отклоняется
o.materials[1] = { name: 'Лента', qty: 1, price: 100, munit: 'pcs', buyer: 'company', where: '', deadline: 1, unit: 'd', status: 'bought', factPrice: 100 };
sandbox.prompt = () => '   ';
sandbox.__saved = false; sandbox.__alerts = [];
sandbox.markSpoiled(1, 1);
t('B5b пустая причина — брак не проставлен', !o.materials[1].spoiled && sandbox.__saved === false);
t('B5b пустая причина — alert', sandbox.__alerts.length > 0);
sandbox.prompt = () => 'тест';

// B5c. Гейт прав: без прав кнопку/действие недоступно
sandbox.can = () => false; sandbox.uiOwner = () => false; sandbox.state.user = 'Чужой';
t('B5c canSpoilGate без прав = false', sandbox.canSpoilGate(o) === false);
t('B5c canRefundGate без прав = false', sandbox.canRefundGate() === false);
sandbox.state.user = 'Иван';
t('B5c canSpoilGate автор заявки = true', sandbox.canSpoilGate({ by: 'Иван' }) === true);
sandbox.can = () => true; sandbox.uiOwner = () => false;
t('B5c canSpoilGate с правом orders_edit = true', sandbox.canSpoilGate({ by: 'Сергей' }) === true);
t('B5c canRefundGate с правом finance_edit = true', sandbox.canRefundGate() === true);

// B6. moneyExtrasBlock: испорченные + свои средства + итог
o.materials[0].spoiled = { reason: 'повреждена', dt: '2026-10-05', by: 'Иван' };
o.materials[0].status = 'bought'; o.materials[0].factPrice = 480;
o.materials[1] = { name: 'Пена', qty: 1, price: 300, munit: 'pcs', buyer: 'company', where: '', deadline: 2, unit: 'd', status: 'bought', factPrice: 290 };
o.materials[3] = { name: 'Клей свой', qty: 1, price: 150, munit: 'pcs', buyer: 'Иван', where: '', deadline: 1, unit: 'd', status: 'bought', factPrice: 150, payer: 'Иван', refund: 'pending' };
const blockHtml = sandbox.moneyExtrasBlock(o);
t('B6 блок содержит ⚠️', blockHtml.includes('⚠️'));
t('B6 блок содержит 💳', blockHtml.includes('💳'));
t('B6 блок содержит итог', blockHtml.includes('К компенсации'));
t('B6 итог = 150 ₽', blockHtml.includes('К компенсации: 150 ₽'));
t('B6 нет двойного ₽', !blockHtml.includes('₽ ₽'));
t('B6 пустой блок, если нет брака/своих', sandbox.moneyExtrasBlock({ materials: [{ name: 'x', price: 1, status: 'bought' }] }) === '');

// B7. refund=paid НЕ попадает в список и в итог
o.materials[3].refund = 'paid';
const blockPaid = sandbox.moneyExtrasBlock(o);
t('B7 paid не в списке 💳', !blockPaid.includes('💳'));
t('B7 paid не в итоге (0 ₽)', blockPaid.includes('К компенсации: 0 ₽'));
t('B7 брак остался в блоке', blockPaid.includes('⚠️'));

// B8. HIST_A: purchase_spoiled / purchase_refund
t('B8 HIST_A spoiled', html.indexOf('purchase_spoiled:') >= 0);
t('B8 HIST_A refund', html.indexOf('purchase_refund:') >= 0);

// B9. histLine: purchase_spoiled / purchase_refund
t('B9 histLine spoiled', html.indexOf("h.action==='purchase_spoiled'") >= 0);
t('B9 histLine refund', html.indexOf("h.action==='purchase_refund'") >= 0);

// B10-B11. Поля payer в формах
t('B10 nm-payer select', html.indexOf('id="nm-payer"') >= 0);
t('B11 mf-payer select', html.indexOf('id="mf-payer"') >= 0);

// B12. addMat: payer + refund
t('B12 addMat payer', html.indexOf("payer:g('mf-payer')") >= 0);
t('B12 addMat refund', html.indexOf("refund:(g('mf-payer')||'company')!=='company'") >= 0);

// B13. addNewMat: payer + refund
t('B13 addNewMat payer', html.indexOf("payer:g('nm-payer')") >= 0);
t('B13 addNewMat refund', html.indexOf("refund:(g('nm-payer')||'company')!=='company'") >= 0);

// B14. Кнопки в карточке заявки
t('B14 кнопка «Испорчен»', html.indexOf('markSpoiled(') >= 0);
t('B14 кнопка «Компенсация»', html.indexOf('refundCompensation(') >= 0);

console.log('\n' + (fails === 0 ? '✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ' : '❌ FAIL: ' + fails));
process.exit(fails);