// ChatGPT / Claude'u kullanıcının tarayıcısından otomatik kullanır; İngilizce prompt ve JSON üretir.
const browser = require('./browser');
const store = require('./store');

const SITES = {
  chatgpt: {
    key: 'chat_chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/',
    fallback: { reply: '[data-message-author-role="assistant"]', input: '#prompt-textarea', send: 'button[data-testid="send-button"]' }
  },
  claude: {
    key: 'chat_claude', name: 'Claude', url: 'https://claude.ai/new',
    fallback: { reply: '.font-claude-response, .font-claude-message, [data-is-streaming]', input: 'div[contenteditable="true"]', send: 'button[aria-label*="Send" i]' }
  }
};

const STEPS = [
  { key: 'input', label: 'Mesaj yazma kutusuna tıklayın.' },
  { key: 'send', label: 'Gönder okuna tıklayın (önce kutuya bir harf yazarsanız ok görünür).', block: true },
  { key: 'reply', label: 'Kutuya "merhaba" yazıp Enter ile gönderin. Cevap gelince "Hazırım" düğmesine, sonra cevabın metnine tıklayın.', ready: true }
];

const siteOf = (p) => SITES[p] || SITES.chatgpt;
const isCalibrated = (p) => store.calibDone(siteOf(p).key, STEPS.map((s) => s.key));

async function readLast(page, site) {
  const desc = store.getCalib(site.key, 'reply');
  const js = `(args) => {
    const [desc, fb] = args;
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
    let list = [];
    if (desc) {
      list = [...document.querySelectorAll(desc.tag)].filter((e) => vis(e) && (desc.cls || []).every((c) => e.classList.contains(c)));
      if (desc.testid) { const t = list.filter((e) => e.getAttribute('data-testid') === desc.testid); if (t.length) list = t; }
    }
    let txt = list.length ? list[list.length - 1].innerText : '';
    if (!txt || txt.trim().length < 2) {
      const f = [...document.querySelectorAll(fb)].filter(vis);
      txt = f.length ? f[f.length - 1].innerText : '';
    }
    return txt || '';
  }`;
  try { return await page.evaluate(`(${js})(${JSON.stringify([desc, site.fallback.reply])})`); } catch (_) { return ''; }
}

async function ask(provider, text, files = [], { timeout = 4 * 60 * 1000, log = () => {} } = {}) {
  const site = siteOf(provider);
  const page = await browser.getPage(site.key, site.url);
  // Her istek temiz sohbetle başlar
  await page.goto(site.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await browser.sleep(2500);
  const beforeText = await readLast(page, site);

  if (files.length) {
    log('Görseller sohbete yükleniyor...');
    await browser.uploadFiles(page, site.key, files, null);
  }
  log(`${site.name} ile konuşuluyor...`);
  await browser.typeStep(page, site.key, 'input', text);
  try {
    await browser.clickStep(page, site.key, 'send', { wait: 8000 });
  } catch (_) {
    await page.keyboard.press('Enter'); // gönder düğmesi bulunamazsa Enter dene
  }

  const t0 = Date.now();
  let last = '', stable = 0;
  while (Date.now() - t0 < timeout) {
    await browser.sleep(1500);
    const cur = await readLast(page, site);
    if (cur && cur !== beforeText) {
      if (cur === last) stable++; else { stable = 0; last = cur; }
      if (stable >= 4) return last;
    }
  }
  if (last) return last;
  throw new Error(`${site.name} cevap vermedi. Oturumunuz açık mı? Kalibrasyon güncel mi?`);
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

module.exports = { SITES, STEPS, ask, askJson, isCalibrated, siteOf };
