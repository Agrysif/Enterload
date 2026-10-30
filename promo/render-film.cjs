// Renders the film: short parts, each in a fresh Electron, then one encode with the track.
// One long Electron run slows down to several seconds per frame, a short one stays at about 15 fps.
//
//   node promo/render-film.cjs en ru
//   env TRAILER_WORKERS=5
// A finished part stays in out/parts, so a repeated run continues from where it stopped.
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// child processes inherit it, so a render doesn't take the CPU from whatever else is running
os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL);

const DIR = __dirname;
const OUT = path.join(DIR, 'out');
const ELECTRON = require('electron');
const FFMPEG = process.env.FFMPEG || path.join(DIR, '..', 'vendor', 'ffmpeg', 'ffmpeg.exe');
const FPS = 60;
const PART_FRAMES = 300;
const WORKERS = Number(process.env.TRAILER_WORKERS) || 5;

const html = fs.readFileSync(path.join(DIR, 'trailer.html'), 'utf8');
const DURATION = Number(html.match(/DURATION\s*=\s*([\d.]+)/)[1]);
const TOTAL = Math.round(DURATION * FPS);
const PARTS = Math.ceil(TOTAL / PART_FRAMES);

const started = Date.now();
const log = message => console.log(`${String(Math.round((Date.now() - started) / 1000)).padStart(4)} s  ${message}`);
const partFile = (lang, i) => path.join(OUT, 'parts', lang, `${String(i).padStart(2, '0')}.mkv`);

function runElectron(env) {
  const clean = { ...process.env, ...env };
  delete clean.ELECTRON_RUN_AS_NODE;
  return new Promise((resolve, reject) => {
    const child = spawn(ELECTRON, [path.join(DIR, 'render.cjs')], { env: clean, stdio: 'ignore', windowsHide: true });
    child.on('error', reject);
    child.on('close', code => (code === 0 ? resolve() : reject(new Error(`part failed: ${env.TRAILER_OUT}`))));
  });
}

async function renderPart(lang, i) {
  const file = partFile(lang, i);
  if (fs.existsSync(file)) return;
  const first = i * PART_FRAMES;
  const last = Math.min(TOTAL, first + PART_FRAMES);
  const temp = `${file}.tmp.mkv`;
  const t0 = Date.now();
  await runElectron({
    TRAILER_LANG: lang, TRAILER_FROM: String(first / FPS), TRAILER_TO: String(last / FPS), TRAILER_OUT: temp,
  });
  fs.renameSync(temp, file);
  log(`${lang} part ${i + 1}/${PARTS} done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

function join(lang) {
  const list = path.join(OUT, 'parts', lang, 'list.txt');
  const names = Array.from({ length: PARTS }, (_, i) => `file '${path.basename(partFile(lang, i))}'`);
  fs.writeFileSync(list, `${names.join('\n')}\n`);
  execFileSync(FFMPEG, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', list,
    '-i', path.join(DIR, 'assets', 'track.mp3'),
    '-map', '0:v', '-map', '1:a', '-af', 'apad', '-t', String(DURATION),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart',
    path.join(OUT, `Enterload-trailer-${lang}.mp4`),
  ], { stdio: 'inherit', windowsHide: true });
  log(`${lang} film ready`);
}

async function main() {
  const langs = process.argv.slice(2).filter(lang => ['en', 'ru'].includes(lang));
  if (!langs.length) langs.push('en', 'ru');
  const queue = [];
  for (const lang of langs) {
    fs.mkdirSync(path.join(OUT, 'parts', lang), { recursive: true });
    for (let i = 0; i < PARTS; i++) queue.push(() => renderPart(lang, i));
  }
  log(`${queue.length} parts, ${WORKERS} at a time`);
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    while (queue.length) await queue.shift()();
  }));
  for (const lang of langs) join(lang);
  fs.rmSync(path.join(OUT, 'parts'), { recursive: true, force: true });
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
