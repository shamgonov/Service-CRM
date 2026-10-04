// Тест доставки уведомления о назначении исполнителя (watchNewOrders, tools/firebase-access.js).
// Гейт статуса был жёсткий 'approved', из-за чего назначение пуловой заявки (статус 'new',
// assignWorkerApply статус НЕ меняет) не доходило до исполнителя. Теперь допускаем new+approved.
// Функция извлекается текстом из tools/firebase-access.js и выполняется в vm (как _roles_test.js).
const fs = require('fs');
const vm = require('vm');
const fa = fs.readFileSync('tools/firebase-access.js', 'utf8');
let fails = 0;
const t = (name, cond) => { if (!cond) fails++; console.log((cond ? 'OK  ' : 'FAIL') + ' — ' + name); };

function grabFn(name, src) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('not found: ' + name);
  let end = src.indexOf('\nfunction ', i + 5);
  if (end < 0) end = src.length;
  return src.slice(i, end);
}

const DEV = 'dev-worker';
const ME = 'Иван Рабочий';

// Песочница: только зависимости watchNewOrders. console.warn ловим — watchNewOrders обёрнут
// в try/catch, и без перехвата любая внутренняя ошибка выглядела бы как «событий нет».
function mkSb(events, warns) {
  const sb = {
    console: {
      log: console.log,
      warn: (...a) => { warns.push(a.map(String).join(' ')); }
    },
    Date, JSON, Math, String, Number, Object, Array, Promise,
    setTimeout: () => 0,
    deviceId: () => DEV,
    myName: () => ME,
    lastByDeviceId: o => (o && o.lastBy ? o.lastBy : null),
    esc: s => String(s == null ? '' : s),
    isOwner: () => false,
    can: () => true,
    render: () => {},
    pushEvent: (type, title, body, orderId, silent) => { events.push({ type, title, body, orderId, silent: !!silent }); }
  };
  vm.createContext(sb);
  vm.runInContext(grabFn('watchNewOrders', fa), sb);
  return sb;
}

// Запуск: prev/next кладём В ПЕСОЧНИЦУ (третий аргумент runInContext — options, не переменные).
function run(prev, next) {
  const events = [], warns = [];
  const sb = mkSb(events, warns);
  sb.prev = prev; sb.next = next;
  vm.runInContext('watchNewOrders(prev, next)', sb);
  return { events, warns, assigned: events.filter(e => e.type === 'assigned') };
}

const ord = (id, status, worker, extra) =>
  Object.assign({ id, client: 'Клиент', status, worker: worker || null, test: false }, extra || {});

// ---------- 1) новая заявка new назначена мне → assigned ----------
{
  const r = run({ orders: [] }, { orders: [ord(10, 'new', ME)] });
  t('1) новая заявка new, назначена мне → событие assigned',
    r.assigned.length === 1 && r.warns.length === 0);
  t('1b) текст уведомления про назначение и № заявки',
    r.assigned.length === 1 && r.assigned[0].title.indexOf('Назначена заявка №10') >= 0 &&
    r.assigned[0].body.indexOf('Вас назначили исполнителем') >= 0);
  t('1c) событие не silent (иначе не кормит бейдж)',
    r.assigned.length === 1 && r.assigned[0].silent === false);
}

// ---------- 2) approved: смена исполнителя null→я → assigned ----------
{
  const r = run({ orders: [ord(20, 'approved', null)] }, { orders: [ord(20, 'approved', ME)] });
  t('2) approved: исполнитель null→я → событие assigned',
    r.assigned.length === 1 && r.warns.length === 0);
}

// ---------- 2b) новый фикс: new: исполнитель null→я (главный путь assignWorkerApply) ----------
{
  const r = run({ orders: [ord(21, 'new', null)] }, { orders: [ord(21, 'new', ME)] });
  t('2b) new: исполнитель null→я → событие assigned (регрессия фикса)',
    r.assigned.length === 1 && r.warns.length === 0);
}

// ---------- 2c) переназначение с одного на меня (не из пула) ----------
{
  const r = run({ orders: [ord(22, 'new', 'Петр')] }, { orders: [ord(22, 'new', ME)] });
  t('2c) new: исполнитель Петр→я → событие assigned',
    r.assigned.length === 1 && r.warns.length === 0);
}

