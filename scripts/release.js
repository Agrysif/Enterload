// Signed build of the app.
//   npm run build      installer and portable version in release/
//   npm run build:dir  only release/win-unpacked (faster)
//   npm run release    the same as build + upload to GitHub Releases
//
// The signing key stays outside the project, see ENTERLOAD_SIGNING_DIR below.
// Extra arguments go to electron-builder as they are.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SIGNING_DIR = process.env.ENTERLOAD_SIGNING_DIR || path.join(os.homedir(), 'Documents', 'Enterload-signing');

const node = (script, args = [], env = process.env) => execFileSync(process.execPath, [script, ...args], { cwd: ROOT, stdio: 'inherit', env });

function signingEnv() {
  const file = path.join(SIGNING_DIR, 'signing.json');
  if (!fs.existsSync(file)) throw new Error(`Нет ключа подписи: ${file}. Без подписи обновления не установятся у пользователей.`);
  const { certificate, password } = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  return { CSC_LINK: certificate, CSC_KEY_PASSWORD: password };
}

// GitHub CLI is already logged in on this computer, its token stays in the Windows credential store
function publishEnv() {
  if (process.env.GH_TOKEN) return {};
  const local = path.join(ROOT, 'vendor', 'gh', 'bin', 'gh.exe');
  const gh = fs.existsSync(local) ? local : 'gh';
  return { GH_TOKEN: execFileSync(gh, ['auth', 'token'], { encoding: 'utf8' }).trim() };
}

function main() {
  const args = process.argv.slice(2);
  const publish = args.includes('--publish');
  const extra = args.filter(arg => arg !== '--publish');
  const env = { ...process.env, ...signingEnv(), ...(publish ? publishEnv() : {}) };

  node('scripts/fetch-ffmpeg.js');
  node('node_modules/webpack/bin/webpack.js', ['--config', 'webpack.renderer.config.js', '--mode', 'production', '--stats', 'errors-warnings']);
  node('node_modules/electron-builder/cli.js', ['--publish', publish ? 'always' : 'never', ...extra], env);
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
