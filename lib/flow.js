// Google Flow otomasyonu (kalibrasyon gerektirmez): gerçek arayüzdeki sabit etiketleri kullanır.
// Arayüz Türkçe ve İngilizce için tanımlıdır. Flow değişirse buradaki SEL tablosu güncellenir (yeni sürüm).
const fs = require('fs');
const path = require('path');
const browser = require('./browser');

const SITE = 'flow';
const HOME = 'https://flow.google.com/';

const SEL = {
  newProject: /Yeni proje|New project/i,
  promptBox: '[role="textbox"][contenteditable="true"], div[role="textbox"]',
  settings: 'button[aria-label*="tetikleyici" i], button[aria-label*="settings trigger" i]',
  generate: 'button[aria-label="Oluşturmaya başla"], button[aria-label*="Create" i][aria-label*="start" i], button:has-text("arrow_forward")',
  addMedia: 'button[aria-label="İçerik öğelerini istem kutusuna ekle"], button[aria-label*="add" i][aria-label*="prompt" i]',
  upload: /Medya yükle|Upload media/i,
  addToPrompt: /İsteme ekle|Add to prompt/i,
  image: /Resim|Image/i, video: /Video/i,
  ingredients: /İçerik öğeleri|Ingredients/i, frames: /Kareler|Frames/i
};

const ERR_RE = /(failed|couldn.t|could not|something went wrong|not allowed|policy|violat|blocked|başarısız|oluşturulamadı|ihlal|izin verilmiyor|engellendi|güvenlik)/i;
const CREDIT_RE = /(out of credits|not enough credits|yetersiz kredi|krediniz|kredi yetersiz|quota|kota)/i;

let session = { page: null, projectUrl: null };
const newSession = () => { session = { page: null, projectUrl: null }; };

const visible = (loc) => loc.filter({ visible: true });

async function ensureLoggedIn(page) {
  if (/accounts\.google\.com/.test(page.url())) {
    const e = new Error('Google hesabınızda oturum açık değil. Kurulum ekranından Flow\'a bağlanın.'); e.code = 'LOGIN'; throw e;
  }
}

// Ana sayfayı açar, giriş yapılmasını bekler (kullanıcı penceredeyse giriş yapabilir).
async function connect(log = () => {}, waitMs = 5 * 60 * 1000) {
  const page = await browser.getPage(SITE, HOME, { forceGoto: true });
  log('Chrome açıldı. Google hesabınızla giriş yapmanız gerekirse şimdi yapın...');
  const t0 = Date.now();
  while (Date.now() - t0 < waitMs) {
    await browser.sleep(1500);
    if (/accounts\.google\.com/.test(page.url())) continue;
    const ok = await visible(page.locator('button, a').filter({ hasText: SEL.newProject })).count().catch(() => 0);
    if (ok) return page;
  }
  throw new Error('Flow ana sayfası görünmedi. Giriş yaptığınızdan emin olun ve tekrar deneyin.');
}

