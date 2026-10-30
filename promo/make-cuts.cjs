// Cuts from the finished trailers: a short teaser and looping animations for the README.
// usage: node promo/make-cuts.cjs
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL);

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const MEDIA = path.join(ROOT, 'docs', 'media');
const FFMPEG = process.env.FFMPEG || path.join(ROOT, 'vendor', 'ffmpeg', 'ffmpeg.exe');

const BAR = 240 / 140;
const K = n => 0.443 + n * BAR;

const ffmpeg = args => execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit', windowsHide: true });

// pause, drop and the first features, then straight to the final hit and the end card
function teaser(source, target) {
  const [a1, a2, b1, b2] = [K(10), K(18), 48.74, 52.9];
  ffmpeg([
    '-i', source,
    '-filter_complex',
    `[0:v]trim=${a1}:${a2},setpts=PTS-STARTPTS[v1];[0:a]atrim=${a1}:${a2},asetpts=PTS-STARTPTS[a1];`
    + `[0:v]trim=${b1}:${b2},setpts=PTS-STARTPTS[v2];[0:a]atrim=${b1}:${b2},asetpts=PTS-STARTPTS[a2];`
    + '[v1][a1][v2][a2]concat=n=2:v=1:a=1[v][a]',
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', target,
  ]);
}

function loop(source, from, to, target) {
  ffmpeg([
    '-ss', String(from), '-t', String(to - from), '-i', source,
    '-vf', 'fps=20,scale=960:-1:flags=lanczos', '-an',
    '-c:v', 'libwebp_anim', '-lossless', '0', '-quality', '62', '-compression_level', '6', '-loop', '0', target,
  ]);
}

fs.mkdirSync(MEDIA, { recursive: true });
for (const [lang, suffix] of [['en', ''], ['ru', '-ru']]) {
  const source = path.join(OUT, `Enterload-trailer-${lang}.mp4`);
  if (!fs.existsSync(source)) continue;
  teaser(source, path.join(OUT, `Enterload-teaser-${lang}.mp4`));
  loop(source, K(14) - .1, K(16), path.join(MEDIA, `hero${suffix}.webp`));
  loop(source, K(15), K(18), path.join(MEDIA, `features${suffix}.webp`));
  loop(source, K(18), K(23), path.join(MEDIA, `screens${suffix}.webp`));
  console.log('cuts ready:', lang);
}
