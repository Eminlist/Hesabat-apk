'use strict';
// My Finance™ — Kassa və Nisyə Dəftəri
const APP_VERSION = '3.1.3 Rev. 005';
const APP_NAME = 'My Finance™';
const hasNative = typeof window.Android !== 'undefined';
const C = window.MF;
const pad = C.pad;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const nowHm = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun', 'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];
const WDAYS = ['Bazar', 'Bazar ertəsi', 'Çərşənbə axşamı', 'Çərşənbə', 'Cümə axşamı', 'Cümə', 'Şənbə'];
const fmtDate = d => { if (!d) return ''; const [y, m, dd] = d.split('-'); return +dd + ' ' + MONTHS[+m - 1] + ' ' + y; };
const fmtShort = d => { if (!d) return ''; const [, m, dd] = d.split('-'); return dd + '.' + m; };
const fmtDay = d => { const x = new Date(d + 'T12:00:00'); return WDAYS[x.getDay()] + ', ' + x.getDate() + ' ' + MONTHS[x.getMonth()]; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = n => String(n || '').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
const fold = s => C.norm(s).replace(/ə/g, 'e').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ı/g, 'i');
function money(q) {
  const neg = q < 0; q = Math.abs(Math.round(q || 0));
  const m = Math.floor(q / 100), c = q % 100;
  return (neg ? '−' : '') + String(m).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + pad(c) + ' ₼';
}
const amountInput = q => q ? String(q / 100).replace('.', ',') : '';
const waNum = phone => { let n = String(phone || '').replace(/\D/g, ''); if (n.startsWith('00')) n = n.slice(2); else if (n.startsWith('0')) n = '994' + n.slice(1); else if (n.length === 9) n = '994' + n; return n; };
function toast(m) { if (hasNative) Android.toast(m); else console.log(m); }
const openUrl = url => { window.location.href = url; };

// ---------- məlumatlar (telefonun yaddaşında, oflayn) ----------
const DEFAULT_TAGS = ['Daimi', 'Qonşu', 'Topdan', 'Riskli'];
const LISTS = ['customers', 'ops', 'recs', 'trash'];
let db = { mf: 1, customers: [], ops: [], recs: [], trash: [], removed: {}, cfg: { u: 0, shop: { name: '', address: '', phone: '', logo: '' }, req: '', tags: DEFAULT_TAGS.slice() } };
function fixDb() {
  for (const k of LISTS) if (!Array.isArray(db[k])) db[k] = [];
  if (!db.removed || typeof db.removed !== 'object') db.removed = {};
  db.cfg = Object.assign({ u: 0, req: '', tags: DEFAULT_TAGS.slice() }, db.cfg || {});
  db.cfg.shop = Object.assign({ name: '', address: '', phone: '', logo: '' }, db.cfg.shop || {});
  if (!Array.isArray(db.cfg.tags)) db.cfg.tags = DEFAULT_TAGS.slice();
  db.mf = 1;
}
function load() {
  let raw = '';
  try { raw = hasNative ? Android.load() : (localStorage.getItem('myFinance') || ''); } catch (e) {}
  if (raw) {
    try {
      const d = JSON.parse(raw);
      if (d && d.mf) db = d;
      else if (hasNative && Android.archiveOld) Android.archiveOld(); // köhnə Hesabatın faylı ayrıca saxlanılır
    } catch (e) { alert('Məlumat oxunmadı: ' + e.message); }
  }
  fixDb();
  purgeTrash();
}
function save() {
  const json = JSON.stringify(db);
  let ok = true;
  try { ok = hasNative ? Android.save(json) : (localStorage.setItem('myFinance', json), true); } catch (e) { ok = false; }
  if (!ok) toast('Yadda saxlanmadı!');
  markDirty();
  pushNative();
  scheduleSync();
}
const touch = r => { r.u = Date.now(); return r; };
const cust = id => db.customers.find(c => c.id === id);
const cname = id => (cust(id) || {}).name || '';
const cstate = id => C.custState(db, id, today());

// ---------- zibil qutusu: 30 gün ----------
const TRASH_DAYS = 30;
function purgeTrash() {
  const lim = Date.now() - TRASH_DAYS * 86400000;
  const old = db.trash.filter(e => e.at < lim);
  if (!old.length) return;
  for (const e of old) db.removed[e.id] = Date.now();
  db.trash = db.trash.filter(e => e.at >= lim);
}
function trashOp(o) {
  db.ops = db.ops.filter(x => x.id !== o.id);
  db.removed[o.id] = Date.now();
  db.trash.unshift(touch({ id: uid(), at: Date.now(), kind: 'op', op: o }));
}
function trashCustomer(c) {
  const ops = db.ops.filter(o => o.cid === c.id);
  db.ops = db.ops.filter(o => o.cid !== c.id);
  db.customers = db.customers.filter(x => x.id !== c.id);
  const t = Date.now();
  db.removed[c.id] = t;
  for (const o of ops) db.removed[o.id] = t;
  db.trash.unshift(touch({ id: uid(), at: t, kind: 'cust', cust: c, ops }));
}

