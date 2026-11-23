// Hesabat 3.1.3 Rev. 000 — sadə versiya. Hesablamalar calc.js-dədir (HC).
'use strict';
const APP_VERSION = '3.1.3 Rev. 001';
const hasNative = typeof window.Android !== 'undefined';
const C = window.HC;
const pad = C.pad;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const nowHm = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); };
const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun', 'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];
const fmtDate = d => { if (!d) return ''; const [y, m, dd] = d.split('-'); return +dd + ' ' + MONTHS[+m - 1] + ' ' + y; };
const mLabel = m => MONTHS[+m.slice(5) - 1] + ' ' + m.slice(0, 4);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = n => String(n || '').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
const CURRENCIES = [['₼', 'Azərbaycan manatı'], ['$', 'ABŞ dolları'], ['€', 'Avro'], ['₺', 'Türk lirəsi'], ['₽', 'Rus rublu']];
const cur = () => (db.cur && db.cur.v) || '₼';
function money(q) {
  const neg = q < 0; q = Math.abs(Math.round(q || 0));
  const m = Math.floor(q / 100), c = q % 100;
  return (neg ? '−' : '') + String(m).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (c ? ',' + pad(c) : '') + ' ' + cur();
}
const signed = q => (q > 0 ? '+' : '') + money(q);
// "120", "120,5", "100+20" kimi yazılanlar
function parseAmount(s, allowZero) {
  s = String(s || '').replace(/\s/g, '').replace(/,/g, '.');
  if (!s) return allowZero ? null : 0;
  if (!/^[\d.+\-*/()]+$/.test(s)) return allowZero ? null : 0;
  let v; try { v = Function('return (' + s + ')')(); } catch (e) { v = NaN; }
  if (!isFinite(v) || v < 0 || (!allowZero && v <= 0)) return allowZero ? null : 0;
  return Math.round(v * 100);
}
const amountInput = q => q ? String(q / 100).replace('.', ',') : '';
const waNum = phone => { let n = String(phone || '').replace(/\D/g, ''); if (n.startsWith('0')) n = '994' + n.slice(1); else if (n.length === 9) n = '994' + n; return n; };
function toast(m) { if (hasNative) Android.toast(m); else console.log(m); }

// ---------- məlumat (köhnə versiyanın faylı olduğu kimi oxunur, heç nə silinmir) ----------
let db = { version: 1, people: [], tx: [], cats: [], loans: [], tpls: [], trash: [], orders: [], kassa: [], borrow: [], journal: [], subs: [], removed: {} };
const LISTS = ['people', 'tx', 'cats', 'loans', 'tpls', 'cards', 'hides', 'trash', 'orders', 'kassa', 'borrow', 'journal', 'subs'];
function load() {
  let raw = '';
  try { raw = hasNative ? Android.load() : (localStorage.getItem('ustaHesab') || ''); } catch (e) {}
  if (raw) {
    try { const d = JSON.parse(raw); if (d && d.people && d.tx) db = Object.assign(db, d); } catch (e) { alert('Məlumat oxunmadı: ' + e.message); }
  }
  for (const k of LISTS) if (!Array.isArray(db[k])) db[k] = [];
  if (!db.removed || typeof db.removed !== 'object') db.removed = {};
}
function save() {
  C.syncLoanTx(db);
  C.syncBorrowTx(db);
  const json = JSON.stringify(db);
  let ok = true;
  try { ok = hasNative ? Android.save(json) : (localStorage.setItem('ustaHesab', json), true); } catch (e) { ok = false; }
  if (!ok) toast('Yadda saxlanmadı!');
  markDirty();
  pushNative();
  scheduleSync();
}

// ---------- Google ilə sinxron (hər dəyişiklik dərhal göndərilir) ----------
const sync = { account: '', status: 'idle', msg: '', last: 0, running: false, again: false, timer: null, dirty: false, ver: 0, sent: -1, retry: null, wait: 0, check: false };
try { sync.last = +localStorage.getItem('lastSync') || 0; sync.dirty = localStorage.getItem('syncDirty') === '1'; } catch (e) {}
function markDirty() {
  sync.ver++;
  if (!sync.dirty) { sync.dirty = true; try { localStorage.setItem('syncDirty', '1'); } catch (e) {} }
}
function mergeDb(a, b) {
  const removed = Object.assign({}, a.removed);
  for (const [id, t] of Object.entries(b.removed || {})) if (!(removed[id] >= t)) removed[id] = t;
  const out = Object.assign({}, b, a, { removed });
  for (const key of LISTS) {
    const m = new Map();
    for (const r of (a[key] || []).concat(b[key] || [])) {
      const c = m.get(r.id);
      if (!c || (r.u || 0) > (c.u || 0)) m.set(r.id, r);
    }
    out[key] = [...m.values()].filter(r => !(removed[r.id] >= (r.u || 0)));
  }
  out.trash.sort((x, y) => y.at - x.at);
  for (const k of ['card', 'cur', 'lang']) if (b[k] && (!a[k] || (b[k].u || 0) > (a[k].u || 0))) out[k] = b[k];
  return out;
}
function scheduleSync() {
  if (!sync.account) return;
  clearTimeout(sync.timer);
  sync.timer = setTimeout(runSync, 150);
}
function runSync() {
  if (!sync.account || !hasNative) return;
  clearTimeout(sync.timer); clearTimeout(sync.retry);
  if (sync.running) { sync.again = true; return; }
  sync.running = true; sync.status = 'syncing'; refreshSettings();
  Android.syncStart();
}
// yedəyin yoxlanması: Google-dakı surət telefondakı ilə müqayisə olunur
function brief(d) {
  const x = Object.assign({ people: [], tx: [], loans: [], borrow: [], kassa: [], removed: {} }, d);
  return { tx: x.tx.length, people: x.people.length, nisye: C.nisyeTotal(x), month: C.monthFlow(x, today().slice(0, 7)).qaliq,
    lend: C.parties(x, 'lend').reduce((s, g) => s + g.left, 0), borrow: C.parties(x, 'borrow').reduce((s, g) => s + g.left, 0) };
}
window.onSyncRemote = function (text) {
  let remote = null;
  if (text) {
    try { remote = JSON.parse(text); } catch (e) { toast('Google-dakı fayl zədəli idi, telefondakı ilə yeniləndi'); }
  }
  if (sync.check) {
    sync.check = false;
    const a = brief(db), b = remote && Array.isArray(remote.people) ? brief(remote) : null;
    state.checkResult = b ? { same: JSON.stringify(a) === JSON.stringify(b), a, b } : { none: true };
    refreshSettings();
  }
  if (remote && Array.isArray(remote.people)) {
    const before = JSON.stringify(db);
    db = mergeDb(db, remote);
    if (JSON.stringify(db) !== before) {
      const json = JSON.stringify(db);
      try { if (hasNative) Android.save(json); } catch (e) {}
      markDirty(); pushNative(); render();
    }
  }
  sync.sent = sync.ver;
  Android.syncUpload(JSON.stringify(db));
};
window.onSyncStatus = function (st, msg) {
  sync.running = false; sync.status = st; sync.msg = msg || '';
  if (st === 'ok') {
    sync.last = Date.now(); sync.wait = 0;
    if (sync.sent === sync.ver) sync.dirty = false;
    try { localStorage.setItem('lastSync', sync.last); localStorage.setItem('syncDirty', sync.dirty ? '1' : '0'); } catch (e) {}
  }
  refreshSettings();
  if (sync.again || (st === 'ok' && sync.dirty)) { sync.again = false; scheduleSync(); }
  else if (st === 'error' && sync.dirty) {
    sync.wait = Math.min(sync.wait ? sync.wait * 2 : 15000, 300000);
    clearTimeout(sync.retry); sync.retry = setTimeout(runSync, sync.wait);
  }
};
window.onAppPause = function () { if (sync.account && sync.dirty) runSync(); };
window.onOnline = function () { if (sync.account && (sync.dirty || sync.status === 'error')) { sync.wait = 0; runSync(); } };
window.onSyncLinked = function (name) { sync.account = name; sync.status = 'idle'; toast('Google hesabı qoşuldu'); render(); runSync(); };
let openedDay = today();
window.onAppResume = function () {
  pushNative();
  if (openedDay !== today()) { openedDay = today(); state.month = today().slice(0, 7); render(); }
  if (!sync.account && hasNative && Android.syncLinked) { sync.account = Android.syncLinked(); if (sync.account) { render(); return runSync(); } }
  if (sync.account && (sync.dirty || Date.now() - sync.last > 60000)) runSync();
};
function refreshSettings() { if (topPage() && topPage().kind === 'settings' && !state.sheet) render(); }

// ---------- telefona: vidcet, qısayollar, xatırlatmalar, günün xülasəsi ----------
function pushNative() {
  if (!hasNative) return;
  const td = today(), B = C.dayBalance(db, td), f = B.f;
  try {
    if (Android.setWidget) Android.setWidget(td, 'Bu günkü gəlir', money(f.gelir), money(0));
    if (Android.updateShortcuts) Android.updateShortcuts('Bu gün gəlir: ' + money(f.gelir), 'Bu gün xərc: ' + money(f.cixis), '');
    if (Android.setSummary) Android.setSummary(td, 'Günün xülasəsi', 'Gəlir: ' + money(f.gelir) + ' · Xərc: ' + money(f.cixis) + ' · Qalıq: ' + money(B.qaliq) + (mods.kart ? ' · 💵 ' + money(f.nagdIn) + ' · 💳 ' + money(f.kartIn) : '') + (f.newDebt ? ' · Yeni nisyə: ' + money(f.newDebt) : ''), 'Bu gün heç nə yazılmayıb · Qalıq: ' + money(B.qaliq));
    if (Android.setDueList) {
      const items = [];
      for (const p of db.people) for (const d of C.debtState(db, p.id).debts) if (d.left > 0 && d.t.due) items.push({ d: addDays(d.t.due, -3), line: p.name + ' — nisyə ' + money(d.left) + ' · ödəniş günü ' + fmtDate(d.t.due) });
      for (const g of C.parties(db, 'lend')) if (g.left > 0 && g.due) items.push({ d: addDays(g.due, -3), line: g.name + ' — verdiyim borc ' + money(g.left) + ' · qaytarma günü ' + fmtDate(g.due) });
      for (const g of C.parties(db, 'borrow')) if (g.left > 0 && g.due) items.push({ d: addDays(g.due, -3), line: g.name + ' — aldığım borc ' + money(g.left) + ' · qaytarma günü ' + fmtDate(g.due) });
      items.sort((a, b) => a.d.localeCompare(b.d));
      Android.setDueList(JSON.stringify({ title: 'Hesabat: xatırlatma', more: '{0} xatırlatma', items }));
    }
  } catch (e) {}
}

// ---------- tema (əvvəlki kimi: gündüz və qızılı gecə) ----------
let theme = 'light';
try { theme = localStorage.getItem('theme') || 'light'; } catch (e) {}
function applyTheme() {
  document.documentElement.setAttribute('data-theme', theme);
  if (hasNative && Android.setDarkBars) try { Android.setDarkBars(theme === 'dark'); } catch (e) {}
}
applyTheme();

// ---------- bölmələri söndürmək (yalnız bu telefonda) ----------
const MODS = [['borclar', 'Borclar (verdiyim / aldığım)'], ['kassa', 'Kassa (cibimdəki və kartdakı pul)'], ['kart', 'Nağd / Kart seçimi']];
let mods = { borclar: true, kassa: true, kart: true };
try { Object.assign(mods, JSON.parse(localStorage.getItem('mods') || '{}')); } catch (e) {}
const saveMods = () => { try { localStorage.setItem('mods', JSON.stringify(mods)); } catch (e) {} };

// ---------- vəziyyət ----------
const state = { tab: 'home', month: today().slice(0, 7), side: 'lend', pages: [], sheet: null, pin: null, checkResult: null };
const topPage = () => state.pages[state.pages.length - 1];
const app = document.getElementById('app');

const I = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11V7a5 5 0 0 1 10 0v4"/><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M12 15v2"/></svg>',
  report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><path d="M18 9l-6 6M12 9l6 6"/></svg>',
  finger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 11v4M8 12a4 4 0 0 1 8 0v3M5 13a7 7 0 0 1 14 0M9 18a3 3 0 0 0 6 0"/></svg>'
};
const IC = (bg, col, emoji) => `<span class="addic" style="background:${bg};color:${col};font-size:22px">${emoji}</span>`;

