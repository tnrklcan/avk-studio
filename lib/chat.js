// ChatGPT / Claude'u kullanıcının tarayıcısından otomatik kullanır (kalibrasyon gerektirmez).
const path = require('path');
const browser = require('./browser');

const SITES = {
  chatgpt: {
    key: 'chat_chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/',
    input: '#prompt-textarea, div[contenteditable="true"][role="textbox"]',
    reply: ['[data-response-body]', '[data-markdown-text-style="assistant-message"]', '[data-message-author-role="assistant"]'],
    stop: 'button[data-testid="stop-button"], button[aria-label*="Stop" i], button[aria-label*="Durdur" i]'
  },
  claude: {
    key: 'chat_claude', name: 'Claude', url: 'https://claude.ai/new',
    input: 'div[contenteditable="true"].ProseMirror, div[contenteditable="true"][role="textbox"], div[contenteditable="true"]',
    reply: ['.font-claude-response', '.font-claude-message', '[data-is-streaming]'],
    stop: 'button[aria-label*="Stop" i], button[aria-label*="Durdur" i]'
  }
};
const siteOf = (p) => SITES[p] || SITES.chatgpt;
let fresh = true; // true: sıradaki istek yeni sohbetle başlar
const resetTask = () => { fresh = true; };
const vis = (loc) => loc.filter({ visible: true });

async function lastReply(page, site, sent) {
  for (const sel of site.reply) {
    const n = await page.locator(sel).count().catch(() => 0);
    if (n) return (await page.locator(sel).nth(n - 1).innerText().catch(() => '')) || '';
  }
  // Son çare: sayfa metninden gönderilen mesajdan sonrasını al (site arayüzü değişse bile çalışır)
  if (!sent) return '';
  const main = await page.locator('main').first().innerText().catch(() => '');
  const key = sent.slice(0, 40);
  const i = main.lastIndexOf(key);
  if (i < 0) return '';
  return main.slice(i + sent.length).replace(/\n+(ChatGPT|Claude)[^\n]*(hata yapabilir|can make mistakes)[^\n]*$/i, '').trim();
}

// Siteyi açar ve giriş yapılmasını bekler (kullanıcı pencerede giriş yapabilir).
async function connect(provider, log = () => {}, waitMs = 5 * 60 * 1000) {
  const site = siteOf(provider);
  const page = await browser.getPage(site.key, site.url, { forceGoto: true });
  log(`${site.name} açıldı. Giriş yapmanız gerekirse şimdi yapın...`);
  const t0 = Date.now();
  while (Date.now() - t0 < waitMs) {
    await browser.sleep(1500);
    if (await vis(page.locator(site.input)).count().catch(() => 0)) return page;
  }
  throw new Error(`${site.name} mesaj kutusu görünmedi. Giriş yaptığınızdan emin olun.`);
}

async function ask(provider, text, files = [], { timeout = 4 * 60 * 1000, log = () => {} } = {}) {
  const site = siteOf(provider);
  const page = await browser.getPage(site.key, site.url, { forceGoto: fresh });
  fresh = false;
  const box = vis(page.locator(site.input)).first();
  await box.waitFor({ timeout: 30000 }).catch(() => { const e = new Error(`${site.name}'da oturum açık değil. Kurulum ekranından bağlanın.`); e.code = 'LOGIN'; throw e; });
  await browser.sleep(800);
  const beforeText = await lastReply(page, site, '');

  if (files.length) {
    log('Görseller sohbete yükleniyor...');
    const input = page.locator('input[type="file"]').first();
    if (await input.count()) {
      // ChatGPT ücretsiz sürümü tek görsel kabul eder (dosya kutusu "multiple" değildir): ilk görsel gönderilir.
      const multi = await input.evaluate((e) => e.multiple).catch(() => true);
      let list = files;
      if (!multi && files.length > 1) {
        list = files.slice(0, 1);
        log(`${site.name} hesabınız tek görsel kabul ediyor (ücretsiz sürüm): yalnızca ilk görsel gönderildi.`);
      }
      try { await input.setInputFiles(list); }
      catch (e) {
        if (list.length > 1) { await input.setInputFiles(list.slice(0, 1)); log('Birden fazla görsel yüklenemedi: yalnızca ilk görsel gönderildi.'); }
        else throw e;
      }
      await browser.sleep(3500);
    }
  }
  log(`${site.name} ile konuşuluyor...`);
  await box.click();
  await page.keyboard.insertText(text);
  await browser.sleep(600);
  await page.keyboard.press('Enter');

  const t0 = Date.now();
  let last = '', stable = 0;
  await browser.sleep(2500);
  while (Date.now() - t0 < timeout) {
    await browser.sleep(1500);
    const cur = await lastReply(page, site, text);
    const generating = await vis(page.locator(site.stop)).count().catch(() => 0);
    if (cur && cur !== beforeText) {
      if (cur === last && !generating) stable++; else { stable = 0; last = cur; }
      if (stable >= 3) return last;
    }
  }
  if (last) return last;
  throw new Error(`${site.name} cevap vermedi.`);
}

function extractJson(raw) {
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Cevapta JSON bulunamadı.');
  const txt = raw.slice(a, b + 1);
  try { return JSON.parse(txt); } catch (_) { return JSON.parse(fixJsonStrings(txt)); }
}

// Metin içindeki gerçek satır sonu/sekme gibi kontrol karakterlerini (JSON'da yasak) \n, \t gibi kaçışlara çevirir.
function fixJsonStrings(txt) {
  let out = '', inStr = false, esc = false;
  for (const ch of txt) {
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === '\\') { out += ch; esc = true; continue; }
      if (ch === '"') { out += ch; inStr = false; continue; }
      const c = ch.codePointAt(0);
      if (c < 0x20) { out += ch === '\n' ? '\\n' : ch === '\r' ? '' : ch === '\t' ? '\\t' : ' '; continue; }
      out += ch;
    } else { if (ch === '"') inStr = true; out += ch; }
  }
  return out;
}

async function askJson(provider, text, files, opts) {
  let raw = await ask(provider, text, files, opts);
  try { return extractJson(raw); } catch (_) {
    raw = await ask(provider, text + '\n\nIMPORTANT: your last answer was not valid JSON. Reply with ONLY the JSON object.', files, opts);
    return extractJson(raw);
  }
}

async function selfTest(provider, log) {
  await connect(provider, log);
  const reply = await ask(provider, 'Reply with exactly: AVK_OK', [], { timeout: 90000, log });
  if (!/AVK_OK/i.test(reply)) throw new Error('Cevap okunamadı.');
  resetTask();
  return true;
}

module.exports = { resetTask, SITES, ask, askJson, connect, selfTest, siteOf };
