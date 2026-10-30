// Track envelope for the trailer: assets/track.mp3 → assets/env.js.
// The speed chart, the equalizer and the climax follow it. Step 20 ms, values 0..1.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const FFMPEG = process.env.FFMPEG || path.join(DIR, '..', 'vendor', 'ffmpeg', 'ffmpeg.exe');
const SR = 22050;
const HOP = 441;

const raw = execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', path.join(DIR, 'assets', 'track.mp3'),
  '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
const x = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);

const rms = [];
const low = [];
let lp = 0;
for (let i = 0; i + HOP <= x.length; i += HOP) {
  let s = 0;
  let l = 0;
  for (let j = 0; j < HOP; j++) {
    const v = x[i + j];
    s += v * v;
    lp += 0.02 * (v - lp);
    l += lp * lp;
  }
  rms.push(Math.sqrt(s / HOP));
  low.push(Math.sqrt(l / HOP));
}
const norm = a => {
  const m = a.reduce((max, v) => Math.max(max, v), 0) || 1;
  return a.map(v => +(v / m).toFixed(3));
};
fs.writeFileSync(path.join(DIR, 'assets', 'env.js'),
  `window.ENV = ${JSON.stringify({ hop: HOP / SR, rms: norm(rms), low: norm(low) })};\n`);
console.log('env.js:', rms.length, 'points');