// ---------- köməkçilər ----------
const person = id => db.people.find(p => p.id === id);
const pname = id => (person(id) || {}).name || '';
const txTitle = t => ({
  debt: 'Nisyə iş', pay: 'Nisyə ödənişi', inc: t.other ? 'Digər gəlir' : 'Nağd iş', pexp: 'Xərc', exp: 'Xərc', loss: 'Ziyan',
  lend: 'Borc verdim', lback: 'Verdiyim borc qaytarıldı', brw: 'Borc aldım', brep: 'Borcu qaytardım', adj: 'Nisyə düzəlişi'
}[t.type] || t.type);
// əməliyyatın pul işarəsi: + cibə girdi, − çıxdı, 0 nisyə (gəlir deyil)
function txSign(t) {
  if (['pay', 'inc', 'brw'].includes(t.type)) return 1;
  if (['pexp', 'exp', 'loss', 'brep'].includes(t.type)) return -1;
  return 0;
}
const visibleTx = t => !t.corr && !(t.type === 'pexp' && (db.cats.find(c => c.id === t.cid) || {}).secret);
// verdiyim borc və onun qaytarılması ümumi hesaba aid deyil: yalnız «Borclar» bölməsində görünür
const isLoanTx = t => t.type === 'lend' || t.type === 'lback';
const accTx = t => visibleTx(t) && !isLoanTx(t);
function txRow(t, showDate) {
  const s = txSign(t), who = t.pid ? pname(t.pid) : (['lend', 'lback', 'brw', 'brep'].includes(t.type) ? t.note : '');
  const note = ['lend', 'lback', 'brw', 'brep'].includes(t.type) ? '' : t.note || '';
  const sub = [showDate ? fmtDate(t.date) : '', t.time || '', who, t.type === 'pexp' && t.cid ? '🏷 ' + catName(t.cid) : '', (s && mods.kart && C.isCard(t)) ? '💳 Kart' : ''].filter(Boolean).join(' · ');
  const cls = s > 0 ? 'pay' : s < 0 ? 'exp' : 'debt';
  const val = s > 0 ? '+' + money(t.amount) : s < 0 ? '−' + money(t.amount) : money(t.amount);
  return `<button class="row" data-a="openTx" data-v="${t.id}">
    <div class="grow"><div class="t">${esc(note ? txTitle(t) + ' — ' + note : txTitle(t))}</div><div class="s">${esc(sub)}${t.cost ? ' · hissə −' + money(t.cost) : ''}</div></div>
    <div class="amt num ${cls}">${val}${s === 0 && t.type === 'debt' ? '<small>gəlir deyil</small>' : ''}</div></button>`;
}
const sortTx = list => list.slice().sort((a, b) => (b.date + (b.time || '') + pad(b.created || 0)).localeCompare(a.date + (a.time || '') + pad(a.created || 0)));
const kv = (l, v, cls) => `<div class="kv"><span>${l}</span><b class="num ${cls || ''}">${v}</b></div>`;
const netCls = q => q < 0 ? 'neg' : 'pay';
function pageHead(title, extra) {
  return `<header><button data-a="back">${I.back}</button><h1>${esc(title)}</h1>${extra || ''}</header>`;
}

// ---------- ANA EKRAN ----------
function renderHome() {
  const td = today(), m = td.slice(0, 7), M = C.monthFlow(db, m), B = C.dayBalance(db, td), D = B.f, K = C.kassaNow(db);
  const nis = C.nisyeTotal(db), lateU = db.people.map(p => ({ p, o: C.overdue(db, p.id, td) })).filter(x => x.o.sum > 0);
  const lateL = C.parties(db, 'lend').filter(g => g.left > 0 && g.due && g.due < td);
  const lateB = C.parties(db, 'borrow').filter(g => g.left > 0 && g.due && g.due < td);
  const recent = sortTx(db.tx.filter(accTx)).slice(0, 8);
  return `<div class="topbar"><h1><span class="sub">${fmtDate(td)}</span>Hesabat</h1><button class="tbtn" data-a="openSettings">${I.gear}</button></div>
  <header>
    <div class="hbal" data-a="openDay" data-v="${td}"><small>Bu gün — qalıq</small><b class="num${B.qaliq < 0 ? ' neg-hero' : ''}">${money(B.qaliq)}</b>
      ${B.carry ? `<small style="display:block;margin-top:2px">Əvvəlki günlərdən qalan: ${money(B.carry)}</small>` : ''}</div>
    <div class="hsplit">
      <button class="hio" data-a="openDay" data-v="${td}"><span style="min-width:0"><small>Bu gün gəlir</small><b class="num">+${money(D.gelir)}</b></span></button>
      <div class="sep"></div>
      <button class="hio" data-a="openDay" data-v="${td}"><span style="min-width:0"><small>Bu gün xərc</small><b class="num">${D.cixis ? '−' : ''}${money(D.cixis)}</b></span></button>
    </div>
  </header>
  <main>
    ${lateU.length ? `<button class="odban" data-a="tab" data-v="people"><span>⚠ ${lateU.length} müştərinin nisyəsi gecikir · ${money(lateU.reduce((s, x) => s + x.o.sum, 0))}</span></button>` : ''}
    ${mods.borclar && lateL.length ? `<button class="odban" data-a="openSide" data-v="lend"><span>⚠ Verdiyim borc gecikir: ${esc(lateL.map(g => g.name + ' (' + C.daysBetween(g.due, td) + ' gün)').join(', '))}</span></button>` : ''}
    ${mods.borclar && lateB.length ? `<button class="odban soon" data-a="openSide" data-v="borrow"><span>⏰ Qaytarmalı olduğum borc gecikir: ${esc(lateB.map(g => g.name + ' (' + C.daysBetween(g.due, td) + ' gün)').join(', '))}</span></button>` : ''}
    ${mods.kart && (D.nagdIn || D.kartIn) ? `<div class="card" style="padding:12px 16px">${kv('Bu gün alınan 💵 nağd', '+' + money(D.nagdIn), 'pay')}${kv('Bu gün alınan 💳 kart', '+' + money(D.kartIn), 'pay')}</div>` : ''}
    <div class="hm3">
      ${mods.kassa ? `<button class="tile" data-a="kassa"><small>Kassa — məndə olmalı</small>
        <b class="num ${K.nagd + (mods.kart ? K.kart : 0) < 0 ? 'neg' : ''}">${money(K.nagd + (mods.kart ? K.kart : 0))}</b>
        <span>💵 Nağd: ${money(K.nagd)}</span>
        ${mods.kart ? `<span>💳 Kart: ${money(K.kart)}</span>` : ''}</button>` : ''}
      <button class="tile" data-a="tab" data-v="people"><small>Müştərilərdəki nisyə</small><b class="num debt">${money(nis)}</b><span>${db.people.filter(p => C.nisye(db, p.id) > 0).length} müştəri</span></button>
    </div>
    <button class="card" data-a="tab" data-v="report" style="display:block;width:100%;text-align:left;margin-top:12px">
      <div class="section-title" style="margin-top:0">${MONTHS[+m.slice(5) - 1]}</div>
      ${kv('Gəlir', '+' + money(M.gelir), 'pay')}${kv('Xərc', (M.cixis ? '−' : '') + money(M.cixis), 'exp')}${kv('Xalis', money(M.qaliq), netCls(M.qaliq))}</button>
    <div class="sec"><b>Son əməliyyatlar</b><button data-a="openAll">Hamısı · 🔍</button></div>
    ${recent.length ? `<div class="list">${recent.map(t => txRow(t, true)).join('')}</div>` : '<div class="empty">Hələ heç nə yazılmayıb.<br>Aşağıdakı «+» düyməsi ilə başlayın.</div>'}
  </main>`;
}