async function openProject(log) {
  if (session.page && !session.page.isClosed() && session.projectUrl) return session.page;
  const page = await browser.getPage(SITE, HOME, { forceGoto: true });
  await browser.sleep(2500);
  await ensureLoggedIn(page);
  log('Flow: yeni proje açılıyor...');
  const btn = visible(page.locator('button').filter({ hasText: SEL.newProject })).first();
  await btn.waitFor({ timeout: 30000 }).catch(() => { const e = new Error('Flow\'da "Yeni proje" düğmesi bulunamadı. Flow arayüzü değişmiş olabilir; programı güncelleyin.'); e.code = 'UI_CHANGED'; throw e; });
  await btn.click();
  await page.waitForURL(/\/project\//, { timeout: 30000 });
  await page.locator(SEL.promptBox).first().waitFor({ state: 'visible', timeout: 30000 });
  session = { page, projectUrl: page.url() };
  return page;
}

async function openSettings(page) {
  const btn = visible(page.locator(SEL.settings)).first();
  await btn.waitFor({ timeout: 15000 });
  for (let i = 0; i < 3; i++) {
    await btn.click();
    try { await visible(page.locator('button[role="radio"]')).first().waitFor({ timeout: 4000 }); await browser.sleep(400); return; }
    catch (_) { await page.keyboard.press('Escape'); await browser.sleep(800); }
  }
  const e = new Error('Flow ayar menüsü açılmadı.'); e.code = 'UI_CHANGED'; throw e;
}

const radio = (page, rx) => visible(page.locator('button[role="radio"]').filter({ hasText: rx })).first();
async function pick(page, rx) {
  const r = radio(page, rx);
  if (await r.count()) { await r.click(); await browser.sleep(250); return true; }
  return false;
}

async function configure(page, { kind, aspect, useIngredients }) { // useIngredients=false -> Kareler (başlangıç karesi)
  await openSettings(page);
  await pick(page, kind === 'image' ? SEL.image : SEL.video);
  if (kind === 'video') await pick(page, useIngredients ? SEL.ingredients : SEL.frames);
  await pick(page, new RegExp(aspect.replace(':', ':')));
  if (kind === 'video') await pick(page, /720p/);
  await pick(page, /^\s*x1\s*$/);
  await page.keyboard.press('Escape');
  await browser.sleep(400);
}

const closeDialog = async (page) => {
  const k = visible(page.locator('button[aria-label="Kapat"], button[aria-label="Close"]')).first();
  if (await k.count()) await k.click().catch(() => {}); else await page.keyboard.press('Escape');
  await browser.sleep(500);
};

// Açık seçim penceresinde dosyayı yükler, hazır olunca seçer ve "İsteme ekle" der.
async function uploadAndAdd(page, file, log) {
  log('Flow: ' + path.basename(file) + ' yükleniyor...');
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 15000 }),
    visible(page.locator('button').filter({ hasText: SEL.upload })).first().click()
  ]);
  await fc.setFiles(file);
  const name = path.basename(file);
  const item = visible(page.locator('button[role="option"]').filter({ hasText: name })).first();
  await item.waitFor({ timeout: 30000 });
  // Yükleme bitince öğe adı "Yükleniyor X" -> "image X" -> "X" şeklinde değişir; sabitlenmesini bekle.
  const t0 = Date.now();
  let calm = 0;
  while (Date.now() - t0 < 90000) {
    const txt = ((await item.innerText({ timeout: 3000 }).catch(() => '')) || '').trim();
    if (txt && !/Yükleniyor|Uploading/i.test(txt) && !/^image\s/i.test(txt)) { if (++calm >= 2) break; } else calm = 0;
    await browser.sleep(800);
  }
  // Doğru öğenin seçili olduğundan emin ol. Başka öğe seçiliyse ona tıkla (zaten seçiliyse tıklama: kapanır).
  const isActive = () => item.evaluate((e) => e.getAttribute('aria-selected') === 'true' || e.classList.contains('asset-item-active'), { timeout: 3000 }).catch(() => false);
  if (!(await isActive())) {
    await item.click({ timeout: 8000 }).catch(() => {});
    await browser.sleep(900);
  }
  await visible(page.locator('button').filter({ hasText: SEL.addToPrompt })).first().click({ timeout: 15000 });
  await browser.sleep(800);
}

const AVATAR_TAB = (page) => visible(page.locator('mat-list-item').filter({ hasText: /Avatarlar|Avatars/i })).first();

// Flow hesabındaki avatarı isteme ekler. Avatar yoksa NO_AVATAR hatası verir.
async function addAvatar(page, log) {
  log('Flow: avatarınız ekleniyor...');
  await visible(page.locator(SEL.addMedia)).first().click();
  await browser.sleep(1000);
  const tab = AVATAR_TAB(page);
  if (!(await tab.count())) { await closeDialog(page); const e = new Error('Flow hesabınızda avatar bulunamadı.'); e.code = 'NO_AVATAR'; throw e; }
  await tab.click();
  await browser.sleep(1200);
  if (!(await visible(page.locator('button[role="option"]')).count())) { await closeDialog(page); const e = new Error('Flow hesabınızda avatar bulunamadı.'); e.code = 'NO_AVATAR'; throw e; }
  await visible(page.locator('button').filter({ hasText: SEL.addToPrompt })).first().click();
  await browser.sleep(800);
}

