// Hesabat — bütün hesablamalar (telefon və GitHub testləri eyni faylı işlədir)
// Məbləğlər qəpiklə (tam ədəd). Gəlir və xərc pulun cibə girdiyi / çıxdığı gün yazılır.
//   Gəlir  (+): nağd iş, nisyə ödənişi, digər gəlir, verdiyim borcun qaytarılması, aldığım borc
//   Xərc   (−): hissə, xərc, ziyan, verdiyim borc, aldığım borcun qaytarılması
//   Nisyə: ustanın borcu — ödənənə qədər gəlir deyil
(function (G) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const isCard = t => !!t.bank || (!!t.method && t.method !== 'nagd');

  // bir siyahı əməliyyatın yekunu
  function flow(list) {
    const r = { work: 0, pays: 0, other: 0, lback: 0, brw: 0, gelir: 0,
      parts: 0, xerc: 0, loss: 0, lend: 0, brep: 0, cixis: 0, qaliq: 0,
      nagdIn: 0, kartIn: 0, nagdOut: 0, kartOut: 0, newDebt: 0 };
    for (const t of list) {
      if (t.corr) continue;
      const a = t.amount || 0;
      switch (t.type) {
        case 'pay': r.pays += a; isCard(t) ? r.kartIn += a : r.nagdIn += a; break;
        case 'inc': if (t.other) r.other += a; else r.work += a; isCard(t) ? r.kartIn += a : r.nagdIn += a; break;
        case 'lback': r.lback += a; r.nagdIn += a; break;
        case 'brw': r.brw += a; r.nagdIn += a; break;
        case 'pexp': case 'exp': r.xerc += a; isCard(t) ? r.kartOut += a : r.nagdOut += a; break;
        case 'loss': r.loss += a; break;
        case 'lend': r.lend += a; r.nagdOut += a; break;
        case 'brep': r.brep += a; r.nagdOut += a; break;
        case 'debt': r.newDebt += a; break;
      }
      // hissələr topdançıdan nağd alınır
      if (t.cost) { r.parts += t.cost; r.nagdOut += t.cost; }
    }
    r.gelir = r.work + r.pays + r.other + r.lback + r.brw;
    r.cixis = r.parts + r.xerc + r.loss + r.lend + r.brep;
    r.qaliq = r.gelir - r.cixis;
    return r;
  }
  const dayFlow = (db, d) => flow(db.tx.filter(t => t.date === d));
  const monthFlow = (db, m) => flow(db.tx.filter(t => (t.date || '').slice(0, 7) === m));

  // ---------- nisyə (ustaların borcu) ----------
  function nisye(db, pid) {
    let b = 0;
    for (const t of db.tx) if (t.pid === pid && !t.corr) b += t.type === 'debt' || t.type === 'adj' ? t.amount : t.type === 'pay' ? -t.amount : 0;
    return b;
  }
  const nisyeTotal = db => db.people.reduce((s, p) => s + Math.max(0, nisye(db, p.id)), 0);
  // ödənişlər əvvəlcə öz borcunu, sonra ən köhnə borcları bağlayır
  function debtState(db, pid) {
    const tx = db.tx.filter(t => t.pid === pid && !t.corr).sort((a, b) => a.date.localeCompare(b.date) || (a.created || 0) - (b.created || 0));
    const debts = tx.filter(t => t.type === 'debt' || (t.type === 'adj' && t.amount > 0)).map(t => ({ t, left: t.amount }));
    let free = 0;
    for (const t of tx) {
      const amt = t.type === 'pay' ? t.amount : t.type === 'adj' && t.amount < 0 ? -t.amount : 0;
      if (!amt) continue;
      const own = t.forDebt && debts.find(d => d.t.id === t.forDebt);
      if (own) { const use = Math.min(own.left, amt); own.left -= use; free += amt - use; } else free += amt;
    }
    for (const d of debts) { const use = Math.min(d.left, free); d.left -= use; free -= use; }
    const open = debts.find(d => d.left > 0);
    return { since: open ? open.t.date : null, debts };
  }
  function daysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5); }
  // ödəniş günü keçmiş, hələ ödənməmiş nisyə
  function overdue(db, pid, today) {
    let sum = 0, days = 0;
    for (const d of debtState(db, pid).debts) if (d.left > 0 && d.t.due && d.t.due < today) { sum += d.left; days = Math.max(days, daysBetween(d.t.due, today)); }
    return { sum, days };
  }

  // ---------- verdiyim borc ----------
  const loanLeft = l => (l.amount || 0) - (l.back || 0);
  function syncLoanTx(db, now) {
    now = now || Date.now();
    const ids = new Set(db.loans.map(l => l.id));
    for (const l of db.loans) {
      const t = db.tx.find(x => x.id === 'L' + l.id);
      if (!t) {
        db.tx.push({ id: 'L' + l.id, type: 'lend', lid: l.id, amount: l.amount, date: l.date, note: l.name, created: l.created || now, u: now });
        if (l.back > 0 && !db.tx.some(x => x.type === 'lback' && x.lid === l.id)) db.tx.push({ id: 'LB' + l.id, type: 'lback', lid: l.id, amount: l.back, date: l.date, note: l.name, created: now, u: now });
      } else if (t.amount !== l.amount || t.date !== l.date || t.note !== l.name) Object.assign(t, { amount: l.amount, date: l.date, note: l.name, u: now });
    }
    const gone = db.tx.filter(t => (t.type === 'lend' || t.type === 'lback') && !ids.has(t.lid));
    if (gone.length) { gone.forEach(t => { db.removed[t.id] = now; }); db.tx = db.tx.filter(t => !gone.includes(t)); }
  }

  // ---------- aldığım borc ----------
  const borrowDate = l => l.start || l.date;
  function borrowCalc(l) {
    const P = l.amount || 0, n = l.months || 0, r = (l.rate || 0) / 1200;
    const pmt = n ? (r ? P * r / (1 - Math.pow(1 + r, -n)) : P / n) : 0;
    const total = Math.round(n ? pmt * n : P * (1 + (l.rate || 0) / 100));
    const paid = (l.pays || []).reduce((s, x) => s + x.amount, 0);
    return { total, paid, left: Math.max(0, total - paid) };
  }
  function syncBorrowTx(db, now) {
    now = now || Date.now();
    const want = new Map();
    for (const l of db.borrow) {
      want.set('B' + l.id, { type: 'brw', bid: l.id, amount: l.amount, date: borrowDate(l), note: l.name });
      for (const x of l.pays || []) want.set('BP' + (x.id || l.id + x.d + x.amount), { type: 'brep', bid: l.id, amount: x.amount, date: x.d, note: l.name });
    }
    for (const [id, f] of want) {
      const t = db.tx.find(x => x.id === id);
      if (!t) db.tx.push(Object.assign({ id, created: now, u: now }, f));
      else if (t.amount !== f.amount || t.date !== f.date || t.note !== f.note) Object.assign(t, f, { u: now });
    }
    const gone = db.tx.filter(t => (t.type === 'brw' || t.type === 'brep') && !want.has(t.id));
    if (gone.length) { gone.forEach(t => { db.removed[t.id] = now; }); db.tx = db.tx.filter(t => !gone.includes(t)); }
  }

  // ---------- borcları adla qruplaşdırmaq ----------
  const norm = s => String(s || '').trim().replace(/[İIı]/g, 'i').toLowerCase().replace(/\s+/g, ' ');
  // side: 'lend' (verdiyim) və ya 'borrow' (aldığım)
  function parties(db, side) {
    const m = new Map();
    for (const l of side === 'lend' ? db.loans : db.borrow) {
      const k = norm(l.name);
      const g = m.get(k) || { key: k, name: l.name, phone: '', total: 0, back: 0, left: 0, due: null, first: null, recs: [] };
      const c = side === 'lend' ? { total: l.amount || 0, left: loanLeft(l) } : borrowCalc(l);
      g.total += c.total; g.left += Math.max(0, c.left); g.back += c.total - Math.max(0, c.left);
      if (l.phone && !g.phone) g.phone = l.phone;
      const d = side === 'lend' ? l.date : borrowDate(l);
      if (!g.first || d < g.first) g.first = d;
      if (c.left > 0 && l.due && (!g.due || l.due < g.due)) g.due = l.due;
      g.recs.push(l);
      m.set(k, g);
    }
    return [...m.values()];
  }
  // geri qaytarılan məbləğ ən köhnə açıq borcdan başlayaraq bağlanır
  function payBack(db, side, key, amount, date, now, mkId) {
    now = now || Date.now();
    const recs = (side === 'lend' ? db.loans : db.borrow).filter(l => norm(l.name) === key)
      .sort((a, b) => ((side === 'lend' ? a.date : borrowDate(a)) || '').localeCompare((side === 'lend' ? b.date : borrowDate(b)) || '') || (a.created || 0) - (b.created || 0));
    let rest = amount;
    for (const l of recs) {
      if (rest <= 0) break;
      const left = side === 'lend' ? loanLeft(l) : borrowCalc(l).left;
      if (left <= 0) continue;
      const use = Math.min(left, rest); rest -= use;
      if (side === 'lend') {
        l.back = (l.back || 0) + use; l.u = now;
        db.tx.push({ id: mkId(), type: 'lback', lid: l.id, amount: use, date, note: l.name, created: now, u: now });
      } else {
        l.pays = (l.pays || []).concat({ id: mkId(), d: date, amount: use }); l.u = now;
      }
    }
    if (side === 'borrow') syncBorrowTx(db, now);
    return amount - rest; // həqiqətən bağlanan məbləğ
  }

  // ---------- kassa: gün başı + daxil olan − çıxan ----------
  function kassaDay(db, d) {
    const k = db.kassa.find(x => x.date === d) || {};
    const prev = f => { let best = null; for (const x of db.kassa) if (x.date < d && x[f] != null && (!best || x.date > best.date)) best = x; return best ? best[f] : null; };
    const open = k.open != null ? k.open : prev('close'), copen = k.copen != null ? k.copen : prev('cclose');
    const f = dayFlow(db, d);
    return { k, open, copen, f, expect: (open || 0) + f.nagdIn - f.nagdOut, cexpect: (copen || 0) + f.kartIn - f.kartOut };
  }

  // ---------- kassa: cibimdəki pul və kartdakı pul ----------
  // Sonuncu dəfə yazılan məbləğ + ondan sonra yazılan bütün əməliyyatlar
  function kassaNow(db) {
    const k = db.kassa.find(x => x.id === 'kassa') || null;
    const at = k ? k.at || 0 : 0;
    const f = flow(db.tx.filter(t => (t.created || 0) > at));
    return { set: !!k, at, nagd: (k ? k.nagd || 0 : 0) + f.nagdIn - f.nagdOut, kart: (k ? k.kart || 0 : 0) + f.kartIn - f.kartOut };
  }

  G.HC = { pad, isCard, flow, dayFlow, monthFlow, nisye, nisyeTotal, debtState, overdue, daysBetween, loanLeft, syncLoanTx,
    borrowDate, borrowCalc, syncBorrowTx, norm, parties, payBack, kassaDay, kassaNow };
})(typeof window !== 'undefined' ? window : globalThis);