// ---------- MÜŞTƏRİLƏR ----------
function renderPeople() {
  const td = today();
  const list = db.people.map(p => ({ p, b: C.nisye(db, p.id), o: C.overdue(db, p.id, td) }))
    .sort((a, b) => (b.b > 0) - (a.b > 0) || b.b - a.b || a.p.name.localeCompare(b.p.name, 'az'));
  return `<div class="topbar"><h1>Müştərilər</h1><button class="tbtn" data-a="newPerson">${I.plus}</button></div>
  <header><div class="hbal" style="padding-bottom:4px"><small>Müştərilərdəki nisyə</small><b class="num">${money(C.nisyeTotal(db))}</b></div></header>
  <main>
    <input class="search" id="q" placeholder="🔍 Ad və ya telefon" autocomplete="off">
    ${list.length ? `<div class="list" id="plist">${list.map(x => `<button class="row" data-a="openPerson" data-v="${x.p.id}" data-name="${esc(fold(x.p.name + ' ' + (x.p.phone || '')))}">
      <div class="avatar">${esc(initials(x.p.name))}</div>
      <div class="grow"><div class="t">${esc(x.p.name)}</div><div class="s">${x.o.sum ? `<span class="neg">⏰ ${x.o.days} gün gecikir</span>` : esc(x.p.phone || '')}</div></div>
      <div class="amt num ${x.b > 0 ? 'debt' : 'zero'}">${money(x.b)}${x.b > 0 ? '<small>nisyə</small>' : ''}</div></button>`).join('')}</div>` : '<div class="empty">Müştəri yoxdur. Yuxarıdakı «+» ilə əlavə edin.</div>'}
  </main>`;
}
function renderPerson(pg) {
  const p = person(pg.id);
  if (!p) { state.pages.pop(); return ''; }
  const b = C.nisye(db, p.id), o = C.overdue(db, p.id, today()), since = C.debtState(db, p.id).since;
  const tx = sortTx(db.tx.filter(t => t.pid === p.id && !t.corr));
  const age = o.sum ? `<span class="neg">⏰ ${o.days} gün gecikir · ${money(o.sum)}</span>` : since ? `⏱ ${C.daysBetween(since, today())} gündür açıq` : '';
  return `<div class="page">${pageHead(p.name, `<button data-a="editPerson" data-v="${p.id}">${I.edit}</button>`)}
  <div class="hero" style="margin:10px 16px"><div class="bal"><small>Nisyə qalığı</small><b class="num">${money(b)}</b></div>
    ${age ? `<div style="position:relative;text-align:center;margin-top:6px;font-size:13px">${age}</div>` : ''}</div>
  <main style="padding-bottom:40px">
    <div class="two"><button class="btn debtb" data-a="newJob" data-v="${p.id}">+ İş yaz</button><button class="btn payb" data-a="newPay" data-v="${p.id}">Ödəniş aldım</button></div>
    ${p.phone ? `<div class="two" style="margin-top:10px"><a class="btn ghost" style="margin:0;text-decoration:none" href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}">📞 Zəng</a><a class="btn ghost" style="margin:0;text-decoration:none" href="https://wa.me/${waNum(p.phone)}">💬 WhatsApp</a></div>` : ''}
    ${b > 0 ? `<a class="btn primary" style="text-decoration:none;display:block;text-align:center" href="${waLink(p.phone, msgPerson(p))}">📨 WhatsApp — hazır mesaj (tarixçə ilə)</a>` : ''}
    <div class="section-title">Əməliyyatlar</div>
    ${tx.length ? `<div class="list">${tx.map(t => txRow(t, true)).join('')}</div>` : '<div class="empty">Hələ əməliyyat yoxdur</div>'}
  </main></div>`;
}

// ---------- BORCLAR ----------
function renderDebts() {
  const side = state.side, all = C.parties(db, side), td = today();
  const open = all.filter(g => g.left > 0).sort((a, b) => (a.due || '9').localeCompare(b.due || '9') || b.left - a.left);
  const done = all.filter(g => g.left <= 0).sort((a, b) => (b.first || '').localeCompare(a.first || ''));
  const sum = open.reduce((s, g) => s + g.left, 0);
  const row = g => `<button class="row" data-a="openParty" data-v="${esc(g.key)}">
    <div class="avatar" style="${side === 'lend' ? 'background:var(--amber-soft);color:var(--amber)' : 'background:var(--exp-soft);color:var(--exp)'}">${esc(initials(g.name))}</div>
    <div class="grow"><div class="t">${esc(g.name)}</div><div class="s">${g.left > 0 && g.due ? (g.due < td ? `<span class="neg">⏰ ${C.daysBetween(g.due, td)} gün gecikir</span>` : '📅 ' + fmtDate(g.due)) : g.left > 0 ? 'Qaytarma günü yoxdur' : 'Bağlanıb ✓'}</div></div>
    <div class="amt num ${g.left > 0 ? (side === 'lend' ? 'debt' : 'exp') : 'zero'}">${money(g.left > 0 ? g.left : g.total)}${g.left > 0 && g.back ? `<small>${money(g.total)}-dan</small>` : ''}</div></button>`;
  return `<div class="topbar"><h1>Borclar</h1><button class="tbtn" data-a="newParty">${I.plus}</button></div>
  <main style="padding-top:6px">
    <div class="seg"><button class="${side === 'lend' ? 'on' : ''}" data-a="side" data-v="lend">Verdiyim</button><button class="${side === 'borrow' ? 'on' : ''}" data-a="side" data-v="borrow">Aldığım</button></div>
    <div class="card" style="margin-top:12px">${kv(side === 'lend' ? 'Mənə qaytarılmalıdır' : 'Mən qaytarmalıyam', money(sum), side === 'lend' ? 'debt' : 'exp')}
      <div class="note">${side === 'lend' ? 'Ümumi hesaba (gəlir, xərc, qalıq, kassa) qatılmır. Qaytarma gününə 3 gün qalmış hər gün xatırladılır.' : 'Alanda gəlirə düşür (+), qaytaranda hesabımdan çıxır (−).'}</div></div>
    ${open.length ? `<div class="list">${open.map(row).join('')}</div>` : '<div class="empty">Açıq borc yoxdur</div>'}
    ${done.length ? `<div class="section-title">Bağlanmış</div><div class="list">${done.map(row).join('')}</div>` : ''}
  </main>`;
}
function renderParty(pg) {
  const g = C.parties(db, pg.side).find(x => x.key === pg.key);
  if (!g) { state.pages.pop(); return ''; }
  const lend = pg.side === 'lend', ids = new Set(g.recs.map(l => l.id));
  const mine = t => lend ? ids.has(t.lid) : ids.has(t.bid);
  const given = sortTx(db.tx.filter(t => t.type === (lend ? 'lend' : 'brw') && mine(t)));
  const backs = sortTx(db.tx.filter(t => t.type === (lend ? 'lback' : 'brep') && mine(t)));
  const td = today();
  const dueTxt = g.left > 0 && g.due ? (g.due < td ? `<span style="color:#FFD6D6">⏰ ${C.daysBetween(g.due, td)} gün gecikir (${fmtDate(g.due)})</span>`
    : g.due === td ? '📅 Bu gün qaytarma günüdür' : `📅 Qaytarma günü: ${fmtDate(g.due)} · ${C.daysBetween(td, g.due)} gün qalıb`) : g.left > 0 ? 'Qaytarma günü yazılmayıb' : 'Bağlanıb ✓';
  const giveRow = t => `<button class="row" data-a="openTx" data-v="${t.id}"><div class="grow"><div class="t">${lend ? '🤝 Verdim' : '📥 Aldım'}</div><div class="s">📅 ${fmtDate(t.date)}${t.time ? ' · 🕒 ' + esc(t.time) : ''}</div></div><div class="amt num ${lend ? 'debt' : 'exp'}">${money(t.amount)}</div></button>`;
  const backRow = t => `<button class="row" data-a="openTx" data-v="${t.id}"><div class="grow"><div class="t pay">✓ ${lend ? 'Qaytardı' : 'Qaytardım'}</div><div class="s">📅 ${fmtDate(t.date)} · 🕒 ${esc(backTime(t) || '—')} · ✏️ düzəlt</div></div><div class="amt num pay">${money(t.amount)}</div></button>`;
  return `<div class="page">${pageHead(g.name)}
  <div class="hero" style="margin:10px 16px"><div class="bal"><small>${lend ? 'Mənə qaytarmalıdır' : 'Mən qaytarmalıyam'}</small><b class="num">${money(g.left)}</b></div>
    <div style="position:relative;text-align:center;font-size:13px;margin-top:6px">Cəmi: ${money(g.total)} · Qaytarılıb: ${money(g.back)}</div>
    <div style="position:relative;text-align:center;font-size:14px;margin-top:4px;font-weight:600">${dueTxt}</div></div>
  <main style="padding-bottom:40px">
    <div class="two">
      <button class="btn ${lend ? 'debtb' : 'expb'}" data-a="newRec" data-v="${pg.side}|${esc(g.key)}">${lend ? 'Yenə verdim' : 'Yenə aldım'}</button>
      <button class="btn payb" data-a="newBack" data-v="${pg.side}|${esc(g.key)}" ${g.left > 0 ? '' : 'disabled style="opacity:.45"'}>${lend ? 'Qaytarıldı' : 'Qaytardım'}</button>
    </div>
    ${g.phone ? `<div class="two" style="margin-top:10px"><a class="btn ghost" style="margin:0;text-decoration:none" href="tel:${esc(g.phone.replace(/[^\d+]/g, ''))}">📞 Zəng</a><a class="btn ghost" style="margin:0;text-decoration:none" href="https://wa.me/${waNum(g.phone)}">💬 WhatsApp</a></div>` : ''}
    <a class="btn primary" style="text-decoration:none;display:block;text-align:center" href="${waLink(g.phone, msgParty(g, lend))}">📨 WhatsApp — hazır mesaj (tarixçə ilə)</a>
    <div class="section-title">${lend ? 'Qaytarmalar' : 'Ödənişlərim'} — gün, saat, məbləğ</div>
    ${backs.length ? `<div class="list">${backs.map(backRow).join('')}</div>` : '<div class="empty">Hələ qaytarılmayıb</div>'}
    <div class="section-title">${lend ? 'Verdiyim' : 'Aldığım'}</div>
    <div class="list">${given.map(giveRow).join('')}</div>
  </main></div>`;
}
// qaytarmanın saatı (köhnə yazılarda saat yoxdursa, yazıldığı an)
function backTime(t) {
  if (t.time) return t.time;
  if (t.type === 'lback' && t.created > 1e12 && !String(t.id).startsWith('LB')) { const d = new Date(t.created); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  return '';
}

// ---------- WhatsApp üçün hazır rəsmi mesaj ----------
const waLink = (phone, text) => 'https://wa.me/' + (phone ? waNum(phone) : '') + '?text=' + encodeURIComponent(text);
const whenTxt = t => fmtDate(t.date) + (backTime(t) || t.time ? ', ' + (backTime(t) || t.time) : '');
function msgParty(g, lend) {
  const ids = new Set(g.recs.map(l => l.id)), mine = t => lend ? ids.has(t.lid) : ids.has(t.bid);
  const given = db.tx.filter(t => t.type === (lend ? 'lend' : 'brw') && mine(t)).sort((a, b) => a.date.localeCompare(b.date));
  const backs = db.tx.filter(t => t.type === (lend ? 'lback' : 'brep') && mine(t)).sort((a, b) => (a.date + (backTime(a) || '')).localeCompare(b.date + (backTime(b) || '')));
  const td = today(), L = [];
  L.push('Salam, ' + g.name + '!', '');
  L.push(lend ? 'Borc haqqında məlumat:' : 'Sizdən aldığım borc haqqında məlumat:', '');
  L.push(lend ? '📅 Verilib:' : '📅 Alınıb:');
  given.forEach(t => L.push('• ' + fmtDate(t.date) + ' — ' + money(t.amount)));
  if (backs.length) { L.push('', lend ? '✅ Ödənişləriniz:' : '✅ Qaytardığım:'); backs.forEach(t => L.push('• ' + whenTxt(t) + ' — ' + money(t.amount))); }
  L.push('', 'Cəmi: ' + money(g.total), (lend ? 'Ödənilib: ' : 'Qaytarılıb: ') + money(g.back), 'Qalıq: ' + money(g.left));
  if (g.left > 0 && g.due) L.push(g.due < td ? '⏰ Qaytarma günü: ' + fmtDate(g.due) + ' (' + C.daysBetween(g.due, td) + ' gün gecikir)' : '📅 Qaytarma günü: ' + fmtDate(g.due));
  if (g.left <= 0) L.push('Borc tam bağlanıb. Təşəkkür edirəm!');
  L.push('', 'Hörmətlə.');
  return L.join('\n');
}
function msgPerson(p) {
  const tx = db.tx.filter(t => t.pid === p.id && !t.corr).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const jobs = tx.filter(t => t.type === 'debt'), pays = tx.filter(t => t.type === 'pay');
  const b = C.nisye(db, p.id), o = C.overdue(db, p.id, today()), L = [];
  L.push('Salam, ' + p.name + '!', '', 'Nisyə haqqında məlumat:', '');
  if (jobs.length) { L.push('🔧 Görülən işlər:'); jobs.forEach(t => L.push('• ' + fmtDate(t.date) + (t.note ? ' — ' + t.note : '') + ' — ' + money(t.amount))); }
  if (pays.length) { L.push('', '✅ Ödənişləriniz:'); pays.forEach(t => L.push('• ' + whenTxt(t) + ' — ' + money(t.amount))); }
  L.push('', 'Cəmi: ' + money(jobs.reduce((s, t) => s + t.amount, 0)), 'Ödənilib: ' + money(pays.reduce((s, t) => s + t.amount, 0)), 'Qalıq: ' + money(b));
  if (o.sum) L.push('⏰ ' + o.days + ' gün gecikir');
  L.push('', 'Hörmətlə.');
  return L.join('\n');
}

// ---------- HESABAT ----------
function reportCard(F, B, carryLabel) {
  return `<div class="card">
    <div class="section-title" style="margin-top:0">Gəlir (+)</div>
    ${F.work ? kv('İşlər', '+' + money(F.work), 'pay') : ''}
    ${F.pays ? kv('Nisyə ödənişləri', '+' + money(F.pays), 'pay') : ''}
    ${F.other ? kv('Digər gəlir', '+' + money(F.other), 'pay') : ''}
    ${F.brw ? kv('Aldığım borc', '+' + money(F.brw), 'pay') : ''}
    <div class="kv total"><span>Cəmi gəlir</span><b class="num pay">+${money(F.gelir)}</b></div>
    <div class="section-title">Xərc (−)</div>
    ${F.parts ? kv('Hissələr', '−' + money(F.parts), 'exp') : ''}
    ${F.xerc ? kv('Xərclər', '−' + money(F.xerc), 'exp') : ''}
    ${F.loss ? kv('Ziyan', '−' + money(F.loss), 'exp') : ''}
    ${F.brep ? kv('Qaytardığım borc', '−' + money(F.brep), 'exp') : ''}
    <div class="kv total"><span>Cəmi xərc</span><b class="num exp">${F.cixis ? '−' : ''}${money(F.cixis)}</b></div>
    ${B ? kv(carryLabel, money(B.carry), netCls(B.carry)) + kv('Bu dövrün nəticəsi', money(F.qaliq), netCls(F.qaliq)) : ''}
    <div class="kv total" style="font-size:20px;border-top:2px solid var(--line);margin-top:6px;padding-top:12px"><span>Qalıq</span><b class="num ${netCls(B ? B.qaliq : F.qaliq)}">${money(B ? B.qaliq : F.qaliq)}</b></div>
    ${mods.kart ? kv('💵 Nağd: daxil / çıxan', '+' + money(F.nagdIn) + ' / ' + (F.nagdOut ? '−' : '') + money(F.nagdOut)) + kv('💳 Kart: daxil / çıxan', '+' + money(F.kartIn) + ' / ' + (F.kartOut ? '−' : '') + money(F.kartOut)) : ''}
    ${F.newDebt ? kv('Yazılan yeni nisyə (gəlir deyil)', money(F.newDebt), 'debt') : ''}
  </div>`;
}
// ---------- dairəvi qrafik ----------
const PIE = ['#16A34A', '#0E9384', '#3E63DD', '#D97706', '#7C3AED', '#DC2626', '#0090FF', '#E5484D', '#12A594', '#F76B15', '#8E4EC6', '#8B8D98'];
function donut(title, parts, total, cls) {
  parts = parts.filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  if (!total || !parts.length) return '';
  const R = 52, L = 2 * Math.PI * R;
  let off = 0;
  const segs = parts.map(([, v], i) => { const len = v / total * L, c = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${PIE[i % PIE.length]}" stroke-width="22" stroke-dasharray="${len} ${L - len}" stroke-dashoffset="${-off}"/>`; off += len; return c; }).join('');
  return `<div class="card"><div class="section-title" style="margin-top:0">${title}</div>
    <div style="display:flex;align-items:center;gap:14px">
      <svg viewBox="0 0 140 140" style="width:130px;height:130px;flex:none;transform:rotate(-90deg)">${segs}</svg>
      <div style="flex:1;min-width:0;text-align:center"><b class="num ${cls}" style="font-size:20px">${money(total)}</b></div></div>
    ${parts.map(([n, v], i) => `<div class="kv"><span><i style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${PIE[i % PIE.length]};margin-right:8px"></i>${esc(n)}</span><b class="num">${money(v)} · ${Math.round(v / total * 100)}%</b></div>`).join('')}</div>`;
}
const catName = id => (db.cats.find(c => c.id === id) || {}).name || '';
function charts(list, F) {
  const exp = new Map();
  const addE = (n, v) => exp.set(n, (exp.get(n) || 0) + v);
  for (const t of list) {
    if (t.corr) continue;
    if (t.type === 'pexp' || t.type === 'exp') addE(catName(t.cid) || 'Kateqoriyasız', t.amount);
    if (t.cost) addE('Hissələr', t.cost);
  }
  if (F.loss) addE('Ziyan', F.loss);
  if (F.brep) addE('Qaytardığım borc', F.brep);
  return donut('Gəlir — dairəvi qrafik', [['İşlər', F.work], ['Nisyə ödənişləri', F.pays], ['Digər gəlir', F.other], ['Aldığım borc', F.brw]], F.gelir, 'pay')
    + donut('Xərc — dairəvi qrafik', [...exp.entries()], F.cixis, 'exp');
}
function renderReport() {
  const m = state.month, B = C.monthBalance(db, m), F = B.f, td = today();
  const mTx = db.tx.filter(t => (t.date || '').slice(0, 7) === m && !t.corr && !isLoanTx(t));
  const days = [...new Set(mTx.map(t => t.date))].sort().reverse();
  const [y, mo] = m.split('-').map(Number), nDays = m === td.slice(0, 7) ? +td.slice(8) : new Date(y, mo, 0).getDate();
  return `<div class="topbar"><h1>Hesabat</h1></div>
  <main style="padding-top:6px">
    <div class="mbar"><button class="iconbtn" data-a="month" data-v="-1">‹</button><b>${mLabel(m)}</b><button class="iconbtn" data-a="month" data-v="1" ${m >= td.slice(0, 7) ? 'disabled style="opacity:.35"' : ''}>›</button></div>
    ${reportCard(F, B, 'Keçən aylardan qalan')}
    <div class="card">${kv('Gündəlik orta gəlir', money(Math.round(F.gelir / nDays)), 'pay')}<div class="note">${mLabel(m)}: ${nDays} günə görə</div></div>
    ${charts(mTx, F)}
    <div class="sec"><b>Günlər</b></div>
    ${days.length ? `<div class="list">${days.map(d => { const b = C.dayBalance(db, d), f = b.f; return `<button class="row" data-a="openDay" data-v="${d}"><div class="grow"><div class="t">${fmtDate(d)}</div><div class="s">+${money(f.gelir)} · −${money(f.cixis)}${f.newDebt ? ' · nisyə ' + money(f.newDebt) : ''}</div></div><div class="amt num ${netCls(b.qaliq)}">${money(b.qaliq)}<small>qalıq</small></div></button>`; }).join('')}</div>` : '<div class="empty">Bu ay əməliyyat yoxdur</div>'}
  </main>`;
}
function renderDay(pg) {
  const d = pg.d, B = C.dayBalance(db, d), F = B.f;
  const tx = sortTx(db.tx.filter(t => t.date === d && accTx(t)));
  return `<div class="page">${pageHead(fmtDate(d))}
  <main style="padding-top:6px;padding-bottom:40px">
    ${reportCard(F, B, 'Əvvəlki günlərdən qalan')}
    <div class="section-title">Əməliyyatlar</div>
    ${tx.length ? `<div class="list">${tx.map(t => txRow(t, false)).join('')}</div>` : '<div class="empty">Bu gün heç nə yazılmayıb</div>'}
  </main></div>`;
}
// axtarış və filtr: bütün aylar üzrə; axtarış boşdursa yalnız seçilən ay görünür
const txSearchText = t => fold([txTitle(t), t.note, t.pid ? pname(t.pid) : '', catName(t.cid), fmtDate(t.date), t.date, t.date.split('-').reverse().join('.'), t.time, money(t.amount), String(t.amount / 100).replace('.', ',')].filter(Boolean).join(' '));
function renderAll() {
  const m = state.month, tx = sortTx(db.tx.filter(accTx));
  const row = t => { const sg = txSign(t); return txRow(t, true).replace('<button class="row"', `<button class="row" data-s="${esc(txSearchText(t))}" data-k="${sg > 0 ? 'in' : sg < 0 ? 'out' : 'n'}" data-m="${sg ? (C.isCard(t) ? 'kart' : 'nagd') : ''}" data-mo="${(t.date || '').slice(0, 7)}"`); };
  return `<div class="page">${pageHead('Bütün əməliyyatlar')}
  <main style="padding-top:6px;padding-bottom:40px">
    <input class="search" id="tq" placeholder="🔍 Ad, qeyd, məbləğ və ya tarix (bütün aylar)" autocomplete="off">
    <div class="seg" data-group="fk" style="margin-top:8px"><button class="on" data-a="flt" data-v="fk|">Hamısı</button><button data-a="flt" data-v="fk|in">Gəlir</button><button data-a="flt" data-v="fk|out">Xərc</button></div>
    ${mods.kart ? `<div class="seg" data-group="fm" style="margin-top:8px"><button class="on" data-a="flt" data-v="fm|">Hamısı</button><button data-a="flt" data-v="fm|nagd">💵 Nağd</button><button data-a="flt" data-v="fm|kart">💳 Kart</button></div>` : ''}
    <div class="mbar" id="tmbar"><button class="iconbtn" data-a="month" data-v="-1">‹</button><b>${mLabel(m)}</b><button class="iconbtn" data-a="month" data-v="1" ${m >= today().slice(0, 7) ? 'disabled style="opacity:.35"' : ''}>›</button></div>
    <div class="card" id="tsum" style="padding:12px 16px"></div>
    ${tx.length ? `<div class="list" id="tlist">${tx.map(row).join('')}</div>` : ''}
    <div class="empty hidden" id="tempty">Heç nə tapılmadı</div>
  </main></div>`;
}
function filterAll() {
  const q = fold(val('tq')), list = document.getElementById('tlist');
  const fk = picked('fk') || '', fm = picked('fm') || '';
  const bar = document.getElementById('tmbar'); if (bar) bar.classList.toggle('hidden', !!q);
  let n = 0, inn = 0, out = 0;
  if (list) list.querySelectorAll('.row').forEach(r => {
    const ok = (q ? r.dataset.s.includes(q) : r.dataset.mo === state.month) && (!fk || r.dataset.k === fk) && (!fm || r.dataset.m === fm);
    r.classList.toggle('hidden', !ok);
    if (ok) { n++; const t = db.tx.find(x => x.id === r.dataset.v); if (t) { const sg = txSign(t); if (sg > 0) inn += t.amount; else if (sg < 0) out += t.amount; } }
  });
  const e = document.getElementById('tempty'); if (e) e.classList.toggle('hidden', n > 0);
  const sm = document.getElementById('tsum'); if (sm) sm.innerHTML = kv(n + ' əməliyyat · gəlir', '+' + money(inn), 'pay') + kv('Xərc', (out ? '−' : '') + money(out), 'exp');
}

