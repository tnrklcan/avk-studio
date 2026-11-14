// ffmpeg ile birleştirme ve son kare çıkarma (program içine gömülü ffmpeg kullanılır).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function ffmpegPath() {
  let p = require('ffmpeg-static');
  if (p.includes('app.asar')) p = p.replace('app.asar', 'app.asar.unpacked');
  return p;
}

function run(args) {
  return new Promise((resolve, reject) => {
    const c = spawn(ffmpegPath(), ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
    let err = '';
    c.stderr.on('data', (d) => (err += d));
    c.on('error', reject);
    c.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg hata: ' + err.slice(-400)))));
  });
}

async function toPng(src, out) {
  await run(['-f', 'image2', '-i', src, '-frames:v', '1', out]).catch(() => run(['-i', src, '-frames:v', '1', out]));
  return out;
}

async function lastFrame(video, out) {
  await run(['-sseof', '-0.15', '-i', video, '-frames:v', '1', '-q:v', '2', out]);
  return out;
}

// Klipleri tek videoda birleştirir (ses dahil; ses yoksa sessiz parça eklenir).
async function concat(videos, out, size) {
  const [W, H] = size || [1080, 1920];
  if (videos.length === 1) { fs.copyFileSync(videos[0], out); return out; }
  const inputs = videos.flatMap((v) => ['-i', v]);
  const n = videos.length;
  const norm = videos.map((_, i) =>
    `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}];` +
    `[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`).join(';');
  const chain = videos.map((_, i) => `[v${i}][a${i}]`).join('');
  try {
    await run([...inputs, '-filter_complex', `${norm};${chain}concat=n=${n}:v=1:a=1[v][a]`, '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
  } catch (e) {
    // Ses akışı olmayan klip varsa sessiz birleştir
    const normV = videos.map((_, i) => `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`).join(';');
    const chainV = videos.map((_, i) => `[v${i}]`).join('');
    await run([...inputs, '-filter_complex', `${normV};${chainV}concat=n=${n}:v=1:a=0[v]`, '-map', '[v]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-movflags', '+faststart', out]);
  }
  return out;
}

// Süre ve ses bilgisi (ffprobe yok; ffmpeg çıktısından okunur)
function probe(file) {
  return new Promise((resolve) => {
    const c = spawn(ffmpegPath(), ['-hide_banner', '-i', file]);
    let e = '';
    c.stderr.on('data', (d) => (e += d));
    c.on('error', () => resolve({ dur: 0, audio: false, w: 0, h: 0 }));
    c.on('close', () => {
      const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(e);
      const v = /Video:.*?(\d{3,5})x(\d{3,5})/.exec(e);
      resolve({ dur: m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0, audio: /Audio:/.test(e), w: v ? +v[1] : 0, h: v ? +v[2] : 0 });
    });
  });
}

// Render: klipleri doğal akışla tek videoya birleştirir.
// Her klip bir öncekinin son karesinden başladığı için sonraki klibin ilk karesi (trim) atılır,
// ardından kısa bir çapraz geçiş (video + ses) uygulanır. Kesme hissi kaybolur.
async function render(videos, out, { smooth = true, fade = 0.35, trim = 0.1 } = {}) {
  if (videos.length === 1) { fs.copyFileSync(videos[0], out); return out; }
  const info = await Promise.all(videos.map(probe));
  const [W, H] = info[0].w > info[0].h ? [1920, 1080] : [1080, 1920]; // ilk videonun yönüne göre
  if (!smooth || info.some((i) => !i.dur || i.dur < 2)) return concat(videos, out, [W, H]);
  const inputs = videos.flatMap((v) => ['-i', v]);
  const durs = info.map((i, k) => i.dur - (k > 0 ? trim : 0));
  const parts = [];
  videos.forEach((_, k) => {
    const t = k > 0 ? trim : 0;
    parts.push(`[${k}:v]trim=start=${t},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${k}]`);
    if (info[k].audio) parts.push(`[${k}:a]atrim=start=${t},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[a${k}]`);
    else parts.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${durs[k].toFixed(3)},asetpts=PTS-STARTPTS[a${k}]`);
  });
  let vl = 'v0', al = 'a0', len = durs[0];
  for (let k = 1; k < videos.length; k++) {
    parts.push(`[${vl}][v${k}]xfade=transition=fade:duration=${fade}:offset=${(len - fade).toFixed(3)}[vx${k}]`);
    parts.push(`[${al}][a${k}]acrossfade=d=${fade}:c1=tri:c2=tri[ax${k}]`);
    vl = `vx${k}`; al = `ax${k}`; len = len + durs[k] - fade;
  }
  try {
    await run([...inputs, '-filter_complex', parts.join(';'), '-map', `[${vl}]`, '-map', `[${al}]`,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
  } catch (e) {
    await concat(videos, out, [W, H]); // geçiş başarısız olursa düz birleştir
  }
  return out;
}

module.exports = { render, probe, toPng, lastFrame, concat, ffmpegPath };
