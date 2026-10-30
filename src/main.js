const {
  app, BrowserWindow, ipcMain, dialog, shell, clipboard, ClipboardItem, nativeImage, nativeTheme, net,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const { formatUploadDate, resolveLanguage, setLanguage, t } = require('./i18n');

// Keep history and settings in the same folder as earlier versions of the app
// (ENTERLOAD_DATA_DIR allows a separate profile, e.g. for testing)
app.setPath('userData', process.env.ENTERLOAD_DATA_DIR || path.join(app.getPath('appData'), 'enterload3'));

const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';
// For screenshots and tests: the app renders off screen and never shows a window.
// Without the GPU, because off-screen capture loses accelerated canvases: the charts come out empty.
const noWindow = !!process.env.ENTERLOAD_NO_WINDOW;
if (noWindow) app.disableHardwareAcceleration();
const DEV_URL = 'http://localhost:3001';
const EXE_SUFFIX = process.platform === 'win32' ? '.exe' : '';
const ICON_PATH = path.join(__dirname, '..', 'build', 'icon.png');
const TITLEBAR_HEIGHT = 44;
const THEMES = ['system', 'light', 'dark'];

// Mica needs Windows 11 22H2 (build 22621) or newer
const supportsMica = process.platform === 'win32' && Number(os.release().split('.')[2]) >= 22621;

let mainWindow = null;
let forceClose = false;

/* ------------------------------------------------------------------ */
/* Persistent storage (JSON file in userData, independent of origin)   */
/* ------------------------------------------------------------------ */

const storeFile = () => path.join(app.getPath('userData'), 'enterload-data.json');
let storeData = null;
let storeTimer = null;

function loadStore() {
  if (storeData) return storeData;
  try {
    storeData = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
  } catch {
    storeData = {};
  }
  return storeData;
}

function flushStore() {
  clearTimeout(storeTimer);
  storeTimer = null;
  if (!storeData) return;
  try {
    const tmp = `${storeFile()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(storeData));
    fs.renameSync(tmp, storeFile());
  } catch (err) {
    console.error('Store write error:', err);
  }
}

function saveStoreSoon() {
  clearTimeout(storeTimer);
  storeTimer = setTimeout(flushStore, 400);
}

/* ------------------------------------------------------------------ */
/* yt-dlp / ffmpeg helpers                                             */
/* ------------------------------------------------------------------ */

const bundledYtDlp = () => (app.isPackaged
  ? path.join(process.resourcesPath, 'bin', `yt-dlp${EXE_SUFFIX}`)
  : path.join(__dirname, '..', 'node_modules', 'yt-dlp-exec', 'bin', `yt-dlp${EXE_SUFFIX}`));
const userYtDlp = () => path.join(app.getPath('userData'), 'bin', `yt-dlp${EXE_SUFFIX}`);

// ffmpeg ships with the app; one from PATH is the fallback for development
function bundledFfmpegDir() {
  const dir = app.isPackaged ? path.join(process.resourcesPath, 'ffmpeg') : path.join(__dirname, '..', 'vendor', 'ffmpeg');
  return fs.existsSync(path.join(dir, `ffmpeg${EXE_SUFFIX}`)) ? dir : null;
}

let ytDlpPathPromise = null;
let ffmpegPromise = null;

// yt-dlp needs a JS runtime for YouTube; Electron itself can act as Node
const ytDlpEnv = () => ({
  ...process.env,
  PYTHONIOENCODING: 'utf-8',
  PYTHONUTF8: '1',
  ELECTRON_RUN_AS_NODE: '1',
});
function commonArgs() {
  const ffmpegDir = bundledFfmpegDir();
  return [
    '--encoding', 'utf-8', '--no-colors', '--js-runtimes', `node:${process.execPath}`,
    ...(ffmpegDir ? ['--ffmpeg-location', ffmpegDir] : []),
  ];
}

function run(bin, args, { onStdoutLine, timeoutMs, env } = {}) {
  const child = spawn(bin, args, { windowsHide: true, env: env || process.env });
  let stdout = '';
  let stderr = '';
  let pending = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    stdout += chunk;
    if (!onStdoutLine) return;
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop();
    lines.forEach(line => line && onStdoutLine(line));
  });
  child.stderr.on('data', chunk => {
    stderr = (stderr + chunk).slice(-20000);
  });
  let timer = null;
  const done = new Promise(resolve => {
    child.on('error', err => resolve({ code: -1, stdout, stderr: `${stderr}\n${err.message}` }));
    child.on('close', code => {
      clearTimeout(timer);
      if (onStdoutLine && pending) onStdoutLine(pending);
      resolve({ code, stdout, stderr });
    });
  });
  if (timeoutMs) timer = setTimeout(() => killTree(child), timeoutMs);
  return { child, done };
}

function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  } else {
    child.kill('SIGKILL');
  }
}

async function binaryVersion(bin) {
  const { code, stdout } = await run(bin, ['--version'], { timeoutMs: 15000 }).done;
  return code === 0 ? stdout.trim() : null;
}

const compareVersions = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return diff;
  }
  return 0;
};

// Prefer whichever copy is newer: the one shipped with the app or the self-updated one
function resolveYtDlp() {
  if (!ytDlpPathPromise) {
    ytDlpPathPromise = (async () => {
      const candidates = [userYtDlp(), bundledYtDlp()].filter(p => fs.existsSync(p));
      if (!candidates.length) return { path: null, version: null };
      const versions = await Promise.all(candidates.map(binaryVersion));
      let best = null;
      candidates.forEach((p, i) => {
        if (!versions[i]) return;
        if (!best || compareVersions(versions[i], best.version) > 0) best = { path: p, version: versions[i] };
      });
      return best || { path: null, version: null };
    })();
  }
  return ytDlpPathPromise;
}

async function ytDlpBinary() {
  const { path: bin } = await resolveYtDlp();
  if (!bin) throw new Error(t('err.ytDlpReinstall'));
  return bin;
}

function hasFfmpeg() {
  if (!ffmpegPromise) {
    const ffmpegDir = bundledFfmpegDir();
    const bin = ffmpegDir ? path.join(ffmpegDir, `ffmpeg${EXE_SUFFIX}`) : 'ffmpeg';
    ffmpegPromise = run(bin, ['-version'], { timeoutMs: 10000 }).done.then(r => r.code === 0);
  }
  return ffmpegPromise;
}

const KNOWN_ERRORS = [
  [/Unsupported URL/i, 'err.unsupported'],
  [/Private video/i, 'err.private'],
  [/Video unavailable|This video is unavailable|has been removed/i, 'err.unavailable'],
  [/confirm your age|age-restricted|inappropriate for some users/i, 'err.ageRestricted'],
  [/not a bot/i, 'err.notBot'],
  [/page needs to be reloaded|Failed to extract|Unable to extract/i, 'err.siteChanged'],
  [/HTTP Error 403/i, 'err.http403'],
  [/HTTP Error 404/i, 'err.http404'],
  [/Requested format is not available/i, 'err.qualityUnavailable'],
  [/No space left/i, 'err.noSpace'],
  [/Permission denied|Access is denied|WinError 5/i, 'err.noFolderAccess'],
  [/ffmpeg|ffprobe/i, 'err.needFfmpeg'],
  [/getaddrinfo|Failed to resolve|timed out|Connection (refused|reset|aborted)|Unable to download webpage/i, 'err.noConnection'],
];

function describeError(stderr, fallback = t('err.unknown')) {
  const lines = String(stderr || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const raw = [...lines].reverse().find(l => l.startsWith('ERROR:')) || lines[lines.length - 1] || fallback;
  const known = KNOWN_ERRORS.find(([re]) => re.test(raw));
  const message = known ? t(known[1]) : raw.replace(/^ERROR:\s*/, '').replace(/^\[[^\]]+\]\s*[\w-]+:\s*/, '');
  return { message, log: lines.slice(-40).join('\n') || fallback };
}

/* ------------------------------------------------------------------ */
/* Metadata                                                            */
/* ------------------------------------------------------------------ */

const metaCache = new Map();
let metaChild = null;

const isHttpUrl = value => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

// Electron's nativeImage can't decode webp, so prefer jpg/png thumbnails
function pickThumbnail(info) {
  const isRaster = url => /\.(jpe?g|png)(\?|$)/i.test(url || '');
  if (isRaster(info.thumbnail)) return info.thumbnail;
  const raster = (info.thumbnails || []).filter(t => isRaster(t.url));
  return raster.length ? raster[raster.length - 1].url : info.thumbnail || '';
}

function mapMetadata(info) {
  const requested = info.requested_formats || [];
  const requestedSize = requested.reduce((sum, f) => sum + (f.filesize || f.filesize_approx || 0), 0);
  return {
    id: info.id,
    title: info.title || info.id || '',
    channelName: info.uploader || info.channel || info.creator || '',
    thumbnail: pickThumbnail(info),
    description: info.description || '',
    tags: Array.isArray(info.tags) ? info.tags : [],
    // Pornhub and similar sites also give categories and performers
    categories: Array.isArray(info.categories) ? info.categories : [],
    cast: Array.isArray(info.cast) ? info.cast : [],
    uploadDate: info.upload_date || '',
    ageLimit: info.age_limit || 0,
    views: info.view_count ?? null,
    likes: info.like_count ?? null,
    durationSeconds: info.duration || 0,
    resolution: info.width && info.height ? `${info.width}x${info.height}` : info.resolution || '',
    fps: info.fps || null,
    filesize: info.filesize || info.filesize_approx || requestedSize || null,
    license: info.license || '',
    webpageUrl: info.webpage_url || '',
    extractor: info.extractor_key || '',
    isLive: !!info.is_live,
  };
}

async function fetchMetadata(url) {
  if (!isHttpUrl(url)) return { ok: false, error: t('err.badLink') };
  if (metaCache.has(url)) return { ok: true, data: metaCache.get(url) };

  const bin = await ytDlpBinary();
  // Only the latest request matters — stop the previous lookup
  killTree(metaChild);
  const task = run(bin, [...commonArgs(), '-J', '--no-playlist', '--no-warnings', url], {
    timeoutMs: 90000,
    env: ytDlpEnv(),
  });
  metaChild = task.child;
  const { code, stdout, stderr } = await task.done;
  if (metaChild === task.child) metaChild = null;

  if (code !== 0) {
    const { message, log } = describeError(stderr, t('errors.metadataFailed'));
    return { ok: false, error: message, log };
  }
  let info;
  try {
    info = JSON.parse(stdout);
  } catch {
    return { ok: false, error: t('err.badData'), log: stdout.slice(0, 2000) };
  }
  if (info._type === 'playlist') {
    return { ok: false, error: t('err.playlist') };
  }
  const data = mapMetadata(info);
  if (data.isLive) return { ok: false, error: t('err.live') };
  metaCache.set(url, data);
  if (metaCache.size > 30) metaCache.delete(metaCache.keys().next().value);
  return { ok: true, data };
}

/* ------------------------------------------------------------------ */
/* App updates (GitHub Releases)                                       */
/* ------------------------------------------------------------------ */

// Releases are signed with our own certificate. Windows doesn't vouch for it,
// so an update is accepted only if it carries a valid signature made with exactly this key.
const RELEASE_CERT_THUMBPRINT = 'F8FE7939E128706669C8550ECCAFD2D59130E212';
const RELEASES_URL = 'https://github.com/Agrysif/Enterload/releases/latest';
const UPDATE_FIRST_CHECK_MS = 5000;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// The portable build can't replace itself, it only points to the download page
const isPortable = !!process.env.PORTABLE_EXECUTABLE_FILE;
let updateState = { state: 'idle', portable: isPortable };

function setUpdateState(patch) {
  updateState = { portable: isPortable, ...patch };
  sendToWindow('update-status', updateState);
}

async function verifyReleaseSignature(_publisherNames, file) {
  const literal = file.replace(/'/g, "''");
  const script = '$s = Get-AuthenticodeSignature -LiteralPath \'' + literal + '\'; "$($s.Status)|$($s.SignerCertificate.Thumbprint)"';
  const { code, stdout, stderr } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeoutMs: 30000 }).done;
  const [status, thumbprint] = stdout.trim().split('|');
  // UnknownError / NotTrusted only mean the chain ends in our own, not publicly trusted root
  const intact = ['Valid', 'UnknownError', 'NotTrusted'].includes(status);
  if (code === 0 && intact && thumbprint === RELEASE_CERT_THUMBPRINT) return null;
  return t('update.signatureFailed', { status: status || stderr.trim() || t('update.noData') });
}

async function checkForUpdates() {
  if (!app.isPackaged || ['checking', 'downloading', 'ready'].includes(updateState.state)) return updateState;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    console.error('Update check failed:', err.message);
  }
  return updateState;
}

function installUpdate() {
  if (updateState.state === 'available' && isPortable) {
    shell.openExternal(RELEASES_URL);
    return { ok: true };
  }
  if (updateState.state !== 'ready') return { ok: false, error: t('update.notReady') };
  if (job) return { ok: false, error: t('common.waitDownload') };
  autoUpdater.quitAndInstall(true, true);
  return { ok: true };
}

function setupUpdater() {
  if (!app.isPackaged) {
    updateState = { state: 'unsupported', portable: isPortable };
    return;
  }
  autoUpdater.autoDownload = !isPortable;
  autoUpdater.autoInstallOnAppQuit = !isPortable;
  autoUpdater.verifyUpdateCodeSignature = verifyReleaseSignature;

  autoUpdater.on('checking-for-update', () => setUpdateState({ state: 'checking' }));
  autoUpdater.on('update-not-available', () => setUpdateState({ state: 'latest' }));
  autoUpdater.on('update-available', info => {
    setUpdateState({ state: isPortable ? 'available' : 'downloading', version: info.version, percent: 0 });
  });
  autoUpdater.on('download-progress', progress => {
    setUpdateState({ state: 'downloading', version: updateState.version, percent: Math.floor(progress.percent) });
  });
  autoUpdater.on('update-downloaded', info => setUpdateState({ state: 'ready', version: info.version }));
  autoUpdater.on('error', err => {
    console.error('Updater error:', err.message);
    setUpdateState({ state: 'error' });
  });

  setTimeout(checkForUpdates, UPDATE_FIRST_CHECK_MS);
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
}

/* ------------------------------------------------------------------ */
/* Downloads                                                           */
/* ------------------------------------------------------------------ */

let job = null;

const PROGRESS_TEMPLATE = 'download:ELP|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s'
  + '|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s|%(info.format_id)s'
  + '|%(progress.fragment_index)s|%(progress.fragment_count)s';

const MAX_HEIGHTS = { '1080p': 1080, '720p': 720, '480p': 480, '360p': 360 };

// Limited qualities get their own file name, otherwise yt-dlp would skip the download
// as "already downloaded" when the same video exists in another quality
const qualityTag = quality => (MAX_HEIGHTS[quality] ? ` [${quality}]` : '');

const INFO_FIELDS = 'title,uploader,channel,webpage_url,upload_date,duration,description,categories,cast,tags';

// 793 → "13:13", 3725 → "1:02:05"
function formatDuration(seconds) {
  const total = Math.round(Number(seconds) || 0);
  if (!total) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// Text file next to the video: title, author, link, description, categories, cast and tags
function writeInfoFile(filePath, info) {
  const list = value => (Array.isArray(value) ? value.filter(Boolean).join(', ') : '');
  const lines = [
    [t('info.title'), info.title],
    [t('info.author'), info.uploader || info.channel],
    [t('info.link'), info.webpage_url],
    [t('info.date'), formatUploadDate(info.upload_date)],
    [t('info.duration'), formatDuration(info.duration)],
  ].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
  const description = String(info.description || '').trim();
  if (description) lines.push('', `${t('video.description')}:`, description);
  const lists = [[t('video.categories'), list(info.categories)], [t('video.cast'), list(info.cast)], [t('video.tags'), list(info.tags)]]
    .filter(([, value]) => value);
  if (lists.length) lines.push('', ...lists.map(([label, value]) => `${label}: ${value}`));

  const target = filePath.replace(/\.[^.\\/]+$/, '') + '.txt';
  fs.writeFileSync(target, lines.join('\r\n').replace(/\r?\n/g, '\r\n') + '\r\n', 'utf8');
  return target;
}

function buildDownloadArgs({ url, quality, embedThumbnail, embedMetadata, saveThumbnail, saveInfo, dir }, ffmpeg) {
  const args = [
    ...commonArgs(), url,
    '--no-playlist', '--newline', '--progress', '--progress-delta', '0.3', '--no-mtime',
    '--progress-template', PROGRESS_TEMPLATE,
    '--print', 'before_dl:ELFMT|%(format_id)s|%(id)s',
    '--print', 'after_move:ELFILE|%(filepath)s',
    '--print', 'after_move:ELRES|%(resolution)s',
    '--no-simulate',
    '-P', dir,
    '-o', `%(title).150B [%(id)s]${qualityTag(quality)}.%(ext)s`,
  ];
  const maxHeight = MAX_HEIGHTS[quality];

  if (quality === 'audio') {
    if (ffmpeg) args.push('-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '0');
    else args.push('-f', 'ba[ext=m4a]/ba/b');
  } else if (ffmpeg) {
    // Best quality first, then the most compatible codecs (h264 + aac in mp4)
    const sort = `${maxHeight ? `res:${maxHeight}` : 'res'},fps,vcodec:h264,acodec:m4a`;
    args.push('-f', 'bv*+ba/b', '-S', sort, '--merge-output-format', 'mp4');
  } else {
    // Without ffmpeg only pre-merged formats are possible
    args.push('-f', maxHeight ? `b[height<=${maxHeight}]/b` : 'b');
  }

  if (ffmpeg && embedThumbnail) args.push('--embed-thumbnail');
  if (ffmpeg && embedMetadata) args.push('--embed-metadata');
  if (saveThumbnail) args.push('--write-thumbnail', ...(ffmpeg ? ['--convert-thumbnails', 'jpg'] : []));
  if (saveInfo) args.push('--print', `after_move:ELINFO|%(.{${INFO_FIELDS}})j`);
  return args;
}

const sendToWindow = (channel, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
};

const toNumber = value => (value === undefined || value === 'NA' || value === 'None' || value === '' ? null : Number(value));

function handleProgressLine(current, line) {
  if (line.startsWith('ELFMT|')) {
    const [, formats, id] = line.split('|');
    current.formatCount = formats.split('+').length;
    current.videoId = id;
    return;
  }
  if (line.startsWith('ELFILE|')) {
    current.filePath = line.slice('ELFILE|'.length).trim();
    return;
  }
  if (line.startsWith('ELRES|')) {
    current.resolution = line.slice('ELRES|'.length).trim();
    return;
  }
  if (line.startsWith('ELINFO|')) {
    try {
      current.info = JSON.parse(line.slice('ELINFO|'.length));
    } catch (err) {
      console.error('Info parse error:', err.message);
    }
    return;
  }
  if (!line.startsWith('ELP|')) return;

  const [, status, downloadedRaw, totalRaw, estimateRaw, speedRaw, etaRaw, formatId, fragIndexRaw, fragCountRaw] = line.split('|');
  const downloaded = toNumber(downloadedRaw) || 0;
  const total = toNumber(totalRaw) ?? toNumber(estimateRaw);
  const fragIndex = toNumber(fragIndexRaw);
  const fragCount = toNumber(fragCountRaw);

  let fraction = 0;
  if (status === 'finished') {
    current.doneFormats.set(formatId, total || downloaded);
  } else if (total) {
    fraction = Math.min(1, downloaded / total);
  } else if (fragCount) {
    fraction = Math.min(1, (fragIndex || 0) / fragCount);
  }

  // yt-dlp downloads video and audio as separate streams — combine them into one progress
  const done = current.doneFormats.size;
  const count = Math.max(current.formatCount || 1, done + (status === 'finished' ? 0 : 1));
  const percent = Math.min(99, ((done + fraction) / count) * 100);
  current.progress = Math.max(current.progress, percent);

  const doneBytes = [...current.doneFormats.values()].reduce((sum, b) => sum + b, 0);
  const now = Date.now();
  if (status === 'finished' || now - current.lastEmit >= 250) {
    current.lastEmit = now;
    sendToWindow('download-progress', {
      percent: current.progress,
      speed: toNumber(speedRaw),
      eta: toNumber(etaRaw),
      downloaded: doneBytes + (status === 'finished' ? 0 : downloaded),
    });
  }

  if (status === 'finished' && done >= (current.formatCount || 1) && !current.processing) {
    current.processing = true;
    sendToWindow('download-status', 'processing');
  }
}

// Removes only temporary files that belong to this download and were created during it
const fileMarker = current => `[${current.videoId}]${qualityTag(current.quality)}`;

function cleanupPartials(current) {
  if (!current.videoId) return;
  const marker = fileMarker(current);
  const temporary = [
    /^\.f[\w-]+\.\w+(\.part(-Frag\d+)?|\.ytdl)?$/i,
    /^\.\w+\.(part(-Frag\d+)?|ytdl)$/i,
    /^\.temp\.\w+$/i,
    /^\.(webp|jpe?g|png)$/i,
  ];
  let names = [];
  try {
    names = fs.readdirSync(current.dir);
  } catch {
    return;
  }
  for (const name of names) {
    const at = name.indexOf(marker);
    if (at === -1) continue;
    const suffix = name.slice(at + marker.length);
    if (!temporary.some(re => re.test(suffix))) continue;
    const full = path.join(current.dir, name);
    try {
      if (fs.statSync(full).mtimeMs >= current.createdAt - 5000) fs.unlinkSync(full);
    } catch (err) {
      console.error('Cleanup error:', err.message);
    }
  }
}

function findOutputFile(current) {
  if (current.filePath && fs.existsSync(current.filePath)) return current.filePath;
  if (!current.videoId) return null;
  try {
    const marker = fileMarker(current);
    const candidates = fs.readdirSync(current.dir)
      .filter(n => n.includes(marker) && !/\.(part|ytdl|txt|jpe?g|png|webp)$|\.temp\.|\.f[\w-]+\.\w+$/i.test(n))
      .map(n => path.join(current.dir, n))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return candidates[0] || null;
  } catch {
    return null;
  }
}

async function runJob(current) {
  const bin = await ytDlpBinary();
  current.processing = false;
  current.runStartedAt = Date.now();
  const task = run(bin, current.args, {
    env: ytDlpEnv(),
    onStdoutLine: line => handleProgressLine(current, line),
  });
  current.child = task.child;
  const { code, stderr } = await task.done;
  current.child = null;
  current.activeMs += Date.now() - current.runStartedAt;

  if (job !== current) return;

  if (current.cancelled) {
    cleanupPartials(current);
    job = null;
    sendToWindow('download-cancelled');
    return;
  }
  if (current.pausing) {
    current.pausing = false;
    if (current.resumeRequested) {
      current.resumeRequested = false;
      await runJob(current);
      return;
    }
    current.paused = true;
    sendToWindow('download-status', 'paused');
    return;
  }
  if (code === 0) {
    const filePath = findOutputFile(current);
    let sizeBytes = 0;
    try {
      sizeBytes = filePath ? fs.statSync(filePath).size : 0;
    } catch {}
    let infoFile = null;
    if (current.saveInfo && filePath && current.info) {
      try {
        infoFile = writeInfoFile(filePath, current.info);
      } catch (err) {
        console.error('Info file error:', err.message);
      }
    }
    job = null;
    sendToWindow('download-progress', { percent: 100, speed: null, eta: 0, downloaded: sizeBytes });
    sendToWindow('download-complete', {
      filePath,
      folderPath: filePath ? path.dirname(filePath) : current.dir,
      sizeBytes,
      activeSeconds: current.activeMs / 1000,
      resolution: current.resolution && current.resolution !== 'NA' ? current.resolution : '',
      infoFile,
      info: metaCache.get(current.url) || null,
    });
    return;
  }

  cleanupPartials(current);
  job = null;
  sendToWindow('download-error', describeError(stderr, t('err.exitCode', { code })));
}

async function startDownload(options = {}) {
  if (job) return { ok: false, error: t('err.alreadyRunning') };
  const url = String(options.url || '').trim();
  if (!isHttpUrl(url)) return { ok: false, error: t('err.badLink') };

  const dir = String(options.downloadPath || '').trim() || app.getPath('downloads');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
  } catch {
    return { ok: false, error: t('err.folderDenied', { dir }) };
  }

  const ffmpeg = await hasFfmpeg();
  const quality = ['original', '1080p', '720p', '480p', '360p', 'audio'].includes(options.quality) ? options.quality : 'original';
  const args = buildDownloadArgs({
    url, quality, dir,
    embedThumbnail: !!options.embedThumbnail,
    embedMetadata: !!options.embedMetadata,
    saveThumbnail: !!options.saveThumbnail,
    saveInfo: !!options.saveInfo,
  }, ffmpeg);

  job = {
    url, dir, args, quality,
    saveInfo: !!options.saveInfo,
    info: null,
    createdAt: Date.now(),
    activeMs: 0,
    progress: 0,
    lastEmit: 0,
    formatCount: 0,
    doneFormats: new Map(),
    child: null,
    paused: false,
    pausing: false,
    cancelled: false,
  };
  const current = job;
  runJob(current).catch(err => {
    if (job !== current) return;
    job = null;
    sendToWindow('download-error', { message: err.message, log: err.stack || err.message });
  });
  return { ok: true, ffmpeg };
}

function pauseDownload() {
  if (!job || job.paused || !job.child || job.processing) return { ok: false };
  // Windows can't suspend a process tree, so stop yt-dlp and continue from the .part file later
  job.pausing = true;
  killTree(job.child);
  return { ok: true };
}

function resumeDownload() {
  if (!job) return { ok: false };
  // Pressed before yt-dlp had time to stop: continue as soon as it exits
  if (job.pausing) {
    job.resumeRequested = true;
    return { ok: true };
  }
  if (!job.paused) return { ok: false };
  const current = job;
  current.paused = false;
  runJob(current).catch(err => {
    if (job !== current) return;
    job = null;
    sendToWindow('download-error', { message: err.message, log: err.stack || err.message });
  });
  return { ok: true };
}

function cancelDownload() {
  if (!job) return { ok: false };
  const current = job;
  current.cancelled = true;
  if (current.child) {
    killTree(current.child);
  } else {
    cleanupPartials(current);
    job = null;
    sendToWindow('download-cancelled');
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

function isTrustedSender(event) {
  const url = event.senderFrame?.url || '';
  return isDev ? url.startsWith(DEV_URL) : url.startsWith('file://');
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender');
    try {
      return await fn(...args);
    } catch (err) {
      console.error(`${channel} failed:`, err);
      return { ok: false, error: err.message, log: err.stack || err.message };
    }
  });
}

function registerIpc() {
  ipcMain.on('bootstrap', event => {
    event.returnValue = isTrustedSender(event)
      ? {
        data: loadStore(),
        username: os.userInfo().username,
        downloadsDir: app.getPath('downloads'),
        systemLanguages: app.getPreferredSystemLanguages(),
        version: app.getVersion(),
        material: supportsMica,
      }
      : {};
  });

  // The app theme drives the native parts too: Mica tint and caption buttons
  ipcMain.on('set-theme', (event, theme) => {
    if (!isTrustedSender(event) || !THEMES.includes(theme)) return;
    nativeTheme.themeSource = theme;
  });

  // Errors, the close dialog and the .txt file next to the video follow the interface language
  ipcMain.on('set-language', (event, code) => {
    if (isTrustedSender(event)) setLanguage(code);
  });

  ipcMain.on('store-set', (event, key, value) => {
    if (!isTrustedSender(event) || typeof key !== 'string') return;
    loadStore()[key] = value;
    saveStoreSoon();
  });

  handle('fetch-metadata', fetchMetadata);
  handle('download-start', startDownload);
  handle('download-pause', pauseDownload);
  handle('download-resume', resumeDownload);
  handle('download-cancel', cancelDownload);

  handle('engine-info', async () => {
    const [{ version }, ffmpeg] = await Promise.all([resolveYtDlp(), hasFfmpeg()]);
    return { ok: true, ytDlpVersion: version, ffmpeg };
  });

  handle('engine-update', async () => {
    if (job) return { ok: false, error: t('common.waitDownload') };
    const target = userYtDlp();
    const { path: current } = await resolveYtDlp();
    if (!current) return { ok: false, error: t('err.ytDlpMissing') };
    // Update a writable copy in userData — the app folder may be read-only
    if (current !== target) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(current, target);
    }
    const { code, stdout, stderr } = await run(target, ['-U'], { timeoutMs: 180000 }).done;
    ytDlpPathPromise = null;
    metaCache.clear();
    const { version } = await resolveYtDlp();
    if (code !== 0) return { ok: false, error: describeError(stderr || stdout).message, version };
    return { ok: true, version, output: stdout.trim() };
  });

  handle('select-folder', async current => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: t('dialog.folderTitle'),
      defaultPath: current && fs.existsSync(current) ? current : app.getPath('downloads'),
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  handle('open-folder', async (folderPath, filePath) => {
    if (typeof filePath === 'string' && filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return { ok: true };
    }
    // openPath would launch a file, so only directories are allowed here
    if (typeof folderPath === 'string' && folderPath && fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
      const error = await shell.openPath(folderPath);
      return error ? { ok: false, error } : { ok: true };
    }
    return { ok: false, error: t('err.folderNotFound') };
  });

  handle('update-state', async () => updateState);
  handle('update-check', checkForUpdates);
  handle('update-install', async () => installUpdate());

  handle('open-url', async url => {
    if (!isHttpUrl(url)) return { ok: false, error: t('err.badLink') };
    await shell.openExternal(url);
    return { ok: true };
  });

  handle('read-clipboard-text', async () => ({ ok: true, text: await clipboard.readText() }));

  handle('copy-text', async text => {
    await clipboard.writeText(String(text ?? ''));
    return { ok: true };
  });

  handle('copy-image', async url => {
    if (!isHttpUrl(url)) return { ok: false, error: t('err.noImage') };
    const response = await net.fetch(url);
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const image = nativeImage.createFromBuffer(Buffer.from(await response.arrayBuffer()));
    if (image.isEmpty()) return { ok: false, error: t('err.imageFormat') };
    // re-encode to PNG so every app can paste it
    const png = new Blob([image.toPNG()], { type: 'image/png' });
    await clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return { ok: true };
  });
}

/* ------------------------------------------------------------------ */
/* Window                                                              */
/* ------------------------------------------------------------------ */

const titleBarOverlay = () => ({
  color: '#00000000',
  symbolColor: nativeTheme.shouldUseDarkColors ? '#f5f5f7' : '#1c1c1e',
  height: TITLEBAR_HEIGHT,
});

function windowBackground() {
  if (supportsMica) return '#00000000';
  return nativeTheme.shouldUseDarkColors ? '#1c1c1f' : '#ebebf0';
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 660,
    show: false,
    // native Windows caption buttons over our own top bar
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarOverlay(),
    backgroundMaterial: supportsMica ? 'mica' : undefined,
    backgroundColor: windowBackground(),
    title: 'Enterload',
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      offscreen: noWindow,
    },
  });

  if (!noWindow) mainWindow.once('ready-to-show', () => mainWindow.show());

  // Links never open inside the app window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isDev && url.startsWith(DEV_URL)) return;
    event.preventDefault();
  });

  mainWindow.on('close', async event => {
    if (forceClose || !job) return;
    event.preventDefault();
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: [t('common.close'), t('dialog.stay')],
      defaultId: 1,
      cancelId: 1,
      title: 'Enterload',
      message: t('dialog.closeTitle'),
      detail: t('dialog.closeDetail'),
    });
    if (response !== 0) return;
    if (job) {
      job.cancelled = true;
      killTree(job.child);
      cleanupPartials(job);
    }
    forceClose = true;
    mainWindow.close();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    const { theme, language } = loadStore();
    setLanguage(resolveLanguage(language, app.getPreferredSystemLanguages()));
    nativeTheme.themeSource = THEMES.includes(theme) ? theme : 'system';
    nativeTheme.on('updated', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.setTitleBarOverlay(titleBarOverlay());
      mainWindow.setBackgroundColor(windowBackground());
    });
    registerIpc();
    createWindow();
    setupUpdater();
    // Warm up the engine checks so the first request is faster
    resolveYtDlp();
    hasFfmpeg();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('will-quit', () => {
  if (job) {
    killTree(job.child);
    cleanupPartials(job);
  }
  killTree(metaChild);
  flushStore();
});
