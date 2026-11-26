'use strict';
// My Finance™ — kompüter (Windows) versiyası.
// Ekranlar, hesablamalar və bütün qaydalar telefondakı ilə eyni koddur (emin/assets → app/).
// Bu fayl telefondakı MainActivity.java-nın işini görür: məlumat faylı, Google sinxronu, PIN kilidi,
// xatırlatmalar, yedək faylları və avtomatik yeniləmə.
const { app, BrowserWindow, ipcMain, dialog, shell, Notification, Tray, Menu, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const T = require('./tr');
const G = require('./google');

const APP_ID = 'az.usta.hesab.pc';
const ICON = path.join(__dirname, 'app', 'icon.png');
const hiddenStart = process.argv.includes('--hidden');

if (!app.requestSingleInstanceLock()) { app.quit(); return; }
app.setAppUserModelId(APP_ID);

let win = null, tray = null, quitting = false;
const dir = () => app.getPath('userData');
const F = n => path.join(dir(), n);

// ---------- ayarlar (telefondakı SharedPreferences) ----------
let P = null;
function prefs() {
  if (P) return P;
  try { P = JSON.parse(fs.readFileSync(F('prefs.json'), 'utf8')) || {}; } catch (e) { P = {}; }
  return P;
}
function setPrefs(o) {
  P = Object.assign(prefs(), o);
  for (const k of Object.keys(P)) if (P[k] === undefined) delete P[k];
  try {
    fs.writeFileSync(F('prefs.json.tmp'), JSON.stringify(P));
    fs.renameSync(F('prefs.json.tmp'), F('prefs.json'));
  } catch (e) {}
}
const pinSet = () => !!prefs().pinHash;
const sha256 = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
let locked = true;

// ---------- səhifəyə müraciət ----------
let pageReady = false;
const pendingJs = [];
function js(code) {
  if (pageReady && win && !win.isDestroyed()) win.webContents.executeJavaScript(code, true).catch(() => {});
  else pendingJs.push(code);
}
const q = v => JSON.stringify(v == null ? '' : String(v));
const pageToast = m => js('toast(' + q(m) + ')');
const syncStatus = (s, m) => js('window.onSyncStatus(' + q(s) + ',' + q(m) + ')');

// ---------- məlumat faylı (telefondakı kimi: əvvəl .tmp, köhnəsi .prev olaraq qalır) ----------
function load() {
  let any = false;
  for (const n of ['data.json', 'data.prev.json', 'data.json.tmp']) {
    const f = F(n);
    if (!fs.existsSync(f)) continue;
    any = true;
    try {
      const s = fs.readFileSync(f, 'utf8').trim();
      if (s.startsWith('{') && s.endsWith('}')) { JSON.parse(s); return s; }
    } catch (e) {}
  }
  // fayl var, amma heç biri oxunmur: proqram boş baza ilə başlamasın, üstünə yazmasın
  return any ? '!BROKEN' : '';
}
function save(json) {
  try {
    const tmp = F('data.json.tmp'), main = F('data.json'), prev = F('data.prev.json');
    const fd = fs.openSync(tmp, 'w');
    fs.writeSync(fd, Buffer.from(String(json), 'utf8'));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    if (fs.existsSync(main)) { try { fs.unlinkSync(prev); } catch (e) {} fs.renameSync(main, prev); }
    fs.renameSync(tmp, main);
    const qq = prefs().queue || {};
    setPrefs({ queue: { seq: (qq.seq || 0) + 1, pending: true, last: qq.last || 0 } }); // Google növbəsinə düşür
    return true;
  } catch (e) { return false; }
}

// ---------- fayllar: «göndər» kompüterdə «yadda saxla» olur ----------
async function saveAs(name, data) {
  const r = await dialog.showSaveDialog(win, { title: T.t('Yadda saxla'), defaultPath: path.join(app.getPath('downloads'), name), buttonLabel: T.t('Yadda saxla') });
  if (r.canceled || !r.filePath) return;
  fs.writeFileSync(r.filePath, data);
  pageToast(T.t('Fayl yadda saxlandı'));
  shell.showItemInFolder(r.filePath);
}

// ---------- xatırlatmalar (telefondakı DueReceiver və SummaryReceiver) ----------
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
function notify(title, body) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: ICON });
  n.on('click', showWin);
  n.show();
}
function notifyDue() {
  const d = prefs().due || {};
  let o;
  try { o = JSON.parse(d.list || ''); } catch (e) { return; }
  const items = (o && o.items) || [], today = ymd(new Date()), lines = [];
  for (const it of items) {
    const until = it.u || '';
    if ((it.d || '9999') <= today && (!until || today <= until)) {
      let line = it.line || '';
      if (it.due) {
        // gün sayı bu gün hesablanır: proqram neçə gün açılmasa da düz göstərilir
        const days = daysBetween(today, it.due);
        const s = days > 0 ? String(o.soon || '{0}').replace('{0}', days) : days === 0 ? (o.today || '') : String(o.late || '{0}').replace('{0}', -days);
        if (s) line += ' · ' + s;
      }
      lines.push(line);
    }
  }
  if (!lines.length) return;
  notify(o.title || T.t('Ödəniş günü çatıb'), lines.join('\n'));
}
function notifySummary() {
  const s = prefs().summary || {};
  const today = ymd(new Date());
  notify(s.title || T.t('Günün xülasəsi'), today === s.date ? (s.text || '') : (s.empty || T.t('Bu gün heç nə yazılmayıb')));
}
// hər yarım dəqiqədən bir: seçilən saat çatıbsa (5 dəqiqəlik pəncərə, telefondakı kimi), günə bir dəfə göstərilir
function tick() {
  const now = new Date(), today = ymd(now), mins = now.getHours() * 60 + now.getMinutes();
  const due = (t, fired) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t || '');
    if (!m || fired === today) return false;
    const at = +m[1] * 60 + +m[2];
    return mins >= at && mins < at + 5;
  };
  const d = prefs().due || {};
  if (due(d.time || '10:00', d.fired)) { setPrefs({ due: Object.assign({}, d, { fired: today }) }); notifyDue(); }
  const s = prefs().summary || {};
  if (due(s.time, s.fired)) { setPrefs({ summary: Object.assign({}, s, { fired: today }) }); notifySummary(); }
}

