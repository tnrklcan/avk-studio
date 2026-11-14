const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, Menu, Notification } = require('electron');
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
app.setName('AVK Sinema');
// Oturum/giriş bilgileri eski klasörde kalsın (ad değişse de yeniden giriş gerekmesin)
if (!process.env.AVK_TEST) app.setPath('userData', path.join(app.getPath('appData'), 'AVK Studio'));
const emit = (evt) => { if (win && !win.isDestroyed()) win.webContents.send('evt', evt); };
const log = (m) => emit({ type: 'log', message: m });

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 780, minWidth: 900, minHeight: 640,
    title: 'AVK Sinema',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#FBF7F2',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, autoplayPolicy: 'no-user-gesture-required' }
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

  // --- kurulum (kalibrasyon gerekmez: otomatik bağlan + test) ---
  'setup.status': () => {
    const p = providerOf();
    const t = store.get('settings').tests || {};
    return { provider: p, flowTested: !!t.flow, chatTested: !!t[p], ready: !!t.flow && !!t[p] };
  },
  'setup.connect': async ({ site }) => {
    const mark = (v) => { const st = store.get('settings'); st.tests = { ...(st.tests || {}), [site]: v }; store.set('settings', st); };
    mark(false);
    if (site === 'flow') {
      await flow.connect(log);
      log('Flow düğmeleri kontrol ediliyor...');
      await flow.selfTest(log);
      mark(true);
      return { message: 'Google Flow hazır.' };
    }
    log('Sohbet test ediliyor...');
    await chat.selfTest(site, log);
    mark(true);
    return { message: chat.siteOf(site).name + ' hazır.' };
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
  'task.start': () => { flow.newSession(); chat.resetTask(); return true; },
  'project.create': ({ name }) => pipeline.projectDir(name),
  'flow.checkAvatar': ({ dir }) => flow.checkAvatar(path.join(dir, 'avatar.png'), log),
  'notify': ({ title, body }) => {
    if (Notification.isSupported() && win && !win.isFocused()) new Notification({ title, body, silent: false }).show();
    return true;
  },
  'projects.delete': ({ id }) => pipeline.deleteProject(id),
  'projects.deleteAll': () => pipeline.deleteAll(),
  'chat.json': async ({ template, params, files }) => {
    if (!T[template]) throw new Error('Bilinmeyen kalıp: ' + template);
    return chat.askJson(providerOf(), T[template](params || {}), files || [], { log });
  },
  'flow.image': ({ prompt, files, dir, name, aspect }) => pipeline.makeImage({ prompt, files, dir, name, aspect, log, provider: providerOf() }),
  'flow.clips': async ({ clips, refs, chain, startFrame, seconds, aspect, dir, title }) => {
    const res = await pipeline.runClips({
      clips, refs, chain, startFrame, seconds, aspect, dir, title, provider: providerOf(), log,
      progress: (p) => emit({ type: 'clip', ...p })
    });
    const old = (store.get('projects') || []).find((x) => x.id === dir);
    const parts = [...((old && old.parts) || []), ...res.clips];
    if (!store.updateProject(dir, { title, final: res.final, parts, date: new Date().toISOString() })) store.addProject({ id: dir, title, dir, final: res.final, parts, date: new Date().toISOString() });
    return res;
  },
  'video.lastFrame': async ({ file, dir }) => require('./lib/stitch').lastFrame(file, path.join(dir, `son-kare-${Date.now().toString(36)}.jpg`)),
  'video.render': async ({ files, title, smooth }) => {
    const missing = files.filter((f) => !fs.existsSync(f));
    if (missing.length) throw new Error('Bazı video dosyaları bulunamadı (silinmiş olabilir).');
    const dir = pipeline.projectDir('Render ' + (title || 'Film'));
    const out = path.join(dir, `${(title || 'Film').replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'Film'}-render.mp4`);
    log(`${files.length} video birleştiriliyor (${smooth === false ? 'düz kesme' : 'yumuşak geçiş'})...`);
    await require('./lib/stitch').render(files, out, { smooth: smooth !== false });
    store.updateProject(dir, { title: (title || 'Film') + ' (render)', final: out, parts: [out], date: new Date().toISOString() });
    return out;
  },
  'video.merge': ({ files, dir, title }) => pipeline.merge({ files, dir, title }),
  'job.cancel': () => { pipeline.cancel(); return true; },
  'projects.list': () => store.get('projects').filter((p) => p.final && fs.existsSync(p.final)),

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
  if (process.platform === 'darwin' && app.dock) { try { app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png')); } catch (_) { /* sessiz */ } }
  createWindow();
  setTimeout(checkUpdate, 4000);
  setInterval(checkUpdate, 4 * 3600 * 1000);
});
app.on('window-all-closed', async () => { await browser.closeBrowser(); app.quit(); });
module.exports = { getWin: () => win };
