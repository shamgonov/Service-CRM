// Смоук «Мой календарь» (sched1): слоты, занятость из заявок, права на просмотр/правку,
// таб «Общий/Мой», модалка дня, запись/удаление дня, офлайн-очередь и её доставка.
// Функции извлекаются текстом из index.html и tools/firebase-access.js и выполняются в vm.
const fs = require('fs');
const vm = require('vm');
const app = fs.readFileSync('index.html', 'utf8');
const fa = fs.readFileSync('tools/firebase-access.js', 'utf8');
let fails = 0;
const t = (name, cond) => { if (!cond) fails++; console.log((cond ? 'OK  ' : 'FAIL') + ' — ' + name); };
const tick = () => new Promise(r => setTimeout(r, 0));

function grabFn(name, src) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('not found: ' + name);
  let end = src.indexOf('\nfunction ', i + 5);
  if (end < 0) end = src.length;
  return src.slice(i, end);
}
function grabConst(name, src) {
  const i = src.indexOf('const ' + name + '=');
  if (i < 0) throw new Error('not found: ' + name);
  const e = src.indexOf('\n', i);
  return src.slice(i, e < 0 ? src.length : e);
}
const vars = c => c.split('const ').join('var ').split('let ').join('var ');

function mkStore() {
  return {
    h: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this.h, k) ? this.h[k] : null; },
    setItem(k, v) { this.h[k] = String(v); },
    removeItem(k) { delete this.h[k]; }
  };
}

// ---------- песочница UI-логики (index.html) ----------
function mkUi() {
  const sb = {
    console, Date, JSON, Math, String, Number, Object, Array, Promise, setTimeout: () => 0,
    state: { user: 'Иван', role: null, calDate: '2026-09-16', schedView: '', calTab: null },
    DB: { orders: [], users: [] },
    localStorage: mkStore(),
    escapeHtml: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    toMin: tt => { if (!tt) return null; const p = String(tt).split(':'); return (+p[0]) * 60 + (+p[1] || 0); },
    isTest: o => !!o.test,
    localToday: () => '2026-09-16',
    isOwner: () => sb.__owner === true,
    uiOwner: () => sb.__owner === true,
    can: p => sb.__owner === true || (sb.__perms || []).indexOf(p) >= 0,
    adminLike: () => sb.uiOwner() || sb.state.role === 'admin' || sb.state.user === 'Владелец',
    getUserName: u => (u && (u.name || u.deviceName)) || '—',
    activeWorkers: () => (sb.DB.users || []).filter(u => u.active !== false && u.status !== 'fired' && u.status !== 'quit'),
    deviceId: () => 'dev-ivan',
    render: () => { sb.__renders = (sb.__renders || 0) + 1; },
    alert: m => { sb.__alert = String(m); },
    confirm: () => true,
    openModal: h => { sb.__modal = h; },
    closeModal: () => { sb.__modalClosed = true; sb.__modal = null; },
    document: { getElementById: id => (sb.__els || {})[id] || null },
    // заглушка облачного слоя sched
    schedDaysCloud: uid => (sb.__daysByUid && sb.__daysByUid[String(uid)]) || {},
    schedWatchMine: () => { sb.__watchMine = (sb.__watchMine || 0) + 1; },
    schedWatchOther: uid => { sb.__watchOther = uid; },
    schedStopOther: () => { sb.__stopped = true; },
    schedSetDayCloud: (date, rec) => {
      sb.__written = sb.__written || [];
      sb.__written.push({ date: date, rec: rec });
      const k = String(sb.deviceId());
      const days = Object.assign({}, (sb.__daysByUid || {})[k] || {});
      if (rec === null || rec === undefined) delete days[date]; else days[date] = rec;
      sb.__daysByUid = sb.__daysByUid || {};
      sb.__daysByUid[k] = days;
    }
  };
  vm.createContext(sb);
  return sb;
}
const UI_FNS = ['schedMineId', 'schedPad', 'schedViewUid', 'schedViewName', 'schedCanViewOthers', 'schedCanEdit',
  'schedDaysOf', 'schedSlots', 'schedBusyOrders', 'schedSetCalTab', 'calTab', 'setCalTab', 'schedSetMonth',
  'renderMyCalendar', 'schedSetView', 'myDayModal', 'schedOffToggle', 'schedSaveDay', 'schedWriteDay', 'schedClearDay'];
