// Üretim hattı: klipleri sırayla üretir, reddedilirse promptu yumuşatıp tekrar dener, sonunda birleştirir.
const fs = require('fs');
const path = require('path');
const os = require('os');
const flow = require('./flow');
const chat = require('./chat');
const stitch = require('./stitch');
const T = require('./templates');
const store = require('./store');

let cancelled = false;
const cancel = () => { cancelled = true; };
const reset = () => { cancelled = false; };
const check = () => { if (cancelled) { const e = new Error('Durduruldu.'); e.code = 'CANCELLED'; throw e; } };

function outputRoot() {
  const dir = store.get('settings').outputDir || path.join(os.homedir(), 'Documents', 'AVK Studio');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function projectDir(name) {
  const safe = (name || 'Proje').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 50) || 'Proje';
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const dir = path.join(outputRoot(), `${safe} ${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  store.addProject({ id: dir, title: (name || 'Proje'), dir, final: null, date: new Date().toISOString() });
  return dir;
}

async function makeImage({ prompt, files = [], dir, name, aspect, log, provider }) {
  reset();
  const out = path.join(dir, name || `gorsel-${Date.now()}.png`);
  try {
    await flow.generate({ kind: 'image', prompt, files, outFile: out, aspect, log });
  } catch (e) {
    if (e.code === 'REJECTED') {
      log('Flow isteği reddetti, prompt yumuşatılıp yeniden deneniyor...');
      const j = await chat.askJson(provider, T.softenPrompt({ prompt, reason: e.message }), [], { log });
      await flow.generate({ kind: 'image', prompt: j.prompt, files, outFile: out, aspect, log });
    } else throw e;
  }
  return out;
}

// clips: [{prompt, turkish_line, seconds}]; refs: kimlik/ürün görselleri; chain: önceki klibin son karesini sonrakine ver
async function runClips({ clips, refs = [], chain = true, startFrame = null, seconds, dir, title, provider, log, progress }) {
  reset();
  const files = [];
  let prevFrame = null;
  if (startFrame) {
    prevFrame = path.join(dir, `devam-baslangic-${Date.now()}.jpg`);
    await stitch.lastFrame(startFrame, prevFrame).catch(() => { prevFrame = null; });
  }
  for (let i = 0; i < clips.length; i++) {
    check();
    progress({ index: i, total: clips.length, state: 'running' });
    log(`Klip ${i + 1}/${clips.length} başlıyor...`);
    const out = path.join(dir, `klip-${Date.now().toString(36)}-${String(i + 1).padStart(2, '0')}.mp4`);
    const useFrame = chain && prevFrame ? prevFrame : null;
    let prompt = clips[i].prompt;
    let attempt = 0;
    for (;;) {
      try {
        await flow.generate({ kind: 'video', prompt, files: useFrame ? [] : refs, startFrame: useFrame, outFile: out, seconds: clips[i].seconds || seconds, log });
        break;
      } catch (e) {
        check();
        attempt++;
        if (e.code === 'REJECTED' && attempt <= 1) {
          log('Flow isteği reddetti, prompt yumuşatılıp yeniden deneniyor...');
          const j = await chat.askJson(provider, T.softenPrompt({ prompt, reason: e.message }), [], { log });
          prompt = j.prompt;
        } else if ((e.code === 'TIMEOUT' || e.code === 'REJECTED') && attempt <= 2) {
          log('Tekrar deneniyor...');
        } else throw e;
      }
    }
    files.push(out);
    progress({ index: i, total: clips.length, state: 'done', file: out });
    if (chain && i < clips.length - 1) {
      prevFrame = path.join(dir, `son-kare-${Date.now().toString(36)}-${i + 1}.jpg`);
      await stitch.lastFrame(out, prevFrame).catch(() => { prevFrame = null; });
    }
  }
  check();
  log('Klipler birleştiriliyor...');
  const final = path.join(dir, `${(title || 'video').replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'video'}.mp4`);
  await stitch.render(files, final, { smooth: !!chain }); // zincirli klipler yumuşak geçişle birleşir
  return { clips: files, final };
}

async function merge({ files, dir, title }) {
  const out = path.join(dir, `${title || 'birlesik'}.mp4`);
  await stitch.concat(files, out);
  return out;
}

function inside(dir) {
  const root = path.resolve(outputRoot());
  const d = path.resolve(dir);
  return d.startsWith(root + path.sep) && d !== root;
}
function removeProjectDir(p) {
  if (p.dir && inside(p.dir) && fs.existsSync(p.dir)) fs.rmSync(p.dir, { recursive: true, force: true });
  store.removeProject(p.id);
}
function deleteProject(id) {
  const p = (store.get('projects') || []).find((x) => x.id === id);
  if (p) removeProjectDir(p);
  return true;
}
function deleteAll() {
  for (const p of [...(store.get('projects') || [])]) removeProjectDir(p);
  return true;
}

module.exports = { deleteProject, deleteAll, makeImage, runClips, merge, cancel, projectDir, outputRoot };
