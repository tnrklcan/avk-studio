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
async function concat(videos, out) {
  if (videos.length === 1) { fs.copyFileSync(videos[0], out); return out; }
  const inputs = videos.flatMap((v) => ['-i', v]);
  const n = videos.length;
  const norm = videos.map((_, i) =>
    `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}];` +
    `[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`).join(';');
  const chain = videos.map((_, i) => `[v${i}][a${i}]`).join('');
  try {
    await run([...inputs, '-filter_complex', `${norm};${chain}concat=n=${n}:v=1:a=1[v][a]`, '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
  } catch (e) {
    // Ses akışı olmayan klip varsa sessiz birleştir
    const normV = videos.map((_, i) => `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`).join(';');
    const chainV = videos.map((_, i) => `[v${i}]`).join('');
    await run([...inputs, '-filter_complex', `${normV};${chainV}concat=n=${n}:v=1:a=0[v]`, '-map', '[v]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-movflags', '+faststart', out]);
  }
  return out;
}

module.exports = { toPng, lastFrame, concat, ffmpegPath };
