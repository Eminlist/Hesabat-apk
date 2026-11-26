'use strict';
// Google sinxronu — telefondakı GoogleSync.java ilə eyni: Google Drive-ın gizli proqram qovluğunda (appDataFolder)
// bir JSON fayl. Telefon və kompüter eyni Google Cloud layihəsindədir («Hesabat»), ona görə eyni faylı görürlər.
// Kompüterdə hesab telefondakı kimi seçilə bilmir: giriş brauzerdə olur (Google-un «Desktop app» girişi).
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app, shell, net, safeStorage } = require('electron');
const T = require('./tr');

const FILE_NAME = 'MyFinance-sinxron.json';
const SCOPE = 'openid email https://www.googleapis.com/auth/drive.appdata';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

class SyncError extends Error {}
class HttpError extends Error {
  constructor(code, body) { super('HTTP ' + code); this.code = code; this.body = body || ''; }
}

let cfg = { clientId: '', clientSecret: '' };
try { cfg = Object.assign(cfg, JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'))); } catch (e) {}
const configured = () => !!(cfg.clientId && cfg.clientSecret);

// ---------- yadda saxlanan vəziyyət (hesab, ilk qoşulma, faylın id-si, giriş açarı) ----------
const stateFile = () => path.join(app.getPath('userData'), 'gsync.json');
let st = null;
function S() {
  if (st) return st;
  try { st = JSON.parse(fs.readFileSync(stateFile(), 'utf8')) || {}; } catch (e) { st = {}; }
  return st;
}
function put(obj) {
  st = Object.assign(S(), obj);
  for (const k of Object.keys(st)) if (st[k] === undefined) delete st[k];
  try { fs.writeFileSync(stateFile(), JSON.stringify(st)); } catch (e) {}
}
function setRefresh(tok) {
  if (!tok) return;
  let v;
  try { v = safeStorage.isEncryptionAvailable() ? 'e:' + safeStorage.encryptString(tok).toString('base64') : 'p:' + tok; } catch (e) { v = 'p:' + tok; }
  put({ refresh: v });
}
function getRefresh() {
  const v = S().refresh || '';
  try {
    if (v.startsWith('e:')) return safeStorage.decryptString(Buffer.from(v.slice(2), 'base64'));
    if (v.startsWith('p:')) return v.slice(2);
  } catch (e) {}
  return '';
}

const account = () => S().account || '';
const needLink = () => !!S().needLink;
const setNeedLink = on => put({ needLink: !!on });
function unlink() { st = {}; try { fs.unlinkSync(stateFile()); } catch (e) {} access = null; }

// ---------- brauzerdə giriş ----------
let access = null; // { token, exp }
let loginRunning = null;
const b64url = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function page(text) {
  return '<!doctype html><meta charset="utf-8"><title>My Finance™</title><body style="font-family:Segoe UI,Arial,sans-serif;background:#F4F7F9;display:flex;align-items:center;justify-content:center;height:90vh;margin:0">' +
    '<div style="background:#fff;border-radius:22px;padding:34px 40px;box-shadow:0 10px 40px rgba(0,0,0,.08);text-align:center;max-width:420px">' +
    '<div style="font-size:42px">✅</div><h2 style="margin:10px 0 6px;color:#0F766E">My Finance™</h2><p style="color:#334155;font-size:16px;line-height:1.5">' +
    text.replace(/[<>&]/g, '') + '</p></div></body>';
}

/** Brauzer açılır, istifadəçi Google hesabını seçir; nəticə: e-poçt ünvanı. */
function login(hint) {
  if (!configured()) return Promise.reject(new SyncError(T.t('Google girişi qurulmayıb (proqram Google Cloud-da qeyd olunmayıb)')));
  if (loginRunning) return loginRunning;
  loginRunning = new Promise((resolve, reject) => {
    const verifier = b64url(crypto.randomBytes(48));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const stateKey = b64url(crypto.randomBytes(16));
    let done = false;
    const server = http.createServer(async (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/' || !u.searchParams.has('state')) { res.writeHead(404); return res.end(); }
      if (u.searchParams.get('state') !== stateKey) { res.writeHead(400); return res.end(); }
      const code = u.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page(code ? T.t('Giriş tamamlandı. Bu pəncərəni bağlayıb My Finance™-ə qayıdın.') : T.t('Google icazəsi verilmədi — yenidən «Sinxron et» basın və icazə verin')));
      finish(async () => {
        if (!code) throw new SyncError(T.t('Google icazəsi verilmədi — yenidən «Sinxron et» basın və icazə verin'));
        const r = await tokenCall({ code, code_verifier: verifier, redirect_uri: redirect, grant_type: 'authorization_code' });
        if (!r.access_token) throw new SyncError(T.t('Google icazə vermədi'));
        if (!String(r.scope || '').includes('drive.appdata')) throw new SyncError(T.t('Google icazəsi verilmədi — yenidən «Sinxron et» basın və icazə verin'));
        access = { token: r.access_token, exp: Date.now() + ((r.expires_in || 3600) - 120) * 1000 };
        if (r.refresh_token) setRefresh(r.refresh_token);
        let email = '';
        try { email = JSON.parse(Buffer.from(r.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).email || ''; } catch (e) {}
        return email || hint || 'Google';
      });
    });
    let redirect = '';
    const timer = setTimeout(() => finish(async () => { throw new SyncError(T.t('Hesab seçilmədi')); }), 5 * 60 * 1000);
    function finish(fn) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      setTimeout(() => server.close(), 500);
      fn().then(v => { loginRunning = null; resolve(v); }, e => { loginRunning = null; reject(e); });
    }
    server.on('error', () => finish(async () => { throw new SyncError(T.t('Google hesabı seçmək mümkün olmadı')); }));
    server.listen(0, '127.0.0.1', () => {
      redirect = 'http://127.0.0.1:' + server.address().port;
      const q = new URLSearchParams({
        client_id: cfg.clientId, redirect_uri: redirect, response_type: 'code', scope: SCOPE,
        code_challenge: challenge, code_challenge_method: 'S256', state: stateKey, access_type: 'offline', prompt: 'consent select_account'
      });
      if (hint) q.set('login_hint', hint);
      shell.openExternal('https://accounts.google.com/o/oauth2/v2/auth?' + q.toString());
    });
  });
  return loginRunning;
}

async function tokenCall(params) {
  let res;
  try {
    res = await net.fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(Object.assign({ client_id: cfg.clientId, client_secret: cfg.clientSecret }, params)).toString()
    });
  } catch (e) { throw new SyncError(T.t('İnternet yoxdur')); }
  const body = await res.text();
  let j = {};
  try { j = JSON.parse(body); } catch (e) {}
  if (!res.ok) {
    if (j.error === 'invalid_grant') { const e = new SyncError(T.t('Google girişi alınmadı — hesabı yenidən seçin')); e.grant = true; throw e; }
    if (j.error === 'invalid_client' || j.error === 'unauthorized_client') throw new SyncError(T.t('Google girişi qurulmayıb (proqram Google Cloud-da qeyd olunmayıb)'));
    if (res.status >= 500 || res.status === 429) throw new SyncError(T.t('Google hazırda cavab vermir, bir az sonra yenə yoxlanacaq'));
    throw new SyncError(T.t('Google xətası: ') + (j.error_description || j.error || res.status));
  }
  return j;
}

