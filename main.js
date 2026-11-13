const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const store = require('./lib/store');
const sb = require('./lib/supabase');
const browser = require('./lib/browser');
const chat = require('./lib/chat');
const flow = require('./lib/flow');
const T = require('./lib/templates');
const pipeline = require('./lib/pipeline');

let win = null;
const emit = (evt) => { if (win && !win.isDestroyed()) win.webContents.send('evt', evt); };
const log = (m) => emit({ type: 'log', message: m });

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 780, minWidth: 900, minHeight: 640,
    title: 'AVK Studio',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#FBF7F2',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  Menu.setApplicationMenu(null);
}

// ---------- güncelleme ----------
function cmpVer(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1; }
  return 0;
}

async function checkUpdate() {
  let repo = '';
  try { repo = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')).githubRepo; } catch (_) { return; }
  if (!repo || /BURAYA|YOUR/i.test(repo) || !app.isPackaged) return;
  if (process.platform === 'win32') {
    try {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.autoDownload = true;
      autoUpdater.on('update-available', (i) => emit({ type: 'update', state: 'downloading', version: i.version }));
      autoUpdater.on('update-downloaded', (i) => emit({ type: 'update', state: 'ready', version: i.version }));
      ipcMain.handle('install-update', () => autoUpdater.quitAndInstall());
      autoUpdater.checkForUpdates();
    } catch (_) { /* sessiz */ }
    return;
  }
  // macOS (imzasız uygulamada otomatik kurulum çalışmaz): yeni sürümü haber ver, indirme sayfasını aç
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { 'User-Agent': 'avk-studio' } });
    const j = await r.json();
    const v = (j.tag_name || '').replace(/^v/, '');
    if (v && cmpVer(v, app.getVersion()) > 0) emit({ type: 'update', state: 'manual', version: v, url: j.html_url });
  } catch (_) { /* sessiz */ }
}

// ---------- API ----------
const platform = () => (process.platform === 'darwin' ? 'mac' : 'win');
const providerOf = () => store.get('settings').provider || 'chatgpt';

function calibSpec(site) {
  if (site === 'flow') return { key: flow.SITE, url: flow.URL, steps: flow.STEPS };
  const s = chat.siteOf(site);
  return { key: s.key, url: s.url, steps: chat.STEPS };
}

async function flowSteps() {
  const remote = await sb.remoteConfig('flow_steps');
  return Array.isArray(remote) && remote.length ? remote : flow.STEPS;
}