function loadUi(sb) {
  vm.runInContext(vars(grabConst('SCHED_ACTIVE', app)), sb);
  UI_FNS.forEach(n => vm.runInContext(vars(grabFn(n, app)), sb));
}

// ---------- песочница облачного слоя (tools/firebase-access.js) ----------
const FA_FNS = ['lsGet', 'lsSet', 'queueGet', 'queueSet', 'queuePush', 'queueCount',
  'schedRef', 'schedCacheKey', 'schedLocalGet', 'schedLocalSet', 'schedDaysCloud',
  'schedWatch', 'schedWatchMine', 'schedWatchOther', 'schedStopOther', 'schedSetDayCloud', 'flushQueue'];
function mkFa(opts) {
  opts = opts || {};
  const docs = {};   // 'sched/uid' -> {days:{...}} — «сервер»
  const writes = []; // история set()
  const subs = {};   // uid -> [onSnapshot callbacks]
  const sb = {
    console, Date, JSON, Math, String, Number, Object, Array, Promise, setTimeout: () => 0,
    navigator: { onLine: true }, window: {},
    deviceId: () => 'dev-ivan',
    render: () => { sb.__renders = (sb.__renders || 0) + 1; },
    isPermErr: e => String((e && e.code) || e || '').indexOf('permission-denied') >= 0,
    writeDeniedBanner: e => { sb.__denied = String(e && e.code || e); },
    localStorage: mkStore(),
    fs: {
      collection: name => ({
        doc: id => ({
          set: data => {
            writes.push({ path: name + '/' + id, data: JSON.parse(JSON.stringify(data)) });
            if (opts.deny) return Promise.reject({ code: 'permission-denied', message: 'Missing or insufficient permissions' });
            if (opts.netFail) return Promise.reject({ code: 'unavailable', message: 'network' });
            docs[name + '/' + id] = JSON.parse(JSON.stringify(data));
            (subs[id] || []).forEach(cb => cb({ exists: true, data: () => docs[name + '/' + id] }));
            return Promise.resolve();
          },
          onSnapshot: (next) => {
            (subs[id] = subs[id] || []).push(next);
            const key = name + '/' + id;
            if (docs[key]) next({ exists: true, data: () => docs[key] });
            else next({ exists: false, data: () => ({}) });
            return () => { subs[id] = subs[id].filter(f => f !== next); };
          }
        })
      })
    }
  };
  vm.createContext(sb);
  vm.runInContext('var OFFLINE=' + (opts.offline ? 'true' : 'false') + ';var SYNCING=false;var SYNC_OK_TS=0;' +
    'var SCHED_CACHE={};var SCHED_UNSUB={};var SCHED_SUB_OK={};var localStorage={h:{},' +
    'getItem:function(k){return Object.prototype.hasOwnProperty.call(this.h,k)?this.h[k]:null},' +
    'setItem:function(k,v){this.h[k]=String(v)},removeItem:function(k){delete this.h[k]}};', sb);
  FA_FNS.forEach(n => {
    let code = grabFn(n, fa);
    // flushQueue оборачивает IIFE-слушатель online/offline. При vm.runInContext он выполняется
    // и проверяет navigator.onLine (==true) → сбрасывает OFFLINE=false. Восстанавливаем позже.
    vm.runInContext(code, sb);
  });
  // восстанавливаем OFFLINE, если IIFE-слушатель его сбросил
  if (opts.offline) vm.runInContext('OFFLINE=true', sb);
  sb.__docs = docs; sb.__writes = writes;
  return sb;
}

