// Demo profile for the promo shots: open films by Blender Studio, no personal data.
// usage: node promo/seed-profile.cjs <profileDir> <downloadDir> [language]
const fs = require('fs');
const path = require('path');

const [profile, downloads, language = 'en'] = process.argv.slice(2);
const DAY = 864e5;

const FILMS = [
  ['aqz-KE-bpKQ', 'Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film', 'Blender', 635, '3840x2160'],
  ['eRsGyueVLvQ', 'Sintel - Open Movie by Blender Foundation', 'Blender', 888, '1920x1080'],
  ['R6MlUcmOul8', 'Tears of Steel - Blender VFX Open Movie', 'Blender', 734, '1920x1080'],
  ['WhWc3b3KhnY', 'Spring - Blender Open Movie', 'Blender Studio', 464, '3840x2160'],
  ['Y-rmzh0PI3c', 'Cosmos Laundromat - First Cycle. Official Blender Foundation release.', 'Blender', 730, '1920x1080'],
  ['mN0zPOpADL4', 'Agent 327: Operation Barbershop', 'Blender Studio', 231, '1920x1080'],
  ['SkVqJ1SGeL0', 'Caminandes 3: Llamigos - Funny 3D Animated Short', 'Blender', 150, '1920x1080'],
  ['UXqq0ZvbOnk', 'CHARGE - Blender Open Movie', 'Blender Studio', 214, '3840x2160'],
  ['_cMxraX_5RE', 'Sprite Fright - Blender Open Movie', 'Blender Studio', 628, '3840x2160'],
  ['PVGeM40dABA', 'Coffee Run - Blender Open Movie', 'Blender Studio', 184, '1920x1080'],
  ['u9lj-c29dxI', 'WING IT! - Blender Open Movie', 'Blender Studio', 217, '3840x2160'],
  ['TLkA0RELQ1g', 'Elephants Dream - Open Movie', 'Blender', 654, '1920x1080'],
];

// [film, days ago, size MB, speed MB/s]
const PLAN = [
  [0, 0, 612, 21], [3, 0, 388, 18], [7, 1, 196, 24], [1, 1, 402, 16], [10, 2, 174, 19], [8, 2, 548, 23],
  [2, 3, 366, 14], [5, 4, 98, 17], [6, 5, 76, 15], [9, 5, 112, 20], [4, 7, 354, 12], [11, 9, 318, 13],
  [0, 10, 226, 16], [1, 12, 702, 22], [3, 13, 164, 11],
];

const now = Date.now();
const history = PLAN.map(([film, daysAgo, sizeMb, speedMb], i) => {
  const [id, title, channel, durationSeconds, resolution] = FILMS[film];
  const sizeBytes = sizeMb * 1e6;
  const file = path.join(downloads, `${title.slice(0, 40)} [${id}].mp4`);
  return {
    id: `demo-${i}`,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    title,
    description: channel,
    dateTs: now - daysAgo * DAY - (i + 1) * 47 * 60000,
    sizeBytes,
    durationSeconds,
    downloadDuration: sizeMb / speedMb,
    resolution,
    source: 'youtube.com',
    sourceUrl: `https://www.youtube.com/watch?v=${id}`,
    folderPath: downloads,
    filePath: file,
    avgSpeedBps: speedMb * 1e6,
    status: 'success',
  };
}).sort((a, b) => a.dateTs - b.dateTs);

fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(downloads, { recursive: true });
fs.writeFileSync(path.join(profile, 'enterload-data.json'), JSON.stringify({
  migrated: true,
  language,
  theme: 'dark',
  accent: 'blue',
  siteAccent: false,
  quality: 'original',
  embedThumbnail: true,
  embedMetadata: true,
  saveThumbnail: true,
  saveInfo: true,
  notificationsEnabled: true,
  defaultDownloadPath: downloads,
  totalAppTime: 41 * 3600 + 26 * 60,
  history,
  errorLog: [],
}, null, 1));
console.log('profile ready:', history.length, 'items');
