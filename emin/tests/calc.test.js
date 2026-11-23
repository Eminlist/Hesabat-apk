// My Finance™ hesablamalarının avtomatik yoxlanması: biri səhv çıxsa, APK yığılmır.
// İşə salmaq: node emin/tests/calc.test.js
'use strict';
const assert = require('assert');
const path = require('path');
require(path.join(__dirname, '..', 'assets', 'calc.js'));
const C = globalThis.MF;

let n = 0, k = 0;
const empty = () => ({ customers: [{ id: 'a', name: 'Əli' }, { id: 'b', name: 'Vüqar' }], ops: [], recs: [], trash: [] });
const op = (o) => Object.assign({ id: 'o' + (++k), c: k, time: '10:00' }, o);
function test(name, f) { f(); n++; console.log('✓ ' + name); }
const T = '2026-11-24';

test('Kalkulyator: 15+20+12.5 = 47.5', () => {
  assert.strictEqual(C.evalExpr('15+20+12.5'), 4750);
  assert.strictEqual(C.evalExpr('15+20+12,5'), 4750);
  assert.strictEqual(C.evalExpr('3*2,5'), 750);
  assert.strictEqual(C.evalExpr('10-2*3'), 400);
  assert.strictEqual(C.evalExpr('100/3'), 3333);
  assert.ok(isNaN(C.evalExpr('5+')));
  assert.ok(isNaN(C.evalExpr('abc')));
  assert.ok(isNaN(C.evalExpr('5/0')));
  assert.strictEqual(C.evalExpr(''), null);
});

test('Nisyə kassaya yazılmır, ödəniş həmin günün gəliridir', () => {
  const db = empty();
  db.ops.push(op({ kind: 'nisye', cid: 'a', amount: 10000, date: '2026-11-20', due: '2026-11-25' }));
  let f = C.flow(db, '2026-11-20', '2026-11-20');
  assert.strictEqual(f.income, 0);
  assert.strictEqual(f.nisye, 10000);
  db.ops.push(op({ kind: 'pay', cid: 'a', amount: 4000, method: 'cash', date: '2026-11-22' }));
  f = C.flow(db, '2026-11-22', '2026-11-22');
  assert.strictEqual(f.income, 4000);
  assert.strictEqual(f.inCash, 4000);
  const s = C.custState(db, 'a', T);
  assert.strictEqual(s.debt, 6000);
  assert.strictEqual(s.given, 10000);
  assert.strictEqual(s.paid, 4000);
});

test('Hissə-hissə ödəniş ən köhnə nisyədən bağlanır', () => {
  const db = empty();
  db.ops.push(op({ kind: 'nisye', cid: 'a', amount: 5000, date: '2026-10-01', due: '2026-10-10' }));
  db.ops.push(op({ kind: 'nisye', cid: 'a', amount: 3000, date: '2026-11-01', due: '2026-11-30' }));
  db.ops.push(op({ kind: 'pay', cid: 'a', amount: 2000, method: 'card', date: '2026-11-02' }));
  let s = C.custState(db, 'a', T);
  assert.strictEqual(s.open.length, 2);
  assert.strictEqual(s.open[0].left, 3000);
  assert.strictEqual(s.due, '2026-10-10');
  assert.strictEqual(s.overdue, 45);
  db.ops.push(op({ kind: 'pay', cid: 'a', amount: 3000, method: 'cash', date: '2026-11-03' }));
  s = C.custState(db, 'a', T);
  assert.strictEqual(s.open.length, 1);
  assert.strictEqual(s.due, '2026-11-30');
  assert.strictEqual(s.overdue, 0);
  assert.strictEqual(s.debt, 3000);
});

test('Artıq ödəniş avans kimi qalır (80 borca 100 ödəniş → +20 avans)', () => {
  const db = empty();
  db.ops.push(op({ kind: 'nisye', cid: 'a', amount: 8000, date: '2026-11-01', due: '2026-11-10' }));
  db.ops.push(op({ kind: 'pay', cid: 'a', amount: 10000, method: 'cash', date: '2026-11-05' }));
  const s = C.custState(db, 'a', T);
  assert.strictEqual(s.debt, 0);
  assert.strictEqual(s.advance, 2000);
  assert.strictEqual(s.isDue, false);
  assert.strictEqual(C.flow(db, '2026-11-05', '2026-11-05').income, 10000);
  // növbəti nisyə avansdan çıxılır
  db.ops.push(op({ kind: 'nisye', cid: 'a', amount: 5000, date: '2026-11-20', due: '2026-11-30' }));
  assert.strictEqual(C.custState(db, 'a', T).debt, 3000);
});

