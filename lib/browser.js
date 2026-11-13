// Tarayıcı otomasyonu: kullanıcının kendi Chrome/Edge'i + kalıcı profil (girişler hatırlanır).
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');
const store = require('./store');

let ctx = null;
const pages = {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (a = 250, b = 700) => sleep(a + Math.random() * (b - a));

async function ensureContext() {
  if (ctx) {
    try { await ctx.pages(); return ctx; } catch (_) { ctx = null; }
  }
  const profile = path.join(store.dir(), 'browser-profile');
  fs.mkdirSync(profile, { recursive: true });
  const base = {
    headless: false,
    viewport: null,
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check'],
    ignoreDefaultArgs: ['--enable-automation'],
    acceptDownloads: true
  };
  let lastErr;
  for (const channel of ['chrome', 'msedge']) {
    try {
      ctx = await chromium.launchPersistentContext(profile, { ...base, channel });
      break;
    } catch (e) { lastErr = e; }
  }
  if (!ctx) throw new Error('Chrome veya Edge bulunamadı ya da AVK Studio\'nun eski penceresi açık kalmış. Google Chrome kurun ve eski pencereleri kapatın. (' + (lastErr && lastErr.message.split('\n')[0]) + ')');
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
    forceGoto = true;
  }
  if (forceGoto || !p.url().startsWith(new URL(url).origin)) {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  }
  await p.bringToFront().catch(() => {});
  return p;
}

module.exports = { ensureContext, closeBrowser, getPage, sleep, jitter };
