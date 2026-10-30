// Downloads the FFmpeg build recommended by yt-dlp into vendor/ffmpeg, it ships inside the app.
// The archive is checked against the checksum published with the release.
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ASSET = 'ffmpeg-master-latest-win64-gpl-shared.zip';
const BASE_URL = 'https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download';
const VENDOR = path.join(__dirname, '..', 'vendor');
const TARGET = path.join(VENDOR, 'ffmpeg');
const TEMP = path.join(VENDOR, 'ffmpeg-download');

async function download(name) {
  const res = await fetch(`${BASE_URL}/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  if (fs.existsSync(path.join(TARGET, 'ffmpeg.exe'))) return;

  console.log(`Downloading ${ASSET}…`);
  const [archive, checksums] = await Promise.all([download(ASSET), download('checksums.sha256')]);
  const expected = checksums.toString('utf8').split(/\r?\n/).find(line => line.endsWith(ASSET))?.split(/\s+/)[0];
  const actual = crypto.createHash('sha256').update(archive).digest('hex');
  if (!expected || expected !== actual) throw new Error(`Checksum mismatch for ${ASSET}`);

  fs.rmSync(TEMP, { recursive: true, force: true });
  fs.mkdirSync(TEMP, { recursive: true });
  const zipPath = path.join(TEMP, ASSET);
  fs.writeFileSync(zipPath, archive);
  // System32 tar understands zip, the one from Git Bash doesn't
  execFileSync(path.join(process.env.SystemRoot, 'System32', 'tar.exe'), ['-xf', zipPath, '-C', TEMP]);

  const root = path.join(TEMP, path.basename(ASSET, '.zip'));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(TARGET, { recursive: true });
  fs.readdirSync(bin)
    .filter(name => name !== 'ffplay.exe')
    .forEach(name => fs.copyFileSync(path.join(bin, name), path.join(TARGET, name)));
  fs.copyFileSync(path.join(root, 'LICENSE.txt'), path.join(TARGET, 'LICENSE.txt'));
  fs.rmSync(TEMP, { recursive: true, force: true });
  console.log(`FFmpeg is ready: ${TARGET}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