// ---------- AYARLAR ----------
const srow = (a, v, icon, color, label, right) => `<button class="srow" data-a="${a}" ${v != null ? `data-v="${v}"` : ''}><span class="si" style="background:${color}">${icon}</span><span class="st"><span>${label}</span>${right || ''}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg></span></button>`;
const sw = on => `<i class="switch ${on ? 'on' : ''}"></i>`;
function renderSettings() {
  const st = { idle: '', syncing: 'göndərilir…', ok: 'hər şey göndərilib ✓', error: 'xəta: ' + sync.msg }[sync.status] || '';
  const last = sync.last ? new Date(sync.last) : null;
  const R = state.checkResult;
  const pin = hasNative && Android.pinSet && Android.pinSet();
  const bioOk = hasNative && Android.bioAvailable && Android.bioAvailable();
  return `<div class="page">${pageHead('Ayarlar')}
  <main style="padding-top:6px;padding-bottom:40px">
    <div class="slabel">Google hesabı</div>
    <div class="card">${sync.account ? `<b>✅ ${esc(sync.account)}</b><div class="note">Hər dəyişiklik dərhal Google-a göndərilir${st ? ' · ' + esc(st) : ''}${last ? '<br>Son göndəriş: ' + fmtDate(today()) + ' ' + pad(last.getHours()) + ':' + pad(last.getMinutes()) : ''}</div>
      <button class="btn primary" data-a="syncNow">🔄 İndi sinxron et</button>
      <button class="btn ghost" data-a="checkBackup">🔍 Yedəyi yoxla</button>
      ${R ? (R.none ? '<div class="bad-box">Google-da hələ surət yoxdur</div>' : R.same ? '<div class="ok-box">✓ Google-dakı surət telefondakı ilə eynidir</div>' : `<div class="bad-box">Fərq var — birləşdirildi və yenidən göndərildi.<br>Telefon: ${R.a.tx} əməliyyat · Google: ${R.b.tx} əməliyyat</div>`) : ''}
      <button class="btn danger" data-a="syncUnlink">Google hesabından ayır</button>`
      : `<div class="note">Məlumatlarınız öz Gmail hesabınızın Google Drive-ında saxlanılsın. Telefon dəyişəndə eyni Gmail ilə hər şey geri gəlir.</div><button class="btn primary" data-a="syncLink">Google hesabını qoş</button>`}</div>
    <div class="slabel">Görünüş</div>
    <div class="sgroup">
      ${srow('theme', null, '🌓', '#6E56CF', 'Tema', `<em>${theme === 'dark' ? 'Gecə (qızılı)' : 'Gündüz'}</em>`)}
      ${srow('summary', null, '🔔', '#F76B15', 'Günün xülasəsi', `<em>${esc((hasNative && Android.summaryTime && Android.summaryTime()) || 'sönülü')}</em>`)}
      ${srow('currency', null, cur(), '#0E9384', 'Valyuta', `<em>${esc((CURRENCIES.find(c => c[0] === cur()) || ['', ''])[1])}</em>`)}
    </div>
    <div class="slabel">Bölmələr</div>
    <div class="sgroup">${MODS.map(([k, l]) => srow('mod', k, '▦', '#3E63DD', l, sw(mods[k]))).join('')}</div>
    <div class="slabel">Təhlükəsizlik</div>
    <div class="sgroup">
      ${srow('pin', null, '🔒', '#E5484D', 'PIN kod', `<em>${pin ? 'qoyulub' : 'yoxdur'}</em>`)}
      ${pin && bioOk ? srow('bio', null, '☝', '#12A594', 'Barmaq izi', sw(Android.bioEnabled())) : ''}
      ${hasNative && Android.secureOn ? srow('secure', null, '📵', '#F76B15', 'Ekran şəklini qadağan et', sw(Android.secureOn())) : ''}
    </div>
    <div class="slabel">Digər</div>
    <div class="sgroup">
      ${srow('openTrash', null, '🗑', '#8B8D98', 'Zibil qutusu', `<em>${db.trash.length || ''}</em>`)}
      ${srow('resetAll', null, '⟲', '#E5484D', 'Hər şeyi sil — yalnız borclar qalsın', '')}
      ${srow('openPrivacy', null, '🛡', '#30A46C', 'Məxfilik siyasəti', '')}
      ${srow('noop', null, 'ℹ', '#0090FF', 'Versiya', `<em>${APP_VERSION}</em>`)}
    </div>
  </main></div>`;
}
function trashLabel(e) {
  if (e.kind === 'tx') return txTitle(e.tx) + ' — ' + money(e.tx.amount) + (e.tx.pid ? ' · ' + (pname(e.tx.pid) || (db.trash.find(x => x.kind === 'person' && x.person.id === e.tx.pid) || { person: {} }).person.name || '') : '');
  if (e.kind === 'person') return 'Müştəri: ' + e.person.name;
  if (e.kind === 'loan') return 'Verdiyim borc: ' + e.loan.name + ' — ' + money(e.loan.amount);
  if (e.kind === 'borrow') return 'Aldığım borc: ' + e.borrow.name + ' — ' + money(e.borrow.amount);
  if (e.kind === 'cat') return 'Bölmə: ' + e.cat.name;
  if (e.kind === 'sub') return 'Abunə: ' + e.sub.name;
  if (e.kind === 'wo') return 'Silinmiş borc: ' + e.name;
  return e.kind;
}
function renderTrash() {
  return `<div class="page">${pageHead('Zibil qutusu')}
  <main style="padding-top:6px;padding-bottom:40px">
    ${db.trash.length ? `<div class="list">${db.trash.map(e => `<div class="row"><div class="grow"><div class="t">${esc(trashLabel(e))}</div><div class="s">${fmtDate(new Date(e.at).toISOString().slice(0, 10))}</div></div>
      <button class="mini" data-a="restore" data-v="${e.id}">Qaytar</button></div>`).join('')}</div>
      <button class="btn danger" data-a="emptyTrash">Zibil qutusunu boşalt</button>` : '<div class="empty">Zibil qutusu boşdur</div>'}
  </main></div>`;
}
const PRIVACY = {
  intro: 'HESABAT · MƏXFİLİK SİYASƏTİ VƏ İSTİFADƏ ŞƏRTLƏRİ\nProqramdan istifadə etməzdən əvvəl bütün 10 bəndi diqqətlə oxuyun.\nSon redaktə: 23.11.2026',
  items: [
    ['ÜMUMİ MÜDDƏALAR', [
      'Bu Məxfilik Siyasəti «Hesabat» proqramının (bundan sonra – «Proqram») istifadəsi zamanı məlumatların toplanması, saxlanılması və mühafizəsi qaydalarını, habelə istifadəçinin hüquq və öhdəliklərini müəyyən edir.',
      'Proqram gəlir, xərc, müştərilərin nisyəsi, verilən və alınan borclar, kassa (nağd və kart) üzrə şəxsi uçotun aparılması üçün nəzərdə tutulmuş Android proqramıdır.',
      'Proqramın operatoru (bundan sonra – «Operator»): ProTechtor Group, Bakı, Azərbaycan Respublikası.',
      'Proqramdan istifadə bu Siyasətin bütün şərtlərinin tam və qeyd-şərtsiz qəbul edilməsi deməkdir. Şərtlərlə razı olmayan şəxs Proqramdan istifadəni dayandırmalıdır.']],
    ['HESABLAMALARIN DƏQİQLİYİ (ƏSAS XƏBƏRDARLIQ)', [
      'Proqramdakı bütün hesablamalar (gəlir, xərc, qalıq, kassa, nisyə və borc qalıqları, hesabatlar və qrafiklər) YALNIZ İSTİFADƏÇİNİN DAXİL ETDİYİ MƏLUMATLAR əsasında aparılır.',
      'Məlumatların düzgün və tam daxil edilməsinə istifadəçi özü cavabdehdir. Səhv və ya natamam daxil edilmiş məlumat hesablamaların nəticəsinə təsir edir.',
      'Proqram mühasibat, vergi və ya hüquqi sənəd hesab edilmir. Proqramın göstəricilərinə əsasən qəbul edilən maliyyə qərarlarına görə məsuliyyət istifadəçiyə aiddir.']],
    ['TOPLANAN MƏLUMATLAR', [
      'Proqram yalnız istifadəçinin özünün daxil etdiyi məlumatları emal edir: müştəri və borc tərəflərinin adları və telefon nömrələri, görülən işlər, gəlir və xərclər, onların kateqoriyaları, nisyə, ödənişlər, borclar və qaytarılma tarixləri, kassa məbləğləri, qeydlər.',
      'Proqram qeydiyyat tələb etmir, məkan məlumatlarını toplamır, reklam və davranış izləmə alətlərindən istifadə etmir.']],
    ['MƏLUMATLARIN SAXLANILMASI', [
      'Bütün məlumatlar istifadəçinin telefonunda, Proqramın daxili yaddaşında saxlanılır.',
      'Silinmiş qeydlər «Zibil qutusu» bölməsinə keçir və oradan geri qaytarıla və ya həmişəlik silinə bilər.',
      'Proqram telefondan silindikdə telefondakı məlumatlar da silinir. Google hesabı ilə sinxronizasiya qoşulubsa, surət istifadəçinin öz Google Drive hesabında qalır.']],
    ['GOOGLE HESABI İLƏ SİNXRONİZASİYA (İSTƏYƏ BAĞLI)', [
      'İstifadəçi öz Google hesabını qoşduqda hər dəyişiklik dərhal həmin hesabın Google Drive yaddaşına göndərilir. Surət yalnız Proqramın görə bildiyi gizli qovluqda (appDataFolder) saxlanılır.',
      'Proqram Google Drive-dakı digər fayllara baxa, onları oxuya və ya dəyişə bilməz.',
      'Telefon dəyişdirildikdə eyni Google hesabı qoşularaq bütün məlumatlar bərpa olunur.']],
    ['TELEFONUN İCAZƏLƏRİ', [
      'Kontaktlar: yalnız istifadəçi «📇» düyməsinə basıb kontakt seçdikdə, seçilən kontaktın adı və nömrəsi forma sahəsinə yazılır. Telefon kitabçasının qalan hissəsi oxunmur və heç yerə göndərilmir.',
      'Bildirişlər: borcların qaytarılma gününə 3 gün qalmış gündəlik xatırlatmalar və istifadəçinin seçdiyi saatda «Günün xülasəsi» üçün istifadə olunur.',
      'Barmaq izi: Proqramın kilidini açmaq üçün telefonun öz sistemi vasitəsilə yoxlanılır; barmaq izi məlumatı Proqrama ötürülmür və saxlanılmır.',
      'İnternet: yalnız Google sinxronizasiyası və Proqramın yeni versiyasının yoxlanılması üçün istifadə olunur.']],
    ['ÜÇÜNCÜ TƏRƏFLƏRƏ ÖTÜRÜLMƏ', [
      'Məlumatlar heç kimə satılmır, ötürülmür və reklam məqsədilə istifadə edilmir.',
      'İstifadəçi «WhatsApp» və ya «Zəng» düyməsinə basdıqda yalnız seçilən proqram açılır və hazır mesajın mətni yalnız istifadəçinin özü göndərdikdə alıcıya çatır. Bundan sonrakı proses həmin proqramın qaydalarına tabe olur.',
      'Proqramın yeni versiyası GitHub serverindən yoxlanılır və yüklənir; bu zaman istifadəçinin məlumatları ötürülmür.']],
    ['TƏHLÜKƏSİZLİK', [
      'İstifadəçi Proqrama PIN kod və barmaq izi ilə giriş qoya bilər. PIN kodun özü saxlanılmır — telefonda yalnız onun geri çevrilməz şifrələnmiş izi saxlanılır.',
      'Ayarlarda «Ekran şəklini qadağan et» seçimi ilə Proqramın ekran şəklinin çəkilməsinin qarşısı alına bilər.',
      'Operator məlumatların qorunması üçün məqbul texniki tədbirlər görür; lakin telefonun itirilməsi, başqa şəxsə verilməsi və ya qorunmaması nəticəsində yaranan hallara görə məsuliyyət daşımır.']],
    ['İSTİFADƏÇİNİN HÜQUQLARI VƏ MƏLUMATLARIN SİLİNMƏSİ', [
      'İstifadəçi öz məlumatlarına istənilən vaxt baxa, onları düzəldə və silə bilər.',
      'Sinxronizasiyanı «Ayarlar → Google hesabından ayır» ilə dayandırmaq olar.',
      'Google Drive-dakı surət «Google Drive → Ayarlar → Tətbiqləri idarə et → Hesabat → Gizli tətbiq məlumatlarını sil» yolu ilə silinir.']],
    ['DƏYİŞİKLİKLƏR, ƏLAQƏ VƏ HÜQUQİ TƏNZİMLƏMƏ', [
      'Operator bu Siyasətə dəyişiklik etmək hüququnu saxlayır; yeni redaksiya Proqramda dərc edildiyi andan qüvvəyə minir.',
      'Sual və müraciətlər üçün əlaqə: 0553115544@gmail.com.',
      'Münasibətlər Azərbaycan Respublikasının qüvvədə olan qanunvericiliyi ilə tənzimlənir.']]
  ],
  foot: 'Hesabat · ProTechtor Group · Bütün hüquqlar qorunur · Son redaktə: 23.11.2026'
};
const PP_COLORS = ['#0E9384', '#E5484D', '#3E63DD', '#16A34A', '#0090FF', '#D97706', '#8E4EC6', '#12A594', '#F76B15', '#D9B45A'];
function renderPrivacy() {
  return `<div class="page">${pageHead('Məxfilik siyasəti')}<main style="padding-top:6px;padding-bottom:40px">
    <div class="pp-intro"><b class="pp-it">${esc(PRIVACY.intro.split('\n')[0])}</b>${esc(PRIVACY.intro.split('\n').slice(1).join('\n'))}</div>
    <div id="ppList">${PRIVACY.items.map(([h, l], i) => `<details class="pp-item${i === 1 ? ' warn' : ''}" style="--c:${i === 1 ? '#E5484D' : PP_COLORS[i]}"${i === 0 ? ' open' : ''}>
      <summary class="pp-head"><span class="pp-num">${pad(i + 1)}</span><span class="pp-title">${esc(h)}</span><span class="pp-chev">›</span></summary>
      <div class="pp-body">${l.map((x, j) => `<p><b class="pp-sub">${i + 1}.${j + 1}</b>${esc(x)}</p>`).join('')}</div></details>`).join('')}</div>
    <div class="pp-foot">${esc(PRIVACY.foot)}</div></main></div>`;
}
// bir bölmə açılanda digərləri yumşaq bağlanır
app.addEventListener('click', e => {
  const sm = e.target.closest('.pp-head');
  if (!sm) return;
  e.preventDefault();
  const d = sm.parentElement, b = d.querySelector('.pp-body');
  const close = x => { const bb = x.querySelector('.pp-body'); bb.style.height = bb.scrollHeight + 'px'; void bb.offsetHeight; bb.style.height = '0px'; bb.style.opacity = '0'; setTimeout(() => { x.open = false; bb.style.cssText = ''; }, 320); };
  if (d.open) return close(d);
  document.querySelectorAll('#ppList details[open]').forEach(x => { if (x !== d) close(x); });
  d.open = true; b.style.height = '0px'; b.style.opacity = '0'; void b.offsetHeight;
  b.style.height = b.scrollHeight + 'px'; b.style.opacity = '1';
  setTimeout(() => { b.style.cssText = ''; d.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 340);
});

// ---------- kateqoriya təklifləri (yazdıqca hərfə uyğun) ----------
function catSuggest() {
  const box = document.getElementById('catsug'), inp = document.getElementById('f_cat');
  if (!box || !inp) return;
  const use = new Map();
  for (const t of db.tx) if (t.cid && (t.type === 'pexp' || t.type === 'exp')) use.set(t.cid, (use.get(t.cid) || 0) + 1);
  const q = fold(inp.value);
  const list = db.cats.filter(c => !c.secret && use.has(c.id) && fold(c.name) !== q && (!q || fold(c.name).includes(q)))
    .sort((a, b) => (q ? fold(b.name).startsWith(q) - fold(a.name).startsWith(q) : 0) || use.get(b.id) - use.get(a.id)).slice(0, 12);
  box.innerHTML = list.map(c => `<button class="chip" data-a="catPick" data-v="${esc(c.name)}">${esc(c.name)}</button>`).join('');
}

// ---------- FORMALAR (açılan vərəqlər) ----------
// Formalar yazarkən yenidən çəkilmir — klaviatura bağlanıb-açılmır.
const nameList = (id, names) => `<datalist id="${id}">${[...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'az')).map(n => `<option value="${esc(n)}">`).join('')}</datalist>`;
const fDate = t => `<div class="two"><div><label>Tarix</label><input class="field" id="f_date" type="date" value="${t && t.date || today()}" max="${today()}"></div><div><label>Saat</label><input class="field" id="f_time" type="time" value="${t && t.time || (t ? '' : nowHm())}"></div></div>`;
const mOf = t => t ? (C.isCard(t) ? 'kart' : 'nagd') : 'nagd';
const fAmount = (v, label) => `<label>${label || 'Məbləğ'}</label><input class="field big num" id="f_amount" inputmode="decimal" placeholder="0" value="${esc(v || '')}" autocomplete="off">`;
const fMethod = v => mods.kart ? `<label>Ödəniş üsulu</label><div class="seg" data-group="method"><button class="${v !== 'kart' ? 'on' : ''}" data-a="pick" data-v="method|nagd">💵 Nağd</button><button class="${v === 'kart' ? 'on' : ''}" data-a="pick" data-v="method|kart">💳 Kart</button></div>` : '';
const picked = g => { const b = app.querySelector(`[data-group="${g}"] .on`); return b ? b.dataset.v.split('|')[1] : null; };
const val = id => { const e = document.getElementById(id); return e ? e.value : ''; };
const saveBtn = (a, label) => `<button class="btn primary" data-a="${a}">${label || 'Yadda saxla'}</button>`;

function renderSheet(s) {
  switch (s.kind) {
    case 'add': return `<h2>Nə yazırsınız?</h2><div class="addgrid">
      <button class="addopt" data-a="newJob">${IC('var(--brand-soft)', 'var(--brand)', '🔧')}<b>İş<small>Ödədi və ya nisyə</small></b></button>
      <button class="addopt" data-a="newPay">${IC('var(--pay-soft)', 'var(--pay)', '💰')}<b>Nisyə ödənişi<small>Müştəri ödədi</small></b></button>
      <button class="addopt" data-a="newInc">${IC('var(--pay-soft)', 'var(--pay)', '➕')}<b>Digər gəlir</b></button>
      <button class="addopt" data-a="newExp">${IC('var(--exp-soft)', 'var(--exp)', '🧾')}<b>Xərc</b></button>
      ${mods.borclar ? `<button class="addopt" data-a="newRec" data-v="lend|">${IC('var(--amber-soft)', 'var(--amber)', '🤝')}<b>Borc verdim</b></button>
      <button class="addopt" data-a="newBack" data-v="lend|">${IC('var(--pay-soft)', 'var(--pay)', '↩️')}<b>Borc qaytarıldı<small>Mənə</small></b></button>
      <button class="addopt" data-a="newRec" data-v="borrow|">${IC('var(--exp-soft)', 'var(--exp)', '📥')}<b>Borc aldım</b></button>
      <button class="addopt" data-a="newBack" data-v="borrow|">${IC('var(--red-soft)', 'var(--red)', '📤')}<b>Borcu qaytardım</b></button>` : ''}
    </div>`;
    case 'job': {
      const t = s.id && db.tx.find(x => x.id === s.id), paid = t ? t.type === 'inc' : s.paid !== false;
      return `<h2>${t ? 'İşi düzəlt' : '🔧 İş yaz'}</h2>
      <label>Müştəri</label><div style="display:flex;gap:8px"><input class="field" id="f_who" list="dl_people" value="${esc(t ? pname(t.pid) : s.pid ? pname(s.pid) : '')}" placeholder="adı yazın (nağd işdə boş qala bilər)" autocomplete="off"><button class="btn ghost" data-a="contact" style="width:auto;margin:0;padding:0 14px;white-space:nowrap">📇</button></div><input type="hidden" id="f_phone" value="">
      ${nameList('dl_people', db.people.map(p => p.name))}
      <label>Görülən iş</label><input class="field" id="f_note" value="${esc(t ? t.note || '' : '')}" placeholder="məs. iPhone 11 ekran" autocomplete="off">
      ${fAmount(t ? amountInput(t.amount) : '', 'İşin dəyəri')}
      <label>Hissə xərci (istəyə bağlı)</label><input class="field num" id="f_cost" inputmode="decimal" placeholder="0" value="${esc(t ? amountInput(t.cost) : '')}" autocomplete="off">
      <label>Ödəniş</label><div class="seg" data-group="paid"><button class="pay ${paid ? 'on' : ''}" data-a="pick" data-v="paid|1">Ödədi</button><button class="debt ${paid ? '' : 'on'}" data-a="pick" data-v="paid|0">Nisyə</button></div>
      <div data-show="paid|1" class="${paid ? '' : 'hidden'}">${fMethod(mOf(t))}</div>
      <div data-show="paid|0" class="${paid ? 'hidden' : ''}"><label>Ödəniş günü (istəyə bağlı — 3 gün qabaqdan xatırladılır)</label><input class="field" id="f_due" type="date" value="${t && t.due || ''}"></div>
      ${fDate(t)}
      ${saveBtn('saveJob')}${t ? '<button class="btn danger" data-a="delTx">Sil</button>' : ''}`;
    }
    case 'pay': {
      const t = s.id && db.tx.find(x => x.id === s.id), withDebt = db.people.filter(p => C.nisye(db, p.id) > 0);
      const pid = t ? t.pid : s.pid;
      return `<h2>${t ? 'Ödənişi düzəlt' : '💰 Nisyə ödənişi'}</h2>
      <label>Müştəri</label><input class="field" id="f_who" list="dl_people" value="${esc(pid ? pname(pid) : '')}" placeholder="kim ödədi?" autocomplete="off">
      ${nameList('dl_people', withDebt.map(p => p.name).concat(pid ? [pname(pid)] : []))}
      ${pid ? `<div class="note" style="margin-top:6px">Nisyə qalığı: <b>${money(C.nisye(db, pid))}</b></div>` : ''}
      ${fAmount(t ? amountInput(t.amount) : '')}${fMethod(mOf(t))}${fDate(t)}
      ${saveBtn('savePay')}${t ? '<button class="btn danger" data-a="delTx">Sil</button>' : ''}`;
    }
    case 'inc': case 'exp': {
      const t = s.id && db.tx.find(x => x.id === s.id), inc = s.kind === 'inc';
      const cn = t && t.cid ? catName(t.cid) : '';
      return `<h2>${inc ? (t ? 'Gəliri düzəlt' : '➕ Digər gəlir') : (t ? 'Xərci düzəlt' : '🧾 Xərc')}</h2>
      <label>${inc ? 'Nə gəliri?' : 'Nəyə xərclədim?'}</label><input class="field" id="f_note" value="${esc(t ? t.note || '' : '')}" placeholder="${inc ? 'məs. köhnə telefon satdım' : 'məs. çörək, benzin, icarə'}" autocomplete="off">
      ${fAmount(t ? amountInput(t.amount) : '')}
      ${!inc ? `<label>Kateqoriya (istəyə bağlı — yeni ad yazsanız, yaradılır)</label><input class="field" id="f_cat" value="${esc(cn)}" placeholder="məs. Yemək, Yol, İcarə" autocomplete="off"><div class="chips" id="catsug" style="margin-top:8px"></div>` : ''}
      ${fMethod(mOf(t))}${fDate(t)}
      ${saveBtn(inc ? 'saveInc' : 'saveExp')}${t ? '<button class="btn danger" data-a="delTx">Sil</button>' : ''}`;
    }
    case 'rec': { // yeni borc: verdim / aldım; ya da mövcud qeydi düzəltmək
      const lend = s.side === 'lend', list = lend ? db.loans : db.borrow, r = s.id && list.find(x => x.id === s.id);
      const g = s.key && C.parties(db, s.side).find(x => x.key === s.key);
      return `<h2>${r ? 'Borcu düzəlt' : lend ? '🤝 Borc verdim' : '📥 Borc aldım'}</h2>
      <label>${lend ? 'Kimə?' : 'Kimdən?'}</label><input class="field" id="f_who" list="dl_names" value="${esc(r ? r.name : g ? g.name : '')}" autocomplete="off">
      ${nameList('dl_names', list.map(l => l.name))}
      <label>Telefon (istəyə bağlı)</label><div style="display:flex;gap:8px"><input class="field" id="f_phone" type="tel" value="${esc(r ? r.phone || '' : g ? g.phone : '')}" autocomplete="off"><button class="btn ghost" data-a="contact" style="width:auto;margin:0;padding:0 14px;white-space:nowrap">📇</button></div>
      ${fAmount(r ? amountInput(r.amount) : '')}
      ${!lend ? fMethod(r ? r.method || 'nagd' : 'nagd') : ''}
      ${r && !lend && (r.rate || r.months) ? `<div class="note" style="margin-top:6px">Faizlə qaytarılacaq cəmi: ${money(C.borrowCalc(r).total)}</div>` : ''}
      <div class="two"><div><label>Tarix</label><input class="field" id="f_date" type="date" value="${r ? (lend ? r.date : C.borrowDate(r)) : today()}" max="${today()}"></div>
      <div><label>Qaytarma günü</label><input class="field" id="f_due" type="date" value="${r && r.due || ''}"></div></div>
      <div class="note" style="margin-top:6px">Qaytarma günündən 3 gün qabaq hər gün xatırladılır.</div>
      <label>Qeyd</label><input class="field" id="f_note" value="${esc(r ? r.note || '' : '')}" autocomplete="off">
      ${saveBtn('saveRec')}${r ? '<button class="btn danger" data-a="delRec">Sil</button>' : ''}`;
    }
    case 'back': { // qaytarma: verdiyim borc qaytarıldı / aldığım borcu qaytardım
      const lend = s.side === 'lend', open = C.parties(db, s.side).filter(g => g.left > 0), g = s.key && open.find(x => x.key === s.key);
      return `<h2>${lend ? '↩️ Borc qaytarıldı' : '📤 Borcu qaytardım'}</h2>
      ${open.length ? `<label>${lend ? 'Kim qaytardı?' : 'Kimə qaytardım?'}</label><div class="chips" data-group="who">${open.map(x => `<button class="chip ${g && g.key === x.key ? 'on' : ''}" data-a="pickChip" data-v="who|${esc(x.key)}">${esc(x.name)} · ${money(x.left)}</button>`).join('')}</div>
      ${fAmount(g ? amountInput(g.left) : '')}${!lend ? fMethod('nagd') : ''}${fDate()}${saveBtn('saveBack')}` : '<div class="empty">Açıq borc yoxdur</div>'}`;
    }
    case 'person': {
      const p = s.id && person(s.id);
      return `<h2>${p ? 'Müştərini düzəlt' : '👤 Yeni müştəri'}</h2>
      <label>Ad</label><input class="field" id="f_name" value="${esc(p ? p.name : '')}" autocomplete="off">
      <label>Telefon</label><div style="display:flex;gap:8px"><input class="field" id="f_phone" type="tel" value="${esc(p ? p.phone || '' : '')}" autocomplete="off"><button class="btn ghost" data-a="contact" style="width:auto;margin:0;padding:0 14px;white-space:nowrap">📇</button></div>
      ${saveBtn('savePerson')}${p ? '<button class="btn danger" data-a="delPerson">Müştərini sil</button>' : ''}`;
    }
    case 'kassa': {
      const K = C.kassaNow(db);
      return `<h2>💰 Kassa</h2>
      <div class="card">${kv('💵 Cibimdəki pul', money(K.nagd), K.nagd < 0 ? 'neg' : '')}${mods.kart ? kv('💳 Kartdakı pul', money(K.kart), K.kart < 0 ? 'neg' : '') : ''}
        <div class="note">Hər yazdığınız gəlir və xərc buraya özü əlavə olunur / çıxılır.</div></div>
      <label>Cibimdəki pul (indi)</label><input class="field big num" id="f_nagd" inputmode="decimal" value="${amountInput(K.nagd) || (K.set ? '0' : '')}" placeholder="0" autocomplete="off">
      ${mods.kart ? `<label>Kartdakı pul (indi)</label><input class="field big num" id="f_kart" inputmode="decimal" value="${amountInput(K.kart) || (K.set ? '0' : '')}" placeholder="0" autocomplete="off">` : ''}
      ${saveBtn('saveKassa')}`;
    }
    case 'tx': { // nisyə düzəlişi, ziyan və digər köhnə növlər: yalnız baxmaq və silmək
      const t = db.tx.find(x => x.id === s.id);
      return `<h2>${esc(txTitle(t))}</h2><div class="card">${kv('Məbləğ', money(t.amount))}${t.cost ? kv('Hissə', money(t.cost)) : ''}${kv('Tarix', fmtDate(t.date) + (t.time ? ', ' + t.time : ''))}${t.pid ? kv('Müştəri', esc(pname(t.pid))) : ''}${t.note ? kv('Qeyd', esc(t.note)) : ''}</div>
      <button class="btn danger" data-a="delTx">Sil</button>`;
    }
    case 'backrow': { // qaytarmanı düzəltmək: məbləğ, gün, saat; ya da silmək
      const t = db.tx.find(x => x.id === s.id);
      return `<h2>${t.type === 'lback' ? '↩️ Qaytarma' : '📤 Qaytardığım'} — ${esc(t.note)}</h2>
      ${fAmount(amountInput(t.amount))}${t.type === 'brep' ? fMethod(mOf(t)) : ''}
      <div class="two"><div><label>Tarix</label><input class="field" id="f_date" type="date" value="${t.date || today()}" max="${today()}"></div><div><label>Saat</label><input class="field" id="f_time" type="time" value="${esc(backTime(t))}"></div></div>
      ${saveBtn('saveBackRow')}<button class="btn danger" data-a="delBackRow">Sil</button>`;
    }
    case 'summary': return `<h2>🔔 Günün xülasəsi</h2>
      <div class="note">Hər gün seçdiyiniz saatda telefona bildiriş gəlir: bu günün gəliri, xərci, qalığı (əvvəlki günlərdən qalanla), nağd və kart.</div>
      <label>Saat</label><input class="field big num" id="f_stime" type="time" value="${esc(hasNative && Android.summaryTime ? Android.summaryTime() : '')}">
      ${saveBtn('saveSummary')}<button class="btn danger" data-a="offSummary">Söndür</button>`;
    case 'currency': return `<h2>Valyuta</h2><div class="sgroup">${CURRENCIES.map(([c, n]) => `<button class="srow" data-a="setCur" data-v="${c}"><span class="si" style="background:#0E9384">${c}</span><span class="st"><span>${n}</span>${c === cur() ? '<em>✓</em>' : ''}</span></button>`).join('')}</div>`;
  }
  return '';
}

// ---------- PIN ----------
const bioOn = () => hasNative && Android.bioEnabled && Android.bioEnabled() && Android.bioAvailable();
function renderPin() {
  const P = state.pin;
  const title = { unlock: 'PIN kodu daxil edin', verify: 'Hazırkı PIN kodu daxil edin', set1: 'Yeni PIN kod', set2: 'PIN kodu təkrar yazın' }[P.mode];
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => `<button data-a="pinKey" data-v="${k}">${k}</button>`).join('')
    + (P.mode === 'unlock' && bioOn() ? `<button class="ic" data-a="bioAsk">${I.finger}</button>` : '<span></span>')
    + `<button data-a="pinKey" data-v="0">0</button><button class="ic" data-a="pinKey" data-v="del">${I.del}</button>`;
  return `<div class="pinpage"><img class="logo" src="icon.png" alt=""><h1>Hesabat</h1><h2>${title}</h2>
    ${P.mode === 'set1' ? `<div class="seg" style="width:220px;margin:0 auto 6px"><button class="pay ${P.len === 4 ? 'on' : ''}" data-a="pinLen" data-v="4">4 rəqəm</button><button class="pay ${P.len === 6 ? 'on' : ''}" data-a="pinLen" data-v="6">6 rəqəm</button></div>` : ''}
    <div class="dots ${P.err ? 'shake' : ''}" id="pinDots">${Array.from({ length: P.len }, (_, i) => `<i class="${i < P.entered.length ? 'on' : ''}"></i>`).join('')}</div>
    <div class="pinerr" id="pinErr">${esc(P.err || '')}</div><div class="pad">${keys}</div>
    ${P.mode === 'unlock' ? '<button class="pinlink" data-a="pinForgot">PIN-i unutdum</button>' : '<button class="pinlink" data-a="pinCancel">Ləğv et</button>'}</div>`;
}
function pinDone() {
  const P = state.pin, code = P.entered;
  P.entered = ''; P.err = '';
  if (P.mode === 'unlock' || P.mode === 'verify') {
    if (!Android.checkPin(code)) { P.err = 'Səhv PIN kod'; return render(); }
    if (P.mode === 'unlock') { state.pin = null; render(); window.onAppResume(); return; }
    if (P.next === 'remove') { Android.clearPin(); state.pin = null; toast('PIN kod silindi'); return render(); }
    Object.assign(P, { mode: 'set1', len: 4 });
  } else if (P.mode === 'set1') Object.assign(P, { mode: 'set2', first: code });
  else if (code === P.first) { Android.setPin(code); state.pin = null; toast('PIN kod qoyuldu'); }
  else Object.assign(P, { mode: 'set1', first: '', err: 'PIN kodlar eyni deyil, yenidən yazın' });
  render();
}
window.showPinLock = function (askBio) {
  if (!(state.pin && state.pin.mode === 'unlock')) { state.sheet = null; state.pin = { mode: 'unlock', len: Android.pinLength(), entered: '', err: '' }; render(); }
  if (askBio && bioOn()) Android.bioPrompt();
};
window.onBioOk = function () { if (state.pin && state.pin.mode === 'unlock') { state.pin = null; render(); window.onAppResume(); } };
window.onPinReset = function () { state.pin = null; render(); alert('PIN kod silindi. İstəsəniz, Ayarlarda yenisini qoyun.'); };

