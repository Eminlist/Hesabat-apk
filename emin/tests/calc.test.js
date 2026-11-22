// Hesablamaların avtomatik yoxlanması: biri səhv çıxsa, APK yığılmır.
// İşə salmaq: node emin/tests/calc.test.js
'use strict';
const assert = require('assert');
const path = require('path');
require(path.join(__dirname, '..', 'assets', 'calc.js'));
const C = globalThis.HC;

let n = 0, id = 0;
const mk = () => 'x' + (++id);
const empty = () => ({ people: [], tx: [], loans: [], borrow: [], kassa: [], removed: {} });
function test(name, f) { f(); n++; console.log('✓ ' + name); }
const M = '2026-11';

test('Borc aldım: A-dan 500, B-dən 100, A-ya 100 qaytardım', () => {
  const db = empty();
  db.borrow.push({ id: 'a', name: 'A', amount: 50000, date: '2026-11-01', pays: [] });
  db.borrow.push({ id: 'b', name: 'B', amount: 10000, date: '2026-11-10', pays: [] });
  C.syncBorrowTx(db);
  C.payBack(db, 'borrow', C.norm('A'), 10000, '2026-11-12', 1, mk);
  const f = C.monthFlow(db, M);
  assert.strictEqual(f.gelir, 60000);
  assert.strictEqual(f.cixis, 10000);
  assert.strictEqual(f.qaliq, 50000);
  const p = C.parties(db, 'borrow');
  assert.strictEqual(p.find(x => x.name === 'A').left, 40000);
  assert.strictEqual(p.find(x => x.name === 'B').left, 10000);
  assert.strictEqual(p.reduce((s, x) => s + x.left, 0), 50000);
});

test('Eyni adamdan iki dəfə borc: qaytarma ən köhnədən bağlanır', () => {
  const db = empty();
  db.borrow.push({ id: 'a1', name: 'Əli', amount: 30000, date: '2026-11-01', pays: [] });
  db.borrow.push({ id: 'a2', name: 'əli ', amount: 20000, date: '2026-11-05', pays: [] });
  C.syncBorrowTx(db);
  C.payBack(db, 'borrow', C.norm('ƏLİ'), 35000, '2026-11-20', 1, mk);
  assert.strictEqual(C.borrowCalc(db.borrow[0]).left, 0);
  assert.strictEqual(C.borrowCalc(db.borrow[1]).left, 15000);
  const g = C.parties(db, 'borrow');
  assert.strictEqual(g.length, 1);
  assert.strictEqual(g[0].left, 15000);
  assert.strictEqual(C.monthFlow(db, M).qaliq, 50000 - 35000);
});

test('Borc verdim: verəndə −, qaytarılanda +', () => {
  const db = empty();
  db.loans.push({ id: 'l', name: 'C', amount: 20000, date: '2026-11-03', back: 0 });
  C.syncLoanTx(db);
  let f = C.monthFlow(db, M);
  assert.strictEqual(f.cixis, 20000); assert.strictEqual(f.qaliq, -20000);
  C.payBack(db, 'lend', C.norm('C'), 5000, '2026-11-15', 1, mk);
  f = C.monthFlow(db, M);
  assert.strictEqual(f.gelir, 5000); assert.strictEqual(f.qaliq, -15000);
  assert.strictEqual(C.parties(db, 'lend')[0].left, 15000);
  // artıq ödəniş qəbul olunmur: yalnız qalan 150 bağlanır
  assert.strictEqual(C.payBack(db, 'lend', C.norm('C'), 99999, '2026-11-16', 1, mk), 15000);
  assert.strictEqual(C.parties(db, 'lend')[0].left, 0);
});

test('Nisyə gəlir deyil, ödəniləndə gəlirdir; hissə xərcdir', () => {
  const db = empty();
  db.people.push({ id: 'u', name: 'Usta' });
  db.tx.push({ id: 'd', pid: 'u', type: 'debt', amount: 10000, cost: 3000, date: '2026-11-02' });
  let f = C.monthFlow(db, M);
  assert.strictEqual(f.gelir, 0); assert.strictEqual(f.parts, 3000); assert.strictEqual(f.newDebt, 10000);
  assert.strictEqual(C.nisye(db, 'u'), 10000);
  db.tx.push({ id: 'p', pid: 'u', type: 'pay', amount: 6000, date: '2026-11-04' });
  f = C.monthFlow(db, M);
  assert.strictEqual(f.gelir, 6000); assert.strictEqual(f.qaliq, 3000);
  assert.strictEqual(C.nisye(db, 'u'), 4000);
  assert.strictEqual(C.nisyeTotal(db), 4000);
});

test('Nağd və kart ayrı sayılır; kassa', () => {
  const db = empty();
  db.tx.push({ id: '1', type: 'inc', amount: 8000, method: 'kart', date: '2026-11-07' });
  db.tx.push({ id: '2', type: 'inc', amount: 5000, date: '2026-11-07', cost: 1000 });
  db.tx.push({ id: '3', type: 'pexp', amount: 700, date: '2026-11-07' });
  db.kassa.push({ id: 'k2026-11-06', date: '2026-11-06', close: 2000 });
  const k = C.kassaDay(db, '2026-11-07');
  assert.strictEqual(k.f.kartIn, 8000);
  assert.strictEqual(k.f.nagdIn, 5000);
  assert.strictEqual(k.f.nagdOut, 1700);
  assert.strictEqual(k.expect, 2000 + 5000 - 1700);
  assert.strictEqual(C.dayFlow(db, '2026-11-07').qaliq, 13000 - 1700);
});

test('Gecikən nisyə', () => {
  const db = empty();
  db.tx.push({ id: 'd', pid: 'u', type: 'debt', amount: 5000, date: '2026-11-01', due: '2026-11-10' });
  assert.deepStrictEqual(C.overdue(db, 'u', '2026-11-13'), { sum: 5000, days: 3 });
  db.tx.push({ id: 'p', pid: 'u', type: 'pay', amount: 5000, date: '2026-11-12' });
  assert.deepStrictEqual(C.overdue(db, 'u', '2026-11-13'), { sum: 0, days: 0 });
});

test('Silinmiş borcun gizli düzəlişi (corr) hesaba düşmür', () => {
  const db = empty();
  db.tx.push({ id: 'c', pid: null, type: 'debt', corr: true, amount: -900, cost: 100, date: '2026-11-01' });
  const f = C.monthFlow(db, M);
  assert.strictEqual(f.parts, 0); assert.strictEqual(f.newDebt, 0);
});

console.log(n + ' yoxlama keçdi');
