// Renders a part of the trailer: trailer.html frames → ffmpeg → lossless MKV without sound.
// The whole film goes through render-film.cjs, this script is what it runs for each part.
//
// Assets are not in git:
//   assets/track.mp3 — the Suno track (140 BPM, scene timings in trailer.html follow it)
//   assets/shots/    — node promo/seed-profile.cjs, then node promo/capture-shots.cjs
//   assets/env.js    — node promo/envelope.cjs
//
//   npx electron promo/render.cjs
//   env TRAILER_LANG=en|ru
//   env TRAILER_STILLS=1.5,3.2,10.4  — only these frames, into out/stills
//   env TRAILER_FROM / TRAILER_TO    — a part of the film, seconds
//   env TRAILER_FPS=60, TRAILER_OUT=file.mkv
const { app, BrowserWindow, nativeImage } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const OUT = path.join(DIR, 'out');
const LANG = process.env.TRAILER_LANG === 'ru' ? 'ru' : 'en';
const FPS = Number(process.env.TRAILER_FPS) || 60;
const FFMPEG = process.env.FFMPEG || path.join(DIR, '..', 'vendor', 'ffmpeg', 'ffmpeg.exe');

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();

// A frame is taken from the paint event that follows render(t): the page writes the frame
// number as bits into the first 16 pixels, and paints are skipped until the number matches.
let frameId = 0;
function readMark(bmp) {
  let id = 0;
  for (let i = 0; i < 16; i++) if (bmp[i * 4 + 1] > 127) id |= 1 << i;
  return id;
}

async function frame(wc, t) {
  frameId = (frameId + 1) & 0xffff;
  const want = frameId;
  const got = new Promise(resolve => {
    const onPaint = (_e, _dirty, img) => {
      const size = img.getSize();
      if (size.width !== 1920 || size.height !== 1080) return;
      const bmp = img.toBitmap();
      if (readMark(bmp) !== want) {
        setTimeout(() => wc.invalidate(), 4);
        return;
      }
      wc.removeListener('paint', onPaint);
      resolve(bmp);
    };
    wc.on('paint', onPaint);
  });
  await wc.executeJavaScript(`render(${t}, ${want})`);
  wc.invalidate();
  const bitmap = await Promise.race([got, new Promise((_, reject) => setTimeout(() => reject(new Error(`no frame ${t}`)), 15000))]);
  // the mark is replaced with pixels from the second row
  bitmap.copy(bitmap, 0, 1920 * 4, 1920 * 4 + 16 * 4);
  return bitmap;
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    width: 1920, height: 1080, show: false, useContentSize: true, frame: false,
    webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: false },
  });
  win.webContents.setFrameRate(120);
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 2) console.log('page:', message); });
  await win.loadFile(path.join(DIR, 'trailer.html'), { query: { lang: LANG } });
  await win.webContents.executeJavaScript('window.ready');
  const duration = await win.webContents.executeJavaScript('window.DURATION');

  if (process.env.TRAILER_STILLS) {
    const dir = path.join(OUT, 'stills');
    fs.mkdirSync(dir, { recursive: true });
    for (const s of process.env.TRAILER_STILLS.split(',').map(Number)) {
      const image = await frame(win.webContents, s);
      const file = path.join(dir, `${LANG}-t${s.toFixed(2).padStart(5, '0')}.png`);
      fs.writeFileSync(file, nativeImage.createFromBitmap(image, { width: 1920, height: 1080 }).toPNG());
      console.log('still', file);
    }
    app.exit(0);
    return;
  }

  const from = Number(process.env.TRAILER_FROM) || 0;
  const to = Math.min(duration, Number(process.env.TRAILER_TO) || duration);
  const file = process.env.TRAILER_OUT || path.join(OUT, `part-${LANG}.mkv`);
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', '1920x1080', '-r', String(FPS), '-i', '-',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '0', file,
  ];
  const ff = spawn(FFMPEG, args, { stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
  const done = new Promise((resolve, reject) => { ff.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`)))); });
  const total = Math.round((to - from) * FPS);
  const started = Date.now();
  for (let i = 0; i < total; i++) {
    const buf = await frame(win.webContents, from + i / FPS);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 300 === 0) console.log(`frame ${i}/${total}  ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
  ff.stdin.end();
  await done;
  console.log('video', file, `${((Date.now() - started) / 1000).toFixed(0)} s`);
  app.exit(0);
}).catch(error => {
  console.error('render failed', error);
  app.exit(1);
});
