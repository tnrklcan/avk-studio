const { app } = require('electron');
const fs = require('fs'); const path = require('path'); const os = require('os');
const out = process.argv[2] || os.tmpdir();
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'avk-test-')); app.setPath('userData', ud);
fs.writeFileSync(path.join(ud, 'avk-store.json'), JSON.stringify({ settings: { tests: { flow: true, chatgpt: true } }, calib: {}, session: null, projects: [] }));
const m = require('../main.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  await sleep(2500);
  const w = m.getWin(); const js = (c) => w.webContents.executeJavaScript(c);
  const shot = async (n) => { const img = await w.webContents.capturePage(); fs.writeFileSync(path.join(out, n + '.png'), img.toPNG()); };
  await js(`document.querySelector('input[type=email]').value='admin@test.com'; document.querySelector('input[type=password]').value='123456'; document.querySelector('.btn').click()`);
  await sleep(2000); console.log(await js(`(()=>{try{S.user=S.user||{email:'a'}; startMode('ugc'); return document.querySelector('h1')?.textContent}catch(e){return 'ERR '+e.message+' '+e.stack.split('\\n')[1]}})()`)); await sleep(800);
  await js(`document.querySelectorAll('.chips')[1].querySelectorAll('.chip')[1].click()`); await sleep(300);
  await js(`window.scrollTo(0, 400)`); await sleep(200); await shot('y1-yon'); console.log('done'); app.quit();
});