/** Hesab seçilir (telefondakı «hesab seç» pəncərəsinin əvəzi). */
async function link() {
  const email = await login('');
  put({ account: email, needLink: true, fileId: undefined });
  return email;
}

// giriş açarının vaxtı keçibsə (məs. Google layihəsi «Testing» rejimindədirsə, 7 gündən bir), pəncərə açıq olanda brauzerdə yenidən soruşulur
let canAsk = () => false;
let lastAsk = 0;
async function token() {
  if (!account()) throw new SyncError(T.t('Google hesabı seçilməyib'));
  if (access && access.exp > Date.now()) return access.token;
  const rt = getRefresh();
  try {
    if (!rt) { const e = new SyncError(T.t('Google girişi alınmadı — hesabı yenidən seçin')); e.grant = true; throw e; }
    const r = await tokenCall({ refresh_token: rt, grant_type: 'refresh_token' });
    access = { token: r.access_token, exp: Date.now() + ((r.expires_in || 3600) - 120) * 1000 };
    if (r.refresh_token) setRefresh(r.refresh_token);
    return access.token;
  } catch (e) {
    if (!e.grant || !canAsk() || Date.now() - lastAsk < 10 * 60 * 1000) throw e;
    lastAsk = Date.now();
    await login(account());
    return access.token;
  }
}