// ---------- körpü: telefondakı «Android» obyektinin metodları ----------
const H = {
  setLang(l) { setPrefs({ lang: l || 'az' }); T.setLang(l || 'az'); buildTray(); },
  loadOld() { return ''; }, // köhnə «Emin Hesabat» kompüterdə olmayıb
  archiveOld() {},
  load,
  save,
  shareFile(json, name) { return saveAs(name, Buffer.from(String(json), 'utf8')); },
  async importFile() {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'My Finance', extensions: ['json', 'xlsx'] }, { name: '*', extensions: ['*'] }] });
    if (r.canceled || !r.filePaths[0]) return;
    try {
      const all = fs.readFileSync(r.filePaths[0]);
      if (all.length > 1 && all[0] === 0x50 && all[1] === 0x4b) js('window.onImportedXlsx(' + q(all.toString('base64')) + ')'); // zip: Excel .xlsx
      else js('window.onImported(' + q(all.toString('utf8')) + ')');
    } catch (e) { pageToast(T.t('Xəta: ') + e.message); }
  },
  pickContact() { pageToast(T.t('Kompüterdə kontaktlar yoxdur')); },
  async syncLink() {
    pageToast(T.t('Brauzerdə Google hesabınızı seçin və icazə verin'));
    try {
      const name = await G.link();
      showWin();
      js('window.onSyncLinked(' + q(name) + ')');
    } catch (e) { showWin(); pageToast(e.message || T.t('Google hesabı seçmək mümkün olmadı')); }
  },
  syncUnlink() { G.unlink(); },
  needLink() { return G.needLink(); },
  linkDone() { G.setNeedLink(false); },
  syncLinked() { return G.account(); },
  async syncStart() {
    if (!G.account()) return;
    try { js('window.onSyncRemote(' + q(await G.download()) + ')'); } catch (e) { syncStatus('error', e.message || String(e)); }
  },
  async syncUpload(json) {
    if (!G.account()) return;
    const seq = (prefs().queue || {}).seq || 0;
    try {
      await G.upload(String(json));
      const qq = prefs().queue || {};
      setPrefs({ queue: { seq: qq.seq || 0, pending: (qq.seq || 0) === seq ? false : !!qq.pending, last: Date.now() } });
      syncStatus('ok', '');
    } catch (e) { syncStatus('error', e.message || String(e)); }
  },
  async pickPhoto() {
    const r = await dialog.showOpenDialog(win, { title: T.t('Şəkil seçin'), properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] }] });
    if (r.canceled || !r.filePaths[0]) return;
    try {
      let img = nativeImage.createFromPath(r.filePaths[0]);
      if (img.isEmpty()) throw new Error('not an image');
      const { width, height } = img.getSize(), k = Math.min(1, 800 / Math.max(width, height)); // uzun tərəfi 800 px
      if (k < 1) img = img.resize({ width: Math.round(width * k), height: Math.round(height * k), quality: 'best' });
      js('window.onPhotoPicked(' + q('data:image/jpeg;base64,' + img.toJPEG(60).toString('base64')) + ')');
    } catch (e) { pageToast(T.t('Şəkil açılmadı')); }
  },
  shareBase64(b64, name) { return saveAs(name, Buffer.from(String(b64), 'base64')); },
  async mailBase64(b64, name, mime, to, subject) {
    try {
      const d = path.join(app.getPath('downloads'), 'MyFinance');
      fs.mkdirSync(d, { recursive: true });
      const f = path.join(d, name);
      fs.writeFileSync(f, Buffer.from(String(b64), 'base64'));
      shell.showItemInFolder(f);
      shell.openExternal('mailto:' + encodeURIComponent(to || '') + '?subject=' + encodeURIComponent(subject || ''));
    } catch (e) { pageToast(T.t('Xəta: ') + e.message); }
  },
  setSummaryTime(t) { setPrefs({ summary: Object.assign({}, prefs().summary, { time: t || '', fired: undefined }) }); },
  summaryTime() { return (prefs().summary || {}).time || ''; },
  setSummary(date, title, text, empty) { setPrefs({ summary: Object.assign({}, prefs().summary, { date, title, text, empty }) }); },
  setDueList(json) { setPrefs({ due: Object.assign({}, prefs().due, { list: json }) }); },
  dueTime() { return (prefs().due || {}).time || '10:00'; },
  setDueTime(t) { setPrefs({ due: Object.assign({}, prefs().due, { time: t || '10:00', fired: undefined }) }); },
  notifAllowed() { return Notification.isSupported(); },
  openNotifSettings() { shell.openExternal('ms-settings:notifications'); },
  queueState() { const qq = prefs().queue || {}; return JSON.stringify({ pending: !!qq.pending, last: qq.last || 0 }); },
  saveToDownloads(json, name) {
    try {
      const d = path.join(app.getPath('downloads'), 'MyFinance');
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, name), String(json), 'utf8');
      return true;
    } catch (e) { return false; }
  },
  setWidget() {}, updateShortcuts() {}, haptic() {},
  bioAvailable() { return false; }, // kompüterdə barmaq izi yoxdur: Ayarlarda bu sətir görünmür
  bioEnabled() { return !!prefs().bio; },
  setBio(on) { setPrefs({ bio: !!on }); },
  bioPrompt() {},
  pinSet,
  pinLength() { return prefs().pinLen || 4; },
  // PIN telefondakı kimi saxlanır (duz + SHA-256), ona görə Google-dan gələn kilid kompüterdə də eyni kodla açılır
  setPin(pin) { const salt = crypto.randomBytes(8).toString('hex'); setPrefs({ pinSalt: salt, pinHash: sha256(salt + pin), pinLen: String(pin).length }); locked = false; },
  checkPin(pin) { const ok = sha256((prefs().pinSalt || '') + pin) === prefs().pinHash; if (ok) locked = false; return ok; },
  pinBlob() { return pinSet() ? JSON.stringify({ salt: prefs().pinSalt || '', hash: prefs().pinHash, len: prefs().pinLen || 4 }) : ''; },
  setPinBlob(json) {
    try {
      if (!json) return setPrefs({ pinHash: undefined, pinSalt: undefined, pinLen: undefined });
      const o = JSON.parse(json);
      setPrefs({ pinSalt: o.salt || '', pinHash: o.hash, pinLen: o.len || 4 });
    } catch (e) {}
  },
  clearPin() { setPrefs({ pinHash: undefined, pinSalt: undefined, pinLen: undefined }); },
  isLocked() { return locked && pinSet(); },
  resetPinWithPhone() { return false; },
  setDarkBars(dark) { if (!!prefs().dark !== !!dark) setPrefs({ dark: !!dark }); if (win) win.setBackgroundColor(dark ? '#070708' : '#F4F7F9'); },
  setSecure(on) { setPrefs({ secure: !!on }); if (win) win.setContentProtection(!!on); },
  secureOn() { return !!prefs().secure; }
};

