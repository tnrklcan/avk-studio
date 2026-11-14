const { app } = require('electron');
const fs = require('fs'); const path = require('path'); const os = require('os');
const out = process.argv[2] || os.tmpdir();
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'avk-test-')); app.setPath('userData', ud);
const D = '/Users/cantanrikulu/Documents/AVK Studio/Sinematik Test 2026-11-13-23-48/';
fs.writeFileSync(path.join(ud, 'avk-store.json'), JSON.stringify({ settings: { tests: { flow: true, chatgpt: true } }, calib: {}, session: null, projects: [
  { id: 'a', title: 'Sinematik Film', dir: D, final: D + 'bolum1.mp4', parts: [D + 'klip-mwfmr23x-01.mp4', D + 'klip-mwfngqgf-02.mp4', D + 'klip-mwfnit7z-01.mp4'], date: new Date().toISOString() },
  { id: 'b', title: 'UGC Video', dir: D, final: D + 'bolum2.mp4', parts: [D + 'bolum2.mp4'], date: new Date().toISOString() }] }));
const m = require('../main.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  await sleep(2500);
  const w = m.getWin(); const js = (c) => w.webContents.executeJavaScript(c);
  const shot = async (n) => { const img = await w.webContents.capturePage(); fs.writeFileSync(path.join(out, n + '.png'), img.toPNG()); };
  await js(`document.querySelector('input[type=email]').value='admin@test.com'; document.querySelector('input[type=password]').value='123456'; document.querySelector('.btn').click()`);
  await sleep(1200);
  await js(`viewLibrary()`); await sleep(600);
  await js(`document.querySelectorAll('input[type=checkbox]')[1].click(); document.querySelectorAll('input[type=checkbox]')[2].click()`); await sleep(300);
  await shot('r1-kutuphane'); console.log('done'); app.quit();
});