(async function main() {
  // ================= 1. слоты дня =================
  {
    const sb = mkUi(); loadUi(sb);
    const s = vm.runInContext('schedSlots("09:00","18:00")', sb);
    t('1) слоты 09:00–18:00 = 5 шагов по 2ч, последний укорочен до конца дня',
      s.length === 5 && JSON.stringify(s) === JSON.stringify([['09:00', '11:00'], ['11:00', '13:00'], ['13:00', '15:00'], ['15:00', '17:00'], ['17:00', '18:00']]));
    const s2 = vm.runInContext('schedSlots("10:00","14:00")', sb);
    t('2) слоты 10:00–14:00 = ровно 2 по 2ч', s2.length === 2 && s2[1][1] === '14:00');
    t('3) некорректный день (to<=from / пусто) → слотов нет',
      vm.runInContext('schedSlots("18:00","09:00")', sb).length === 0 && vm.runInContext('schedSlots(null,"18:00")', sb).length === 0);
    t('4) schedPad форматирует минуты в HH:MM', vm.runInContext('schedPad(545)', sb) === '09:05');
  }

  // ================= 2. занятость из DB.orders =================
  {
    const sb = mkUi(); loadUi(sb);
    sb.DB.orders = [
      { id: 1, date: '2026-09-20', worker: 'Иван', t1: '14:00', t2: '16:00', status: 'inwork' },
      { id: 2, date: '2026-09-20', worker: 'Иван', t1: '09:30', t2: '10:30', status: 'new' },
      { id: 3, date: '2026-09-20', worker: 'Иван', t1: '11:00', t2: '12:00', status: 'completed' },
      { id: 4, date: '2026-09-20', worker: 'Иван', t1: '11:00', t2: '12:00', status: 'new', test: true },
      { id: 5, date: '2026-09-20', worker: 'Петр', t1: '11:00', t2: '12:00', status: 'new' },
      { id: 6, date: '2026-09-21', worker: 'Иван', t1: '11:00', t2: '12:00', status: 'new' }
    ];
    const ids = vm.runInContext('schedBusyOrders("Иван","2026-09-20").map(o=>o.id)', sb);
    t('5) занятость: только свои активные нетестовые заявки за день, по t1', JSON.stringify(ids) === JSON.stringify([2, 1]));
    t('6) занятость: пустые аргументы → пустой список',
      vm.runInContext('schedBusyOrders("","2026-09-20")', sb).length === 0 && vm.runInContext('schedBusyOrders("Иван","")', sb).length === 0);
    t('7) SCHED_ACTIVE = новые/инспекция/одобрено/в работе/ожидание/отложено',
      vm.runInContext("SCHED_ACTIVE.join()===['new','inspection','approved','in_progress','inwork','waiting','postponed'].join()", sb));
  }

  // ================= 3. права: просмотр чужого, правка только своего =================
  {
    const sb = mkUi(); loadUi(sb);
    sb.DB.users = [{ name: 'Иван', deviceId: 'dev-ivan' }, { name: 'Петр', deviceId: 'dev-petr' }];
    t('8) своему календарю правка разрешена', vm.runInContext('schedCanEdit()', sb) === true);
    sb.__owner = true;
    t('9) владелец может смотреть чужие', vm.runInContext('schedCanViewOthers()', sb) === true);
    sb.__owner = false; sb.state.role = 'admin';
    t('10) роль admin — просмотр чужих доступен', vm.runInContext('schedCanViewOthers()', sb) === true);
    sb.state.role = 'manager';
    t('11) роль manager — просмотр чужих доступен (админ/менеджер: только просмотр)', vm.runInContext('schedCanViewOthers()', sb) === true);
    sb.state.role = null; sb.__perms = ['orders_view_all'];
    t('12) orders_view_all — просмотр чужих доступен', vm.runInContext('schedCanViewOthers()', sb) === true);
    sb.__perms = ['staff_manage'];
    t('13) staff_manage — просмотр чужих доступен', vm.runInContext('schedCanViewOthers()', sb) === true);
    sb.__perms = ['orders_view', 'tasks', 'calendar'];
    t('14) обычному исполнителю просмотр чужих запрещён', vm.runInContext('schedCanViewOthers()', sb) === false);
    sb.state.schedView = 'dev-petr';
    t('15) чужой календарь — правка запрещена даже менеджеру',
      (sb.state.role = 'manager', vm.runInContext('schedCanEdit()', sb) === false));
    t('16) имя просматриваемого берётся из DB.users по deviceId', vm.runInContext('schedViewName()', sb) === 'Петр');
    sb.state.schedView = ''; sb.state.role = null;
    t('17) без выбора — просматриваю себя', vm.runInContext('schedViewUid()', sb) === 'dev-ivan' && vm.runInContext('schedViewName()', sb) === 'Иван');
    sb.__perms = ['orders_view']; sb.__alert = '';
    vm.runInContext('schedSetView("dev-petr")', sb);
    t('18) schedSetView без прав → «Нет прав» и просмотр не сменился',
      (sb.__alert || '').indexOf('Нет прав') >= 0 && sb.state.schedView === '');
    sb.__perms = ['orders_view_all'];
    vm.runInContext('schedSetView("dev-petr")', sb);
    t('19) schedSetView с правами — подписка на чужой + смена просмотра',
      sb.state.schedView === 'dev-petr' && sb.__watchOther === 'dev-petr');
    vm.runInContext('schedSetView("")', sb);
    t('20) возврат к своему снимает чужие подписки', sb.state.schedView === '' && sb.__stopped === true);
  }

  // ================= 4. таб «Общий/Мой» =================
  {
    const sb = mkUi(); loadUi(sb);
    t('21) по умолчанию таб — общий', vm.runInContext('calTab()', sb) === 'common');
    vm.runInContext('setCalTab("mine")', sb);
    t('22) переключение на «Мой»: localStorage + подписка + перерисовка',
      sb.state.calTab === 'mine' && sb.localStorage.getItem('crm_cal_tab') === 'mine' && sb.__watchMine >= 1 && sb.__renders >= 1);
    const sb2 = mkUi(); loadUi(sb2);
    sb2.localStorage.setItem('crm_cal_tab', 'mine');
    t('23) сохранённый таб восстанавливается из localStorage', vm.runInContext('calTab()', sb2) === 'mine');
    const sb3 = mkUi(); loadUi(sb3);
    sb3.localStorage.setItem('crm_cal_tab', 'garbage');
    t('24) некорректное значение таба → общий', vm.runInContext('calTab()', sb3) === 'common');
  }

  // ================= 5. сетка месяца =================
  {
    const sb = mkUi(); loadUi(sb);
    sb.DB.users = [{ name: 'Иван', deviceId: 'dev-ivan' }, { name: 'Петр', deviceId: 'dev-petr' }];
    sb.DB.orders = [{ id: 7, date: '2026-09-20', worker: 'Иван', t1: '14:00', t2: '16:00', status: 'inwork' }];
    sb.__daysByUid = { 'dev-ivan': { '2026-09-18': { off: true }, '2026-09-20': { from: '09:00', to: '18:00', off: false } } };
    sb.__owner = true;
    const html = vm.runInContext('renderMyCalendar()', sb);
    t('25) сетка рендерится и идемпотентно поднимает свою подписку', typeof html === 'string' && html.length > 500 && sb.__watchMine >= 1);
    t('26) заголовок «Мой календарь» + подсказка про тап', html.indexOf('Мой календарь') >= 0 && html.indexOf('по тапу') >= 0);
    t('27) селект просмотра чужого есть для владельца', html.indexOf('Просмотр календаря') >= 0 && html.indexOf('dev-petr') >= 0);
    t('28) дни месяца 01..30 на месте (Сентябрь 2026)', html.indexOf('>1<') >= 0 && html.indexOf('>30<') >= 0 && html.indexOf('Сентябрь 2026') >= 0);
    t('29) выходной помечен «вых.»', html.indexOf('вых.') >= 0);
    t('30) занятый слот — номер заявки, свободные — маркер', html.indexOf('№7') >= 0 && html.indexOf('▪') >= 0);
    t('31) заданный день показывает свой интервал', html.indexOf('09:00–18:00') >= 0);
    t('32) тап по дню доступен только в своём календаре', html.indexOf("myDayModal('2026-09-20')") >= 0);
    vm.runInContext('schedSetView("dev-petr")', sb);
    const htmlOther = vm.runInContext('renderMyCalendar()', sb);
    t('33) чужой календарь — «только просмотр» и ни одного входа в правку дня',
      htmlOther.indexOf('только просмотр') >= 0 && htmlOther.indexOf('myDayModal') < 0 && htmlOther.indexOf('Сохранить') < 0);
    const sb4 = mkUi(); loadUi(sb4);
    sb4.DB.users = [{ name: 'Иван', deviceId: 'dev-ivan' }];
    sb4.__daysByUid = { 'dev-ivan': {} };
    sb4.DB.orders = [{ id: 8, date: '2026-09-22', worker: 'Иван', t1: '09:00', t2: '10:00', status: 'new' },
    { id: 9, date: '2026-09-22', worker: 'Иван', t1: '11:00', t2: '12:00', status: 'approved' }];
    const h4 = vm.runInContext('renderMyCalendar()', sb4);
    t('34) день не настроен, но заявки есть → «🔴N»', h4.indexOf('🔴2') >= 0);
    t('35) обычный исполнитель: ✏ в пустом дне и нет селекта просмотра', h4.indexOf('✏') >= 0 && h4.indexOf('Просмотр календаря') < 0);
  }

  // ================= 6. модалка дня + сохранение =================
  {
    const sb = mkUi(); loadUi(sb);
    sb.DB.users = [{ name: 'Иван', deviceId: 'dev-ivan' }];
    sb.__daysByUid = { 'dev-ivan': { '2026-09-20': { from: '09:00', to: '18:00', off: false } } };
    sb.DB.orders = [{ id: 7, date: '2026-09-20', worker: 'Иван', t1: '14:00', t2: '16:00', status: 'inwork' }];
    vm.runInContext("myDayModal('2026-09-20')", sb);
    t('36) модалка дня: дата, занятость №7, sd-off/sd-from/sd-to, кнопка убрать настройку',
      !!sb.__modal && sb.__modal.indexOf('№7') >= 0 && sb.__modal.indexOf('id="sd-off"') >= 0 &&
      sb.__modal.indexOf('id="sd-from"') >= 0 && sb.__modal.indexOf('value="09:00"') >= 0 &&
      sb.__modal.indexOf('Убрать настройку дня') >= 0);
    sb.state.schedView = 'dev-petr'; sb.__alert = ''; sb.__modal = null;
    vm.runInContext("myDayModal('2026-09-20')", sb);
    t('37) чужой календарь: тап по дню → «только для просмотра», модалки нет',
      (sb.__alert || '').indexOf('только для просмотра') >= 0 && sb.__modal === null);
    sb.state.schedView = '';
    sb.__els = { 'sd-off': { checked: false }, 'sd-from': { value: '' }, 'sd-to': { value: '' } };
    sb.__alert = ''; sb.__written = [];
    vm.runInContext("schedSaveDay('2026-09-25')", sb);
    t('38) без from/to → подсказка и записей нет', (sb.__alert || '').indexOf('Укажите начало') >= 0 && sb.__written.length === 0);
    sb.__els = { 'sd-off': { checked: false }, 'sd-from': { value: '18:00' }, 'sd-to': { value: '09:00' } };
    sb.__alert = '';
    vm.runInContext("schedSaveDay('2026-09-25')", sb);
    t('39) to<=from → «Конец дня должен быть позже», записей нет',
      (sb.__alert || '').indexOf('позже начала') >= 0 && sb.__written.length === 0);
    sb.__els = { 'sd-off': { checked: false }, 'sd-from': { value: '10:00' }, 'sd-to': { value: '16:30' } };
    sb.__modal = 'X';
    vm.runInContext("schedSaveDay('2026-09-25')", sb);
    t('40) сохранение дня → {from,to,off:false} и закрытие модалки',
      sb.__written.length === 1 && sb.__written[0].date === '2026-09-25' &&
      JSON.stringify(sb.__written[0].rec) === JSON.stringify({ from: '10:00', to: '16:30', off: false }) && sb.__modal === null);
    sb.__written = [];
    sb.__els = { 'sd-off': { checked: true }, 'sd-from': { value: '10:00' }, 'sd-to': { value: '16:30' } };
    vm.runInContext("schedSaveDay('2026-09-26')", sb);
    t('41) «Выходной» → запись {off:true} (время игнорируется)', JSON.stringify(sb.__written[0].rec) === JSON.stringify({ off: true }));
    sb.__written = [];
    vm.runInContext("schedClearDay('2026-09-20')", sb);
    t('42) «Убрать настройку дня» → schedSetDayCloud(date,null)',
      sb.__written.length === 1 && sb.__written[0].date === '2026-09-20' && sb.__written[0].rec === null);
    const el = { style: {} }; sb.__els = { 'sd-hours': el };
    vm.runInContext('schedOffToggle(true)', sb);
    const hidden = el.style.display === 'none';
    vm.runInContext('schedOffToggle(false)', sb);
    t('43) переключатель «Выходной» скрывает/показывает блок времени', hidden && el.style.display === 'block');
    sb.state.schedView = 'dev-petr'; sb.__written = []; sb.__alert = '';
    vm.runInContext("schedSaveDay('2026-09-27')", sb);
    t('44) schedSaveDay на чужом календаре блокируется', sb.__written.length === 0 && (sb.__alert || '').indexOf('только для просмотра') >= 0);
  }

  // ================= 7. облачный слой sched =================
  {
    const sb = mkFa();
    vm.runInContext("schedSetDayCloud('2026-09-20',{from:'09:00',to:'18:00',off:false})", sb);
    await tick();
    const w = sb.__writes[0];
    t('45) запись идёт в sched/{deviceId} полным снимком {days}',
      !!w && w.path === 'sched/dev-ivan' && w.data.days['2026-09-20'].from === '09:00');
    vm.runInContext("schedSetDayCloud('2026-09-21',{from:'10:00',to:'12:00',off:false})", sb);
    await tick();
    t('46) второй день дополняет days, а не затирает первый',
      Object.keys(sb.__writes[1].data.days).sort().join() === '2026-09-20,2026-09-21');
    vm.runInContext("schedSetDayCloud('2026-09-20',null)", sb);
    await tick();
    t('47) удаление дня: rec=null реально убирает ключ из записи на сервере',
      Object.keys(sb.__writes[2].data.days).join() === '2026-09-21');
    t('48) синхронное чтение для рендера: свой days, у чужого — пусто',
      vm.runInContext("Object.keys(schedDaysCloud('dev-ivan')).join()", sb) === '2026-09-21' &&
      Object.keys(vm.runInContext("schedDaysCloud('dev-petr')", sb)).length === 0);
    t('49) кэш дня переживает перезагрузку (localStorage crm_cache_sched)',
      JSON.parse(sb.localStorage.getItem('crm_cache_sched'))['dev-ivan'].days['2026-09-21'].from === '10:00');
    vm.runInContext('schedWatchMine()', sb);
    vm.runInContext('schedWatchMine()', sb);
    t('50) schedWatch идемпотентен: повтор не дублирует подписку', vm.runInContext('Object.keys(SCHED_UNSUB).length', sb) === 1);
    vm.runInContext("schedWatchOther('dev-petr')", sb);
    vm.runInContext('schedStopOther()', sb);
    t('51) schedStopOther снимает чужую подписку и оставляет свою', vm.runInContext('Object.keys(SCHED_UNSUB).join()', sb) === 'dev-ivan');
  }
  {
    // офлайн: правка не теряется, а кладётся в очередь kind='sched'
    const sb = mkFa({ offline: true });
    t('52a) офлайн-контекст собран: OFFLINE=true, мок localStorage жив',
      vm.runInContext('OFFLINE', sb) === true && vm.runInContext("typeof localStorage.setItem", sb) === 'function');
    vm.runInContext("schedSetDayCloud('2026-09-22',{off:true})", sb);
    t('52b) офлайн: в сеть ничего не летит', sb.__writes.length === 0);
    t('52c) офлайн: день оптимистично виден', vm.runInContext("schedDaysCloud('dev-ivan')['2026-09-22'].off", sb) === true);
    t('52d) офлайн: в очереди 1 элемент kind=sched',
      vm.runInContext('queueCount()', sb) === 1 && vm.runInContext("queueGet()[0].item.kind", sb) === 'sched');
    vm.runInContext('OFFLINE=false', sb);
    vm.runInContext('flushQueue()', sb);
    await tick(); await tick();
    t('53) flush доставляет sched как {days} и очищает очередь',
      sb.__writes.length === 1 && sb.__writes[0].path === 'sched/dev-ivan' &&
      sb.__writes[0].data.days['2026-09-22'].off === true && vm.runInContext('queueCount()', sb) === 0);
  }
  {
    // сетевая ошибка записи → OFFLINE + очередь
    const sb = mkFa({ netFail: true });
    vm.runInContext("schedSetDayCloud('2026-09-23',{from:'08:00',to:'12:00',off:false})", sb);
    await tick();
    t('54) сетевая ошибка: OFFLINE=true, правка в очереди, локально уже видна',
      vm.runInContext('OFFLINE', sb) === true && vm.runInContext('queueCount()', sb) === 1 &&
      vm.runInContext("schedDaysCloud('dev-ivan')['2026-09-23'].to", sb) === '12:00');
  }
  {
    // permission-denied повтор бессмысленен: в очередь НЕ кладём, показываем баннер
    const sb = mkFa({ deny: true });
    vm.runInContext("schedSetDayCloud('2026-09-24',{off:true})", sb);
    await tick();
    t('55) permission-denied: баннер, очередь пуста (бессмысленный повтор не копим)',
      (sb.__denied || '').indexOf('permission-denied') >= 0 && vm.runInContext('queueCount()', sb) === 0);
  }

  console.log(fails ? '\nFAILS: ' + fails : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})();