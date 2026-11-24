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

let session = { page: null, projectUrl: null, assets: {}, uploaded: {} };
const newSession = () => { session = { page: null, projectUrl: null, assets: {}, uploaded: {} }; };
const baseOf = (u) => String(u).split('=')[0];

const visible = (loc) => loc.filter({ visible: true });

async function ensureLoggedIn(page) {
  if (/accounts\.google\.com/.test(page.url())) {
    const e = new Error('Google hesabınızda oturum açık değil. Kurulum ekranından Flow\'a bağlanın.'); e.code = 'LOGIN'; throw e;
  }
}

// Ana sayfayı açar, giriş yapılmasını bekler (kullanıcı penceredeyse giriş yapabilir).
async function connect(log = () => {}, { waitMs = 3 * 60 * 1000, cancelled = () => false } = {}) {
  const page = await browser.getPage(SITE, HOME, { forceGoto: true });
  log('Tarayıcı açıldı (' + browser.info() + '). Google hesabınızla giriş yapmanız gerekirse şimdi yapın...');
  const t0 = Date.now();
  let helped = 0;
  while (Date.now() - t0 < waitMs) {
    await browser.sleep(1500);
    if (cancelled()) { const e = new Error('Durduruldu.'); e.code = 'CANCELLED'; throw e; }
    if (page.isClosed()) { const e = new Error('Tarayıcı penceresi kapandı. Pencereyi açık tutup tekrar deneyin.'); e.code = 'CLOSED'; throw e; }
    const onLogin = /accounts\.google\.com/.test(page.url());
    if (!onLogin) {
      const ok = await visible(page.locator('button, a').filter({ hasText: SEL.newProject })).count().catch(() => 0);
      if (ok) return page;
    }
    const sec = Math.round((Date.now() - t0) / 1000);
    if (sec >= 45 && helped < 1) { helped = 1; log(onLogin ? 'Hâlâ Google giriş sayfasındasınız. Açılan pencerede e-posta ve şifrenizi girin.' : 'Flow sayfası açık ama "Yeni proje" düğmesi görünmüyor. Pencerede giriş yaptığınızdan ve Flow ana sayfasının açıldığından emin olun.'); }
    if (sec >= 120 && helped < 2) { helped = 2; log('Sayfa: ' + String(page.url()).slice(0, 80) + ' — Giriş olmuyorsa "Vazgeç" deyip Chrome kurun/güncelleyin ve tekrar deneyin.'); }
  }
  const e = new Error('Flow ana sayfası görünmedi (sayfa: ' + String(page.url()).slice(0, 100) + '). Giriş yaptığınızdan emin olun ve tekrar deneyin.');
  e.code = 'LOGIN_TIMEOUT'; throw e;
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
  session = { page, projectUrl: page.url(), assets: {}, uploaded: {} };
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

// Süre kaydırıcısı: değer = saniye - 3 (5 -> 8 sn, 12 -> 15 sn).
async function setDuration(page, seconds) {
  const v = Math.max(1, Math.min(12, Math.round(seconds) - 3));
  await page.evaluate((val) => {
    const i = document.querySelector('input[type="range"]');
    if (!i) return;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(i, String(val));
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new Event('change', { bubbles: true }));
  }, v);
  await browser.sleep(500);
}

const radio = (page, rx) => visible(page.locator('button[role="radio"]').filter({ hasText: rx })).first();
async function pick(page, rx) {
  const r = radio(page, rx);
  if (await r.count()) { await r.click(); await browser.sleep(250); return true; }
  return false;
}

async function configure(page, { kind, aspect, useIngredients, seconds }) { // useIngredients=false -> Kareler (başlangıç karesi)
  await openSettings(page);
  await pick(page, kind === 'image' ? SEL.image : SEL.video);
  if (kind === 'video') await pick(page, useIngredients ? SEL.ingredients : SEL.frames);
  await pick(page, new RegExp(aspect.replace(':', ':')));
  if (kind === 'video') await pick(page, /720p/);
  await pick(page, /^\s*x1\s*$/);
  if (kind === 'video') await setDuration(page, seconds || 8);
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
  session.uploaded[file] = name; // aynı görsel sonraki üretimlerde yeniden yüklenmeden seçilir
}

