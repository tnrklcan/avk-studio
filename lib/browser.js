// Tarayıcı otomasyonu: kullanıcının kendi Chrome/Edge'i + kalıcı profil (girişler hatırlanır).
// "Kalibrasyon": kullanıcı düğmelere bir kez tıklar, program düğmenin parmak izini hafızaya alır.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');
const store = require('./store');

let ctx = null;
const pages = {};
let pickResolver = null;
const bound = new WeakSet();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureContext() {
  if (ctx) {
    try { await ctx.pages(); return ctx; } catch (_) { ctx = null; }
  }
  const profile = path.join(store.dir(), 'browser-profile');
  fs.mkdirSync(profile, { recursive: true });
  const base = {
    headless: false,
    viewport: null,
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check', '--start-maximized'],
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
  if (!ctx) throw new Error('Chrome veya Edge bulunamadı. Lütfen Google Chrome kurun. (' + (lastErr && lastErr.message.split('\n')[0]) + ')');
  ctx.on('close', () => { ctx = null; for (const k of Object.keys(pages)) delete pages[k]; });
  return ctx;
}

async function closeBrowser() {
  if (ctx) { try { await ctx.close(); } catch (_) {} ctx = null; }
}

async function getPage(site, url) {
  const c = await ensureContext();
  let p = pages[site];
  if (!p || p.isClosed()) {
    p = c.pages().find((x) => !x.isClosed() && x.url() === 'about:blank') || (await c.newPage());
    pages[site] = p;
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  } else if (!p.url().startsWith(new URL(url).origin)) {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  }
  await p.bringToFront().catch(() => {});
  return p;
}

// ---------- parmak izi ----------
// Sayfa içinde çalışır: tıklanan elemandan bir tarif çıkarır.
const DESCRIBE_FN = `(el) => {
  const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
  const r = el.getBoundingClientRect();
  const dynId = (id) => !id || /\\d{3,}|[0-9a-f]{8,}|radix|:r/i.test(id);
  const cls = [...el.classList].filter((c) => !/\\d{3,}/.test(c)).slice(0, 8);
  return {
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role') || '',
    aria: el.getAttribute('aria-label') || '',
    testid: el.getAttribute('data-testid') || '',
    placeholder: el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || '',
    id: dynId(el.id) ? '' : el.id,
    type: el.getAttribute('type') || '',
    editable: el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT',
    text: clean(el.innerText),
    cls,
    cx: (r.left + r.width / 2) / window.innerWidth,
    cy: (r.top + r.height / 2) / window.innerHeight,
    w: r.width / window.innerWidth,
    h: r.height / window.innerHeight
  };
}`;

// Sayfa içinde çalışır: tarife en çok uyan görünür elemanı bulur (kendi kendini onaran eşleşme).
const FIND_FN = `(desc) => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
  const pool = new Set(document.querySelectorAll(desc.tag));
  if (desc.editable) document.querySelectorAll('[contenteditable="true"],textarea,input[type="text"],input:not([type])').forEach((e) => pool.add(e));
  let best = null, bestScore = 0;
  for (const e of pool) {
    if (!vis(e)) continue;
    let s = 0;
    if (desc.testid && e.getAttribute('data-testid') === desc.testid) s += 6;
    if (desc.aria && e.getAttribute('aria-label') === desc.aria) s += 5;
    if (desc.id && e.id === desc.id) s += 3;
    const ph = e.getAttribute('placeholder') || e.getAttribute('data-placeholder') || '';
    if (desc.placeholder && ph === desc.placeholder) s += 4;
    const t = clean(e.innerText);
    if (desc.text && t && t === desc.text) s += 4;
    else if (desc.text && t && (t.includes(desc.text) || desc.text.includes(t)) && t.length < 60) s += 1.5;
    if (desc.role && e.getAttribute('role') === desc.role) s += 1;
    if (desc.type && e.getAttribute('type') === desc.type) s += 0.5;
    if (desc.cls && desc.cls.length) { const c = [...e.classList]; s += 2 * desc.cls.filter((x) => c.includes(x)).length / desc.cls.length; }
    const r = e.getBoundingClientRect();
    const dx = (r.left + r.width / 2) / window.innerWidth - desc.cx, dy = (r.top + r.height / 2) / window.innerHeight - desc.cy;
    s += Math.max(0, 2 - Math.hypot(dx, dy) * 6);
    if (s > bestScore) { bestScore = s; best = e; }
  }
  return bestScore >= 4 ? best : null;
}`;

async function findEl(page, desc) {
  const h = await page.evaluateHandle(`(${FIND_FN})(${JSON.stringify(desc)})`);
  const el = h.asElement();
  if (!el) { await h.dispose(); return null; }
  return el;
}

async function resolveEl(page, site, step, { wait = 15000 } = {}) {
  const desc = store.getCalib(site, step);
  if (!desc) throw new Error(`Kalibrasyon eksik: ${site}/${step}`);
  const t0 = Date.now();
  while (Date.now() - t0 < wait) {
    const el = await findEl(page, desc);
    if (el) return el;
    await sleep(500);
  }
  const err = new Error(`"${step}" düğmesi bulunamadı (${site}). Site arayüzü değişmiş olabilir; Ayarlar'dan kalibrasyonu yenileyin.`);
  err.code = 'NEEDS_CALIBRATION';
  err.site = site; err.step = step;
  throw err;
}

// ---------- kalibrasyon ----------
const OVERLAY = `(() => {
  if (window.__avkOverlay) return; window.__avkOverlay = true;
  const bar = document.createElement('div');
  bar.id = '__avk_bar';
  bar.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483647;background:#1f1b18;color:#fff;font:600 15px system-ui,sans-serif;padding:12px 18px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35);border:2px solid #E87134;display:none;max-width:80vw;text-align:center;pointer-events:none';
  document.documentElement.appendChild(bar);
  const hi = document.createElement('div');
  hi.style.cssText = 'position:fixed;z-index:2147483646;border:3px solid #E87134;background:rgba(232,113,52,.15);pointer-events:none;display:none;border-radius:6px';
  document.documentElement.appendChild(hi);
  const txt = document.createElement('span'); bar.appendChild(txt);
  const btn = document.createElement('button');
  btn.textContent = 'Hazırım, seçmeye başla';
  btn.style.cssText = 'display:none;margin-left:14px;background:#E87134;color:#fff;border:0;border-radius:8px;padding:7px 12px;font:700 14px system-ui;cursor:pointer;pointer-events:auto';
  bar.appendChild(btn);
  btn.addEventListener('click', (e) => { e.stopPropagation(); window.__avkArmed = true; btn.style.display = 'none'; txt.textContent = window.__avkMsg + '  (şimdi tıklayın)'; }, true);
  window.__avkSet = (msg, ready) => { window.__avkMsg = msg; txt.textContent = msg; btn.style.display = ready ? 'inline-block' : 'none'; bar.style.display = msg ? 'block' : 'none'; if (!msg) hi.style.display = 'none'; };
  window.__avkArmed = false;
  const target = (e) => e.target && e.target.closest ? (e.target.closest('button,[role=button],a,input,textarea,[contenteditable="true"],[role=menuitem],[role=option],[role=tab],[role=radio]') || e.target) : e.target;
  document.addEventListener('mousemove', (e) => {
    if (!window.__avkArmed) return;
    const t = target(e); if (!t || t === document.body) return;
    const r = t.getBoundingClientRect();
    hi.style.display = 'block'; hi.style.left = r.left + 'px'; hi.style.top = r.top + 'px'; hi.style.width = r.width + 'px'; hi.style.height = r.height + 'px';
  }, true);
  const block = (e) => { if (window.__avkArmed && window.__avkBlock && !(e.target && e.target.tagName === 'BUTTON' && e.target.parentNode === bar)) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } };
  ['mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach((n) => document.addEventListener(n, block, true));
  document.addEventListener('click', (e) => {
    if (!window.__avkArmed) return;
    if (e.target && e.target.parentNode === bar) return;
    block(e);
    const t = target(e);
    window.__avkArmed = false;
    hi.style.display = 'none';
    window.__avkPick(JSON.stringify((${DESCRIBE_FN})(t)));
  }, true);
})();`;

// steps: [{key, label (Türkçe yönerge), optional}]
async function calibrate(site, url, steps, onProgress = () => {}) {
  const page = await getPage(site, url);
  if (!bound.has(page)) {
    await page.exposeBinding('__avkPick', (_s, json) => { if (pickResolver) pickResolver(JSON.parse(json)); });
    bound.add(page);
  }
  const install = () => page.evaluate(OVERLAY).catch(() => {});
  await install();
  const done = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    onProgress({ site, index: i, total: steps.length, step: s.key, label: s.label, state: 'waiting' });
    // Sayfa yönlenirse paneli yeniden kur
    await install();
    const desc = await new Promise((res, rej) => {
      const onClose = () => { clearTimeout(t); rej(new Error('Tarayıcı kapatıldı.')); };
      const t = setTimeout(() => { page.off('close', onClose); rej(new Error('Kalibrasyon zaman aşımı (10 dk).')); }, 10 * 60 * 1000);
      page.once('close', onClose);
      pickResolver = (d) => { clearTimeout(t); page.off('close', onClose); res(d); };
      page.evaluate(([m, ready, blk]) => { window.__avkBlock = blk; window.__avkSet(m, ready); window.__avkArmed = !ready; }, [`${i + 1}/${steps.length}  ${s.label}`, !!s.ready, !!s.block]).catch(rej);
    });
    store.setCalib(site, s.key, desc);
    done.push(s.key);
    onProgress({ site, index: i, total: steps.length, step: s.key, label: s.label, state: 'saved' });
    await sleep(300);
    if (s.after) { // Kullanıcıdan sonra gerçek tıklamayı kendisinin yapması gereken adımlar için bekleme
      await page.evaluate(([m]) => { window.__avkSet(m); }, [s.after]);
      await sleep(s.afterMs || 3000);
    }
  }
  await page.evaluate(() => window.__avkSet('Kalibrasyon tamam. Programa dönebilirsiniz.')).catch(() => {});
  await sleep(1500);
  await page.evaluate(() => window.__avkSet('')).catch(() => {});
  return done;
}

