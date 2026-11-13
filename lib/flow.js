// Google Flow otomasyonu: görsel ve video üretir, sonucu bilgisayara indirir.
const fs = require('fs');
const path = require('path');
const browser = require('./browser');
const store = require('./store');

const SITE = 'flow';
const URL = 'https://labs.google/fx/tools/flow';

// Kalibrasyon adımları. İsterseniz uzaktan ayar (remote_config 'flow_steps') ile değiştirilebilir.
const STEPS = [
  { key: 'promptBox', label: 'İstem (prompt) yazma kutusuna tıklayın.' },
  { key: 'modeMenu', label: 'Görsel / Video türünü seçtiğiniz kutuya veya menüye tıklayın.' },
  { key: 'optionImage', label: 'Açılan menüde GÖRSEL oluşturma seçeneğine tıklayın.' },
  { key: 'modeMenuV', label: 'Menüyü yeniden açıp (aynı kutuya tıklayın) kaydedin.' },
  { key: 'optionVideo', label: 'Şimdi VİDEO oluşturma seçeneğine tıklayın.' },
  { key: 'aspectMenu', label: 'En-boy oranı (ör. 16:9) kutusuna tıklayın.' },
  { key: 'aspect916', label: 'Açılan listede 9:16 (dikey) seçeneğine tıklayın.' },
  { key: 'addMedia', label: 'Görsel eklemek için + / yükle düğmesine tıklayın. Dosya penceresi açılırsa İptal deyin.' },
  { key: 'generate', label: 'Oluştur (ok) düğmesine tıklayın. Bu adımda tıklama gerçekten yapılmaz.', block: true }
];

const isCalibrated = (steps = STEPS) => store.calibDone(SITE, steps.map((s) => s.key));

const ERR_RE = /(failed|couldn.t|could not|something went wrong|not allowed|policy|violat|blocked|başarısız|oluşturulamadı|ihlal|izin verilmiyor|engellendi)/i;
const CREDIT_RE = /(out of credits|not enough credits|credit|quota|daily limit|kredi|kota|limit)/i;

const MEDIA_SNAPSHOT = `() => {
  const out = { v: [], i: [] };
  document.querySelectorAll('video').forEach((v) => { const s = v.currentSrc || v.src; if (s && (v.duration > 1 || v.readyState >= 1)) out.v.push(s); });
  document.querySelectorAll('img').forEach((m) => { if (m.src && m.naturalWidth >= 400 && m.complete) out.i.push(m.src); });
  return out;
}`;

const ALERT_TEXT = `() => [...document.querySelectorAll('[role="alert"],[role="status"],[class*="toast" i],[class*="snack" i],[class*="error" i]')]
  .map((e) => (e.innerText || '').trim()).filter(Boolean).join(' | ').slice(0, 400)`;

async function snapshot(page) {
  return page.evaluate(`(${MEDIA_SNAPSHOT})()`).catch(() => ({ v: [], i: [] }));
}

async function download(page, url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const b64 = await page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: 'include' });
    if (!r.ok) throw new Error('indirme ' + r.status);
    const blob = await r.blob();
    return await new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(',')[1]); f.onerror = rej; f.readAsDataURL(blob); });
  }, url);
  fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
  return dest;
}

async function setMode(page, kind) {
  // kind: 'image' | 'video'
  try {
    await browser.clickStep(page, SITE, kind === 'image' ? 'modeMenu' : 'modeMenuV', { wait: 6000 });
    await browser.sleep(500);
    await browser.clickStep(page, SITE, kind === 'image' ? 'optionImage' : 'optionVideo', { wait: 6000 });
    await browser.sleep(500);
  } catch (e) { if (e.code !== 'NEEDS_CALIBRATION') throw e; throw e; }
  try {
    await browser.clickStep(page, SITE, 'aspectMenu', { wait: 4000 });
    await browser.sleep(400);
    await browser.clickStep(page, SITE, 'aspect916', { wait: 4000 });
    await browser.sleep(400);
  } catch (_) { /* oran zaten doğru olabilir */ }
}

async function generate({ kind, prompt, files = [], outFile, log = () => {}, timeout }) {
  const t = timeout || (kind === 'video' ? 12 * 60 * 1000 : 4 * 60 * 1000);
  const page = await browser.getPage(SITE, URL);
  await browser.sleep(1500);
  log(kind === 'video' ? 'Flow: video moduna geçiliyor...' : 'Flow: görsel moduna geçiliyor...');
  await setMode(page, kind);
  if (files.length) {
    log('Flow: referans görseller yükleniyor...');
    await browser.uploadFiles(page, SITE, files, 'addMedia');
  }
  await browser.typeStep(page, SITE, 'promptBox', prompt);
  const snap = await snapshot(page);
  const seen = new Set([...snap.v, ...snap.i]);
  await browser.clickStep(page, SITE, 'generate');
  log(kind === 'video' ? 'Flow: video üretiliyor (birkaç dakika sürebilir)...' : 'Flow: görsel üretiliyor...');

  const t0 = Date.now();
  let lastAlert = '';
  while (Date.now() - t0 < t) {
    await browser.sleep(4000);
    const now = await snapshot(page);
    const fresh = (kind === 'video' ? now.v : now.i).filter((u) => !seen.has(u));
    if (fresh.length) {
      await browser.sleep(2500); // dosyanın tam oturması için
      const saved = await download(page, fresh[0], outFile);
      return { file: saved, url: fresh[0] };
    }
    if (Date.now() - t0 > 20000) {
      const a = await page.evaluate(`(${ALERT_TEXT})()`).catch(() => '');
      if (a && a !== lastAlert && ERR_RE.test(a)) {
        const e = new Error('Flow hata verdi: ' + a);
        e.code = CREDIT_RE.test(a) && !/policy|violat|ihlal/i.test(a) ? 'NO_CREDIT' : 'REJECTED';
        throw e;
      }
      lastAlert = a;
    }
  }
  const e = new Error('Flow zaman aşımı: sonuç gelmedi.');
  e.code = 'TIMEOUT';
  throw e;
}

module.exports = { STEPS, URL, SITE, isCalibrated, generate };
