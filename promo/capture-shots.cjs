// Captures the app screens for the trailer through the DevTools protocol.
// The app must run with the demo profile and --remote-debugging-port.
// usage: node promo/capture-shots.cjs <port> <outDir> [only,these,steps]
// Steps: static, site, active, themes
const fs = require('fs');
const path = require('path');

const [port, outDir, onlyArg] = process.argv.slice(2);
const only = onlyArg ? onlyArg.split(',') : ['static', 'site', 'active', 'themes'];
const YOUTUBE_DEMO = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
const ACTIVE_DEMO = YOUTUBE_DEMO;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find(t => t.type === 'page' && !t.url.startsWith('devtools://'));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.result?.value;

  const tidy = () => ev(`(() => {
    if (!document.getElementById('no-motion')) {
      // a hidden window doesn't advance CSS animations, shots would catch them halfway
      document.head.insertAdjacentHTML('beforeend', '<style id="no-motion">*, *::before, *::after { transition: none !important; animation: none !important; }</style>');
    }
    document.documentElement.classList.remove('has-material');
    const name = document.querySelector('.who b'); if (name) name.textContent = 'Agrysif';
    const avatar = document.querySelector('.sidebar-footer .avatar'); if (avatar) avatar.textContent = 'A';
    document.querySelectorAll('.nav-badge:not(.activity)').forEach(el => el.remove());
    document.querySelectorAll('.row-value').forEach(el => { if (el.textContent.startsWith('promo-')) el.textContent = 'Downloads'; });
  })()`);
  const nav = async label => {
    await ev(`[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes(${JSON.stringify(label)})).click()`);
    await sleep(900);
    await tidy();
    await sleep(150);
  };
  const shot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(r.result.data, 'base64'));
    console.log('shot', name);
  };
  const setUrl = value => ev(`(() => { const i = document.querySelector('main input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const waitInfo = async () => {
    for (let i = 0; i < 160; i++) {
      if (await ev(`!!document.querySelector('.video-title')`)) return true;
      if (await ev(`!!document.querySelector('.preview .empty')`) && i > 4) return false;
      await sleep(500);
    }
    return false;
  };
  const pick = text => ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}).click()`);
  const toggleSiteColor = () => ev(`[...document.querySelectorAll('.row')].find(r => r.textContent.includes('Цвет сайта')).querySelector('.switch').click()`);

  await send('Emulation.setDeviceMetricsOverride', { width: 1240, height: 820, deviceScaleFactor: 2, mobile: false });
  await sleep(500);
  await tidy();

  if (only.includes('static')) {
    await nav('История');
    await sleep(2500); // thumbnails
    await shot('history');
    await nav('Статистика');
    await shot('stats');
    await nav('Настройки');
    await shot('settings');
    await nav('Загрузка');
    await setUrl(YOUTUBE_DEMO);
    if (await waitInfo()) {
      await sleep(2500);
      await tidy();
      await shot('download');
    } else console.log('no analysis for download');
  }

  if (only.includes('site')) {
    await nav('Настройки');
    await toggleSiteColor();
    await sleep(300);
    await nav('Загрузка');
    await setUrl(YOUTUBE_DEMO);
    if (await waitInfo()) {
      await sleep(2500);
      await tidy();
      await shot('download-site');
    } else console.log('no analysis for download-site');
    await nav('Настройки');
    await toggleSiteColor();
    await sleep(300);
  }

  if (only.includes('active')) {
    await nav('Загрузка');
    await setUrl(ACTIVE_DEMO);
    if (await waitInfo()) {
      await sleep(2000);
      await ev(`document.querySelector('.btn-primary').click()`);
      for (let i = 0; i < 120; i++) {
        if (await ev(`!!document.querySelector('.status-card canvas')`)) break;
        await sleep(500);
      }
      await sleep(18000);
      await tidy();
      await ev(`document.querySelector('.content').scrollTop = 1e5`);
      await sleep(300);
      await shot('download-active');
      console.log(await ev(`document.querySelector('.status-card')?.textContent?.slice(0, 80)`));
      await ev(`document.querySelector('.status-card button[aria-label="Отменить"]')?.click()`);
      await sleep(2500);
      await ev(`document.querySelector('.status-card button[aria-label="Скрыть"]')?.click()`);
    } else console.log('no analysis for download-active');
  }

  if (only.includes('themes')) {
    await nav('Загрузка');
    await setUrl('');
    await nav('Настройки');
    await pick('Светлая');
    await sleep(500);
    await nav('История');
    await sleep(1500);
    await shot('history-light');
    await nav('Настройки');
    await ev(`document.querySelector('.accent-swatch[title="Фиолетовый"]').click()`);
    await sleep(400);
    await pick('Тёмная');
    await sleep(500);
    await nav('Статистика');
    await shot('stats-purple');
    await nav('Настройки');
    await ev(`document.querySelector('.accent-swatch[title="Зелёный"]').click()`);
    await sleep(500);
    await shot('settings-green');
    await ev(`document.querySelector('.accent-swatch[title="Синий"]').click()`);
  }

  await send('Emulation.clearDeviceMetricsOverride');
  ws.close();
})().catch(err => { console.error(err); process.exit(1); });
