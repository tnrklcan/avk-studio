// ChatGPT / Claude'u kullanıcının tarayıcısından otomatik kullanır (kalibrasyon gerektirmez).
const path = require('path');
const browser = require('./browser');

const SITES = {
  chatgpt: {
    key: 'chat_chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/',
    input: '#prompt-textarea, div[contenteditable="true"][role="textbox"]',
    reply: '[data-message-author-role="assistant"]',
    stop: 'button[data-testid="stop-button"], button[aria-label*="Stop" i], button[aria-label*="Durdur" i]'
  },
  claude: {
    key: 'chat_claude', name: 'Claude', url: 'https://claude.ai/new',
    input: 'div[contenteditable="true"].ProseMirror, div[contenteditable="true"][role="textbox"], div[contenteditable="true"]',
    reply: '.font-claude-response, .font-claude-message, [data-is-streaming]',
    stop: 'button[aria-label*="Stop" i], button[aria-label*="Durdur" i]'
  }
};
const siteOf = (p) => SITES[p] || SITES.chatgpt;
const vis = (loc) => loc.filter({ visible: true });

async function lastReply(page, site) {
  const n = await page.locator(site.reply).count().catch(() => 0);
  if (!n) return '';
  return (await page.locator(site.reply).nth(n - 1).innerText().catch(() => '')) || '';
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
  const page = await browser.getPage(site.key, site.url, { forceGoto: true });
  const box = vis(page.locator(site.input)).first();
  await box.waitFor({ timeout: 30000 }).catch(() => { const e = new Error(`${site.name}'da oturum açık değil. Kurulum ekranından bağlanın.`); e.code = 'LOGIN'; throw e; });
  await browser.sleep(800);
  const beforeText = await lastReply(page, site);

  if (files.length) {
    log('Görseller sohbete yükleniyor...');
    const input = page.locator('input[type="file"]').first();
    if (await input.count()) { await input.setInputFiles(files); await browser.sleep(3500); }
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
    const cur = await lastReply(page, site);
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
  return JSON.parse(raw.slice(a, b + 1));
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
  return true;
}

module.exports = { SITES, ask, askJson, connect, selfTest, siteOf };
