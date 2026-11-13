// Arayüz ekran görüntüsü testi: AVK_DEV=1 electron test/shot.js <çıktı klasörü>
const { app } = require('electron');
const fs = require('fs'); const path = require('path'); const os = require('os');
const out = process.argv[2] || os.tmpdir();
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'avk-test-')));
const m = require('../main.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  await sleep(2500);
  const w = m.getWin();
  const shot = async (n) => { const img = await w.webContents.capturePage(); fs.writeFileSync(path.join(out, n + '.png'), img.toPNG()); };
  const js = (c) => w.webContents.executeJavaScript(c);
  await shot('1-login');
  await js(`document.querySelectorAll('.tabs button')[1].click()`); await sleep(300); await shot('2-ilk-giris');
  await js(`document.querySelectorAll('.tabs button')[0].click()`); await sleep(200);
  await js(`document.querySelector('input[type=email]').value='admin@test.com'; document.querySelector('input[type=password]').value='123456'; document.querySelector('.btn').click()`);
  await sleep(1500); await shot('3-kurulum');
  // kurulumu atla: test için durumu hazır say
  await js(`window.avk.call('settings.set',{tests:{flow:true,chatgpt:true}})`);
  await js(`window.avk.call('setup.status').then(s=>s)`);
  const st = await js(`window.avk.call('setup.status')`);
  console.log('setup', JSON.stringify(st));
  await js(`viewHome()`); await sleep(500); await shot('4-ana');
  await js(`startMode('ugc')`); await sleep(500); await shot('5-ugc');
  await js(`startMode('cine')`); await sleep(500); await shot('6-cine');
  await js(`viewSettings()`); await sleep(500); await shot('7-ayarlar');
  console.log('done'); app.quit();
});