// Önceki üretimden kalan öğeleri (ingredient/başlangıç kareleri) temizler: yanlış referans kullanılmasın.
async function clearComposer(page) {
  const x = visible(page.locator('button[aria-label="İstemi temizle"], button[aria-label="Clear prompt"]')).first();
  if (await x.count()) { await x.click().catch(() => {}); await browser.sleep(700); }
}

async function attach(page, files, log) {
  for (const f of files) {
    if (f === 'flow:avatar') { await addAvatar(page, log); continue; }
    await visible(page.locator(SEL.addMedia)).first().click();
    await browser.sleep(1000);
    await uploadAndAdd(page, f, log);
  }
}

async function attachStartFrame(page, file, log) {
  const slot = visible(page.locator('button').filter({ hasText: /^\s*(Başlat|Start)\s*$/ })).first();
  await slot.waitFor({ timeout: 20000 }).catch(async () => {
    // Kareler modu seçilmemiş olabilir: ayarlardan tekrar seç
    await openSettings(page); await pick(page, SEL.frames); await page.keyboard.press('Escape'); await browser.sleep(800);
  });
  await slot.click({ timeout: 15000 });
  await browser.sleep(1000);
  await uploadAndAdd(page, file, log);
}

// Avatar kontrolü: avatar var mı, varsa önizlemesini kaydeder (sohbete tarif için).
async function checkAvatar(saveTo, log = () => {}) {
  const page = await openProject(log);
  await configure(page, { kind: 'video', aspect: '9:16', useIngredients: true });
  await clearComposer(page);
  await visible(page.locator(SEL.addMedia)).first().click();
  await browser.sleep(1000);
  const tab = AVATAR_TAB(page);
  if (!(await tab.count())) { await closeDialog(page); return { found: false }; }
  await tab.click();
  await browser.sleep(1500);
  if (!(await visible(page.locator('button[role="option"]')).count())) { await closeDialog(page); return { found: false }; }
  const src = await page.evaluate(() => {
    const im = [...document.querySelectorAll('img')].filter((m) => m.naturalWidth > 100 && m.getBoundingClientRect().width > 100)[0];
    return im ? im.src : null;
  });
  await closeDialog(page);
  if (src && src.startsWith('data:')) {
    fs.mkdirSync(path.dirname(saveTo), { recursive: true });
    fs.writeFileSync(saveTo, Buffer.from(src.split(',')[1], 'base64'));
    return { found: true, file: saveTo };
  }
  return { found: true, file: null };
}

const SNAP = `() => {
  const v = [...document.querySelectorAll('video')].map((x) => x.currentSrc || x.src).filter(Boolean);
  const i = [...document.querySelectorAll('img')].filter((m) => m.naturalWidth >= 300 && m.complete && /^https?:|^blob:/.test(m.src)).map((m) => m.src);
  return { v, i };
}`;
const ALERTS = `() => [...document.querySelectorAll('[role="alert"],[role="status"],snack-bar-container,simple-snack-bar,[class*="snack" i],[class*="toast" i]')].map((e) => (e.innerText || '').trim()).filter(Boolean).join(' | ').slice(0, 400)`;