ipcMain.on('A', (e, name, args) => {
  try { const v = H[name] ? H[name](...(args || [])) : null; e.returnValue = v === undefined ? null : v; } catch (err) { e.returnValue = null; }
});
ipcMain.on('a', (e, name, args) => {
  try { const r = H[name] && H[name](...(args || [])); if (r && r.catch) r.catch(() => {}); } catch (err) {}
});

// ---------- pəncərə ----------
function lockNow() {
  if (!pinSet()) return;
  locked = true;
  js('window.showPinLock && window.showPinLock(false)');
}
let lastResume = 0;
function resumed() {
  if (locked && pinSet()) return js('window.showPinLock && window.showPinLock(false)');
  lastResume = Date.now();
  js('window.onAppResume && window.onAppResume()');
}
function showWin() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}
function createWindow() {
  win = new BrowserWindow({
    width: 440, height: 880, minWidth: 360, minHeight: 560, show: false, title: 'My Finance™', icon: ICON,
    backgroundColor: prefs().dark ? '#070708' : '#F4F7F9', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false }
  });
  win.removeMenu();
  win.setContentProtection(!!prefs().secure);
  win.on('page-title-updated', e => e.preventDefault());
  win.once('ready-to-show', () => { if (!hiddenStart) win.show(); });
  win.webContents.on('did-finish-load', () => {
    pageReady = true;
    js("window.addEventListener('online', () => window.onOnline && window.onOnline())"); // internet qayıdanda növbə dərhal gedir
    for (const c of pendingJs.splice(0)) js(c);
  });
  // WhatsApp, zəng və s. linklər kompüterin öz proqramında açılır
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url).catch(() => {}); } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (!url.startsWith('file:')) shell.openExternal(url).catch(() => {}); return { action: 'deny' }; });
  // Esc / siçanın «geri» düyməsi = telefondakı «geri»
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'Escape' || (i.alt && i.key === 'ArrowLeft')) js('window.onBack && window.onBack()');
    if ((i.control || i.meta) && ['r', 'R', 'w', 'W'].includes(i.key)) e.preventDefault();
    if (i.key === 'F5' || (i.control && i.shift && ['i', 'I'].includes(i.key))) e.preventDefault();
  });
  win.on('app-command', (e, cmd) => { if (cmd === 'browser-backward') js('window.onBack && window.onBack()'); });
  // kiçildəndə kod soruşulmur; bağlayanda (X) soruşulur. Hər ikisində göndərilməmiş dəyişiklik dərhal Google-a gedir
  win.on('minimize', () => js('window.onAppPause && window.onAppPause()'));
  win.on('hide', () => { js('window.onAppPause && window.onAppPause()'); lockNow(); });
  win.on('restore', resumed);
  win.on('show', resumed);
  win.on('focus', () => { if (Date.now() - lastResume > 60000) resumed(); });
  // bağla düyməsi proqramı arxaya göndərir: xatırlatmalar telefondakı kimi gəlməyə davam edir
  win.on('close', e => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!prefs().trayTold) { setPrefs({ trayTold: 1 }); notify('My Finance™', T.t('Proqram arxada işləyir — xatırlatmalar gələcək')); }
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
}
function buildTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: T.t('Aç'), click: showWin },
    { type: 'separator' },
    { label: T.t('Çıxış'), click: () => { quitting = true; js('window.onAppPause && window.onAppPause()'); setTimeout(() => app.quit(), 1500); } }
  ]));
}