// ---------- çəkmək ----------
let lastKey = '';
function render() {
  if (state.pin) { app.innerHTML = renderPin(); return; }
  let h = '';
  if (state.tab === 'home') h = renderHome();
  else if (state.tab === 'people') h = renderPeople();
  else if (state.tab === 'debts' && mods.borclar) h = renderDebts();
  else if (state.tab === 'report') h = renderReport();
  else { state.tab = 'home'; h = renderHome(); }
  h += `<nav>
    <button class="${state.tab === 'home' ? 'on' : ''}" data-a="tab" data-v="home">${I.home}Ana</button>
    <button class="${state.tab === 'people' ? 'on' : ''}" data-a="tab" data-v="people">${I.people}Müştərilər</button>
    <button class="navplus" data-a="add"><span>${I.plus}</span></button>
    ${mods.borclar ? `<button class="${state.tab === 'debts' ? 'on' : ''}" data-a="tab" data-v="debts">${I.hand}Borclar</button>` : ''}
    <button class="${state.tab === 'report' ? 'on' : ''}" data-a="tab" data-v="report">${I.report}Hesabat</button></nav>`;
  const pg = topPage();
  if (pg) h += ({ person: renderPerson, party: renderParty, day: renderDay, all: renderAll, settings: renderSettings, trash: renderTrash, privacy: renderPrivacy })[pg.kind](pg) || '';
  const sheetHtml = state.sheet ? renderSheet(state.sheet) : '';
  const key = state.sheet ? JSON.stringify(state.sheet) : '';
  if (state.sheet) h += `<div class="shade" data-a="shade"><div class="sheet">${sheetHtml}</div></div>`;
  app.dataset.sheetAnim = state.sheet && key !== lastKey ? '1' : '';
  lastKey = key;
  const y = window.scrollY, py = (app.querySelector('.page') || {}).scrollTop || 0;
  app.innerHTML = h;
  window.scrollTo(0, y);
  const p2 = app.querySelector('.page'); if (p2 && pg && pg === state.lastPage) p2.scrollTop = py;
  state.lastPage = pg;
  if (pg && pg.kind === 'all') filterAll();
  if (state.sheet && (state.sheet.kind === 'exp')) catSuggest();
}
function openSheet(s) { state.sheet = s; render(); }
function closeSheet() { state.sheet = null; render(); }
function pushPage(p) { state.sheet = null; state.pages.push(p); state.lastPage = null; render(); }