// ---------- Google ilə sinxron (hər dəyişiklik dərhal göndərilir) ----------
const sync = { account: '', status: 'idle', msg: '', last: 0, running: false, again: false, timer: null, dirty: false, ver: 0, sent: -1, retry: null, wait: 0 };
try { sync.last = +localStorage.getItem('mfLastSync') || 0; sync.dirty = localStorage.getItem('mfSyncDirty') === '1'; } catch (e) {}
function markDirty() {
  sync.ver++;
  if (!sync.dirty) { sync.dirty = true; try { localStorage.setItem('mfSyncDirty', '1'); } catch (e) {} }
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
  out.cfg = (b.cfg && (!a.cfg || (b.cfg.u || 0) > (a.cfg.u || 0))) ? b.cfg : a.cfg;
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
window.onSyncRemote = function (text) {
  let remote = null;
  if (text) { try { remote = JSON.parse(text); } catch (e) { remote = null; } }
  if (remote && remote.mf) {
    const before = JSON.stringify(db);
    db = mergeDb(db, remote); fixDb();
    if (JSON.stringify(db) !== before) {
      try { if (hasNative) Android.save(JSON.stringify(db)); } catch (e) {}
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
    try { localStorage.setItem('mfLastSync', sync.last); localStorage.setItem('mfSyncDirty', sync.dirty ? '1' : '0'); } catch (e) {}
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
  purgeTrash();
  pushNative();
  if (openedDay !== today()) { openedDay = today(); state.kday = today(); render(); }
  if (!sync.account && hasNative && Android.syncLinked) { sync.account = Android.syncLinked(); if (sync.account) { render(); return runSync(); } }
  if (sync.account && (sync.dirty || Date.now() - sync.last > 60000)) runSync();
};
function refreshSettings() { if (topPage() && topPage().kind === 'settings' && !state.sheet && !state.confirm) render(); }

// ---------- telefona: bildirişlər, vidcet, günün sonu ----------
function pushNative() {
  if (!hasNative) return;
  const td = today(), f = C.flow(db, td, td), B = C.balances(db, td);
  try {
    if (Android.setWidget) Android.setWidget(td, 'Bu günkü gəlir', money(f.income), money(0));
    if (Android.updateShortcuts) Android.updateShortcuts('Bu gün gəlir: ' + money(f.income), 'Bu gün xərc: ' + money(f.expense), '');
    if (Android.setSummary) Android.setSummary(td, 'Günün sonu: kassanı yekunlaşdırın',
      'Gəlir: ' + money(f.income) + ' · Xərc: ' + money(f.expense) + ' · Kassada nağd: ' + money(B.cash) + ' · Kartda: ' + money(B.card) + (f.nisye ? ' · Yeni nisyə: ' + money(f.nisye) : ''),
      'Bu gün heç nə yazılmayıb · Kassada nağd: ' + money(B.cash) + ' · Kartda: ' + money(B.card));
    if (Android.setDueList) {
      const items = [];
      for (const c of db.customers) {
        const s = C.custState(db, c.id, td);
        if (s.debt > 0 && s.due) items.push({ d: s.due, line: c.name + ' — nisyə ' + money(s.debt) + ' · ödəmə günü ' + fmtDate(s.due) });
      }
      for (const r of db.recs) {
        for (const m of [td.slice(0, 7), C.addMonths(td.slice(0, 7) + '-01', 1).slice(0, 7)]) {
          if (C.recPaid(db, r, m)) continue;
          const d = C.recDate(r, m);
          items.push({ d, u: C.addDays(C.addMonths(m + '-01', 1), -1), line: r.name + ' — ' + money(r.amount) + ' · ödəmə günü ' + fmtDate(d) });
        }
      }
      items.sort((a, b) => a.d.localeCompare(b.d));
      Android.setDueList(JSON.stringify({ title: APP_NAME + ': ödəmə xatırlatması', more: '{0} ödəmə xatırlatması', items }));
    }
  } catch (e) {}
}

// ---------- tema ----------
let theme = 'light';
try { theme = localStorage.getItem('mfTheme') || 'light'; } catch (e) {}
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  if (hasNative && Android.setDarkBars) Android.setDarkBars(theme === 'dark');
}
applyTheme();

// ---------- vəziyyət ----------
const state = { tab: 'home', pages: [], sheet: null, confirm: null, pin: null, kday: today(), seg: 'active', tag: '', sent: {} };
const topPage = () => state.pages[state.pages.length - 1];
const app = document.getElementById('app');

const I = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  kassa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12.5" r="2.6"/><path d="M6 6V4h12v2"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><path d="M18 9l-6 6M12 9l6 6"/></svg>',
  finger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 11v4M8 12a4 4 0 0 1 8 0v3M5 13a7 7 0 0 1 14 0M9 18a3 3 0 0 0 6 0"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>'
};

// ---------- köməkçilər ----------
const KIND = {
  in: { t: 'Gəlir', ic: '⬇', bg: 'var(--pay-soft)', col: 'var(--pay)', sign: '+' },
  out: { t: 'Xərc', ic: '⬆', bg: 'var(--exp-soft)', col: 'var(--exp)', sign: '−' },
  nisye: { t: 'Nisyə', ic: '📝', bg: 'var(--debt-soft)', col: 'var(--debt)', sign: '' },
  pay: { t: 'Nisyədən ödəniş', ic: '💵', bg: 'var(--pay-soft)', col: 'var(--pay)', sign: '+' }
};
const methodTxt = o => o.kind === 'nisye' ? '' : (o.method === 'card' ? '💳 Kart' : '💵 Nağd');
const sortDesc = list => list.slice().sort((a, b) => C.byWhen(b, a));
function opTitle(o) {
  if (o.kind === 'nisye' || o.kind === 'pay') return KIND[o.kind].t + ' · ' + (cname(o.cid) || '—');
  if (o.kind === 'out' && o.rec) return (db.recs.find(r => r.id === o.rec) || {}).name || o.note || 'Sabit xərc';
  return o.note || KIND[o.kind].t;
}
function opRow(o, showDate) {
  const k = KIND[o.kind];
  const sub = [showDate ? fmtDate(o.date) : '', o.time, methodTxt(o), (o.kind === 'nisye' || o.kind === 'pay' || (o.kind === 'out' && o.rec)) && o.note ? o.note : '', o.kind === 'out' && o.rec ? 'sabit xərc' : ''].filter(Boolean).join(' · ');
  const cls = o.kind === 'out' ? 'exp' : o.kind === 'nisye' ? 'debt' : 'pay';
  return `<button class="row" data-a="editOp" data-v="${o.id}" data-s="${esc(fold([opTitle(o), o.note, sub, money(o.amount), String(o.amount / 100).replace('.', ','), o.date].join(' ')))}" data-k="${o.kind}" data-m="${o.kind === 'nisye' ? '' : (o.method || 'cash')}">
    <span class="ic" style="background:${k.bg};color:${k.col};font-size:19px">${k.ic}</span>
    <div class="grow"><div class="t">${esc(opTitle(o))}</div><div class="s">${esc(sub)}</div></div>
    <div class="amt num ${cls}">${k.sign}${money(o.amount)}</div></button>`;
}
const kv = (l, v, cls) => `<div class="kv"><span>${l}</span><b class="num ${cls || ''}">${v}</b></div>`;
function pageHead(title, extra) {
  return `<header><button data-a="back">${I.back}</button><h1>${esc(title)}</h1>${extra || ''}</header>`;
}
const AGE = ['', 'age1', 'age2', 'age3'];
const AGE_TXT = s => s.ageDays ? s.ageDays + ' gündür açıqdır' : '';
function lateTxt(s) {
  if (!(s.debt > 0) || !s.due) return '';
  if (s.overdue) return s.overdue + ' gün gecikir';
  if (s.dueToday) return 'bu gün ödəmə günü';
  return '';
}

// ---------- ANA EKRAN ----------
function dueCustomers() {
  const td = today();
  return db.customers.map(c => ({ c, s: C.custState(db, c.id, td) })).filter(x => x.s.isDue).sort((a, b) => b.s.overdue - a.s.overdue || b.s.debt - a.s.debt);
}
function renderHome() {
  const td = today(), f = C.flow(db, td, td), B = C.balances(db, td), O = C.outstanding(db, td);
  const due = dueCustomers();
  const recs = C.recStatus(db, td).filter(x => !x.paid && x.days <= 3);
  const ops = sortDesc(db.ops.filter(o => o.date === td));
  return `<div class="topbar"><div style="flex:1;min-width:0"><span class="sub">${esc(fmtDay(td))}</span><h1>${esc(APP_NAME)}</h1></div>
    <button class="tbtn" data-a="settings">${I.gear}</button></div>
  <main style="padding-top:6px">
    ${due.length ? `<div class="duebox"><div class="duehead"><b>⏰ Ödəmə vaxtı çatanlar (${due.length})</b><button data-a="tab" data-v="remind">Xatırlat ›</button></div>
      ${due.slice(0, 5).map(({ c, s }) => `<button class="duerow" data-a="openCust" data-v="${c.id}"><span class="grow"><b>${esc(c.name)}</b><small>${esc(lateTxt(s))}</small></span><em class="num">${money(s.debt)}</em></button>`).join('')}
      ${due.length > 5 ? `<button class="duemore" data-a="tab" data-v="remind">və daha ${due.length - 5} nəfər ›</button>` : ''}</div>` : ''}
    ${recs.map(x => `<div class="odban soon"><span style="flex:1">📌 ${esc(x.r.name)} — ${money(x.r.amount)} · ${x.days < 0 ? Math.abs(x.days) + ' gün keçib' : x.days === 0 ? 'bu gün' : x.days + ' gün qalıb'}</span><button class="mini" data-a="recPay" data-v="${x.r.id}">Ödədim</button></div>`).join('')}
    <div class="hero" style="margin:0 0 12px">
      <div class="hbal"><small>Kassada cəmi pul</small><b class="num ${B.total < 0 ? 'neg-hero' : ''}">${money(B.total)}</b></div>
      <div class="hsplit">
        <div class="hio"><i>💵</i><div style="min-width:0"><small>Kassada nağd</small><b class="num">${money(B.cash)}</b></div></div>
        <div class="sep"></div>
        <div class="hio"><i>💳</i><div style="min-width:0"><small>Kartda</small><b class="num">${money(B.card)}</b></div></div>
      </div>
    </div>
    <div class="hm-card"><div class="hm-title"><span>Bu gün</span><span class="hm-link" data-a="tab" data-v="kassa">Kassa ›</span></div>
      <div class="hm-3"><div><small>Gəlir</small><b class="num pay">${money(f.income)}</b></div><div><small>Xərc</small><b class="num exp">${money(f.expense)}</b></div><div><small>Nisyə</small><b class="num debt">${money(f.nisye)}</b></div></div></div>
    <button class="outcard" data-a="tab" data-v="people"><span class="ic" style="background:var(--debt-soft);color:var(--debt);font-size:22px">🤝</span>
      <span class="grow"><small>Çöldə olan pul (aktiv nisyə)</small><b class="num">${money(O.total)}</b><span class="s">${O.count ? O.count + ' müştəridə' : 'Heç kimdə borc yoxdur'}</span></span><span class="chev">›</span></button>
    <div class="sec"><b>Bu günün əməliyyatları</b>${ops.length ? '<button data-a="tab" data-v="kassa">Hamısı</button>' : ''}</div>
    ${ops.length ? `<div class="list">${ops.slice(0, 8).map(o => opRow(o)).join('')}</div>` : '<div class="empty">Bu gün hələ heç nə yazılmayıb.<br>Aşağıdakı «+» ilə əlavə edin.</div>'}
  </main>`;
}

// ---------- MÜŞTƏRİLƏR ----------
function renderCustomers() {
  const td = today();
  const all = db.customers.map(c => ({ c, s: C.custState(db, c.id, td) }));
  const closed = all.filter(x => x.s.bal === 0 && x.s.hasHistory);
  const active = all.filter(x => !(x.s.bal === 0 && x.s.hasHistory));
  let list = state.seg === 'closed' ? closed : active;
  if (state.tag) list = list.filter(x => (x.c.tags || []).includes(state.tag));
  list.sort((a, b) => (b.s.isDue - a.s.isDue) || (b.s.overdue - a.s.overdue) || (b.s.debt - a.s.debt) || a.c.name.localeCompare(b.c.name, 'az'));
  const O = C.outstanding(db, td);
  return `<div class="topbar"><div style="flex:1;min-width:0"><span class="sub">Nisyə dəftəri</span><h1>Müştərilər</h1></div>
    <button class="tbtn" data-a="newCust">${I.plus}</button></div>
  <main style="padding-top:6px">
    <div class="hm-card" style="display:flex;justify-content:space-between;align-items:center"><span class="note" style="font-weight:700">Çöldə olan pul</span><b class="num debt" style="font-size:20px">${money(O.total)}</b></div>
    <input class="search" id="q" placeholder="🔍 Ad, nömrə, məbləğ və ya qeyd…" autocomplete="off">
    <div class="seg" style="margin-bottom:10px"><button class="${state.seg === 'active' ? 'on' : ''}" data-a="seg" data-v="active">Aktiv (${active.length})</button><button class="${state.seg === 'closed' ? 'on' : ''}" data-a="seg" data-v="closed">Bağlanmışlar (${closed.length})</button></div>
    <div class="chips" style="margin:0 0 12px"><button class="chip ${!state.tag ? 'on' : ''}" data-a="tagF" data-v="">Hamısı</button>${db.cfg.tags.map(t => `<button class="chip ${state.tag === t ? 'on' : ''}" data-a="tagF" data-v="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    ${list.length ? `<div class="list" id="plist">${list.map(({ c, s }) => custRow(c, s)).join('')}</div><div class="empty hidden" id="qempty">Heç nə tapılmadı</div>`
      : `<div class="empty">${state.seg === 'closed' ? 'Borcu bağlanmış müştəri yoxdur' : 'Hələ müştəri yoxdur.<br>«+» ilə nisyə yazın və ya yeni müştəri əlavə edin.'}</div>`}
  </main>`;
}
function custRow(c, s) {
  const notes = db.ops.filter(o => o.cid === c.id).map(o => (o.note || '') + ' ' + money(o.amount) + ' ' + String(o.amount / 100).replace('.', ',')).join(' ');
  const late = lateTxt(s);
  const sub = [c.phone, (c.tags || []).join(', ')].filter(Boolean).join(' · ');
  const right = s.debt > 0 ? `<div class="amt num debt">${money(s.debt)}${s.ageDays >= 30 ? `<small class="${AGE[s.age]}t">${s.ageDays} gün</small>` : ''}</div>`
    : s.advance > 0 ? `<div class="amt num pay">+${money(s.advance)}<small>avans</small></div>` : `<div class="amt num zero">0,00 ₼</div>`;
  return `<button class="row ${AGE[s.age]}" data-a="openCust" data-v="${c.id}" data-s="${esc(fold(c.name + ' ' + (c.phone || '') + ' ' + (c.phone || '').replace(/\D/g, '') + ' ' + (c.tags || []).join(' ') + ' ' + notes + ' ' + money(s.debt)))}">
    <span class="avatar">${esc(initials(c.name))}</span>
    <div class="grow"><div class="t">${esc(c.name)}</div>${late ? `<div class="s late">🔴 ${esc(late)}</div>` : ''}${sub ? `<div class="s">${esc(sub)}</div>` : ''}</div>${right}</button>`;
}
function renderCustomer(pg) {
  const c = cust(pg.id);
  if (!c) { state.pages.pop(); return ''; }
  const s = cstate(c.id), h = C.history(db, c.id);
  const late = lateTxt(s);
  const dueN = s.open.find(x => x.n.due === s.due);
  const ext = dueN && dueN.n.ext && dueN.n.ext.length ? dueN.n.ext : null;
  return `<div class="page">${pageHead(c.name, `<button data-a="editCust" data-v="${c.id}">${I.edit}</button>`)}
  <main style="padding-top:6px;padding-bottom:40px">
    <div class="hero" style="margin:0 0 12px">
      <div class="hbal"><small>${s.advance > 0 ? 'Avans (artıq ödəniş)' : 'Qalıq borc'}</small><b class="num">${s.advance > 0 ? '+' + money(s.advance) : money(s.debt)}</b></div>
      <div class="hsplit"><div class="hio"><div style="min-width:0"><small>Cəmi nisyə</small><b class="num">${money(s.given)}</b></div></div><div class="sep"></div><div class="hio"><div style="min-width:0"><small>Ödənilib</small><b class="num">${money(s.paid)}</b></div></div></div>
    </div>
    ${c.phone || (c.tags || []).length ? `<div class="note" style="margin:0 4px 8px">${c.phone ? '📞 ' + esc(c.phone) : ''}${(c.tags || []).map(t => ` <span class="badge tagb">${esc(t)}</span>`).join('')}</div>` : ''}
    ${late ? `<div class="odban"><span>🔴 ${esc(late)} · ödəmə günü ${fmtDate(s.due)}</span></div>` : s.debt > 0 && s.due ? `<div class="odban soon" style="background:var(--brand-soft);color:var(--brand)"><span>📅 Ödəmə günü: ${fmtDate(s.due)}</span></div>` : ''}
    ${ext ? `<div class="extnote">↻ ${ext.length} dəfə uzadılıb · köhnə: ${fmtShort(ext[ext.length - 1].old)}${ext[ext.length - 1].note ? ' · ' + esc(ext[ext.length - 1].note) : ''}</div>` : ''}
    ${s.debt > 0 && s.ageDays ? `<div class="agebar ${AGE[s.age]}b">⏳ Borc ${s.ageDays} gündür açıqdır</div>` : ''}
    <div class="acts">
      <button data-a="call" data-v="${c.id}"><span style="background:#E8F1FF;color:#2563EB">${I.phone}</span>Zəng</button>
      <button data-a="msg" data-v="${c.id}"><span style="background:#E7F8EE;color:#16A34A">${I.wa}</span>WhatsApp</button>
      <button data-a="payFor" data-v="${c.id}"><span style="background:var(--pay-soft);color:var(--pay)">💵</span>Ödəniş al</button>
      <button data-a="nisyeFor" data-v="${c.id}"><span style="background:var(--debt-soft);color:var(--debt)">📝</span>Nisyə yaz</button>
      <button data-a="extend" data-v="${c.id}"><span style="background:var(--amber-soft);color:var(--amber)">📅</span>Tarixi uzat</button>
      <button data-a="stmt" data-v="${c.id}"><span style="background:#F1ECFE;color:#7C3AED">📄</span>Çıxarış</button>
    </div>
    ${s.debt > 0 ? `<button class="btn payb" data-a="closeDebt" data-v="${c.id}">✅ Borcu tam bağla (${money(s.debt)})</button>` : ''}
    <div class="sec"><b>Tarixçə</b><span class="note">${h.length} əməliyyat</span></div>
    ${h.length ? `<div class="list">${h.map(({ o, bal }) => histRow(o, bal)).join('')}</div>` : '<div class="empty">Hələ nisyə və ödəniş yoxdur</div>'}
    <button class="btn danger" style="margin-top:18px" data-a="delCust" data-v="${c.id}">Müştərini sil</button>
  </main></div>`;
}
function histRow(o, bal) {
  const n = o.kind === 'nisye';
  const ext = n && o.ext && o.ext.length ? `↻ ${o.ext.length} dəfə uzadılıb · köhnə: ${fmtShort(o.ext[o.ext.length - 1].old)}` : '';
  const sub = [fmtDate(o.date) + (o.time ? ', ' + o.time : ''), n ? (o.due ? 'ödəmə: ' + fmtShort(o.due) : '') : methodTxt(o)].filter(Boolean).join(' · ');
  return `<button class="row" data-a="editOp" data-v="${o.id}">
    <span class="ic" style="background:${KIND[o.kind].bg};color:${KIND[o.kind].col};font-size:19px">${KIND[o.kind].ic}</span>
    <div class="grow"><div class="t">${n ? 'Nisyə' : 'Ödəniş'}${o.note ? ' — ' + esc(o.note) : ''}</div><div class="s">${esc(sub)}</div>${ext ? `<div class="s extsm">${esc(ext)}</div>` : ''}</div>
    <div class="amt num ${n ? 'debt' : 'pay'}">${n ? '+' : '−'}${money(o.amount)}<small>qalıq: ${bal < 0 ? '+' + money(-bal) + ' avans' : money(bal)}</small></div></button>`;
}

// ---------- KASSA ----------
function renderKassa() {
  const d = state.kday, f = C.flow(db, d, d), B = C.balances(db, d), td = today();
  const ops = sortDesc(db.ops.filter(o => o.date === d));
  return `<div class="topbar"><div style="flex:1;min-width:0"><span class="sub">Gündəlik gəlir və xərc</span><h1>Kassa</h1></div>
    <button class="tbtn" data-a="openAll" title="Axtarış">🔍</button></div>
  <main style="padding-top:6px">
    <div class="monthbar"><button class="iconbtn" data-a="kday" data-v="-1">‹</button>
      <label style="margin:0;position:relative"><b>${d === td ? 'Bu gün · ' : ''}${fmtDate(d)}</b><input type="date" id="kdate" value="${d}" max="${td}" style="position:absolute;inset:0;opacity:0"></label>
      <button class="iconbtn" data-a="kday" data-v="1" ${d >= td ? 'disabled style="opacity:.35"' : ''}>›</button></div>
    <div class="hero" style="margin:0 0 12px">
      <div class="hbal" style="padding-bottom:10px"><small>Günün sonuna kassa</small><b class="num ${B.total < 0 ? 'neg-hero' : ''}" style="font-size:32px">${money(B.total)}</b></div>
      <div class="hsplit"><div class="hio"><i>💵</i><div style="min-width:0"><small>Nağd</small><b class="num">${money(B.cash)}</b></div></div><div class="sep"></div><div class="hio"><i>💳</i><div style="min-width:0"><small>Kart</small><b class="num">${money(B.card)}</b></div></div></div>
    </div>
    <div class="card">
      <div class="ktab"><span></span><b>💵 Nağd</b><b>💳 Kart</b></div>
      <div class="ktab"><span>Gəlir</span><b class="num pay">${money(f.inCash)}</b><b class="num pay">${money(f.inCard)}</b></div>
      <div class="ktab"><span>Xərc</span><b class="num exp">${money(f.outCash)}</b><b class="num exp">${money(f.outCard)}</b></div>
      ${kv('Günün gəliri', money(f.income), 'pay')}${f.payIn ? kv('&nbsp;&nbsp;o cümlədən nisyədən ödəniş', money(f.payIn), 'pay') : ''}${kv('Günün xərci', money(f.expense), 'exp')}
      ${kv('Günün nəticəsi', money(f.net), f.net < 0 ? 'neg' : 'pay')}${f.nisye ? kv('Verilən nisyə (kassaya yazılmır)', money(f.nisye), 'debt') : ''}
    </div>
    <div class="two"><button class="btn payb" data-a="add" data-v="in">+ Gəlir</button><button class="btn expb" data-a="add" data-v="out">− Xərc</button></div>
    <div class="sec"><b>Əməliyyatlar</b><span class="note">${ops.length}</span></div>
    ${ops.length ? `<div class="list">${ops.map(o => opRow(o)).join('')}</div>` : '<div class="empty">Bu gün üçün heç nə yazılmayıb</div>'}
  </main>`;
}
function renderAll(pg) {
  const ops = sortDesc(db.ops);
  let lastD = '', h = '';
  for (const o of ops) {
    if (o.date !== lastD) { if (lastD) h += '</div>'; h += `<div class="dgrp" data-d="${o.date}"><div class="dayhead"><b>${fmtDate(o.date)}</b></div><div class="list">`; lastD = o.date; }
    h += opRow(o);
  }
  if (lastD) h += '</div></div>';
  const chip = (g, v, l) => `<button class="chip ${pg[g] === v ? 'on' : ''}" data-a="allF" data-v="${g}|${v}">${l}</button>`;
  return `<div class="page">${pageHead('Bütün əməliyyatlar')}
  <main style="padding-top:6px;padding-bottom:40px">
    <input class="search" id="tq" placeholder="🔍 Ad, məbləğ, qeyd və ya tarix…" autocomplete="off" value="${esc(pg.q || '')}">
    <div class="chips" style="margin:0 0 6px">${chip('k', '', 'Hamısı')}${chip('k', 'in', 'Gəlir')}${chip('k', 'out', 'Xərc')}${chip('k', 'nisye', 'Nisyə')}${chip('k', 'pay', 'Ödəniş')}</div>
    <div class="chips" style="margin:0 0 10px">${chip('m', '', 'Hər üsul')}${chip('m', 'cash', '💵 Nağd')}${chip('m', 'card', '💳 Kart')}</div>
    <div id="alllist">${h || '<div class="empty">Hələ əməliyyat yoxdur</div>'}</div><div class="empty hidden" id="aempty">Heç nə tapılmadı</div>
  </main></div>`;
}
function filterAll() {
  const pg = topPage(); if (!pg || pg.kind !== 'all') return;
  const q = fold(pg.q || ''), qd = String(pg.q || '').replace(/[^\d]/g, '');
  let any = false;
  app.querySelectorAll('#alllist .row').forEach(r => {
    const ok = (!pg.k || r.dataset.k === pg.k) && (!pg.m || r.dataset.m === pg.m) && (!q || r.dataset.s.includes(q) || (qd.length > 1 && r.dataset.s.replace(/\D/g, '').includes(qd)));
    r.classList.toggle('hidden', !ok); if (ok) any = true;
  });
  app.querySelectorAll('#alllist .dgrp').forEach(g => g.classList.toggle('hidden', !g.querySelector('.row:not(.hidden)')));
  const e = document.getElementById('aempty'); if (e) e.classList.toggle('hidden', any || !db.ops.length);
}
function filterCust(v) {
  const q = fold(v), qd = String(v).replace(/\D/g, '');
  let any = false;
  app.querySelectorAll('#plist .row').forEach(r => { const s = r.dataset.s || ''; const ok = !q || s.includes(q) || (qd.length > 1 && s.replace(/\D/g, '').includes(qd)); r.classList.toggle('hidden', !ok); if (ok) any = true; });
  const e = document.getElementById('qempty'); if (e) e.classList.toggle('hidden', any);
}

// ---------- XATIRLAT: bu gün ödəyəcəklər ----------
const TONES = ['', 'Yumşaq xatırlatma', 'Rəsmi bildiriş', 'Son xəbərdarlıq'];
function renderRemind() {
  const due = dueCustomers();
  const sentN = due.filter(x => state.sent[x.c.id]).length;
  return `<div class="topbar"><div style="flex:1;min-width:0"><span class="sub">Toplu borc xatırlatması</span><h1>Xatırlat</h1></div></div>
  <main style="padding-top:6px">
    ${due.length ? `<div class="hm-card" style="display:flex;justify-content:space-between;align-items:center"><span class="note" style="font-weight:700">Ödəmə vaxtı çatıb: ${due.length} nəfər</span><b class="num ${sentN === due.length ? 'pay' : ''}">${sentN}/${due.length} göndərilib</b></div>
      <div class="list">${due.map(({ c, s }) => {
        const tone = C.toneFor(s.overdue), sent = state.sent[c.id];
        return `<div class="row ${AGE[s.age]}"><button class="grow" style="text-align:left" data-a="openCust" data-v="${c.id}"><div class="t">${esc(c.name)} · <span class="num debt">${money(s.debt)}</span></div>
          <div class="s late">🔴 ${esc(lateTxt(s))}</div><div class="s">${esc(TONES[tone])}${c.phone ? '' : ' · nömrə yoxdur'}</div></button>
          ${c.phone ? `<button class="rbtn" data-a="call" data-v="${c.id}" style="background:#E8F1FF;color:#2563EB">${I.phone}</button>` : ''}
          <button class="rbtn ${sent ? 'sent' : ''}" data-a="quickWa" data-v="${c.id}" style="background:${sent ? 'var(--line2)' : '#16A34A'};color:${sent ? 'var(--pay)' : '#fff'}">${sent ? '✓' : I.wa}</button></div>`;
      }).join('')}</div>
      <div class="note" style="margin:10px 4px">Yaşıl düyməyə bir-bir basın: hər müştəriyə gecikməsinə uyğun hazır mesaj WhatsApp-da açılır. Göndərilənlər ✓ ilə işarələnir.</div>`
      : '<div class="empty">🎉 Bu gün ödəmə vaxtı çatan müştəri yoxdur</div>'}
  </main>`;
}

// ---------- WhatsApp mesajı ----------
function waMessage(c, tone) {
  const s = cstate(c.id), shop = db.cfg.shop;
  const pays = db.ops.filter(o => o.kind === 'pay' && o.cid === c.id).sort(C.byWhen);
  const shopName = shop.name || 'mağazamız';
  let head;
  if (tone === 3) head = `Hörmətli ${c.name},\nBu, son xəbərdarlıqdır. ${shopName} qarşısında olan borcunuzun ödəmə müddəti ${s.overdue} gün əvvəl başa çatıb.`;
  else if (tone === 2) head = `Hörmətli ${c.name},\n${shopName} qarşısında${s.overdue ? ' ' + s.overdue + ' gün' : ''} gecikmiş borcunuz mövcuddur.`;
  else head = `Salam, ${c.name}! 😊\n${shopName} üzrə nisyə borcunuzun ${s.due && s.due > today() ? 'ödəmə vaxtı yaxınlaşır' : 'ödəmə vaxtı çatıb'}.`;
  let det;
  if (pays.length) {
    det = `İlkin borc: ${money(s.given)}\nEdilən ödənişlər:\n` + pays.map(p => `• ${fmtDate(p.date)} — ${money(p.amount)}`).join('\n') + `\nQalan borc: ${money(s.debt)}`;
  } else det = `Borc məbləği: ${money(s.debt)}`;
  if (s.due) det += `\nÖdəmə günü: ${fmtDate(s.due)}`;
  const tail = tone === 3 ? 'Borcun təxirə salınmadan ödənilməsini xahiş edirik.' : tone === 2 ? 'Borcun ən qısa zamanda ödənilməsini xahiş edirik.' : 'İmkanınız olanda ödəyə bilərsiniz. Təşəkkür edirik!';
  let msg = head + '\n\n' + det + '\n\n' + tail;
  if (db.cfg.req.trim()) msg += '\n\nÖdəniş üçün:\n' + db.cfg.req.trim();
  if (shop.name || shop.phone) msg += '\n\n' + [shop.name, shop.phone].filter(Boolean).join(' · ');
  return msg;
}
const waLink = (phone, text) => 'https://wa.me/' + (phone ? waNum(phone) : '') + '?text=' + encodeURIComponent(text);

// ---------- AYARLAR ----------
const srow = (a, v, icon, color, label, right) => `<button class="srow" data-a="${a}" ${v != null ? `data-v="${esc(v)}"` : ''}><span class="si" style="background:${color}">${icon}</span><span class="st"><span>${label}</span>${right || ''}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg></span></button>`;
const sw = on => `<i class="switch ${on ? 'on' : ''}"></i>`;
function renderSettings() {
  const st = { idle: '', syncing: 'göndərilir…', ok: 'hər şey göndərilib ✓', error: 'xəta: ' + sync.msg }[sync.status] || '';
  const last = sync.last ? new Date(sync.last) : null;
  const pin = hasNative && Android.pinSet && Android.pinSet();
  const bioOk = hasNative && Android.bioAvailable && Android.bioAvailable();
  const sum = (hasNative && Android.summaryTime && Android.summaryTime()) || '';
  return `<div class="page">${pageHead('Ayarlar')}
  <main style="padding-top:6px;padding-bottom:40px">
    <div class="slabel">Dükan</div>
    <div class="sgroup">
      ${srow('shop', null, '🏪', '#3E63DD', 'Dükanın vizitkartı', `<em>${esc(db.cfg.shop.name || 'yazılmayıb')}</em>`)}
      ${srow('req', null, '💳', '#0E9384', 'Ödəniş rekvizitləri', `<em>${db.cfg.req.trim() ? 'yazılıb' : 'yoxdur'}</em>`)}
      ${srow('tags', null, '🏷', '#D97706', 'Müştəri qrupları', `<em>${db.cfg.tags.length}</em>`)}
    </div>
    <div class="slabel">Xatırlatmalar</div>
    <div class="sgroup">
      ${srow('recs', null, '📌', '#E5484D', 'Sabit aylıq xərclər', `<em>${db.recs.length || ''}</em>`)}
      ${srow('summary', null, '🔔', '#F76B15', 'Günün sonu kassa xatırlatması', `<em>${esc(sum || 'sönülü')}</em>`)}
    </div>
    <div class="slabel">Ehtiyat nüsxə</div>
    <div class="card">${sync.account ? `<b>✅ Google Drive: ${esc(sync.account)}</b><div class="note">Hər dəyişiklik avtomatik Google Drive-a göndərilir${st ? ' · ' + esc(st) : ''}${last ? '<br>Son göndəriş: ' + pad(last.getDate()) + '.' + pad(last.getMonth() + 1) + ' ' + pad(last.getHours()) + ':' + pad(last.getMinutes()) : ''}</div>
      <button class="btn ghost" data-a="syncNow">🔄 İndi göndər</button><button class="btn danger" data-a="syncUnlink">Google hesabından ayır</button>`
      : `<div class="note">Google hesabını qoşun: hər dəyişiklik avtomatik öz Google Drive-ınıza yazılsın. Telefon dəyişəndə eyni Gmail ilə hər şey geri gəlir.</div><button class="btn primary" data-a="syncLink">Google Drive-a qoş</button>`}</div>
    <div class="sgroup">
      ${srow('xlsx', null, '📊', '#16A34A', 'Excel faylı kimi yadda saxla', '')}
      ${srow('backupFile', null, '📤', '#0090FF', 'Yedək faylı göndər (WhatsApp, Telegram…)', '')}
      ${srow('importFile', null, '📥', '#8E4EC6', 'Yedək faylından bərpa et', '')}
    </div>
    <div class="slabel">Təhlükəsizlik</div>
    <div class="sgroup">
      ${srow('pin', null, '🔒', '#E5484D', 'PIN kod', `<em>${pin ? 'qoyulub' : 'yoxdur'}</em>`)}
      ${pin && bioOk ? srow('bio', null, '☝', '#12A594', 'Barmaq izi ilə aç', sw(Android.bioEnabled())) : ''}
    </div>
    <div class="slabel">Digər</div>
    <div class="sgroup">
      ${srow('theme', null, '🌓', '#6E56CF', 'Tema', `<em>${theme === 'dark' ? 'Gecə (qızılı)' : 'Gündüz'}</em>`)}
      ${srow('openTrash', null, '🗑', '#8B8D98', 'Zibil qutusu (30 gün)', `<em>${db.trash.length || ''}</em>`)}
      ${srow('openPrivacy', null, '🛡', '#30A46C', 'Məxfilik siyasəti', '')}
      ${srow('noop', null, 'ℹ', '#0090FF', 'Versiya', `<em>${APP_VERSION}</em>`)}
    </div>
  </main></div>`;
}
function trashLabel(e) {
  if (e.kind === 'cust') return 'Müştəri: ' + e.cust.name + (e.ops.length ? ' (' + e.ops.length + ' əməliyyat)' : '');
  if (e.kind === 'rec') return 'Sabit xərc: ' + e.rec.name;
  const o = e.op;
  const nm = o.cid ? (cname(o.cid) || ((db.trash.find(x => x.kind === 'cust' && x.cust.id === o.cid) || { cust: {} }).cust.name) || '') : '';
  return KIND[o.kind].t + (nm ? ' · ' + nm : o.note ? ' · ' + o.note : '') + ' — ' + money(o.amount);
}
function renderTrash() {
  const left = e => Math.max(0, TRASH_DAYS - Math.floor((Date.now() - e.at) / 86400000));
  return `<div class="page">${pageHead('Zibil qutusu')}
  <main style="padding-top:6px;padding-bottom:40px">
    <div class="note" style="margin:0 4px 10px">Silinən qeydlər burada 30 gün saxlanılır, sonra avtomatik həmişəlik silinir.</div>
    ${db.trash.length ? `<div class="list">${db.trash.map(e => `<div class="row"><div class="grow"><div class="t">${esc(trashLabel(e))}</div><div class="s">${left(e)} gün qalıb</div></div>
      <button class="mini" data-a="restore" data-v="${e.id}">Qaytar</button></div>`).join('')}</div>
      <button class="btn danger" data-a="emptyTrash">Zibil qutusunu boşalt</button>` : '<div class="empty">Zibil qutusu boşdur</div>'}
  </main></div>`;
}
function renderRecs() {
  const st = C.recStatus(db, today());
  return `<div class="page">${pageHead('Sabit aylıq xərclər', `<button data-a="recEdit">${I.plus}</button>`)}
  <main style="padding-top:6px;padding-bottom:40px">
    <div class="note" style="margin:0 4px 10px">İcarə, kommunal, internet kimi hər ay təkrarlanan ödənişlər. Ödəmə günü çatanda bildiriş gəlir; «Ödədim» basanda xərc kassaya yazılır.</div>
    ${st.length ? `<div class="list">${st.map(x => `<div class="row"><button class="grow" style="text-align:left" data-a="recEdit" data-v="${x.r.id}"><div class="t">${esc(x.r.name)} · <span class="num">${money(x.r.amount)}</span></div>
      <div class="s">Hər ayın ${x.r.day}-i · ${x.r.method === 'card' ? '💳 Kart' : '💵 Nağd'} · ${x.paid ? '<span class="pay">bu ay ödənilib ✓</span>' : x.days < 0 ? '<span class="neg">' + Math.abs(x.days) + ' gün keçib</span>' : x.days === 0 ? 'bu gün' : x.days + ' gün qalıb'}</div></button>
      ${x.paid ? '' : `<button class="mini" data-a="recPay" data-v="${x.r.id}">Ödədim</button>`}</div>`).join('')}</div>` : '<div class="empty">Hələ sabit xərc yoxdur.<br>Yuxarıdakı «+» ilə əlavə edin.</div>'}
  </main></div>`;
}

// ---------- Məxfilik siyasəti ----------
const PRIVACY = {
  intro: 'MY FINANCE™ · MƏXFİLİK SİYASƏTİ VƏ İSTİFADƏ ŞƏRTLƏRİ\nProqramdan istifadə etməzdən əvvəl bütün 10 bəndi diqqətlə oxuyun.\nSon redaktə: 24.11.2026',
  items: [
    ['ÜMUMİ MÜDDƏALAR', [
      'Bu Məxfilik Siyasəti «My Finance™» proqramının (bundan sonra – «Proqram») istifadəsi zamanı məlumatların toplanması, saxlanılması və mühafizəsi qaydalarını, habelə istifadəçinin hüquq və öhdəliklərini müəyyən edir.',
      'Proqram dükan və kiçik biznes üçün kassa (nağd və kart üzrə gündəlik gəlir və xərc), nisyə dəftəri, müştərilərin borc və ödənişlərinin uçotu üçün nəzərdə tutulmuş Android proqramıdır.',
      'Proqramın operatoru (bundan sonra – «Operator»): ProTechtor Group, Bakı, Azərbaycan Respublikası.',
      'Proqramdan istifadə bu Siyasətin şərtlərinin qəbul edilməsi deməkdir. Şərtlərlə razı olmayan şəxs Proqramdan istifadəni dayandırmalı və onu telefondan silməlidir.']],
    ['HESABLAMALARIN DƏQİQLİYİ (ƏSAS XƏBƏRDARLIQ)', [
      'Proqramdakı bütün hesablamalar (kassa qalığı, nağd və kart balansı, nisyə qalıqları, avanslar, gecikmə günləri, çıxarışlar) YALNIZ İSTİFADƏÇİNİN DAXİL ETDİYİ MƏLUMATLAR əsasında aparılır.',
      'Məlumatların düzgün və tam daxil edilməsinə istifadəçi özü cavabdehdir. Səhv və ya natamam daxil edilmiş məlumat hesablamaların nəticəsinə təsir edir.',
      'Proqram mühasibat, vergi və ya hüquqi sənəd hesab edilmir. Proqramda hazırlanan borc çıxarışı məlumat xarakteri daşıyır. Proqramın göstəricilərinə əsasən qəbul edilən qərarlara görə məsuliyyət istifadəçiyə aiddir.']],
    ['TOPLANAN MƏLUMATLAR', [
      'Proqram yalnız istifadəçinin özünün daxil etdiyi məlumatları emal edir: müştərilərin adları, telefon nömrələri və qrupları, nisyə və ödənişlər, onların tarixləri və qeydləri, gəlir və xərclər, sabit aylıq xərclər, dükanın adı, ünvanı, telefonu, loqosu və ödəniş rekvizitləri.',
      'Proqram qeydiyyat tələb etmir, məkan məlumatlarını toplamır, reklam və davranış izləmə (analitika) alətlərindən istifadə etmir.',
      'İstifadəçi müştərilərinin şəxsi məlumatlarını (ad, telefon nömrəsi, borc məlumatı) Proqrama daxil edərkən həmin məlumatların qanuni əsasla əldə edilməsinə və istifadəsinə görə özü cavabdehdir.']],
    ['MƏLUMATLARIN SAXLANILMASI', [
      'Bütün məlumatlar istifadəçinin telefonunda, Proqramın daxili yaddaşında saxlanılır; Proqram internet olmadan tam işləyir.',
      'Silinmiş qeydlər «Zibil qutusu» bölməsinə keçir, orada 30 gün saxlanılır və bu müddətdə geri qaytarıla bilər; 30 gündən sonra həmişəlik silinir.',
      'Proqram telefondan silindikdə telefondakı məlumatlar da silinir. Google Drive sinxronizasiyası qoşulubsa, surət istifadəçinin öz Google Drive hesabında qalır.',
      'İstifadəçinin özünün yaratdığı ehtiyat nüsxə faylları (Excel və yedək faylı) onun seçdiyi yerdə saxlanılır və bu faylların qorunmasına istifadəçi özü cavabdehdir.']],
    ['GOOGLE DRIVE İLƏ EHTİYAT NÜSXƏ (İSTƏYƏ BAĞLI)', [
      'İstifadəçi öz Google hesabını qoşduqda hər dəyişiklik avtomatik həmin hesabın Google Drive yaddaşına göndərilir. Surət yalnız Proqramın görə bildiyi gizli qovluqda (appDataFolder) saxlanılır.',
      'Proqram Google Drive-dakı digər fayllara baxa, onları oxuya və ya dəyişə bilməz.',
      'Telefon dəyişdirildikdə eyni Google hesabı qoşularaq bütün məlumatlar bərpa olunur.']],
    ['TELEFONUN İCAZƏLƏRİ', [
      'Kontaktlar: yalnız istifadəçi «📇» düyməsinə basıb kontakt seçdikdə seçilən kontaktın adı və nömrəsi forma sahəsinə yazılır. Telefon kitabçasının qalan hissəsi oxunmur və heç yerə göndərilmir.',
      'Qalereya: yalnız istifadəçi dükanın loqosunu seçdikdə seçilən şəkil kiçildilərək Proqramda saxlanılır.',
      'Bildirişlər: müştərinin ödəmə günü çatdıqda və gecikdikdə, sabit aylıq xərclərin ödəmə günündə və istifadəçinin seçdiyi saatda «Günün sonu» xatırlatması üçün istifadə olunur.',
      'Barmaq izi: Proqramın kilidini açmaq üçün telefonun öz sistemi vasitəsilə yoxlanılır; barmaq izi məlumatı Proqrama ötürülmür və saxlanılmır.',
      'İnternet: yalnız Google Drive sinxronizasiyası və Proqramın yeni versiyasının yoxlanılması üçün istifadə olunur.']],
    ['ÜÇÜNCÜ TƏRƏFLƏRƏ ÖTÜRÜLMƏ', [
      'Məlumatlar heç kimə satılmır, ötürülmür və reklam məqsədilə istifadə edilmir.',
      'İstifadəçi «WhatsApp», «Zəng» və ya çıxarışı «Göndər» düyməsinə basdıqda yalnız seçilən proqram açılır; mesaj və ya fayl yalnız istifadəçinin özü göndərdikdə alıcıya çatır. Bundan sonrakı proses həmin proqramın qaydalarına tabedir.',
      'Proqramın yeni versiyası GitHub serverindən yoxlanılır və yüklənir; bu zaman istifadəçinin məlumatları ötürülmür.']],
    ['TƏHLÜKƏSİZLİK', [
      'İstifadəçi Proqrama PIN kod və barmaq izi ilə giriş kilidi qoya bilər. PIN kodun özü saxlanılmır — telefonda yalnız onun geri çevrilməz şifrələnmiş izi saxlanılır.',
      'Kilid qoyulduqda Proqram son tətbiqlər ekranında məlumatları göstərmir.',
      'Operator məlumatların qorunması üçün məqbul texniki tədbirlər görür; lakin telefonun itirilməsi, başqa şəxsə verilməsi, kilidsiz saxlanılması və ya yedək fayllarının başqasına ötürülməsi nəticəsində yaranan hallara görə məsuliyyət daşımır.']],
    ['İSTİFADƏÇİNİN HÜQUQLARI VƏ MƏLUMATLARIN SİLİNMƏSİ', [
      'İstifadəçi öz məlumatlarına istənilən vaxt baxa, onları düzəldə, ixrac edə və silə bilər.',
      'Sinxronizasiyanı «Ayarlar → Google hesabından ayır» ilə dayandırmaq olar.',
      'Google Drive-dakı surət «Google Drive → Ayarlar → Tətbiqləri idarə et → Hesabat → Gizli tətbiq məlumatlarını sil» yolu ilə silinir.']],
    ['DƏYİŞİKLİKLƏR, ƏLAQƏ VƏ HÜQUQİ TƏNZİMLƏMƏ', [
      'Operator bu Siyasətə dəyişiklik etmək hüququnu saxlayır; yeni redaksiya Proqramda dərc edildiyi andan qüvvəyə minir.',
      'Sual və müraciətlər üçün əlaqə: 0553115544@gmail.com.',
      'Münasibətlər Azərbaycan Respublikasının qüvvədə olan qanunvericiliyi, o cümlədən «Fərdi məlumatlar haqqında» Qanun ilə tənzimlənir.']]
  ],
  foot: 'My Finance™ · ProTechtor Group · Bütün hüquqlar qorunur · Son redaktə: 24.11.2026'
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

// ---------- formalar ----------
const val = id => { const e = document.getElementById(id); return e ? e.value : ''; };
const picked = g => { const b = app.querySelector(`[data-group="${g}"] .on`); return b ? b.dataset.v.split('|')[1] : null; };
const fAmount = (v, label) => `<label>${label || 'Məbləğ'}</label><input class="field big num" id="f_amount" inputmode="decimal" placeholder="0" value="${esc(v || '')}" autocomplete="off">
  <div class="calcbar"><button data-a="calcOp" data-v="+">+</button><button data-a="calcOp" data-v="-">−</button><button data-a="calcOp" data-v="*">×</button><button data-a="calcOp" data-v="/">÷</button><span class="calcres num" id="calcres"></span></div>`;
const fMethod = v => `<label>Ödəniş üsulu</label><div class="seg" data-group="method"><button class="${v !== 'card' ? 'on' : ''}" data-a="pick" data-v="method|cash">💵 Nağd</button><button class="${v === 'card' ? 'on' : ''}" data-a="pick" data-v="method|card">💳 Kart</button></div>`;
const fDate = o => `<div class="two"><div><label>Tarix</label><input class="field" id="f_date" type="date" value="${o && o.date || today()}" max="${today()}"></div><div><label>Saat</label><input class="field" id="f_time" type="time" value="${o && o.time || nowHm()}"></div></div>`;
const fNote = (v, label, ph) => `<label>${label || 'Qeyd'}</label><input class="field" id="f_note" value="${esc(v || '')}" placeholder="${esc(ph || '')}" autocomplete="off">`;
const saveBtn = (a, label, cls) => `<button class="btn ${cls || 'primary'}" data-a="${a}">${label || 'Yadda saxla'}</button>`;
const fWho = (o) => `<label>Müştəri</label><div style="display:flex;gap:8px"><input class="field" id="f_name" value="${esc(o && o.cid ? cname(o.cid) : '')}" placeholder="Ad yazın və ya seçin" autocomplete="off"><button class="iconbtn" data-a="contact" title="Kontaktlardan seç">📇</button></div>
  <div class="whosug" id="whosug"></div>`;
function readAmount() {
  const v = C.evalExpr(val('f_amount'));
  if (v == null || isNaN(v) || v <= 0) { toast('Məbləği düzgün yazın'); const e = document.getElementById('f_amount'); if (e) { e.focus(); e.classList.add('shake'); setTimeout(() => e.classList.remove('shake'), 400); } return 0; }
  return v;
}
const readDate = () => { let d = val('f_date') || today(); if (d > today()) d = today(); return d; };

function renderSheet(s) {
  const o = s.id ? db.ops.find(x => x.id === s.id) : null;
  const delBtn = o ? `<button class="btn danger" data-a="delOp" data-v="${o.id}">Sil</button>` : '';
  switch (s.kind) {
    case 'add': return `<h2>Yeni əməliyyat</h2><div class="addgrid">
      <button class="addopt" data-a="add" data-v="in"><span class="addic" style="background:var(--pay-soft);color:var(--pay);font-size:22px">⬇</span><div><b>Gəlir</b><small>Nağd və ya kart</small></div></button>
      <button class="addopt" data-a="add" data-v="out"><span class="addic" style="background:var(--exp-soft);color:var(--exp);font-size:22px">⬆</span><div><b>Xərc</b><small>Gündəlik xərc</small></div></button>
      <button class="addopt" data-a="add" data-v="nisye"><span class="addic" style="background:var(--debt-soft);color:var(--debt);font-size:22px">📝</span><div><b>Nisyə yaz</b><small>Kassaya yazılmır</small></div></button>
      <button class="addopt" data-a="add" data-v="pay"><span class="addic" style="background:var(--pay-soft);color:var(--pay);font-size:22px">💵</span><div><b>Ödəniş al</b><small>Nisyədən</small></div></button>
    </div><button class="btn ghost" data-a="newCust">👤 Yeni müştəri</button>`;
    case 'in': case 'out': return `<h2>${o ? 'Düzəliş: ' : ''}${s.kind === 'in' ? 'Gəlir' : 'Xərc'}</h2>
      ${fAmount(o ? amountInput(o.amount) : '')}${fMethod(o && o.method)}${fNote(o && o.note, s.kind === 'in' ? 'Nə üçün' : 'Nəyə xərcləndi', s.kind === 'in' ? 'məs. satış' : 'məs. mal alışı, nahar')}${fDate(o)}
      ${saveBtn('saveIO', 'Yadda saxla', s.kind === 'in' ? 'payb' : 'expb')}${delBtn}`;
    case 'nisye': {
      const due = o ? o.due || '' : s.due || C.addDays(today(), 7);
      return `<h2>${o ? 'Düzəliş: nisyə' : 'Nisyə yaz'}</h2>
      ${s.cid || o ? `<div class="whofix">👤 <b>${esc(cname((o || s).cid))}</b></div>` : fWho()}
      ${s.cid || o ? '' : '<label>Telefon (istəyə bağlı)</label><input class="field" id="f_phone" type="tel" inputmode="tel" autocomplete="off">'}
      ${fAmount(o ? amountInput(o.amount) : '')}
      ${fNote(o && o.note, 'Qeyd (malın adı və s.)', 'məs. 2 kisə un')}
      ${fDate(o)}
      <label>Ödəmə günü</label><div class="chips" style="margin:0 0 8px">${[['3 gün', 3], ['7 gün', 7], ['10 gün', 10], ['15 gün', 15], ['1 ay', 'm']].map(([l, v]) => `<button class="chip" data-a="dueSet" data-v="${v}">${l}</button>`).join('')}</div>
      <input class="field" id="f_due" type="date" value="${esc(due)}">
      ${saveBtn('saveNisye', 'Yadda saxla', 'debtb')}${delBtn}`;
    }
    case 'pay': {
      const cid = o ? o.cid : s.cid;
      const st = cid ? cstate(cid) : null;
      return `<h2>${o ? 'Düzəliş: ödəniş' : 'Nisyədən ödəniş al'}</h2>
      ${cid ? `<div class="whofix">👤 <b>${esc(cname(cid))}</b>${st && !o ? ` · borc: <b class="debt num">${money(st.debt)}</b>${st.advance ? ` · avans: <b class="pay num">+${money(st.advance)}</b>` : ''}` : ''}</div>` : fWho()}
      ${fAmount(o ? amountInput(o.amount) : '', 'Alınan məbləğ')}
      ${st && st.debt > 0 && !o ? `<div class="chips" style="margin:6px 0 0"><button class="chip" data-a="fillAmt" data-v="${st.debt}">Tam borc: ${money(st.debt)}</button></div>` : ''}
      <div class="note" id="payinfo" style="margin-top:6px"></div>
      ${fMethod(o && o.method)}${fNote(o && o.note, 'Qeyd', '')}${fDate(o)}
      ${saveBtn('savePay', 'Ödənişi yaz', 'payb')}${delBtn}`;
    }
    case 'cust': {
      const c = s.id ? cust(s.id) : null;
      const tags = c ? c.tags || [] : [];
      return `<h2>${c ? 'Müştərini düzəlt' : 'Yeni müştəri'}</h2>
      <label>Ad</label><div style="display:flex;gap:8px"><input class="field" id="f_name" value="${esc(c ? c.name : '')}" autocomplete="off"><button class="iconbtn" data-a="contact">📇</button></div>
      <label>Telefon</label><input class="field" id="f_phone" type="tel" inputmode="tel" value="${esc(c ? c.phone || '' : '')}" autocomplete="off">
      <label>Qruplar</label><div class="chips" style="margin:0" data-group="tags">${db.cfg.tags.map(t => `<button class="chip ${tags.includes(t) ? 'on' : ''}" data-a="tagToggle" data-v="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      ${saveBtn('saveCust')}`;
    }
    case 'extend': {
      const st = cstate(s.cid), it = st.open.find(x => x.n.due === st.due) || st.open[0];
      if (!it) return `<h2>Tarixi uzat</h2><div class="empty">Açıq nisyə yoxdur</div>`;
      const n = it.n;
      return `<h2>Ödəmə tarixini uzat</h2>
      <div class="whofix">📝 ${esc(n.note || 'Nisyə')} · ${fmtDate(n.date)} · qalıq <b class="num debt">${money(it.left)}</b><br>Hazırkı ödəmə günü: <b>${n.due ? fmtDate(n.due) : 'yoxdur'}</b>${n.ext && n.ext.length ? ` · ${n.ext.length} dəfə uzadılıb` : ''}</div>
      <label>Yeni tarix</label><div class="chips" style="margin:0 0 8px">${[['+3 gün', 3], ['+7 gün', 7], ['+10 gün', 10], ['+1 ay', 'm']].map(([l, v]) => `<button class="chip" data-a="dueSet" data-v="${v}" data-base="${esc(n.due && n.due > today() ? n.due : today())}">${l}</button>`).join('')}</div>
      <input class="field" id="f_due" type="date" value="${esc(C.addDays(n.due && n.due > today() ? n.due : today(), 7))}" min="${today()}">
      ${fNote('', 'Kiçik qeyd (istəyə bağlı)', 'məs. maaş alanda verəcək')}
      ${saveBtn('saveExtend', 'Tarixi uzat')}`;
    }
    case 'msg': {
      const c = cust(s.cid), st = cstate(s.cid), tone = s.tone || C.toneFor(st.overdue);
      return `<h2>WhatsApp xatırlatması</h2>
      <div class="seg" style="margin-bottom:8px">${[1, 2, 3].map(t => `<button class="${tone === t ? 'on' : ''}" data-a="tone" data-v="${t}" style="font-size:13px">${TONES[t]}</button>`).join('')}</div>
      <div class="note">${st.overdue ? st.overdue + ' gün gecikir — avtomatik seçildi: «' + TONES[C.toneFor(st.overdue)] + '»' : 'Gecikmə yoxdur — avtomatik seçildi: «Yumşaq xatırlatma»'}</div>
      <label>Mesaj (istəsəniz dəyişin)</label><textarea class="field" id="f_msg" rows="12" style="resize:vertical">${esc(waMessage(c, tone))}</textarea>
      ${c.phone ? '' : '<div class="bad-box" style="margin-top:8px">Müştərinin nömrəsi yoxdur — WhatsApp-da kontaktı özünüz seçəcəksiniz</div>'}
      <button class="btn payb" data-a="sendWa" data-v="${c.id}">${I.wa.replace('<svg', '<svg style="width:20px;height:20px;vertical-align:-4px;margin-right:6px"')}WhatsApp-da göndər</button>`;
    }
    case 'stmt': return `<h2>Borc çıxarışı</h2><div class="note">Müştərinin bütün nisyə və ödəniş tarixçəsi${db.cfg.shop.name ? ', dükanın vizitkartı' : ''}${db.cfg.req.trim() ? ' və ödəniş rekvizitləri' : ''} ilə səliqəli çıxarış.${db.cfg.shop.name ? '' : '<br>Vizitkartı Ayarlar → Dükanın vizitkartı bölməsində doldurun.'}</div>
      <div class="two" style="margin-top:12px"><button class="btn primary" data-a="stmtGo" data-v="pdf">📄 PDF</button><button class="btn ghost" data-a="stmtGo" data-v="png">🖼 Şəkil</button></div>`;
    case 'shop': {
      const sh = s.draft;
      return `<h2>Dükanın vizitkartı</h2><div class="note">Müştəriyə göndərilən çıxarışların yuxarısında görünür.</div>
      <div style="display:flex;align-items:center;gap:14px;margin-top:12px"><div class="logobox">${sh.logo ? `<img src="${esc(sh.logo)}" alt="">` : '🏪'}</div>
        <div style="flex:1"><button class="btn ghost" style="margin:0" data-a="logoPick">${sh.logo ? 'Loqonu dəyiş' : 'Loqo seç'}</button>${sh.logo ? '<button class="btn danger" style="margin-top:6px;padding:9px" data-a="logoDel">Loqonu sil</button>' : ''}</div></div>
      <label>Dükanın adı</label><input class="field" id="f_sname" value="${esc(sh.name)}" autocomplete="off">
      <label>Ünvan</label><input class="field" id="f_saddr" value="${esc(sh.address)}" autocomplete="off">
      <label>Əlaqə nömrəsi</label><input class="field" id="f_sphone" type="tel" value="${esc(sh.phone)}" autocomplete="off">
      ${saveBtn('saveShop')}`;
    }
    case 'req': return `<h2>Ödəniş rekvizitləri</h2><div class="note">WhatsApp xatırlatmalarının və çıxarışların altına avtomatik əlavə olunur ki, müştəri elə oradan köçürmə etsin.</div>
      <label>Kart nömrəsi, M10 nömrəsi və ya ödəniş linki</label><textarea class="field" id="f_req" rows="4" placeholder="Kart: 4169 0000 0000 0000 (Ad Soyad)&#10;M10: +994 55 000 00 00">${esc(db.cfg.req)}</textarea>
      ${saveBtn('saveReq')}`;
    case 'tags': return `<h2>Müştəri qrupları</h2>
      <div class="list">${db.cfg.tags.map(t => `<div class="row"><div class="grow"><div class="t">🏷 ${esc(t)}</div><div class="s">${db.customers.filter(c => (c.tags || []).includes(t)).length} müştəri</div></div><button class="del" data-a="tagDel" data-v="${esc(t)}">✕</button></div>`).join('') || '<div class="empty">Qrup yoxdur</div>'}</div>
      <label>Yeni qrup</label><div style="display:flex;gap:8px"><input class="field" id="f_tag" placeholder="məs. Qohum" autocomplete="off"><button class="mini" style="padding:0 16px" data-a="tagAdd">Əlavə et</button></div>`;
    case 'rec': {
      const r = s.id ? db.recs.find(x => x.id === s.id) : null;
      return `<h2>${r ? 'Sabit xərci düzəlt' : 'Yeni sabit aylıq xərc'}</h2>
      <label>Adı</label><input class="field" id="f_rname" value="${esc(r ? r.name : '')}" placeholder="məs. İcarə, Kommunal, İnternet" autocomplete="off">
      ${fAmount(r ? amountInput(r.amount) : '')}
      <label>Hər ayın neçəsində ödənilir</label><input class="field" id="f_rday" type="number" inputmode="numeric" min="1" max="31" value="${r ? r.day : ''}" placeholder="1–31">
      ${fMethod(r && r.method)}
      ${saveBtn('saveRec')}${r ? `<button class="btn danger" data-a="delRec" data-v="${r.id}">Sil</button>` : ''}`;
    }
    case 'summary': {
      const t = (hasNative && Android.summaryTime && Android.summaryTime()) || '';
      return `<h2>Günün sonu kassa xatırlatması</h2><div class="note">Seçdiyiniz saatda günün gəliri, xərci, kassadakı nağd və kartdakı pul bildirişlə gəlir ki, günü yekunlaşdırasınız.</div>
      <label>Saat</label><input class="field" id="f_sum" type="time" value="${esc(t || '21:00')}">
      ${saveBtn('saveSummary')}${t ? '<button class="btn danger" data-a="offSummary">Söndür</button>' : ''}`;
    }
  }
  return '';
}