async function download(page, url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let buf;
  if (/^blob:/.test(url)) {
    const b64 = await page.evaluate(async (u) => {
      const blob = await (await fetch(u)).blob();
      return await new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(',')[1]); f.onerror = rej; f.readAsDataURL(blob); });
    }, url);
    buf = Buffer.from(b64, 'base64');
  } else {
    const r = await page.context().request.get(url);
    if (!r.ok()) throw new Error('İndirme hatası ' + r.status());
    buf = await r.body();
  }
  if (/\.png$/i.test(dest) && !(buf[0] === 0x89 && buf[1] === 0x50)) { // webp/jpeg -> png
    const tmp = dest + '.tmp';
    fs.writeFileSync(tmp, buf);
    await require('./stitch').toPng(tmp, dest);
    fs.unlinkSync(tmp);
  } else fs.writeFileSync(dest, buf);
  return dest;
}

// kind: 'image' | 'video'; files: yüklenecek referans görseller
async function generate({ kind, prompt, files = [], startFrame = null, outFile, aspect, log = () => {}, timeout }) {
  const t = timeout || (kind === 'video' ? 12 * 60 * 1000 : 5 * 60 * 1000);
  const page = await openProject(log);
  aspect = aspect || '9:16';
  log(kind === 'video' ? 'Flow: video ayarları yapılıyor...' : 'Flow: görsel ayarları yapılıyor...');
  await configure(page, { kind, aspect, useIngredients: !startFrame });
  await clearComposer(page);
  if (startFrame) await attachStartFrame(page, startFrame, log);
  else if (files.length) await attach(page, files, log);
  const box = visible(page.locator(SEL.promptBox)).first();
  await box.click();
  await browser.sleep(300);
  await page.keyboard.insertText(prompt);
  await browser.jitter(400, 900);

  const snap = await page.evaluate(`(${SNAP})()`).catch(() => ({ v: [], i: [] }));
  const seen = new Set([...snap.v, ...snap.i]);
  const gen = visible(page.locator(SEL.generate)).first();
  await gen.click();
  log(kind === 'video' ? 'Flow: video üretiliyor (birkaç dakika sürebilir)...' : 'Flow: görsel üretiliyor...');

  const t0 = Date.now();
  let lastAlert = '';
  while (Date.now() - t0 < t) {
    await browser.sleep(4000);
    const now = await page.evaluate(`(${SNAP})()`).catch(() => ({ v: [], i: [] }));
    const fresh = (kind === 'video' ? now.v : now.i).filter((u) => !seen.has(u));
    if (fresh.length) {
      await browser.sleep(2500);
      const saved = await download(page, fresh[0], outFile);
      return { file: saved, url: fresh[0] };
    }
    if (Date.now() - t0 > 15000) {
      const a = await page.evaluate(`(${ALERTS})()`).catch(() => '');
      if (a && a !== lastAlert && (ERR_RE.test(a) || CREDIT_RE.test(a))) {
        const e = new Error('Flow hata verdi: ' + a);
        e.code = CREDIT_RE.test(a) ? 'NO_CREDIT' : 'REJECTED';
        throw e;
      }
      lastAlert = a;
    }
  }
  const e = new Error('Flow zaman aşımı: sonuç gelmedi.');
  e.code = 'TIMEOUT';
  throw e;
}

// Kurulum testi: yeni proje açıp tüm düğmelerin bulunduğunu doğrular (kredi harcamaz).
async function selfTest(log = () => {}) {
  newSession();
  const page = await openProject(log);
  await openSettings(page);
  const needed = { 'Resim': SEL.image, 'Video': SEL.video, '9:16': /9:16/ };
  for (const [name, rx] of Object.entries(needed)) {
    if (!(await radio(page, rx).count())) { const e = new Error(`Flow ayarlarında "${name}" seçeneği bulunamadı.`); e.code = 'UI_CHANGED'; throw e; }
  }
  await page.keyboard.press('Escape');
  if (!(await visible(page.locator(SEL.generate)).count())) { const e = new Error('Flow "Oluştur" düğmesi bulunamadı.'); e.code = 'UI_CHANGED'; throw e; }
  newSession();
  return true;
}

module.exports = { _t: { openProject: (l) => openProject(l), configure, attachStartFrame, attach, clear: clearComposer }, _download: download, SITE, HOME, connect, generate, newSession, selfTest, checkAvatar };
