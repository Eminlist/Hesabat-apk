'use strict';
// Səhifə (emin/assets — telefondakı ilə eyni kod) «Android» körpüsünü gözləyir. Kompüterdə onun əvəzi budur:
// hər çağırış proqramın əsas hissəsinə (main.js) gedir, cavab qaytaranlar gözləyərək (sendSync) işləyir.
const { contextBridge, ipcRenderer } = require('electron');

const SYNC = ['loadOld', 'load', 'save', 'needLink', 'syncLinked', 'summaryTime', 'dueTime', 'notifAllowed', 'queueState',
  'saveToDownloads', 'bioAvailable', 'bioEnabled', 'pinSet', 'pinLength', 'checkPin', 'pinBlob', 'isLocked', 'resetPinWithPhone', 'secureOn', 'isPc', 'helloAvailable', 'deviceName'];
const ASYNC = ['setLang', 'archiveOld', 'shareFile', 'importFile', 'pickContact', 'syncLink', 'syncUnlink', 'linkDone', 'syncStart',
  'syncUpload', 'pickPhoto', 'shareBase64', 'setSummaryTime', 'setSummary', 'setDueList', 'setDueTime', 'openNotifSettings',
  'setWidget', 'haptic', 'setBio', 'bioPrompt', 'setPin', 'setPinBlob', 'clearPin', 'resetPinWithGoogle', 'notifyNow', 'markUnlocked', 'lockNow', 'setDarkBars', 'updateShortcuts', 'setSecure', 'mailBase64'];

const api = {};
for (const n of SYNC) api[n] = (...a) => ipcRenderer.sendSync('A', n, a);
for (const n of ASYNC) api[n] = (...a) => { ipcRenderer.send('a', n, a); };

// telefondakı qısa bildiriş (Toast) — ekranın aşağısında bir neçə saniyəlik yazı
let box = null, timer = null;
api.toast = msg => {
  if (!document.body) return;
  if (!box) {
    box = document.createElement('div');
    box.setAttribute('style', 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);max-width:86%;z-index:2147483647;' +
      'background:rgba(32,33,36,.92);color:#fff;font:14px/1.4 "Segoe UI",system-ui,sans-serif;padding:10px 16px;border-radius:18px;' +
      'box-shadow:0 6px 24px rgba(0,0,0,.25);text-align:center;pointer-events:none;transition:opacity .25s;opacity:0');
    document.body.appendChild(box);
  }
  box.textContent = String(msg == null ? '' : msg);
  box.style.opacity = '1';
  clearTimeout(timer);
  timer = setTimeout(() => { box.style.opacity = '0'; }, 3500);
};

contextBridge.exposeInMainWorld('Android', api);