// ---------- təsdiq pəncərəsi (səhv toxunuşdan qorunma) ----------
function ask(opts) { state.confirm = opts; render(); }
function renderConfirm(c) {
  return `<div class="cfm-shade" data-a="cfmNo"><div class="cfm ${c.danger ? 'danger' : ''}"><div class="cfm-ic">${c.icon || (c.danger ? '🗑' : '✅')}</div>
    <h3>${esc(c.title)}</h3>${c.text ? `<p>${esc(c.text)}</p>` : ''}
    ${c.methodPick ? `<div class="seg" style="margin:0 0 12px"><button class="${state.closeMethod !== 'card' ? 'on' : ''}" data-a="cfmMethod" data-v="cash">💵 Nağd</button><button class="${state.closeMethod === 'card' ? 'on' : ''}" data-a="cfmMethod" data-v="card">💳 Kart</button></div>` : ''}
    <div class="two">${c.alt ? `<button class="btn danger" data-a="cfmAlt">${esc(c.alt)}</button>` : '<button class="btn ghost" data-a="cfmNo">Ləğv et</button>'}<button class="btn ${c.danger ? 'dangerb' : 'payb'}" data-a="cfmOk">${esc(c.ok || 'Bəli')}</button></div>
    ${c.alt ? '<button class="pinlink" style="margin-top:12px" data-a="cfmNo">Ləğv et</button>' : ''}</div></div>`;
}