// ---------- avtomatik yeniləmə (GitHub-dakı «pc» buraxılışı) ----------
function updater() {
  if (!app.isPackaged) return;
  let U;
  try { U = require('electron-updater').autoUpdater; } catch (e) { return; }
  U.autoDownload = true;
  U.autoInstallOnAppQuit = true;
  U.on('update-downloaded', async info => {
    let notes = info.releaseNotes || '';
    if (Array.isArray(notes)) notes = notes.map(n => n.note || '').join('\n');
    notes = String(notes).replace(/<[^>]+>/g, '').trim();
    const r = await dialog.showMessageBox(win && win.isVisible() ? win : null, {
      type: 'info', title: 'My Finance™', message: T.t('Yeni versiya hazırdır'),
      detail: ((notes ? T.t('Nə dəyişdi:') + '\n' + notes : '') + T.t('\n\nYükləndi. Quraşdırmaq üçün «Quraşdır» basın. Məlumatlarınız silinmir.')).trim(),
      buttons: [T.t('Quraşdır'), T.t('Sonra')], defaultId: 0, cancelId: 1, icon: ICON
    });
    if (r.response === 0) { quitting = true; setImmediate(() => U.quitAndInstall(true, true)); }
  });
  U.on('error', () => {});
  const check = () => U.checkForUpdates().catch(() => {});
  check();
  setInterval(check, 6 * 3600 * 1000);
}

app.on('second-instance', showWin);
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => {}); // pəncərə gizlənəndə proqram dayanmır
app.whenReady().then(() => {
  T.setLang(prefs().lang || 'az');
  G.setCanAsk(() => !!(win && win.isVisible() && win.isFocused()));
  createWindow();
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('My Finance™');
  tray.on('click', showWin);
  tray.on('double-click', showWin);
  buildTray();
  // kompüter açılanda proqram arxada başlayır (xatırlatmalar üçün)
  if (app.isPackaged && process.platform === 'win32') app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
  setInterval(tick, 30000);
  tick();
  // telefonda yazılanlar kompüterə gəlsin: hər 2 dəqiqədən bir Google-dakı ilə birləşdirilir
  setInterval(() => { if (!(locked && pinSet())) js('window.onPull && window.onPull()'); }, 120000);
  updater();
});