async function call(method, url, tok, type, body) {
  let res;
  try {
    const h = { Authorization: 'Bearer ' + tok };
    if (type) h['Content-Type'] = type;
    res = await net.fetch(url, { method, headers: h, body: body || undefined });
  } catch (e) { throw new SyncError(T.t('İnternet yoxdur')); }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok) throw new HttpError(res.status, buf.toString('utf8'));
  return buf;
}

function explain(e) {
  if (!(e instanceof HttpError)) return e;
  const b = e.body;
  if (e.code === 401) return new SyncError(T.t('Google girişi alınmadı — hesabı yenidən seçin'));
  if (e.code === 403 && (b.includes('accessNotConfigured') || b.includes('SERVICE_DISABLED') || b.includes('has not been used'))) return new SyncError(T.t('Google Cloud-da “Google Drive API” aktiv edilməyib'));
  if (e.code === 403 && (b.includes('storageQuotaExceeded') || b.includes('quotaExceeded'))) return new SyncError(T.t('Google Drive-da yer qalmayıb'));
  if (e.code === 403) return new SyncError(T.t('Google icazə vermədi (403)'));
  if (e.code === 429 || e.code >= 500) return new SyncError(T.t('Google hazırda cavab vermir, bir az sonra yenə yoxlanacaq'));
  return new SyncError(T.t('Google xətası (') + e.code + ')');
}

async function withToken(fn) {
  let tok = await token();
  try { return await fn(tok); } catch (e) {
    if (!(e instanceof HttpError) || e.code !== 401) throw explain(e);
    access = null;
    tok = await token();
    try { return await fn(tok); } catch (e2) { throw explain(e2); }
  }
}

async function fileId(tok) {
  if (S().fileId) return S().fileId;
  const q = encodeURIComponent("name = '" + FILE_NAME + "' and trashed = false");
  const r = JSON.parse((await call('GET', API + '?spaces=appDataFolder&orderBy=modifiedTime%20desc&pageSize=10&fields=files(id)&q=' + q, tok)).toString('utf8'));
  if (!r.files || !r.files.length) return null;
  put({ fileId: r.files[0].id });
  return r.files[0].id;
}

/** Google-dakı nüsxə, yoxdursa "". */
function download() {
  return withToken(async tok => {
    let id = await fileId(tok);
    if (!id) return '';
    try { return (await call('GET', API + '/' + id + '?alt=media', tok)).toString('utf8').trim(); } catch (e) {
      if (!(e instanceof HttpError) || e.code !== 404) throw e;
      put({ fileId: undefined }); // Drive-da silinib: adı ilə yenidən axtarılır
      id = await fileId(tok);
      return id ? (await call('GET', API + '/' + id + '?alt=media', tok)).toString('utf8').trim() : '';
    }
  });
}

/** Google-dakı nüsxəni əvəz edir (ilk dəfə yaradır). */
function upload(json) {
  return withToken(async tok => {
    const data = Buffer.from(json, 'utf8');
    const id = await fileId(tok);
    if (id) {
      try { await call('PATCH', UPLOAD + '/' + id + '?uploadType=media', tok, 'application/json; charset=UTF-8', data); return; } catch (e) {
        if (!(e instanceof HttpError) || e.code !== 404) throw e;
        put({ fileId: undefined });
      }
    }
    const boundary = 'hesabat_' + crypto.randomBytes(8).toString('hex');
    const meta = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] });
    const body = Buffer.concat([
      Buffer.from('--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n', 'utf8'),
      data, Buffer.from('\r\n--' + boundary + '--\r\n', 'utf8')]);
    const r = JSON.parse((await call('POST', UPLOAD + '?uploadType=multipart&fields=id', tok, 'multipart/related; boundary=' + boundary, body)).toString('utf8'));
    if (r.id) put({ fileId: r.id });
  });
}

module.exports = { account, needLink, setNeedLink, link, unlink, download, upload, configured, setCanAsk: f => { canAsk = f; } };
