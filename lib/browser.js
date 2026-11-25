// Tarayıcı otomasyonu: kullanıcının kendi Chrome/Edge'i + kalıcı profil (girişler hatırlanır).
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');
const store = require('./store');

let ctx = null;
let used = '';
const pages = {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (a = 250, b = 700) => sleep(a + Math.random() * (b - a));

// Tarayıcı sırası: kullanıcının Chrome'u, Edge'i, yoksa programın içindeki hazır Chromium.
// Her tarayıcı kendi profil klasörünü kullanır (sürümler birbirine karışmasın).
function bundledPath() {
  try {
    const p = chromium.executablePath();
    return p && fs.existsSync(p) ? p : null;
  } catch (_) { return null; }
}

async function ensureContext() {
  if (ctx) {
    try { await ctx.pages(); return ctx; } catch (_) { ctx = null; }
  }
  const base = {
    headless: false,
    viewport: null,
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check'],
    ignoreDefaultArgs: ['--enable-automation'],
    acceptDownloads: true
  };
  const profile = (name) => { const d = path.join(store.dir(), name); fs.mkdirSync(d, { recursive: true }); return d; };
  const order = [
    { name: 'browser-profile', opts: { channel: 'chrome' } },
    { name: 'browser-profile-edge', opts: { channel: 'msedge' } }
  ];
  const bp = bundledPath();
  if (bp) order.push({ name: 'browser-profile-bundled', opts: { executablePath: bp } });
  if (process.env.AVK_FORCE_BUNDLED && bp) order.splice(0, order.length - 1);
  let lastErr;
  for (const c of order) {
    try {
      ctx = await chromium.launchPersistentContext(profile(c.name), { ...base, ...c.opts });
      used = c.opts.channel === 'chrome' ? 'Chrome' : c.opts.channel === 'msedge' ? 'Edge' : 'Gömülü Chromium';
      break;
    } catch (e) { lastErr = e; }
  }
  if (!ctx) throw new Error('Tarayıcı açılamadı. AVK Sinema\'nın eski penceresi açık kalmış olabilir; kapatıp tekrar deneyin. (' + (lastErr && lastErr.message.split('\n')[0]) + ')');
  ctx.on('close', () => { ctx = null; for (const k of Object.keys(pages)) delete pages[k]; });
  return ctx;
}

async function closeBrowser() {
  if (ctx) { try { await ctx.close(); } catch (_) {} ctx = null; }
}

// Her site için tek sekme; gerekirse adrese götürür.
async function getPage(site, url, { forceGoto = false } = {}) {
  const c = await ensureContext();
  let p = pages[site];
  if (!p || p.isClosed()) {
    p = c.pages().find((x) => !x.isClosed() && (x.url() === 'about:blank' || x.url().startsWith('chrome://'))) || (await c.newPage());
    pages[site] = p;
    // Sitenin açtığı uyarı pencereleri otomasyonu sonsuza kadar kilitler; otomatik kapatılır.
    p.on('dialog', (d) => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {}));
    forceGoto = true;
  }
  if (forceGoto || !p.url().startsWith(new URL(url).origin)) {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  }
  await p.bringToFront().catch(() => {});
  return p;
}

const info = () => used || '(açılmadı)';

module.exports = { info, ensureContext, closeBrowser, getPage, sleep, jitter };