const api = {
  'app.info': async () => ({
    version: app.getVersion(), platform: platform(), configured: sb.configured(), dev: sb.DEV,
    outputDir: pipeline.outputRoot(), provider: providerOf()
  }),

  // --- giriş ---
  'auth.restore': () => sb.restore(app.getVersion(), platform()),
  'auth.login': ({ email, password }) => sb.signIn(email, password, app.getVersion(), platform()),
  'auth.signup': ({ email, password }) => sb.firstSignup(email, password, app.getVersion(), platform()),
  'auth.logout': () => { sb.signOut(); return true; },

  // --- kurulum ---
  'setup.status': () => {
    const p = providerOf();
    const flowOk = flow.isCalibrated();
    const chatOk = chat.isCalibrated(p);
    const t = store.get('settings').tests || {};
    return {
      provider: p, flowCalibrated: flowOk, chatCalibrated: chatOk,
      flowTested: !!t.flow, chatTested: !!t[p],
      ready: flowOk && chatOk && !!t.flow && !!t[p]
    };
  },
  'setup.open': async ({ site }) => {
    const s = calibSpec(site);
    await browser.getPage(s.key, s.url);
    return true;
  },
  'setup.calibrate': async ({ site }) => {
    const s = calibSpec(site);
    const steps = site === 'flow' ? await flowSteps() : s.steps;
    await browser.calibrate(s.key, s.url, steps, (p) => emit({ type: 'calib', ...p }));
    const st = store.get('settings'); st.tests = { ...(st.tests || {}), [site]: false }; store.set('settings', st);
    return true;
  },
  'setup.reset': ({ site }) => {
    store.clearCalib(calibSpec(site).key);
    const st = store.get('settings'); st.tests = { ...(st.tests || {}), [site]: false }; store.set('settings', st);
    return true;
  },
  'setup.test': async ({ site }) => {
    const markOk = () => { const st = store.get('settings'); st.tests = { ...(st.tests || {}), [site]: true }; store.set('settings', st); };
    if (site === 'flow') {
      const s = calibSpec('flow');
      const page = await browser.getPage(s.key, s.url);
      await browser.sleep(3000);
      for (const k of ['promptBox', 'generate']) await browser.resolveEl(page, s.key, k, { wait: 8000 });
      markOk();
      return { ok: true, message: 'Google Flow düğmeleri bulundu.' };
    }
    const reply = await chat.ask(site, 'Reply with exactly: AVK_OK', [], { timeout: 90000, log });
    if (!/AVK_OK/i.test(reply)) throw new Error('Cevap okunamadı. Kalibrasyonu yenileyin.');
    markOk();
    return { ok: true, message: chat.siteOf(site).name + ' çalışıyor.' };
  },
  'settings.get': () => store.get('settings'),
  'settings.set': (patch) => {
    const st = { ...store.get('settings'), ...patch };
    store.set('settings', st);
    return st;
  },
  'settings.pickOutput': async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled) return null;
    const st = { ...store.get('settings'), outputDir: r.filePaths[0] }; store.set('settings', st);
    return r.filePaths[0];
  },

  // --- dosyalar ---
  'files.pick': async ({ multi }) => {
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile', ...(multi ? ['multiSelections'] : [])],
      filters: [{ name: 'Görseller', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    });
    if (r.canceled) return [];
    return r.filePaths.map((p) => ({ path: p, name: path.basename(p), dataUrl: dataUrl(p) }));
  },
  'files.dataUrl': ({ path: p }) => dataUrl(p),
  'files.reveal': ({ path: p }) => { shell.showItemInFolder(p); return true; },
  'files.openDir': ({ path: p }) => { shell.openPath(p); return true; },
  'files.csv': async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }] });
    if (r.canceled) return null;
    return fs.readFileSync(r.filePaths[0], 'utf8');
  },

  // --- üretim ---
  'project.create': ({ name }) => pipeline.projectDir(name),
  'chat.json': async ({ template, params, files }) => {
    if (!T[template]) throw new Error('Bilinmeyen kalıp: ' + template);
    return chat.askJson(providerOf(), T[template](params || {}), files || [], { log });
  },
  'flow.image': ({ prompt, files, dir, name }) => pipeline.makeImage({ prompt, files, dir, name, log, provider: providerOf() }),
  'flow.clips': async ({ clips, refs, chain, dir, title }) => {
    const res = await pipeline.runClips({
      clips, refs, chain, dir, title, provider: providerOf(), log,
      progress: (p) => emit({ type: 'clip', ...p })
    });
    store.addProject({ id: Date.now(), title, dir, final: res.final, date: new Date().toISOString() });
    return res;
  },
  'video.merge': ({ files, dir, title }) => pipeline.merge({ files, dir, title }),
  'job.cancel': () => { pipeline.cancel(); return true; },
  'projects.list': () => store.get('projects').filter((p) => fs.existsSync(p.final || p.dir)),

  // --- yönetici ---
  'admin.list': () => sb.rpc('admin_list'),
  'admin.import': ({ rows, deactivateMissing }) => sb.rpc('admin_import', { p_rows: rows, p_deactivate_missing: deactivateMissing }),
  'admin.setActive': ({ email, active }) => sb.rpc('admin_set_active', { p_email: email, p_active: active }),
  'admin.setConfig': ({ key, value }) => sb.rpc('admin_set_config', { p_key: key, p_value: value })
};

function dataUrl(p) {
  try {
    const ext = path.extname(p).slice(1).toLowerCase().replace('jpg', 'jpeg');
    const img = nativeImage.createFromPath(p);
    const size = img.getSize();
    const small = size.width > 900 ? img.resize({ width: 900 }) : img;
    return 'data:image/jpeg;base64,' + small.toJPEG(85).toString('base64');
  } catch (_) { return null; }
}

ipcMain.handle('api', async (_e, name, args) => {
  const fn = api[name];
  if (!fn) return { error: 'Bilinmeyen işlem: ' + name };
  try { return { data: await fn(args || {}) }; }
  catch (e) { return { error: e.message || String(e), code: e.code, site: e.site }; }
});

app.whenReady().then(() => {
  store.init(app.getPath('userData'));
  createWindow();
  setTimeout(checkUpdate, 4000);
  setInterval(checkUpdate, 4 * 3600 * 1000);
});
app.on('window-all-closed', async () => { await browser.closeBrowser(); app.quit(); });
module.exports = { getWin: () => win };