window.onBack = function () {
  if (state.pin) { if (state.pin.mode === 'unlock') return false; state.pin = null; render(); return true; }
  if (state.sheet) { closeSheet(); return true; }
  if (state.pages.length) { state.pages.pop(); render(); return true; }
  if (state.tab !== 'home') { state.tab = 'home'; render(); return true; }
  return false;
};
window.onLaunchTarget = function (t) { if (state.pin) return; state.sheet = null; state.pages = []; state.tab = t === 'people' ? 'people' : 'home'; render(); };
window.onContactPicked = function (name, phone) {
  const n = document.getElementById('f_name') || document.getElementById('f_who'), ph = document.getElementById('f_phone');
  if (ph) ph.value = String(phone || '').trim();
  if (n && !n.value.trim() && String(name || '').trim()) n.value = String(name).trim();
};

// ---------- əməliyyatlar ----------
function findPersonByName(name, create) {
  const k = C.norm(name);
  if (!k) return null;
  let p = db.people.find(x => C.norm(x.name) === k);
  if (!p && create) { p = { id: uid(), name: name.trim(), phone: '', created: Date.now(), u: Date.now() }; db.people.push(p); }
  return p;
}
function trashTx(t) {
  const now = Date.now();
  db.trash.unshift({ id: uid(), kind: 'tx', tx: t, with: [], corr: [], at: now, u: now });
  db.removed[t.id] = now;
  db.tx = db.tx.filter(x => x !== t);
}
function txBase(t) {
  const d = val('f_date') || today(), tm = val('f_time');
  return Object.assign(t, { date: d, time: tm || undefined, u: Date.now() });
}
const actions = {
  noop() {},
  tab(v) { state.tab = v; state.pages = []; state.sheet = null; render(); window.scrollTo(0, 0); },
  back() { state.pages.pop(); render(); },
  shade(v, e) { if (e.target.classList.contains('shade')) closeSheet(); },
  add() { openSheet({ kind: 'add' }); },
  month(v) { const [y, m] = state.month.split('-').map(Number), d = new Date(y, m - 1 + +v, 1); const k = d.getFullYear() + '-' + pad(d.getMonth() + 1); if (k <= today().slice(0, 7)) { state.month = k; render(); } },
  side(v) { state.side = v; render(); },
  openSide(v) { state.side = v; actions.tab('debts'); },
  openSettings() { state.checkResult = null; pushPage({ kind: 'settings' }); },
  openPerson(v) { pushPage({ kind: 'person', id: v }); },
  openParty(v) { pushPage({ kind: 'party', side: state.side, key: v }); },
  openDay(v) { pushPage({ kind: 'day', d: v }); },
  openAll() { state.month = today().slice(0, 7); pushPage({ kind: 'all' }); },
  openTrash() { pushPage({ kind: 'trash' }); },
  openPrivacy() { pushPage({ kind: 'privacy' }); },
  // seçim düymələri: forma yenidən çəkilmir
  pick(v, e, el) {
    const [g] = v.split('|'), box = el.closest('[data-group]');
    box.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
    app.querySelectorAll('[data-show^="' + g + '|"]').forEach(x => x.classList.toggle('hidden', x.dataset.show !== v));
  },
  pickChip(v, e, el) {
    const box = el.closest('[data-group]'), was = el.classList.contains('on');
    box.querySelectorAll('.chip').forEach(b => b.classList.remove('on'));
    if (!was) el.classList.add('on');
    if (box.dataset.group === 'who' && !was) { // seçilən adamın qalığı məbləğə yazılır
      const g = C.parties(db, state.sheet.side).find(x => x.key === v.split('|')[1]);
      const a = document.getElementById('f_amount'); if (g && a) a.value = amountInput(g.left);
    }
  },
  contact() { if (hasNative) Android.pickContact(); else toast('Yalnız telefonda işləyir'); },

  openTx(v) {
    const t = db.tx.find(x => x.id === v);
    if (!t) return;
    if (t.type === 'debt' || (t.type === 'inc' && !t.other)) return openSheet({ kind: 'job', id: v });
    if (t.type === 'pay') return openSheet({ kind: 'pay', id: v });
    if (t.type === 'inc') return openSheet({ kind: 'inc', id: v });
    if (t.type === 'pexp' || t.type === 'exp') return openSheet({ kind: 'exp', id: v });
    if (t.type === 'lend') return openSheet({ kind: 'rec', side: 'lend', id: t.lid });
    if (t.type === 'brw') return openSheet({ kind: 'rec', side: 'borrow', id: t.bid });
    if (t.type === 'lback' || t.type === 'brep') return openSheet({ kind: 'backrow', id: v });
    openSheet({ kind: 'tx', id: v });
  },
  newJob(v) { openSheet({ kind: 'job', pid: v || null }); },
  newPay(v) { openSheet({ kind: 'pay', pid: v || null }); },
  newInc() { openSheet({ kind: 'inc' }); },
  newExp() { openSheet({ kind: 'exp' }); },
  newRec(v) { const [side, key] = v.split('|'); openSheet({ kind: 'rec', side, key: key || null }); },
  newBack(v) { const [side, key] = v.split('|'); openSheet({ kind: 'back', side, key: key || null }); },
  newParty() { openSheet({ kind: 'rec', side: state.side }); },
  newPerson() { openSheet({ kind: 'person' }); },
  editPerson(v) { openSheet({ kind: 'person', id: v }); },

  saveJob() {
    const s = state.sheet, amount = parseAmount(val('f_amount')), cost = parseAmount(val('f_cost')), paid = picked('paid') !== '0';
    const who = val('f_who').trim();
    if (!amount) return toast('İşin dəyərini yazın');
    if (!paid && !who) return toast('Nisyə üçün müştərinin adını yazın');
    const p = findPersonByName(who, true), ph = val('f_phone').trim();
    if (p && ph && !p.phone) { p.phone = ph; p.u = Date.now(); }
    let t = s.id && db.tx.find(x => x.id === s.id);
    if (!t) { t = { id: uid(), created: Date.now() }; db.tx.push(t); }
    Object.assign(t, { type: paid ? 'inc' : 'debt', pid: p ? p.id : null, amount, note: val('f_note').trim() });
    if (cost) t.cost = cost; else delete t.cost;
    if (paid) { t.method = mods.kart ? picked('method') || 'nagd' : t.method || 'nagd'; if (t.method === 'nagd') delete t.bank; delete t.due; delete t.other; }
    else { delete t.method; const due = val('f_due'); if (due) t.due = due; else delete t.due; }
    txBase(t); save(); closeSheet(); toast(paid ? 'Yazıldı: +' + money(amount) : 'Nisyə yazıldı');
  },
  savePay() {
    const s = state.sheet, amount = parseAmount(val('f_amount')), p = findPersonByName(val('f_who'), false);
    if (!p) return toast('Müştərini siyahıdan seçin');
    if (!amount) return toast('Məbləği yazın');
    let t = s.id && db.tx.find(x => x.id === s.id);
    if (!t) { t = { id: uid(), created: Date.now() }; db.tx.push(t); }
    Object.assign(t, { type: 'pay', pid: p.id, amount, method: mods.kart ? picked('method') || 'nagd' : t.method || 'nagd' });
    if (t.method === 'nagd') delete t.bank;
    txBase(t); save(); closeSheet(); toast('Ödəniş yazıldı · qalıq ' + money(C.nisye(db, p.id)));
  },
  saveInc() { actions.saveSimple('inc'); },
  saveExp() { actions.saveSimple('pexp'); },
  saveSimple(type) {
    const s = state.sheet, amount = parseAmount(val('f_amount')), note = val('f_note').trim();
    if (!amount) return toast('Məbləği yazın');
    let t = s.id && db.tx.find(x => x.id === s.id);
    if (!t) { t = { id: uid(), created: Date.now(), type }; db.tx.push(t); }
    Object.assign(t, { amount, note, method: mods.kart ? picked('method') || 'nagd' : t.method || 'nagd' });
    if (t.method === 'nagd') delete t.bank;
    if (t.type === 'inc') t.other = true;
    if (t.type === 'pexp') {
      const cn = val('f_cat').trim().replace(/\s+/g, ' ');
      if (!cn) delete t.cid;
      else {
        let c = db.cats.find(x => C.norm(x.name) === C.norm(cn));
        if (!c) { c = { id: uid(), name: cn, created: Date.now(), u: Date.now() }; db.cats.push(c); }
        t.cid = c.id;
      }
    }
    txBase(t); save(); closeSheet(); toast('Yazıldı');
  },
  delTx() {
    const t = db.tx.find(x => x.id === state.sheet.id);
    if (!t || !confirm('Silinsin? (Zibil qutusundan geri qaytarmaq olar)')) return;
    trashTx(t); save(); closeSheet(); toast('Silindi');
  },
  saveRec() {
    const s = state.sheet, lend = s.side === 'lend', list = lend ? db.loans : db.borrow;
    const name = val('f_who').trim(), amount = parseAmount(val('f_amount'));
    if (!name) return toast(lend ? 'Kimə verdiyinizi yazın' : 'Kimdən aldığınızı yazın');
    if (!amount) return toast('Məbləği yazın');
    let r = s.id && list.find(x => x.id === s.id);
    if (!r) { r = lend ? { id: uid(), back: 0, created: Date.now() } : { id: uid(), pays: [], created: Date.now() }; list.push(r); }
    // eyni adamın başqa qeydləri də eyni adla qalsın
    Object.assign(r, { name, phone: val('f_phone').trim(), amount, note: val('f_note').trim(), u: Date.now() });
    if (lend) { r.date = val('f_date') || today(); if ((r.back || 0) > amount) r.back = amount; }
    else { r.date = val('f_date') || today(); if (r.start) r.start = r.date; r.method = mods.kart ? picked('method') || 'nagd' : r.method || 'nagd'; }
    const due = val('f_due'); if (due) r.due = due; else delete r.due;
    save(); closeSheet(); toast('Yazıldı');
  },
  delRec() {
    const s = state.sheet, lend = s.side === 'lend', r = (lend ? db.loans : db.borrow).find(x => x.id === s.id);
    if (!r || !confirm('Bu borc silinsin? (Zibil qutusundan geri qaytarmaq olar)')) return;
    const now = Date.now();
    db.trash.unshift(lend ? { id: uid(), kind: 'loan', loan: r, at: now, u: now } : { id: uid(), kind: 'borrow', borrow: r, at: now, u: now });
    db.removed[r.id] = now;
    if (lend) db.loans = db.loans.filter(x => x !== r); else db.borrow = db.borrow.filter(x => x !== r);
    save(); closeSheet(); toast('Silindi');
  },
  saveBack() {
    const s = state.sheet, key = picked('who'), amount = parseAmount(val('f_amount'));
    if (!key) return toast('Adamı seçin');
    if (!amount) return toast('Məbləği yazın');
    const g = C.parties(db, s.side).find(x => x.key === key);
    if (amount > g.left && !confirm(`Qalan borc ${money(g.left)}-dır. Yalnız ${money(g.left)} yazılsın?`)) return;
    const d = val('f_date') || today();
    if (d > today()) return toast('Gələcək tarix olmaz');
    const done = C.payBack(db, s.side, key, amount, d, Date.now(), uid, val('f_time') || nowHm(), s.side === 'borrow' && mods.kart ? picked('method') || 'nagd' : 'nagd');
    save(); closeSheet(); toast(money(done) + ' yazıldı');
  },
  saveBackRow() {
    const t = db.tx.find(x => x.id === state.sheet.id);
    if (!t) return closeSheet();
    const amount = parseAmount(val('f_amount')), d = val('f_date') || t.date, tm = val('f_time');
    if (!amount) return toast('Məbləği yazın');
    if (d > today()) return toast('Gələcək tarix olmaz');
    const now = Date.now();
    if (t.type === 'lback') {
      const l = db.loans.find(x => x.id === t.lid);
      if (l) {
        const max = (l.amount || 0) - ((l.back || 0) - t.amount);
        if (amount > max) return toast('Borcdan artıq ola bilməz: ən çoxu ' + money(max));
        l.back = (l.back || 0) - t.amount + amount; l.u = now;
      }
      Object.assign(t, { amount, date: d, time: tm, u: now });
    } else {
      const l = db.borrow.find(x => x.id === t.bid);
      const x = l && (l.pays || []).find(x => 'BP' + (x.id || l.id + x.d + x.amount) === t.id);
      if (!x) return closeSheet();
      const c = C.borrowCalc(l), max = c.left + x.amount;
      if (amount > max) return toast('Borcdan artıq ola bilməz: ən çoxu ' + money(max));
      if (!x.id) { db.removed[t.id] = now; db.tx = db.tx.filter(y => y !== t); x.id = uid(); }
      Object.assign(x, { amount, d, t: tm }); if (mods.kart) x.m = picked('method') || 'nagd'; l.u = now;
    }
    save(); closeSheet(); toast('Düzəldildi');
  },
  delBackRow() {
    const t = db.tx.find(x => x.id === state.sheet.id);
    if (!t || !confirm('Bu qaytarma silinsin?')) return;
    const now = Date.now();
    if (t.type === 'lback') {
      const l = db.loans.find(x => x.id === t.lid);
      if (l) { l.back = Math.max(0, (l.back || 0) - t.amount); l.u = now; }
      db.removed[t.id] = now; db.tx = db.tx.filter(x => x !== t);
    } else {
      const l = db.borrow.find(x => x.id === t.bid);
      if (l) { l.pays = (l.pays || []).filter(x => 'BP' + (x.id || l.id + x.d + x.amount) !== t.id); l.u = now; }
    }
    save(); closeSheet(); toast('Silindi');
  },
  savePerson() {
    const s = state.sheet, name = val('f_name').trim();
    if (!name) return toast('Adı yazın');
    const dup = db.people.find(x => C.norm(x.name) === C.norm(name) && x.id !== s.id);
    if (dup) return toast('Bu adda müştəri artıq var');
    let p = s.id && person(s.id);
    if (!p) { p = { id: uid(), created: Date.now() }; db.people.push(p); }
    Object.assign(p, { name, phone: val('f_phone').trim(), u: Date.now() });
    save(); closeSheet();
  },
  delPerson() {
    const p = person(state.sheet.id);
    if (!p) return;
    const b = C.nisye(db, p.id);
    if (!confirm(b > 0 ? `${p.name}-in ${money(b)} nisyəsi var. Yenə də silinsin? (Zibil qutusundan qaytarmaq olar)` : `${p.name} silinsin?`)) return;
    const now = Date.now(), tx = db.tx.filter(t => t.pid === p.id);
    db.trash.unshift({ id: uid(), kind: 'person', person: p, tx, keptTx: false, corr: [], at: now, u: now });
    db.removed[p.id] = now; tx.forEach(t => { db.removed[t.id] = now; });
    db.people = db.people.filter(x => x !== p); db.tx = db.tx.filter(t => t.pid !== p.id);
    state.sheet = null; state.pages = state.pages.filter(x => !(x.kind === 'person' && x.id === p.id));
    save(); render(); toast('Silindi');
  },
  kassa() { openSheet({ kind: 'kassa' }); },
  saveKassa() {
    const n = parseAmount(val('f_nagd'), true), k2 = mods.kart ? parseAmount(val('f_kart'), true) : null, cur0 = C.kassaNow(db);
    let k = db.kassa.find(x => x.id === 'kassa');
    if (!k) { k = { id: 'kassa' }; db.kassa.push(k); }
    const now = Date.now();
    Object.assign(k, { nagd: n != null ? n : 0, kart: k2 != null ? k2 : cur0.kart, at: now, u: now });
    save(); closeSheet(); toast('Kassa yazıldı');
  },

  // ayarlar
  syncLink() { if (hasNative && Android.syncLink) Android.syncLink(); else toast('Yalnız telefonda işləyir'); },
  syncUnlink() { if (!confirm('Google hesabından ayrılsın? Telefondakı məlumat qalır.')) return; Android.syncUnlink(); sync.account = ''; sync.status = 'idle'; render(); },
  syncNow() { runSync(); },
  checkBackup() { state.checkResult = null; sync.check = true; runSync(); },
  theme() { theme = theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('theme', theme); } catch (e) {} applyTheme(); render(); },
  currency() { openSheet({ kind: 'currency' }); },
  summary() { openSheet({ kind: 'summary' }); },
  saveSummary() { const tm = val('f_stime'); if (!/^\d{1,2}:\d{2}$/.test(tm)) return toast('Saatı seçin'); if (hasNative && Android.setSummaryTime) Android.setSummaryTime(tm); pushNative(); closeSheet(); toast('Hər gün ' + tm + '-da bildiriş gələcək'); },
  offSummary() { if (hasNative && Android.setSummaryTime) Android.setSummaryTime(''); closeSheet(); toast('Söndürüldü'); },
  catPick(v) { const i = document.getElementById('f_cat'); if (i) { i.value = v; catSuggest(); } },
  flt(v, e, el) { el.closest('[data-group]').querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); filterAll(); },
  setCur(v) { db.cur = { v, u: Date.now() }; save(); closeSheet(); },
  mod(v) { mods[v] = !mods[v]; saveMods(); if (!mods.borclar && state.tab === 'debts') state.tab = 'home'; render(); },
  pin() {
    if (!hasNative) return toast('Yalnız telefonda işləyir');
    if (Android.pinSet()) {
      if (confirm('PIN kod silinsin? (Ləğv et — yenisini qoymaq)')) state.pin = { mode: 'verify', next: 'remove', len: Android.pinLength(), entered: '', err: '' };
      else state.pin = { mode: 'verify', next: 'change', len: Android.pinLength(), entered: '', err: '' };
    } else state.pin = { mode: 'set1', len: 4, entered: '', err: '' };
    render();
  },
  bio() { Android.setBio(!Android.bioEnabled()); render(); },
  secure() { Android.setSecure(!Android.secureOn()); render(); },
  restore(v) {
    const e = db.trash.find(x => x.id === v);
    if (!e) return;
    const back = [e];
    if (e.kind === 'tx' && e.tx.pid && !person(e.tx.pid)) {
      const owner = db.trash.find(x => x.kind === 'person' && x.person.id === e.tx.pid);
      if (!owner) return toast('Bu əməliyyatın müştərisi həmişəlik silinib');
      back.push(owner);
    }
    const t = Date.now() + 1;
    for (const b of back) {
      db.removed[b.id] = Date.now();
      if (b.kind === 'person') { db.people.push(Object.assign(b.person, { u: t })); (b.tx || []).forEach(x => db.tx.push(Object.assign(x, { u: t }))); }
      else if (b.kind === 'loan') db.loans.push(Object.assign(b.loan, { u: t }));
      else if (b.kind === 'borrow') db.borrow.push(Object.assign(b.borrow, { u: t }));
      else if (b.kind === 'sub') db.subs.push(Object.assign(b.sub, { u: t }));
      else if (b.kind === 'cat') { db.cats.push(Object.assign(b.cat, { u: t })); (b.tx || []).forEach(x => db.tx.push(Object.assign(x, { u: t }))); }
      else if (b.kind === 'wo') { db.removed[b.txId] = Date.now(); db.tx = db.tx.filter(x => x.id !== b.txId); }
      else { db.tx.push(Object.assign(b.tx, { u: t })); (b.with || []).forEach(x => db.tx.push(Object.assign(x, { u: t }))); }
      (b.corr || []).forEach(cid => { db.removed[cid] = Date.now(); }); db.tx = db.tx.filter(x => !(b.corr || []).includes(x.id));
    }
    db.trash = db.trash.filter(x => !back.includes(x));
    save(); render(); toast('Qaytarıldı');
  },
  // müştərilər, nisyə, gəlir, xərc, kassa və s. silinir; yalnız «Borc verdim / Borc aldım» qalır
  resetAll() {
    if (!confirm('Müştərilər, nisyə, bütün gəlir və xərclər, kassa silinəcək. Yalnız «Borc verdim» və «Borc aldım» qalacaq. Davam edək?')) return;
    if (!confirm('Əminsiniz? Bu geri qaytarılmır (Google-dakı surət də yenilənəcək).')) return;
    const now = Date.now(), keep = t => ['lend', 'lback', 'brw', 'brep'].includes(t.type);
    for (const k of LISTS) {
      if (k === 'loans' || k === 'borrow') continue;
      const list = k === 'tx' ? db.tx.filter(t => !keep(t)) : db[k];
      list.forEach(r => { if (r && r.id) db.removed[r.id] = now; });
      db[k] = k === 'tx' ? db.tx.filter(keep) : [];
    }
    state.pages = []; state.tab = 'home'; state.month = today().slice(0, 7);
    save(); render(); toast('Silindi. Yalnız borclar qaldı');
  },
  emptyTrash() {
    if (!confirm('Zibil qutusu həmişəlik boşaldılsın?')) return;
    const now = Date.now(); db.trash.forEach(x => { db.removed[x.id] = now; }); db.trash = [];
    save(); render();
  },

  // PIN
  pinKey(v) {
    const P = state.pin;
    if (v === 'del') P.entered = P.entered.slice(0, -1); else if (P.entered.length < P.len) P.entered += v;
    P.err = '';
    const dots = document.getElementById('pinDots');
    if (!dots) return render();
    dots.classList.remove('shake');
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i < P.entered.length));
    document.getElementById('pinErr').textContent = '';
    if (P.entered.length === P.len) setTimeout(pinDone, 60);
  },
  pinLen(v) { Object.assign(state.pin, { len: +v, entered: '', err: '' }); render(); },
  pinCancel() { state.pin = null; render(); },
  bioAsk() { Android.bioPrompt(); },
  pinForgot() {
    if (!confirm('PIN-i sıfırlamaq üçün telefonun öz kilidi soruşulacaq. Davam edək?')) return;
    if (!Android.resetPinWithPhone()) alert('Telefonda ekran kilidi qurulmayıb, PIN-i bu yolla sıfırlamaq olmur.');
  }
};
app.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el || !app.contains(el) || el.disabled) return;
  const a = el.dataset.a;
  if (a === 'shade' && e.target !== el) return;
  const f = actions[a];
  if (!f) return;
  e.preventDefault();
  try { if (hasNative && Android.haptic && a !== 'shade') Android.haptic(); } catch (x) {}
  f(el.dataset.v, e, el);
});
// axtarış: siyahı yenidən çəkilmir, yalnız sətirlər gizlənir
const fold = s => C.norm(s).replace(/ə/g, 'e').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u');
app.addEventListener('input', e => {
  if (e.target.id === 'f_cat') return catSuggest();
  if (e.target.id === 'tq') return filterAll();
  if (e.target.id !== 'q') return;
  const q = fold(e.target.value), qd = e.target.value.replace(/\D/g, '');
  app.querySelectorAll('#plist .row').forEach(r => { const n = r.dataset.name || ''; r.classList.toggle('hidden', !!q && !n.includes(q) && !(qd.length > 1 && n.replace(/\D/g, '').includes(qd))); });
});

// ---------- başlanğıc ----------
load();
C.syncLoanTx(db);
C.syncBorrowTx(db);
if (hasNative && Android.syncLinked) sync.account = Android.syncLinked();
if (hasNative && Android.pinSet && Android.pinSet() && Android.isLocked()) {
  state.pin = { mode: 'unlock', len: Android.pinLength(), entered: '', err: '' };
  if (bioOn()) setTimeout(() => Android.bioPrompt(), 300);
}
render();
pushNative();
if (sync.account && !state.pin) setTimeout(runSync, 500);