// ---------- eylemler ----------
async function clickStep(page, site, step, opts) {
  const el = await resolveEl(page, site, step, opts);
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(150 + Math.random() * 250);
  await el.click({ timeout: 10000 });
}

async function typeStep(page, site, step, text) {
  const el = await resolveEl(page, site, step);
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await el.click({ timeout: 10000 });
  await sleep(200);
  const tag = await el.evaluate((n) => n.tagName);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.press('Backspace');
  if (tag === 'TEXTAREA' || tag === 'INPUT') await el.fill(text);
  else await page.keyboard.insertText(text);
  await sleep(300);
}

// Dosya yükleme: sayfadaki gizli input[type=file] varsa doğrudan, yoksa kalibre edilmiş düğme + dosya penceresi.
async function uploadFiles(page, site, files, buttonStep) {
  if (!files || !files.length) return;
  let input = await page.$('input[type="file"]');
  if (!input && buttonStep && store.getCalib(site, buttonStep)) {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 15000 }),
      clickStep(page, site, buttonStep)
    ]);
    await chooser.setFiles(files);
    await sleep(2500);
    return;
  }
  if (!input) throw new Error('Dosya yükleme alanı bulunamadı.');
  await input.setInputFiles(files);
  await sleep(2500);
}

module.exports = { ensureContext, closeBrowser, getPage, calibrate, resolveEl, clickStep, typeStep, uploadFiles, sleep, findEl };