// ---------- 3) самовзятие/своя правка (byMe) → НЕТ ----------
{
  const r = run({ orders: [] }, { orders: [ord(30, 'new', ME, { lastBy: DEV })] });
  t('3) своя правка (lastBy=мой dev, новая) → assigned НЕТ', r.assigned.length === 0 && r.warns.length === 0);
  const r2 = run({ orders: [ord(31, 'new', null)] }, { orders: [ord(31, 'new', ME, { lastBy: DEV })] });
  t('3b) своя правка (lastBy=мой dev, смена исполнителя) → assigned НЕТ', r2.assigned.length === 0);
}

// ---------- 4) посторонние статусы → НЕТ ----------
{
  ['postponed', 'inwork', 'completed', 'paid', 'canceled', 'in_progress', 'waiting', 'inspection']
    .forEach(st => {
      const rn = run({ orders: [] }, { orders: [ord(40, st, ME)] });
      const rc = run({ orders: [ord(41, st, null)] }, { orders: [ord(41, st, ME)] });
      t('4) статус ' + st + ': новая и смена исполнителя → assigned НЕТ',
        rn.assigned.length === 0 && rc.assigned.length === 0 && rn.warns.length === 0);
    });
}

// ---------- 5) исполнителя сняли → assigned НЕТ ----------
{
  const r = run({ orders: [ord(50, 'new', ME)] }, { orders: [ord(50, 'new', null)] });
  t('5) снятие исполнителя (nowMine=false) → assigned НЕТ', r.assigned.length === 0);
  t('5b) снятие исполнителя → вместо него «переназначили» (регрессия не сломана)',
    r.events.some(e => e.type === 'order' && e.title.indexOf('переназначили') >= 0));
}

// ---------- 6) назначили не мне → НЕТ ----------
{
  const r = run({ orders: [] }, { orders: [ord(60, 'new', 'Петр')] });
  t('6) новая new назначена другому → assigned НЕТ', r.assigned.length === 0 && r.warns.length === 0);
  const r2 = run({ orders: [ord(61, 'new', null)] }, { orders: [ord(61, 'new', 'Петр')] });
  t('6b) new: исполнитель null→другому → assigned НЕТ', r2.assigned.length === 0);
}

// ---------- 7) тестовая заявка игнорируется ----------
{
  const r = run({ orders: [] }, { orders: [ord(70, 'new', ME, { test: true })] });
  t('7) тестовая заявка (test:true) → assigned НЕТ', r.assigned.length === 0);
}

// ---------- 8) неизменная «моя» заявка → assigned НЕТ (нет шума) ----------
{
  const r = run({ orders: [ord(80, 'new', ME)] }, { orders: [ord(80, 'new', ME)] });
  t('8) моя заявка без изменений → assigned НЕТ', r.assigned.length === 0 && r.warns.length === 0);
}

// ---------- 9) смежные события не сломаны (регрессия движка) ----------
{
  const r = run({ orders: [ord(90, 'new', ME)] }, { orders: [ord(90, 'completed', ME)] });
  t('9a) завершение моей заявки → completed (не потеряно правкой гейта)',
    r.events.some(e => e.type === 'completed') && r.warns.length === 0);
  const r2 = run({ orders: [ord(91, 'new', ME)] }, { orders: [ord(91, 'new', ME, { t1: '10:00', t2: '12:00' })] });
  const r3 = run({ orders: [ord(91, 'new', ME, { t1: '10:00', t2: '12:00' })] },
    { orders: [ord(91, 'new', ME, { t1: '14:00', t2: '16:00' })] });
  t('9b) перенос времени моей заявки → calendar',
    r3.events.some(e => e.type === 'calendar') && r2.warns.length === 0);
}

// ---------- 10) устойчивость: пустые/битые снапшоты не роняют движок ----------
{
  const r = run(null, { orders: [ord(100, 'new', ME)] });
  t('10) prev=null → тихо выходим, без падения', r.events.length === 0 && r.warns.length === 0);
  const r2 = run({ orders: [null] }, { orders: [ord(101, 'new', ME)] });
  t('10b) заявка null в prev → движок не падает, assigned доходит',
    r2.warns.length === 0 && r2.assigned.length === 1);
}

console.log(fails ? '\nFAILS: ' + fails : '\nALL PASS');
process.exit(fails ? 1 : 0);