// Daha önce bu projeye yüklenmiş referans görseli "Yüklemeler"den seçip isteme ekler (tekrar yüklemez).
async function addUploaded(page, file, log) {
  const name = session.uploaded[file];
  if (!name) return false;
  // Aynı adlı iki farklı dosya karışmasın
  if (Object.entries(session.uploaded).some(([f, n]) => f !== file && n === name)) return false;
  log('Flow: ' + name + ' zaten yüklü, tekrar yüklenmeden seçiliyor...');
  const tab = visible(page.locator('mat-list-item').filter({ hasText: /Yüklemeler|Uploads/i })).first();
  if (await tab.count()) { await tab.click(); await browser.sleep(1000); }
  const item = visible(page.locator('button[role="option"]').filter({ hasText: name })).first();
  try { await item.waitFor({ timeout: 8000 }); } catch (_) { return false; }
  const isActive = () => item.evaluate((e) => e.getAttribute('aria-selected') === 'true' || e.classList.contains('asset-item-active'), { timeout: 3000 }).catch(() => false);
  if (!(await isActive())) { await item.click({ timeout: 8000 }); await browser.sleep(900); }
  await visible(page.locator('button').filter({ hasText: SEL.addToPrompt })).first().click({ timeout: 15000 });
  await browser.sleep(800);
  return true;
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

// Flow'da zaten üretilmiş görseli kütüphaneden seçip isteme ekler (indirip tekrar yüklemeden).
async function addFromLibrary(page, base, log, label) {
  log('Flow: ' + (label || 'görsel') + ' Flow kütüphanesinden ekleniyor...');
  const tab = visible(page.locator('mat-list-item').filter({ hasText: /Resimler|Images/i })).first();
  if (await tab.count()) { await tab.click(); await browser.sleep(1000); }
  const key = base.slice(0, 120);
  const item = visible(page.locator('button[role="option"]').filter({ has: page.locator(`img[src*="${key}"]`) })).first();
  try { await item.waitFor({ timeout: 12000 }); } catch (_) { return false; }
  const isActive = () => item.evaluate((e) => e.getAttribute('aria-selected') === 'true' || e.classList.contains('asset-item-active'), { timeout: 3000 }).catch(() => false);
  // Bu penceredeki seçim bazen başka öğede başlar; hedefe tıklayıp seçili olduğunu doğrula
  if (!(await isActive())) { await item.click({ timeout: 8000 }); await browser.sleep(900); }
  await visible(page.locator('button').filter({ hasText: SEL.addToPrompt })).first().click({ timeout: 15000 });
  await browser.sleep(800);
  return true;
}

async function attach(page, files, log) {
  for (const f of files) {
    if (f === 'flow:avatar') { await addAvatar(page, log); continue; }
    await visible(page.locator(SEL.addMedia)).first().click();
    await browser.sleep(1000);
    const base = session.assets[f];
    if (base && (await addFromLibrary(page, base, log, path.basename(f)))) continue;
    if (await addUploaded(page, f, log)) continue;
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
  const i = [...document.querySelectorAll('img')].filter((m) => m.naturalWidth >= 256 && m.complete && /^https?:|^blob:|^data:image/.test(m.src)).map((m) => m.src);
  return { v, i };
}`;
const ALERTS = `() => [...document.querySelectorAll('[role="alert"],[role="status"],snack-bar-container,simple-snack-bar,[class*="snack" i],[class*="toast" i]')].map((e) => (e.innerText || '').trim()).filter(Boolean).join(' | ').slice(0, 400)`;

async function download(page, url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let buf;
  if (/^data:image/.test(url)) {
    buf = Buffer.from(url.split(',')[1], 'base64');
  } else if (/^blob:/.test(url)) {
    const b64 = await page.evaluate(async (u) => {
      const blob = await (await fetch(u)).blob();
      return await new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(',')[1]); f.onerror = rej; f.readAsDataURL(blob); });
    }, url);
    buf = Buffer.from(b64, 'base64');
  } else {
    let r = await page.context().request.get(url).catch(() => null);
    if (r && r.ok()) buf = await r.body();
    else { // yedek: sayfanın kendi oturumuyla (çerezlerle) indir
      const b64 = await page.evaluate(async (u) => {
        const resp = await fetch(u, { credentials: 'include' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const blob = await resp.blob();
        return await new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(',')[1]); f.onerror = rej; f.readAsDataURL(blob); });
      }, url).catch((err) => { throw new Error('İndirme hatası ' + (r ? r.status() : String(err.message).slice(0, 80))); });
      buf = Buffer.from(b64, 'base64');
    }
  }
  if (/\.png$/i.test(dest) && !(buf[0] === 0x89 && buf[1] === 0x50)) { // webp/jpeg -> png
    const tmp = dest + '.tmp';
    fs.writeFileSync(tmp, buf);
    await require('./stitch').toPng(tmp, dest);
    fs.unlinkSync(tmp);
  } else fs.writeFileSync(dest, buf);
  return dest;
}

// ---- Video yakalama ----
// Flow ızgarasında videolar <video> değil, küçük resimli "flow-video-tile" olarak durur.
// Yeni biten video = daha önce görülmeyen ve %ilerleme yazısı olmayan kare. Sonra karoya tıklanıp
// "Medyayı indir > 720p Orijinal boyut" ile (kredi harcamadan) indirilir.
const normSrc = (u) => String(u || '').split('=')[0];
function tilesSnapshot() {
  return [...document.querySelectorAll('flow-video-tile')].map((t) => { const im = t.querySelector('img.thumbnail'); return im ? im.src : ''; }).filter(Boolean);
}
function markFreshTile(seenArr) {
  const seen = new Set(seenArr);
  document.querySelectorAll('[data-avk-new]').forEach((e) => e.removeAttribute('data-avk-new'));
  for (const t of document.querySelectorAll('flow-video-tile')) {
    const im = t.querySelector('img.thumbnail');
    if (!im || !im.src || seen.has(im.src.split('=')[0])) continue;
    if (/%\s*\d+/.test(t.innerText || '')) continue; // hâlâ üretiliyor
    if (!(im.complete && im.naturalWidth > 20)) continue;
    t.setAttribute('data-avk-new', '1');
    return im.src;
  }
  return null;
}

async function backToProject(page) {
  if (!/\/edit\//.test(page.url())) return;
  await page.goto(session.projectUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.locator(SEL.promptBox).first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
}

async function downloadVideoViaUi(page, dest, log) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tile = page.locator('[data-avk-new="1"]').first();
  await tile.scrollIntoViewIfNeeded().catch(() => {});
  await tile.click({ timeout: 15000 });
  await page.waitForURL(/\/edit\//, { timeout: 20000 });
  await browser.sleep(2500);
  let got = null;
  const onDl = (d) => { got = d; };
  page.on('download', onDl);
  try {
    const dl = visible(page.locator('button[aria-label="Medyayı indir"], button[aria-label="Download media"], button[aria-label*="indir" i]')).first();
    await dl.waitFor({ timeout: 20000 });
    await dl.click();
    // Menü açılırsa 720p (orijinal, ücretsiz) seçilir. Yükseltilmiş seçenekler kredi harcar, onlara dokunulmaz.
    const item = visible(page.locator('[role="menuitem"]').filter({ hasText: /720p/ })).first();
    if (await item.waitFor({ timeout: 5000 }).then(() => true).catch(() => false)) await item.click({ timeout: 10000 });
    const t0 = Date.now();
    while (!got && Date.now() - t0 < 90000) await browser.sleep(500);
    if (!got) throw new Error('Video indirilemedi.');
    await got.saveAs(dest);
  } finally { page.off('download', onDl); }
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 10000) throw new Error('İndirilen video dosyası bozuk görünüyor.');
  return dest;
}

// kind: 'image' | 'video'; files: yüklenecek referans görseller
async function generate({ kind, prompt, files = [], startFrame = null, outFile, aspect, seconds, log = () => {}, timeout }) {
  const t = timeout || (kind === 'video' ? 12 * 60 * 1000 : 5 * 60 * 1000);
  const page = await openProject(log);
  aspect = aspect || '9:16';
  log(kind === 'video' ? 'Flow: video ayarları yapılıyor...' : 'Flow: görsel ayarları yapılıyor...');
  await configure(page, { kind, aspect, useIngredients: !startFrame, seconds });
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
  const seenBase = new Set(snap.i.map((u) => baseOf(u).slice(0, 300)));
  const seenTiles = kind === 'video' ? (await page.evaluate(tilesSnapshot).catch(() => [])).map(normSrc) : [];
  const gen = visible(page.locator(SEL.generate)).first();
  await gen.click();
  log(kind === 'video' ? 'Flow: video üretiliyor (birkaç dakika sürebilir)...' : 'Flow: görsel üretiliyor...');

  const t0 = Date.now();
  let lastAlert = '';
  let videoSeenAt = 0, badUrls = new Set(), dlTries = 0;
  while (Date.now() - t0 < t) {
    await browser.sleep(4000);
    if (kind === 'video') {
      // 1) Asıl yol: biten video karosunu bul, arayüzden indir
      const tileSrc = await page.evaluate(markFreshTile, seenTiles).catch(() => null);
      if (tileSrc) {
        await browser.sleep(3000);
        try {
          log('Flow: video hazır, indiriliyor...');
          await downloadVideoViaUi(page, outFile, log);
          await backToProject(page);
          return { file: outFile, url: tileSrc };
        } catch (err) {
          dlTries++;
          await backToProject(page);
          if (dlTries >= 3) { const e = new Error('Video Flow\'da hazır ama bilgisayara indirilemedi. Videoyu Flow\'dan elle indirebilirsiniz. (' + String(err.message).split('\n')[0] + ')'); e.code = 'DOWNLOAD'; throw e; }
          log('İndirme tekrar deneniyor (' + dlTries + '/3)...');
          await browser.sleep(4000);
          continue;
        }
      }
      // 2) Yedek yol: eski usul <video> adresi (karo bulunamazsa)
      const now = await page.evaluate(`(${SNAP})()`).catch(() => ({ v: [], i: [] }));
      const fv = now.v.filter((u) => !seen.has(u) && !badUrls.has(u));
      if (fv.length) {
        if (!videoSeenAt) videoSeenAt = Date.now();
        if (Date.now() - videoSeenAt > 30000) {
          try { await browser.sleep(1500); const saved = await download(page, fv[0], outFile); return { file: saved, url: fv[0] }; }
          catch (_) { badUrls.add(fv[0]); videoSeenAt = 0; }
        }
      }
    } else {
      const now = await page.evaluate(`(${SNAP})()`).catch(() => ({ v: [], i: [] }));
      const fresh = now.i.filter((u) => !seen.has(u) && !seenBase.has(baseOf(u).slice(0, 300)));
      if (fresh.length) {
        await browser.sleep(2500);
        const saved = await download(page, fresh[0], outFile);
        session.assets[saved] = baseOf(fresh[0]);
        return { file: saved, url: fresh[0] };
      }
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
  try {
    const fin = await page.evaluate(`(${SNAP})()`);
    log('Teşhis: sayfada ' + fin.i.length + ' görsel, ' + fin.v.length + ' video; yeni sayılan: ' + fin.i.filter((u) => !seen.has(u)).length);
  } catch (_) {}
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

module.exports = { _t: { openProject: (l) => openProject(l), configure, attachStartFrame, attach, clear: clearComposer, markFreshTile, tilesSnapshot, downloadVideoViaUi, addUploaded, session: () => session }, _download: download, SITE, HOME, connect, generate, newSession, selfTest, checkAvatar };