// ---------- PIN ----------
const bioOn = () => hasNative && Android.bioEnabled && Android.bioEnabled() && Android.bioAvailable();
function renderPin() {
  const P = state.pin;
  const title = { unlock: 'PIN kodu daxil edin', verify: 'Hazırkı PIN kodu daxil edin', set1: 'Yeni PIN kod', set2: 'PIN kodu təkrar yazın' }[P.mode];
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => `<button data-a="pinKey" data-v="${k}">${k}</button>`).join('')
    + (P.mode === 'unlock' && bioOn() ? `<button class="ic" data-a="bioAsk">${I.finger}</button>` : '<span></span>')
    + `<button data-a="pinKey" data-v="0">0</button><button class="ic" data-a="pinKey" data-v="del">${I.del}</button>`;
  return `<div class="pinpage"><img class="logo" src="icon.png" alt=""><h1>${esc(APP_NAME)}</h1><h2>${title}</h2>
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
  if (!(state.pin && state.pin.mode === 'unlock')) { state.sheet = null; state.confirm = null; state.pin = { mode: 'unlock', len: Android.pinLength(), entered: '', err: '' }; render(); }
  if (askBio && bioOn()) Android.bioPrompt();
};
window.onBioOk = function () { if (state.pin && state.pin.mode === 'unlock') { state.pin = null; render(); window.onAppResume(); } };
window.onPinReset = function () { state.pin = null; render(); toast('PIN kod silindi. İstəsəniz, Ayarlarda yenisini qoyun.'); };

// ---------- çəkmək ----------
let lastKey = '';
function render() {
  if (state.pin) { app.innerHTML = renderPin(); return; }
  let h = '';
  if (state.tab === 'people') h = renderCustomers();
  else if (state.tab === 'kassa') h = renderKassa();
  else if (state.tab === 'remind') h = renderRemind();
  else { state.tab = 'home'; h = renderHome(); }
  const dueN = dueCustomers().length;
  h += `<nav>
    <button class="${state.tab === 'home' ? 'on' : ''}" data-a="tab" data-v="home">${I.home}Ana</button>
    <button class="${state.tab === 'people' ? 'on' : ''}" data-a="tab" data-v="people">${I.people}Müştərilər</button>
    <button class="navplus" data-a="addMenu"><span>${I.plus}</span></button>
    <button class="${state.tab === 'kassa' ? 'on' : ''}" data-a="tab" data-v="kassa">${I.kassa}Kassa</button>
    <button class="${state.tab === 'remind' ? 'on' : ''}" data-a="tab" data-v="remind" style="position:relative">${I.bell}Xatırlat${dueN ? `<i class="navbadge">${dueN}</i>` : ''}</button></nav>`;
  const pg = topPage();
  if (pg) h += ({ cust: renderCustomer, all: renderAll, settings: renderSettings, trash: renderTrash, privacy: renderPrivacy, recs: renderRecs })[pg.kind](pg) || '';
  const key = state.sheet ? JSON.stringify(Object.assign({}, state.sheet, { draft: null })) : '';
  if (state.sheet) h += `<div class="shade" data-a="shade"><div class="sheet">${renderSheet(state.sheet)}</div></div>`;
  if (state.confirm) h += renderConfirm(state.confirm);
  app.dataset.sheetAnim = state.sheet && key !== lastKey ? '1' : '';
  lastKey = key;
  const y = window.scrollY, py = (app.querySelector('.page') || {}).scrollTop || 0;
  const q = val('q');
  app.innerHTML = h;
  window.scrollTo(0, y);
  const p2 = app.querySelector('.page'); if (p2 && pg && pg === state.lastPage) p2.scrollTop = py;
  state.lastPage = pg;
  if (pg && pg.kind === 'all') filterAll();
  const qi = document.getElementById('q'); if (qi && q && !pg) { qi.value = q; filterCust(q); }
  if (state.sheet) { calcPreview(); if (document.getElementById('whosug') && val('f_name')) whoSuggest(); }
}
function openSheet(s) { state.sheet = s; render(); }
function closeSheet() { state.sheet = null; render(); }
let animT = null;
function anim(k) { app.dataset.anim = k; clearTimeout(animT); animT = setTimeout(() => { app.dataset.anim = ''; }, 350); }
function pushPage(p) { state.sheet = null; state.pages.push(p); state.lastPage = null; anim('page'); render(); }

window.onBack = function () {
  if (state.pin) { if (state.pin.mode === 'unlock') return false; state.pin = null; render(); return true; }
  if (state.confirm) { state.confirm = null; render(); return true; }
  if (state.sheet) { closeSheet(); return true; }
  if (state.pages.length) { state.pages.pop(); render(); return true; }
  if (state.tab !== 'home') { state.tab = 'home'; render(); return true; }
  return false;
};
window.onLaunchTarget = function (t) { if (state.pin) return; state.sheet = null; state.pages = []; state.tab = t === 'people' ? 'people' : 'home'; render(); };
window.onContactPicked = function (name, phone) {
  const n = document.getElementById('f_name'), ph = document.getElementById('f_phone');
  phone = String(phone || '').trim(); name = String(name || '').trim();
  if (n && name) n.value = name;
  if (ph) ph.value = phone;
  else if (n && phone) { n.dataset.phone = phone; }
  whoSuggest();
};
window.onPhotoPicked = function (url) {
  if (state.sheet && state.sheet.kind === 'shop' && url) { keepShopDraft(); state.sheet.draft.logo = url; render(); }
};
window.onImported = function (text) {
  let d = null;
  try { d = JSON.parse(text); } catch (e) {}
  if (!d || !d.mf) return toast('Bu fayl My Finance™ yedəyi deyil');
  ask({ title: 'Yedək faylından bərpa edilsin?', text: `Faylda ${(d.customers || []).length} müştəri və ${(d.ops || []).length} əməliyyat var. Telefondakı məlumatlar silinmir — fayldakılar onlarla birləşdirilir.`, ok: 'Bərpa et', icon: '📥',
    run() { db = mergeDb(db, d); fixDb(); save(); toast('Bərpa olundu'); } });
};
window.onImportedXlsx = function () { toast('Bərpa üçün .json yedək faylını seçin'); };

// müştəri təklifləri: ad yazdıqca
function whoSuggest() {
  const box = document.getElementById('whosug'), inp = document.getElementById('f_name');
  if (!box || !inp || !state.sheet || state.sheet.kind === 'cust') return;
  const q = fold(inp.value), qd = inp.value.replace(/\D/g, '');
  const exact = db.customers.find(c => C.norm(c.name) === C.norm(inp.value));
  const list = q ? db.customers.filter(c => c !== exact && (fold(c.name).includes(q) || (qd.length > 2 && (c.phone || '').replace(/\D/g, '').includes(qd)))).slice(0, 5) : [];
  const td = today();
  const row = c => { const s = C.custState(db, c.id, td); return `<button class="whorow" data-a="whoPick" data-v="${c.id}"><span class="avatar" style="width:34px;height:34px;border-radius:11px;font-size:13px">${esc(initials(c.name))}</span><span class="grow"><b>${esc(c.name)}</b>${c.phone ? `<small>${esc(c.phone)}</small>` : ''}</span>${s.debt ? `<em class="debt num">${money(s.debt)}</em>` : ''}</button>`; };
  box.innerHTML = (exact ? `<div class="whophone">✓ Mövcud müştəri${exact.phone ? ' · ' + esc(exact.phone) : ''}${C.custState(db, exact.id, td).debt ? ' · borc: ' + money(C.custState(db, exact.id, td).debt) : ''}</div>` : '') + list.map(row).join('');
  if (state.sheet.kind === 'pay') payInfo();
}
function findCustByName(name) { const n = C.norm(name); return db.customers.find(c => C.norm(c.name) === n); }
function calcPreview() {
  const e = document.getElementById('f_amount'), r = document.getElementById('calcres');
  if (!e || !r) return;
  const v = C.evalExpr(e.value);
  r.textContent = C.hasOp(e.value) && v != null && !isNaN(v) ? '= ' + money(v) : '';
  if (state.sheet && state.sheet.kind === 'pay') payInfo();
}
function payInfo() {
  const box = document.getElementById('payinfo'); if (!box) return;
  const s = state.sheet, o = s.id ? db.ops.find(x => x.id === s.id) : null;
  const c = o ? cust(o.cid) : s.cid ? cust(s.cid) : findCustByName(val('f_name'));
  const v = C.evalExpr(val('f_amount'));
  if (!c || !v || isNaN(v)) { box.textContent = ''; return; }
  const st = cstate(c.id);
  const debt = st.bal + (o ? o.amount : 0);
  const after = debt - v;
  box.innerHTML = after > 0 ? `Qalacaq borc: <b class="debt num">${money(after)}</b>` : after === 0 ? '<b class="pay">Borc tam bağlanacaq ✓</b>' : `Borc bağlanacaq, artıq <b class="pay num">+${money(-after)}</b> avans kimi qalacaq`;
}
function keepShopDraft() {
  const d = state.sheet.draft;
  if (document.getElementById('f_sname')) { d.name = val('f_sname'); d.address = val('f_saddr'); d.phone = val('f_sphone'); }
}
// ad yazılıbsa müştərini tap və ya yarat
function ensureCustomer(name, phone) {
  name = String(name || '').trim().replace(/\s+/g, ' ');
  if (!name) return null;
  let c = findCustByName(name);
  if (!c) { c = touch({ id: uid(), name, phone: String(phone || '').trim(), tags: [], c: Date.now() }); db.customers.push(c); }
  else if (phone && !c.phone) { c.phone = String(phone).trim(); touch(c); }
  return c;
}
function newOp(o) { o.id = uid(); o.c = Date.now(); touch(o); db.ops.push(o); return o; }

// ---------- çıxarış: şəkil və PDF ----------
function loadImg(src) { return new Promise(res => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }
async function drawStatement(cid) {
  const c = cust(cid), s = cstate(cid), h = C.history(db, cid), shop = db.cfg.shop, req = db.cfg.req.trim();
  const W = 1080, P = 60, F = 'system-ui, -apple-system, Roboto, sans-serif';
  const reqLines = req ? req.split('\n') : [];
  const H = 360 + 260 + 70 + h.length * 74 + 520 + (reqLines.length ? 90 + reqLines.length * 44 : 0) + 80;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H);
  const gr = x.createLinearGradient(0, 0, W, 300); gr.addColorStop(0, '#14C7AF'); gr.addColorStop(1, '#0A675C');
  x.fillStyle = gr; x.fillRect(0, 0, W, 300);
  const logo = await loadImg(shop.logo);
  let tx = P;
  if (logo) {
    x.save(); x.beginPath(); x.arc(P + 80, 150, 80, 0, Math.PI * 2); x.closePath(); x.fillStyle = '#fff'; x.fill(); x.clip();
    const k = Math.max(160 / logo.width, 160 / logo.height); x.drawImage(logo, P + 80 - logo.width * k / 2, 150 - logo.height * k / 2, logo.width * k, logo.height * k); x.restore();
    tx = P + 200;
  }
  x.fillStyle = '#fff'; x.textBaseline = 'alphabetic';
  x.font = `800 52px ${F}`; x.fillText(shop.name || 'Borc çıxarışı', tx, 130, W - tx - P);
  x.font = `500 30px ${F}`; x.globalAlpha = .92;
  if (shop.address) x.fillText('📍 ' + shop.address, tx, 185, W - tx - P);
  if (shop.phone) x.fillText('📞 ' + shop.phone, tx, 232, W - tx - P);
  x.globalAlpha = 1;
  let y = 380;
  x.fillStyle = '#0F1A24'; x.font = `800 44px ${F}`; x.fillText('Borc çıxarışı', P, y);
  x.font = `500 28px ${F}`; x.fillStyle = '#6B7785'; x.textAlign = 'right'; x.fillText(fmtDate(today()) + ', ' + nowHm(), W - P, y); x.textAlign = 'left';
  y += 60; x.fillStyle = '#0F1A24'; x.font = `700 36px ${F}`; x.fillText('Müştəri: ' + c.name, P, y, W - 2 * P);
  if (c.phone) { y += 46; x.font = `500 30px ${F}`; x.fillStyle = '#6B7785'; x.fillText('📞 ' + c.phone, P, y); }
  y += 60;
  x.fillStyle = '#F4F7F9'; x.fillRect(P, y, W - 2 * P, 60);
  x.fillStyle = '#6B7785'; x.font = `700 26px ${F}`;
  x.fillText('Tarix', P + 20, y + 40); x.fillText('Əməliyyat', P + 250, y + 40);
  x.textAlign = 'right'; x.fillText('Məbləğ', W - P - 230, y + 40); x.fillText('Qalıq', W - P - 20, y + 40); x.textAlign = 'left';
  y += 60;
  for (const { o, bal } of h) {
    const n = o.kind === 'nisye';
    x.fillStyle = '#0F1A24'; x.font = `500 28px ${F}`;
    x.fillText(fmtShort(o.date) + '.' + o.date.slice(0, 4), P + 20, y + 46);
    x.font = `600 28px ${F}`; x.fillText(n ? 'Nisyə' : 'Ödəniş', P + 250, y + 36);
    x.font = `400 22px ${F}`; x.fillStyle = '#6B7785';
    x.fillText((o.note || (n ? (o.due ? 'ödəmə günü ' + fmtShort(o.due) : '') : (o.method === 'card' ? 'kart' : 'nağd'))).slice(0, 34), P + 250, y + 64);
    x.textAlign = 'right'; x.font = `700 28px ${F}`; x.fillStyle = n ? '#D9480F' : '#16A34A';
    x.fillText((n ? '+' : '−') + money(o.amount), W - P - 230, y + 46);
    x.fillStyle = '#0F1A24'; x.fillText(bal < 0 ? '+' + money(-bal) : money(bal), W - P - 20, y + 46); x.textAlign = 'left';
    y += 74; x.fillStyle = '#E7ECF0'; x.fillRect(P, y - 1, W - 2 * P, 2);
  }
  y += 40;
  const line = (l, v, col, big) => { x.font = `${big ? 800 : 600} ${big ? 36 : 30}px ${F}`; x.fillStyle = '#0F1A24'; x.fillText(l, P + 20, y); x.textAlign = 'right'; x.fillStyle = col; x.fillText(v, W - P - 20, y); x.textAlign = 'left'; y += big ? 64 : 52; };
  x.fillStyle = '#F4F7F9'; x.fillRect(P, y - 10, W - 2 * P, s.debt > 0 && s.due ? 250 : 206);
  y += 40;
  line('İlkin borc (cəmi nisyə)', money(s.given), '#D9480F');
  line('Ödənilib', money(s.paid), '#16A34A');
  if (s.advance > 0) line('Avans (artıq ödəniş)', '+' + money(s.advance), '#16A34A', true);
  else line('Qalan borc', money(s.debt), s.debt ? '#DC2626' : '#16A34A', true);
  if (s.debt > 0 && s.due) { y += 6; x.font = `600 28px ${F}`; x.fillStyle = s.overdue ? '#DC2626' : '#0F1A24'; x.fillText('Ödəmə günü: ' + fmtDate(s.due) + (s.overdue ? ' (' + s.overdue + ' gün gecikir)' : ''), P + 20, y); y += 30; }
  if (reqLines.length) {
    y += 40; x.strokeStyle = '#0E9384'; x.lineWidth = 3; x.strokeRect(P, y, W - 2 * P, 60 + reqLines.length * 44);
    x.fillStyle = '#0E9384'; x.font = `800 28px ${F}`; x.fillText('Ödəniş üçün', P + 24, y + 44);
    x.fillStyle = '#0F1A24'; x.font = `600 30px ${F}`;
    reqLines.forEach((l, i) => x.fillText(l, P + 24, y + 92 + i * 44, W - 2 * P - 48));
    y += 60 + reqLines.length * 44;
  }
  // artıq boşluğu kəs
  const end = Math.min(H, y + 60);
  const out = document.createElement('canvas'); out.width = W; out.height = end;
  out.getContext('2d').drawImage(cv, 0, 0);
  return out;
}
function b64ToBytes(b64) { const s = atob(b64); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
function bytesToB64(a) { let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); }
// JPEG şəkildən bir səhifəlik PDF
function pdfFromJpeg(jpg, w, h) {
  const enc = new TextEncoder(), parts = [], offs = [];
  let len = 0;
  const add = p => { const b = typeof p === 'string' ? enc.encode(p) : p; parts.push(b); len += b.length; };
  const pw = 595, ph = Math.round(595 * h / w);
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  add('%PDF-1.4\n');
  const obj = (n, body) => { offs[n] = len; add(n + ' 0 obj\n'); if (Array.isArray(body)) body.forEach(add); else add(body); add('\nendobj\n'); };
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, [`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`, jpg, '\nendstream']);
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = len;
  add('xref\n0 6\n0000000000 65535 f \n' + [1, 2, 3, 4, 5].map(n => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join(''));
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const out = new Uint8Array(len); let p = 0; for (const b of parts) { out.set(b, p); p += b.length; }
  return out;
}
async function makeStatement(cid, kind) {
  const c = cust(cid); if (!c) return;
  toast('Çıxarış hazırlanır…');
  const cv = await drawStatement(cid);
  const base = 'Cixaris-' + c.name.replace(/[^\wəöüğışçƏÖÜĞİŞÇ]+/g, '_') + '-' + today();
  if (kind === 'png') {
    const b64 = cv.toDataURL('image/png').split(',')[1];
    if (hasNative) Android.shareBase64(b64, base + '.png', 'image/png'); else window.open(cv.toDataURL());
  } else {
    const jpg = b64ToBytes(cv.toDataURL('image/jpeg', 0.92).split(',')[1]);
    const pdf = pdfFromJpeg(jpg, cv.width, cv.height);
    if (hasNative) Android.shareBase64(bytesToB64(pdf), base + '.pdf', 'application/pdf');
  }
}

// ---------- Excel faylı (.xlsx) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipStore(files) {
  const enc = new TextEncoder(), chunks = [], central = [];
  let off = 0;
  const u16 = v => [v & 0xFF, (v >> 8) & 0xFF], u32 = v => [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >>> 24) & 0xFF];
  for (const [name, text] of files) {
    const nb = enc.encode(name), db_ = enc.encode(text), crc = crc32(db_);
    const head = [0x50, 0x4B, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(db_.length), ...u32(db_.length), ...u16(nb.length), ...u16(0)];
    chunks.push(new Uint8Array(head), nb, db_);
    central.push([new Uint8Array([0x50, 0x4B, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(db_.length), ...u32(db_.length), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nb]);
    off += head.length + nb.length + db_.length;
  }
  let csize = 0; for (const [h, n] of central) { chunks.push(h, n); csize += h.length + n.length; }
  chunks.push(new Uint8Array([0x50, 0x4B, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(csize), ...u32(off), ...u16(0)]));
  const total = chunks.reduce((s, c) => s + c.length, 0), out = new Uint8Array(total);
  let p = 0; for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}
function xlsx(sheets) {
  const x = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  const col = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const sheetXml = rows => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    const ref = col(ci) + (ri + 1);
    if (typeof v === 'number') return `<c r="${ref}"${ri === 0 ? ' s="1"' : ''}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${x(v)}</t></is></c>`;
  }).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${x(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`]
  ].concat(sheets.map((s, i) => ['xl/worksheets/sheet' + (i + 1) + '.xml', sheetXml(s.rows)]));
  return zipStore(files);
}
function exportXlsx() {
  const td = today(), q = v => Math.round(v) / 100;
  const ops = db.ops.slice().sort(C.byWhen);
  const kassa = [['Tarix', 'Saat', 'Növ', 'Müştəri / Qeyd', 'Üsul', 'Məbləğ (₼)']].concat(ops.filter(o => o.kind !== 'nisye').map(o => [o.date, o.time || '', KIND[o.kind].t, o.cid ? cname(o.cid) + (o.note ? ' — ' + o.note : '') : opTitle(o), o.method === 'card' ? 'Kart' : 'Nağd', (o.kind === 'out' ? -1 : 1) * q(o.amount)]));
  const B = C.balances(db, td);
  kassa.push([], ['', '', '', 'Kassada nağd', '', q(B.cash)], ['', '', '', 'Kartda', '', q(B.card)], ['', '', '', 'Cəmi', '', q(B.total)]);
  const nis = [['Müştəri', 'Tarix', 'Məbləğ (₼)', 'Ödəmə günü', 'Qeyd', 'Uzadılıb']].concat(ops.filter(o => o.kind === 'nisye').map(o => [cname(o.cid), o.date, q(o.amount), o.due || '', o.note || '', o.ext && o.ext.length ? o.ext.length + ' dəfə' : '']));
  const cs = [['Ad', 'Telefon', 'Qruplar', 'Cəmi nisyə (₼)', 'Ödənilib (₼)', 'Qalıq borc (₼)', 'Avans (₼)', 'Ödəmə günü', 'Gecikmə (gün)']].concat(db.customers.map(c => { const s = C.custState(db, c.id, td); return [c.name, c.phone || '', (c.tags || []).join(', '), q(s.given), q(s.paid), q(s.debt), q(s.advance), s.debt ? s.due : '', s.overdue || 0]; }));
  const bytes = xlsx([{ name: 'Kassa', rows: kassa }, { name: 'Nisyə', rows: nis }, { name: 'Müştərilər', rows: cs }]);
  if (hasNative) Android.shareBase64(bytesToB64(bytes), 'MyFinance-' + td + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

// ---------- düymələr ----------
const actions = {
  tab(v) { state.tab = v; state.pages = []; state.sheet = null; anim('tab'); render(); window.scrollTo(0, 0); },
  back() { window.onBack(); },
  shade() { closeSheet(); },
  noop() {},
  settings() { pushPage({ kind: 'settings' }); },
  addMenu() { openSheet({ kind: 'add' }); },
  add(v) { openSheet({ kind: v }); },
  openCust(v) { pushPage({ kind: 'cust', id: v }); },
  openAll() { pushPage({ kind: 'all', k: '', m: '', q: '' }); },
  allF(v) { const [g, x] = v.split('|'); const pg = topPage(); pg[g] = x; pg.q = val('tq'); render(); },
  seg(v) { state.seg = v; render(); },
  tagF(v) { state.tag = v; render(); },
  kday(v) { const d = C.addDays(state.kday, +v); if (d <= today()) { state.kday = d; render(); } },
  newCust() { openSheet({ kind: 'cust' }); },
  editCust(v) { openSheet({ kind: 'cust', id: v }); },
  tagToggle(v, e, el) { el.classList.toggle('on'); },
  contact() { if (hasNative) Android.pickContact(); },
  whoPick(v) { const c = cust(v); const n = document.getElementById('f_name'); if (c && n) { n.value = c.name; whoSuggest(); calcPreview(); } },
  pick(v, e, el) { el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); },
  calcOp(v) {
    const e = document.getElementById('f_amount'); if (!e) return;
    const p = e.selectionStart != null ? e.selectionStart : e.value.length;
    e.value = e.value.slice(0, p) + v + e.value.slice(e.selectionEnd != null ? e.selectionEnd : p);
    e.focus(); try { e.setSelectionRange(p + 1, p + 1); } catch (er) {}
    calcPreview();
  },
  fillAmt(v) { const e = document.getElementById('f_amount'); if (e) { e.value = amountInput(+v); calcPreview(); } },
  dueSet(v, e, el) {
    const f = document.getElementById('f_due'); if (!f) return;
    const base = el.dataset.base || val('f_date') || today();
    f.value = v === 'm' ? C.addMonths(base, 1) : C.addDays(base, +v);
    el.parentElement.querySelectorAll('.chip').forEach(b => b.classList.toggle('on', b === el));
  },
  saveIO() {
    const s = state.sheet, amount = readAmount(); if (!amount) return;
    const o = s.id ? db.ops.find(x => x.id === s.id) : null;
    const data = { kind: s.kind, amount, method: picked('method') || 'cash', note: val('f_note').trim(), date: readDate(), time: val('f_time') || nowHm() };
    if (o) Object.assign(touch(o), data); else newOp(data);
    save(); closeSheet(); toast(s.kind === 'in' ? 'Gəlir yazıldı' : 'Xərc yazıldı');
  },
  saveNisye() {
    const s = state.sheet, o = s.id ? db.ops.find(x => x.id === s.id) : null;
    let cid = o ? o.cid : s.cid;
    if (!cid) {
      const name = val('f_name').trim(); if (!name) return toast('Müştərinin adını yazın');
      const n = document.getElementById('f_name');
      cid = ensureCustomer(name, val('f_phone') || (n && n.dataset.phone)).id;
    }
    const amount = readAmount(); if (!amount) return;
    const date = readDate(); let due = val('f_due');
    if (due && due < date) return toast('Ödəmə günü nisyə günündən əvvəl ola bilməz');
    const data = { kind: 'nisye', cid, amount, note: val('f_note').trim(), date, time: val('f_time') || nowHm(), due };
    if (o) Object.assign(touch(o), data); else newOp(data);
    save(); closeSheet(); toast('Nisyə yazıldı (kassaya düşmür)');
  },
  savePay() {
    const s = state.sheet, o = s.id ? db.ops.find(x => x.id === s.id) : null;
    let cid = o ? o.cid : s.cid;
    if (!cid) {
      const c = findCustByName(val('f_name'));
      if (!c) return toast('Müştərini siyahıdan seçin');
      cid = c.id;
    }
    const amount = readAmount(); if (!amount) return;
    const data = { kind: 'pay', cid, amount, method: picked('method') || 'cash', note: val('f_note').trim(), date: readDate(), time: val('f_time') || nowHm() };
    if (o) Object.assign(touch(o), data); else newOp(data);
    save(); closeSheet();
    const st = cstate(cid);
    toast(st.advance ? 'Ödəniş yazıldı · avans: +' + money(st.advance) : st.debt ? 'Ödəniş yazıldı · qalıq: ' + money(st.debt) : 'Ödəniş yazıldı · borc bağlandı ✓');
  },
  saveCust() {
    const s = state.sheet, name = val('f_name').trim().replace(/\s+/g, ' ');
    if (!name) return toast('Adı yazın');
    const same = findCustByName(name);
    if (same && same.id !== s.id) return toast('Bu adda müştəri artıq var');
    const tags = [...app.querySelectorAll('[data-group="tags"] .on')].map(b => b.dataset.v);
    if (s.id) { const c = cust(s.id); Object.assign(touch(c), { name, phone: val('f_phone').trim(), tags }); save(); closeSheet(); }
    else { const c = touch({ id: uid(), name, phone: val('f_phone').trim(), tags, c: Date.now() }); db.customers.push(c); save(); state.sheet = null; pushPage({ kind: 'cust', id: c.id }); }
  },
  editOp(v) { const o = db.ops.find(x => x.id === v); if (o) openSheet({ kind: o.kind, id: o.id }); },
  delOp(v) {
    const o = db.ops.find(x => x.id === v); if (!o) return;
    ask({ title: 'Silinsin?', text: opTitle(o) + ' — ' + money(o.amount) + '. Zibil qutusundan 30 gün ərzində qaytarmaq olar.', ok: 'Sil', danger: true,
      run() { trashOp(o); state.sheet = null; save(); toast('Zibil qutusuna atıldı'); } });
  },
  delCust(v) {
    const c = cust(v); if (!c) return;
    const n = db.ops.filter(o => o.cid === v).length;
    ask({ title: c.name + ' silinsin?', text: (n ? n + ' əməliyyatı ilə birlikdə. ' : '') + 'Zibil qutusundan 30 gün ərzində qaytarmaq olar.', ok: 'Sil', danger: true,
      run() { trashCustomer(c); state.pages.pop(); save(); toast('Zibil qutusuna atıldı'); } });
  },
  payFor(v) { openSheet({ kind: 'pay', cid: v }); },
  nisyeFor(v) { openSheet({ kind: 'nisye', cid: v }); },
  closeDebt(v) {
    const s = cstate(v); if (!(s.debt > 0)) return;
    state.closeMethod = 'cash';
    ask({ title: 'Borc tam bağlansın?', text: cname(v) + ' — ' + money(s.debt) + ' tam ödəniş kimi bu günün gəlirinə yazılacaq.', ok: 'Bağla', icon: '✅', methodPick: true,
      run() { newOp({ kind: 'pay', cid: v, amount: s.debt, method: state.closeMethod, note: 'Borc tam bağlandı', date: today(), time: nowHm() }); save(); toast('Borc bağlandı ✓'); } });
  },
  extend(v) { if (!cstate(v).open.length) return toast('Açıq nisyə yoxdur'); openSheet({ kind: 'extend', cid: v }); },
  saveExtend() {
    const st = cstate(state.sheet.cid), it = st.open.find(x => x.n.due === st.due) || st.open[0];
    const nd = val('f_due'); if (!nd) return toast('Yeni tarixi seçin');
    const n = db.ops.find(o => o.id === it.n.id);
    if (nd === n.due) return toast('Tarix eynidir');
    n.ext = (n.ext || []).concat([{ old: n.due || n.date, at: today(), note: val('f_note').trim() }]);
    n.due = nd; touch(n);
    save(); closeSheet(); toast('Ödəmə günü uzadıldı: ' + fmtDate(nd));
  },
  call(v) { const c = cust(v); if (!c || !c.phone) return toast('Nömrə yazılmayıb'); openUrl('tel:' + c.phone.replace(/[^\d+]/g, '')); },
  msg(v) { const c = cust(v); if (!c) return; if (!(cstate(v).debt > 0)) return toast('Bu müştərinin borcu yoxdur'); openSheet({ kind: 'msg', cid: v }); },
  tone(v) { state.sheet.tone = +v; render(); },
  sendWa(v) { const c = cust(v); state.sent[v] = true; openUrl(waLink(c.phone, val('f_msg'))); closeSheet(); },
  quickWa(v) { const c = cust(v); if (!c) return; state.sent[v] = true; render(); openUrl(waLink(c.phone, waMessage(c, C.toneFor(cstate(v).overdue)))); },
  stmt(v) { if (!C.history(db, v).length) return toast('Tarixçə boşdur'); openSheet({ kind: 'stmt', cid: v }); },
  stmtGo(v) { const cid = state.sheet.cid; closeSheet(); makeStatement(cid, v); },
  // təsdiq
  cfmNo() { state.confirm = null; render(); },
  cfmOk() { const c = state.confirm; state.confirm = null; c.run(); render(); },
  cfmMethod(v, e, el) { state.closeMethod = v; el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); },
  // ayarlar
  shop() { openSheet({ kind: 'shop', draft: Object.assign({}, db.cfg.shop) }); },
  logoPick() { keepShopDraft(); if (hasNative) Android.pickPhoto(); },
  logoDel() { keepShopDraft(); state.sheet.draft.logo = ''; render(); },
  saveShop() { keepShopDraft(); db.cfg.shop = Object.assign({}, state.sheet.draft, { name: state.sheet.draft.name.trim(), address: state.sheet.draft.address.trim(), phone: state.sheet.draft.phone.trim() }); touch(db.cfg); save(); closeSheet(); toast('Vizitkart yadda saxlandı'); },
  req() { openSheet({ kind: 'req' }); },
  saveReq() { db.cfg.req = val('f_req'); touch(db.cfg); save(); closeSheet(); toast('Rekvizitlər yadda saxlandı'); },
  tags() { openSheet({ kind: 'tags' }); },
  tagAdd() { const t = val('f_tag').trim(); if (!t) return; if (db.cfg.tags.some(x => C.norm(x) === C.norm(t))) return toast('Bu qrup var'); db.cfg.tags.push(t); touch(db.cfg); save(); render(); },
  tagDel(v) {
    ask({ title: '«' + v + '» qrupu silinsin?', text: 'Müştərilər silinmir, yalnız bu qrup işarəsi götürülür.', ok: 'Sil', danger: true,
      run() { db.cfg.tags = db.cfg.tags.filter(t => t !== v); touch(db.cfg); for (const c of db.customers) if ((c.tags || []).includes(v)) { c.tags = c.tags.filter(t => t !== v); touch(c); } if (state.tag === v) state.tag = ''; save(); } });
  },
  recs() { pushPage({ kind: 'recs' }); },
  recEdit(v) { openSheet({ kind: 'rec', id: v || null }); },
  saveRec() {
    const name = val('f_rname').trim(); if (!name) return toast('Adını yazın');
    const amount = readAmount(); if (!amount) return;
    const day = Math.round(+val('f_rday')); if (!(day >= 1 && day <= 31)) return toast('Ayın gününü 1–31 arasında yazın');
    const s = state.sheet, data = { name, amount, day, method: picked('method') || 'cash' };
    if (s.id) Object.assign(touch(db.recs.find(r => r.id === s.id)), data); else db.recs.push(touch(Object.assign({ id: uid() }, data)));
    save(); closeSheet();
  },
  delRec(v) {
    const r = db.recs.find(x => x.id === v); if (!r) return;
    ask({ title: r.name + ' silinsin?', text: 'Keçmiş ödənişlər kassada qalır.', ok: 'Sil', danger: true,
      run() { db.recs = db.recs.filter(x => x.id !== v); db.removed[v] = Date.now(); db.trash.unshift(touch({ id: uid(), at: Date.now(), kind: 'rec', rec: r })); state.sheet = null; save(); } });
  },
  recPay(v) {
    const r = db.recs.find(x => x.id === v); if (!r) return;
    const m = today().slice(0, 7);
    if (C.recPaid(db, r, m)) return toast('Bu ay artıq ödənilib');
    ask({ title: r.name + ' ödənildi?', text: money(r.amount) + ' (' + (r.method === 'card' ? 'kart' : 'nağd') + ') bu günün xərci kimi kassaya yazılacaq.', ok: 'Ödədim', icon: '📌',
      run() { newOp({ kind: 'out', amount: r.amount, method: r.method || 'cash', note: r.name, rec: r.id, recMonth: m, date: today(), time: nowHm() }); save(); toast('Xərc yazıldı'); } });
  },
  summary() { openSheet({ kind: 'summary' }); },
  saveSummary() { const t = val('f_sum'); if (!t) return; if (hasNative) Android.setSummaryTime(t); pushNative(); closeSheet(); toast('Hər gün ' + t + '-da xatırladılacaq'); },
  offSummary() { if (hasNative) Android.setSummaryTime(''); closeSheet(); },
  syncLink() { if (hasNative) Android.syncLink(); },
  syncNow() { runSync(); },
  syncUnlink() { ask({ title: 'Google hesabından ayrılsın?', text: 'Telefondakı məlumatlar qalır, sadəcə Drive-a göndərilmə dayanır.', ok: 'Ayır', danger: true, icon: '☁', run() { Android.syncUnlink(); sync.account = ''; sync.status = 'idle'; } }); },
  xlsx() { exportXlsx(); },
  backupFile() { if (hasNative) Android.shareFile(JSON.stringify(db), 'MyFinance-yedek-' + today() + '.json'); },
  importFile() { if (hasNative) Android.importFile(); },
  theme() { theme = theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('mfTheme', theme); } catch (e) {} applyTheme(); render(); },
  openTrash() { pushPage({ kind: 'trash' }); },
  openPrivacy() { pushPage({ kind: 'privacy' }); },
  restore(v) {
    const e = db.trash.find(x => x.id === v); if (!e) return;
    const t = Date.now();
    if (e.kind === 'op') {
      if (e.op.cid && !cust(e.op.cid)) return toast('Əvvəlcə müştərini qaytarın');
      e.op.u = t; db.ops.push(e.op);
    } else if (e.kind === 'cust') {
      e.cust.u = t; db.customers.push(e.cust);
      for (const o of e.ops) { o.u = t; db.ops.push(o); }
    } else if (e.kind === 'rec') { e.rec.u = t; db.recs.push(e.rec); }
    db.trash = db.trash.filter(x => x.id !== v); db.removed[v] = t;
    save(); render(); toast('Qaytarıldı');
  },
  emptyTrash() {
    ask({ title: 'Zibil qutusu boşaldılsın?', text: 'İçindəkilər həmişəlik silinəcək, geri qaytarmaq olmayacaq.', ok: 'Boşalt', danger: true,
      run() { const t = Date.now(); for (const e of db.trash) db.removed[e.id] = t; db.trash = []; save(); } });
  },
  pin() {
    if (!hasNative) return;
    if (Android.pinSet()) {
      ask({ title: 'PIN kod', text: 'PIN kodu dəyişmək və ya silmək istəyirsiniz?', ok: 'Dəyiş', icon: '🔒', alt: 'Sil',
        run() { state.pin = { mode: 'verify', next: 'change', len: Android.pinLength(), entered: '', err: '' }; },
        runAlt() { state.pin = { mode: 'verify', next: 'remove', len: Android.pinLength(), entered: '', err: '' }; } });
    } else { state.pin = { mode: 'set1', len: 4, entered: '', err: '' }; render(); }
  },
  cfmAlt() { const c = state.confirm; state.confirm = null; c.runAlt(); render(); },
  bio() { Android.setBio(!Android.bioEnabled()); render(); },
  pinKey(v) {
    const P = state.pin;
    if (v === 'del') P.entered = P.entered.slice(0, -1);
    else if (P.entered.length < P.len) P.entered += v;
    const dots = document.getElementById('pinDots');
    if (dots) dots.innerHTML = Array.from({ length: P.len }, (_, i) => `<i class="${i < P.entered.length ? 'on' : ''}"></i>`).join('');
    const er = document.getElementById('pinErr'); if (er) er.textContent = '';
    if (P.entered.length === P.len) setTimeout(pinDone, 60);
  },
  pinLen(v) { Object.assign(state.pin, { len: +v, entered: '', err: '' }); render(); },
  pinCancel() { state.pin = null; render(); },
  bioAsk() { Android.bioPrompt(); },
  pinForgot() {
    ask({ title: 'PIN-i unutmusunuz?', text: 'Sıfırlamaq üçün telefonun öz ekran kilidi soruşulacaq.', ok: 'Davam et', icon: '🔑',
      run() { if (!Android.resetPinWithPhone()) toast('Telefonda ekran kilidi qurulmayıb'); } });
  }
};
app.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el || !app.contains(el) || el.disabled) return;
  const a = el.dataset.a;
  if (a === 'shade' && e.target !== el) return;
  if (a === 'cfmNo' && e.target !== el && el.classList.contains('cfm-shade')) return;
  if (actions[a]) { e.preventDefault(); actions[a](el.dataset.v, e, el); }
});
app.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'f_amount') return calcPreview();
  if (id === 'f_name') { delete e.target.dataset.phone; return whoSuggest(); }
  if (id === 'q') return filterCust(e.target.value);
  if (id === 'tq') { const pg = topPage(); if (pg) pg.q = e.target.value; return filterAll(); }
});
app.addEventListener('change', e => {
  if (e.target.id === 'kdate' && e.target.value) { state.kday = e.target.value > today() ? today() : e.target.value; render(); }
});
// məbləğ xanasından çıxanda ifadə nəticə ilə əvəz olunur (15+20+12,5 → 47,5)
app.addEventListener('focusout', e => {
  if (e.target.id !== 'f_amount' || !C.hasOp(e.target.value)) return;
  const v = C.evalExpr(e.target.value);
  if (v != null && !isNaN(v) && v > 0) { e.target.value = amountInput(v); calcPreview(); }
});

// ---------- başlanğıc ----------
load();
if (hasNative && Android.syncLinked) sync.account = Android.syncLinked();
if (hasNative && Android.pinSet && Android.pinSet() && Android.isLocked()) {
  state.pin = { mode: 'unlock', len: Android.pinLength(), entered: '', err: '' };
  if (bioOn()) setTimeout(() => Android.bioPrompt(), 300);
}
render();
pushNative();
if (sync.account && !state.pin) setTimeout(runSync, 500);