test('Çöldə olan ümumi pul', () => {
  const db = empty();
  db.ops.push(op({ kind: 'nisye', cid: 'a', amount: 5000, date: '2026-11-01' }));
  db.ops.push(op({ kind: 'nisye', cid: 'b', amount: 7000, date: '2026-11-02' }));
  db.ops.push(op({ kind: 'pay', cid: 'b', amount: 9000, method: 'cash', date: '2026-11-03' }));
  const o = C.outstanding(db, T);
  assert.strictEqual(o.total, 5000);
  assert.strictEqual(o.count, 1);
});

test('Kassa: nağd və kart ayrı, əvvəlki günlərin qalığı ilə', () => {
  const db = empty();
  db.ops.push(op({ kind: 'in', amount: 20000, method: 'cash', date: '2026-11-20' }));
  db.ops.push(op({ kind: 'in', amount: 15000, method: 'card', date: '2026-11-21' }));
  db.ops.push(op({ kind: 'out', amount: 5000, method: 'cash', date: '2026-11-22' }));
  db.ops.push(op({ kind: 'out', amount: 2500, method: 'card', date: '2026-11-24' }));
  db.ops.push(op({ kind: 'nisye', cid: 'a', amount: 99900, date: '2026-11-24' }));
  const b = C.balances(db, T);
  assert.strictEqual(b.cash, 15000);
  assert.strictEqual(b.card, 12500);
  assert.strictEqual(b.total, 27500);
  assert.strictEqual(C.balances(db, '2026-11-21').total, 35000);
});

test('Borcun yaşı: 30 sarı, 60 narıncı, 90+ qırmızı', () => {
  const db = empty();
  db.ops.push(op({ kind: 'nisye', cid: 'a', amount: 1000, date: C.addDays(T, -31) }));
  assert.strictEqual(C.custState(db, 'a', T).age, 1);
  db.ops[0].date = C.addDays(T, -60);
  assert.strictEqual(C.custState(db, 'a', T).age, 2);
  db.ops[0].date = C.addDays(T, -95);
  assert.strictEqual(C.custState(db, 'a', T).age, 3);
  db.ops[0].date = C.addDays(T, -5);
  assert.strictEqual(C.custState(db, 'a', T).age, 0);
});

test('Sabit aylıq xərc: ödəmə günü və ödənilib-ödənilməməsi', () => {
  const db = empty();
  db.recs.push({ id: 'r1', name: 'İcarə', amount: 30000, day: 31 });
  assert.strictEqual(C.recDate(db.recs[0], '2026-11'), '2026-11-30');
  assert.strictEqual(C.recDate(db.recs[0], '2027-02'), '2027-02-28');
  let st = C.recStatus(db, T)[0];
  assert.strictEqual(st.paid, null);
  db.ops.push(op({ kind: 'out', amount: 30000, method: 'cash', date: '2026-11-24', rec: 'r1', recMonth: '2026-11' }));
  st = C.recStatus(db, T)[0];
  assert.ok(st.paid);
});

test('WhatsApp tonu: 1-ci gün yumşaq, 5-ci gün rəsmi, 15+ son xəbərdarlıq', () => {
  assert.strictEqual(C.toneFor(0), 1);
  assert.strictEqual(C.toneFor(1), 1);
  assert.strictEqual(C.toneFor(5), 2);
  assert.strictEqual(C.toneFor(14), 2);
  assert.strictEqual(C.toneFor(15), 3);
});

test('Tarixçə xronoloji və qalıqla', () => {
  const db = empty();
  db.ops.push(op({ kind: 'pay', cid: 'a', amount: 3000, method: 'cash', date: '2026-11-10' }));
  db.ops.push(op({ kind: 'nisye', cid: 'a', amount: 8000, date: '2026-11-01' }));
  const h = C.history(db, 'a');
  assert.strictEqual(h[0].o.kind, 'nisye');
  assert.strictEqual(h[0].bal, 8000);
  assert.strictEqual(h[1].bal, 5000);
});

console.log('\nHamısı düzgündür: ' + n + ' yoxlama');
