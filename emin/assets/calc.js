// My Finance™ — hesablamalar (məbləğlər qəpiklə, tam ədəd)
// Kassa: gəlir (in), xərc (out), nisyədən ödəniş (pay). Nisyə (nisye) kassaya yazılmır.
// Borclar: aldığım borc və onun qaytarılması (brep), verdiyim borc və onun qaytarılması (lback)
//   gəlirə, xərcə və kassa qalığına QATILMIR — yalnız Borclar bölməsində izlənir və xatırladılır.
(function (g) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const norm = s => String(s == null ? '' : s).trim().toLocaleLowerCase('az').replace(/\s+/g, ' ');
  const when = o => (o.date || '') + ' ' + (o.time || '00:00') + ' ' + pad(o.c || 0).padStart(14, '0');
  const byWhen = (a, b) => when(a).localeCompare(when(b));
  const dayNum = d => Math.round(new Date(d + 'T12:00:00Z').getTime() / 86400000);
  const daysBetween = (a, b) => dayNum(b) - dayNum(a);
  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const addMonths = (d, n) => {
    const [y, m, dd] = d.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1 + n, 1, 12));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0, 12)).getUTCDate();
    return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(Math.min(dd, last));
  };
  const isMoneyIn = o => o.kind === 'in' || o.kind === 'pay';

  // ---- məbləğ xanasındakı kalkulyator: "15+20+12,5" → 4750 qəpik ----
  function evalExpr(s) {
    const src = String(s == null ? '' : s).replace(/\s+/g, '').replace(/×|x|X/g, '*').replace(/÷|:/g, '/').replace(/,/g, '.');
    if (!src) return null;
    if (!/^[0-9.+\-*/()]+$/.test(src)) return NaN;
    let i = 0;
    const peek = () => src[i];
    function num() {
      const m = /^\d*\.?\d+|^\d+\.?/.exec(src.slice(i));
      if (!m) throw 0;
      i += m[0].length;
      return parseFloat(m[0]);
    }
    function factor() {
      if (peek() === '-') { i++; return -factor(); }
      if (peek() === '+') { i++; return factor(); }
      if (peek() === '(') { i++; const v = expr(); if (peek() !== ')') throw 0; i++; return v; }
      return num();
    }
    function term() {
      let v = factor();
      while (peek() === '*' || peek() === '/') {
        const op = src[i++], r = factor();
        if (op === '/') { if (r === 0) throw 0; v /= r; } else v *= r;
      }
      return v;
    }
    function expr() {
      let v = term();
      while (peek() === '+' || peek() === '-') { const op = src[i++]; const r = term(); v = op === '+' ? v + r : v - r; }
      return v;
    }
    try {
      const v = expr();
      if (i !== src.length || !isFinite(v)) return NaN;
      return Math.round(v * 100);
    } catch (e) { return NaN; }
  }
  const hasOp = s => /[0-9.,)]\s*[+\-*/×x÷:]\s*[0-9(]/.test(String(s || ''));

  // ---- müştəri vəziyyəti ----
  // Ödənişlər ən köhnə nisyədən bağlanır. bal > 0 — borc, bal < 0 — avans (artıq ödəniş).
  function custState(db, cid, today) {
    const ns = db.ops.filter(o => o.kind === 'nisye' && o.cid === cid).sort(byWhen);
    const ps = db.ops.filter(o => o.kind === 'pay' && o.cid === cid).sort(byWhen);
    const given = ns.reduce((s, o) => s + o.amount, 0);
    const paid = ps.reduce((s, o) => s + o.amount, 0);
    let rest = paid;
    const items = ns.map(n => { const cov = Math.min(rest, n.amount); rest -= cov; return { n, left: n.amount - cov }; });
    const open = items.filter(x => x.left > 0);
    const dues = open.map(x => x.n.due).filter(Boolean).sort();
    const due = dues[0] || '';
    const overdue = due && due < today ? daysBetween(due, today) : 0;
    const ageDays = open.length ? Math.max(0, daysBetween(open[0].n.date, today)) : 0;
    const bal = given - paid;
    const last = ns.concat(ps).sort(byWhen).pop();
    return { cid, given, paid, bal, debt: Math.max(bal, 0), advance: Math.max(-bal, 0), items, open, due,
      overdue, dueToday: !!due && due === today, isDue: !!due && due <= today && bal > 0, ageDays,
      age: ageDays >= 90 ? 3 : ageDays >= 60 ? 2 : ageDays >= 30 ? 1 : 0,
      hasHistory: ns.length + ps.length > 0, last: last ? when(last) : '' };
  }
  // orta ödəmə müddəti: ödənişlər ən köhnə nisyədən bağlanır; nisyə tam bağlandığı ödənişin günü − nisyə günü
  function payStats(db, cid) {
    const ns = db.ops.filter(o => o.kind === 'nisye' && o.cid === cid).sort(byWhen);
    const ps = db.ops.filter(o => o.kind === 'pay' && o.cid === cid).sort(byWhen);
    const left = ns.map(n => n.amount), days = [];
    let i = 0;
    for (const p of ps) {
      let amt = p.amount;
      while (amt > 0 && i < ns.length) {
        const use = Math.min(amt, left[i]); left[i] -= use; amt -= use;
        if (left[i] === 0) { days.push(Math.max(0, daysBetween(ns[i].date, p.date))); i++; }
      }
    }
    return { avg: days.length ? Math.round(days.reduce((s, d) => s + d, 0) / days.length) : null, count: days.length };
  }
  // ümumi çöldə olan pul (aktiv nisyə)
  function outstanding(db, today) {
    let total = 0, count = 0;
    for (const c of db.customers) { const s = custState(db, c.id, today); if (s.debt > 0) { total += s.debt; count++; } }
    return { total, count };
  }
  // müştərinin tarixçəsi xronoloji ardıcıllıqla, hər sətirdən sonrakı qalıqla
  function history(db, cid) {
    // 'in' + cid: dərhal (nağd/kart) ödənilmiş iş — tarixçədə görünür, borca təsir etmir
    const list = db.ops.filter(o => (o.kind === 'nisye' || o.kind === 'pay' || o.kind === 'in') && o.cid === cid).sort(byWhen);
    let bal = 0;
    return list.map(o => { if (o.kind === 'nisye') bal += o.amount; else if (o.kind === 'pay') bal -= o.amount; return { o, bal }; });
  }

  // ---- kassa ----
  function flow(db, from, to) {
    const f = { inCash: 0, inCard: 0, outCash: 0, outCard: 0, nisye: 0, payIn: 0, job: 0, count: 0 };
    for (const o of db.ops) {
      if (o.date < from || o.date > to) continue;
      f.count++;
      const card = o.method === 'card';
      if (isMoneyIn(o)) { if (card) f.inCard += o.amount; else f.inCash += o.amount; if (o.kind === 'pay') f.payIn += o.amount; }
      // müştəri işinin xərci (job): xərc kimi yox, həmin günün gəlirindən çıxılır; kassadan isə yenə çıxır
      else if (o.kind === 'out' && o.job) { if (card) f.inCard -= o.amount; else f.inCash -= o.amount; f.job += o.amount; }
      else if (o.kind === 'out') { if (card) f.outCard += o.amount; else f.outCash += o.amount; }
      else if (o.kind === 'nisye') f.nisye += o.amount;
    }
    f.income = f.inCash + f.inCard;
    f.expense = f.outCash + f.outCard;
    f.net = f.income - f.expense;
    return f;
  }
  // kassadakı nağd və kartdakı pul: bu günə qədər (daxil) bütün gəlir − xərc
  function balances(db, upto) {
    const f = flow(db, '0000-00-00', upto || '9999-99-99');
    return { cash: f.inCash - f.outCash, card: f.inCard - f.outCard, total: f.net };
  }

  // ---- sabit aylıq xərclər ----
  function recDate(r, month) {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
    return month + '-' + pad(Math.min(Math.max(1, +r.day || 1), last));
  }
  function recPaid(db, r, month) { return db.ops.find(o => o.kind === 'out' && o.rec === r.id && (o.recMonth || o.date.slice(0, 7)) === month) || null; }
  function recStatus(db, today) {
    const month = today.slice(0, 7);
    return db.recs.map(r => {
      const d = recDate(r, month), paid = recPaid(db, r, month);
      return { r, date: d, paid, days: daysBetween(today, d), month };
    });
  }


  // ---- borclar: verdiyim (lend) / aldığım (borrow), adla qruplaşır ----
  const debtTotal = d => d.total || d.amount || 0;
  const backKind = side => side === 'lend' ? 'lback' : 'brep';
  function debtPaid(db, d) { let s = 0; for (const o of db.ops) if (o.did === d.id && (o.kind === 'lback' || o.kind === 'brep')) s += o.amount; return s; }
  // eyni adlı iki fərqli adam ayrılsın: açar = ad + telefonun son 9 rəqəmi (telefon yoxdursa yalnız ad)
  const phoneKey = p => String(p || '').replace(/\D/g, '').slice(-9);
  const partyKey = d => norm(d.name) + (phoneKey(d.phone) ? '#' + phoneKey(d.phone) : '');
  function parties(db, side, today) {
    const m = new Map();
    const recs = (db.debts || []).filter(d => d.side === side).slice().sort(byWhen);
    for (const d of recs) {
      const k = partyKey(d);
      const g = m.get(k) || { key: k, side, name: d.name, phone: '', total: 0, back: 0, left: 0, due: '', first: '', recs: [] };
      const tot = debtTotal(d), paid = debtPaid(db, d), left = Math.max(0, tot - paid);
      g.total += tot; g.back += Math.min(paid, tot); g.left += left;
      if (d.phone && !g.phone) g.phone = d.phone;
      if (!g.first || d.date < g.first) g.first = d.date;
      if (left > 0 && d.due && (!g.due || d.due < g.due)) g.due = d.due;
      g.recs.push(d);
      m.set(k, g);
    }
    return [...m.values()].map(g => {
      g.overdue = g.left > 0 && g.due && g.due < today ? daysBetween(g.due, today) : 0;
      g.daysLeft = g.left > 0 && g.due ? daysBetween(today, g.due) : null;
      g.soon = g.left > 0 && !!g.due && g.daysLeft <= 3;
      return g;
    });
  }
  // qaytarılan məbləğ ən köhnə açıq borcdan başlayaraq bölünür: [{did, amount}]
  function allocBack(db, side, key, amount) {
    const g = parties(db, side, '9999-12-31').find(x => x.key === key);
    const out = [];
    if (!g) return out;
    let rest = amount;
    for (const d of g.recs) {
      if (rest <= 0) break;
      const left = debtTotal(d) - debtPaid(db, d);
      if (left <= 0) continue;
      const use = Math.min(left, rest); rest -= use;
      out.push({ did: d.id, amount: use });
    }
    return out;
  }

  // ---- köhnə Emin Hesabatdan borcların köçürülməsi (eyni id-lər: təkrar köçürmə dublikat yaratmır) ----
  function migrateOld(old) {
    const debts = [], ops = [];
    const meth = m => (m && m !== 'nagd') ? 'card' : 'cash';
    const tx = Array.isArray(old.tx) ? old.tx : [];
    for (const l of Array.isArray(old.loans) ? old.loans : []) {
      const id = 'old-L' + l.id;
      debts.push({ id, side: 'lend', name: String(l.name || '').trim() || '—', phone: l.phone || '', amount: l.amount || 0, date: l.date || '', time: l.time || '', due: l.due || '', note: l.note || '', c: l.created || 0, u: 1 });
      const backs = tx.filter(t => t.type === 'lback' && t.lid === l.id && !t.corr);
      let sum = 0;
      for (const t of backs) { sum += t.amount || 0; ops.push({ id: 'old-' + t.id, kind: 'lback', did: id, amount: t.amount || 0, date: t.date || l.date, time: t.time || '', method: meth(t.method), c: t.created || 0, u: 1 }); }
      if ((l.back || 0) > sum) ops.push({ id: 'old-LBX' + l.id, kind: 'lback', did: id, amount: l.back - sum, date: l.date || '', time: '', method: 'cash', c: 0, u: 1 });
    }
    for (const l of Array.isArray(old.borrow) ? old.borrow : []) {
      const id = 'old-B' + l.id;
      const n = l.months || 0, r = (l.rate || 0) / 1200, P = l.amount || 0;
      const pmt = n ? (r ? P * r / (1 - Math.pow(1 + r, -n)) : P / n) : 0;
      const total = Math.round(n ? pmt * n : P * (1 + (l.rate || 0) / 100));
      const d = { id, side: 'borrow', name: String(l.name || '').trim() || '—', phone: l.phone || '', amount: P, date: l.start || l.date || '', time: l.time || '', due: l.due || '', note: l.note || '', method: meth(l.method), c: l.created || 0, u: 1 };
      if (total !== P) d.total = total;
      debts.push(d);
      (l.pays || []).forEach((x, i) => ops.push({ id: 'old-BP' + (x.id || l.id + '-' + i), kind: 'brep', did: id, amount: x.amount || 0, date: x.d || d.date, time: x.t || '', method: meth(x.m), c: 0, u: 1 }));
    }
    return { debts, ops };
  }

  // ---- WhatsApp mesaj tonu: gecikmə gününə görə ----
  const toneFor = overdue => overdue >= 15 ? 3 : overdue >= 5 ? 2 : 1;

  g.MF = { pad, norm, byWhen, when, daysBetween, addDays, addMonths, evalExpr, hasOp, custState, payStats, outstanding, history, flow, balances, recDate, recPaid, recStatus, toneFor, isMoneyIn, debtTotal, debtPaid, backKind, parties, partyKey, phoneKey, allocBack, migrateOld };
})(typeof window !== 'undefined' ? window : globalThis);
