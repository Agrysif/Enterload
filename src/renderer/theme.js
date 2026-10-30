// Accent colors in the spirit of iOS system colors: [light, dark] variants
export const ACCENTS = [
  { id: 'blue', name: 'Синий', light: '#007aff', dark: '#0a84ff' },
  { id: 'indigo', name: 'Индиго', light: '#5856d6', dark: '#5e5ce6' },
  { id: 'purple', name: 'Фиолетовый', light: '#af52de', dark: '#bf5af2' },
  { id: 'pink', name: 'Розовый', light: '#ff2d55', dark: '#ff375f' },
  { id: 'orange', name: 'Оранжевый', light: '#f08c00', dark: '#ff9f0a' },
  { id: 'green', name: 'Зелёный', light: '#28a745', dark: '#30d158' },
  { id: 'teal', name: 'Бирюзовый', light: '#1f9fb8', dark: '#40c8e0' },
  { id: 'graphite', name: 'Графит', light: '#6e6e73', dark: '#98989d' },
];

export const THEME_OPTIONS = [
  { value: 'system', label: 'Авто' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
];

export const accentColor = (id, theme) => {
  const accent = ACCENTS.find(a => a.id === id) || ACCENTS[0];
  return theme === 'dark' ? accent.dark : accent.light;
};

// Brand colors of popular sites, used as the accent while their link is in the field.
// `dark` is a lighter variant for the dark theme, `onAccent` the text color on top of the brand color.
export const SITE_ACCENTS = [
  { name: 'YouTube', hosts: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'], color: '#ff0033', dark: '#ff3355' },
  { name: 'VK', hosts: ['vk.com', 'vk.ru', 'vkvideo.ru', 'vkontakte.ru'], color: '#0077ff', dark: '#2787f5' },
  { name: 'Rutube', hosts: ['rutube.ru'], color: '#ed143b', dark: '#ff3a5c' },
  { name: 'Одноклассники', hosts: ['ok.ru'], color: '#ee8208' },
  { name: 'Pornhub', hosts: ['pornhub.com', 'pornhub.org', 'pornhubpremium.com'], color: '#ff9000', onAccent: '#000' },
  { name: 'TikTok', hosts: ['tiktok.com'], color: '#fe2c55' },
  { name: 'Twitch', hosts: ['twitch.tv'], color: '#9146ff', dark: '#a970ff' },
  { name: 'Vimeo', hosts: ['vimeo.com'], color: '#0d9fd8', dark: '#1ab7ea' },
  { name: 'Instagram', hosts: ['instagram.com'], color: '#e1306c', dark: '#f04c84' },
  { name: 'X', hosts: ['x.com', 'twitter.com'], color: '#1d9bf0' },
  { name: 'Facebook', hosts: ['facebook.com', 'fb.watch', 'fb.com'], color: '#0866ff', dark: '#2d88ff' },
  { name: 'Reddit', hosts: ['reddit.com', 'redd.it'], color: '#ff4500' },
  { name: 'SoundCloud', hosts: ['soundcloud.com'], color: '#ff5500' },
  { name: 'Bilibili', hosts: ['bilibili.com', 'b23.tv'], color: '#00a1d6', dark: '#00aeec' },
];

export const siteAccentFor = (url, theme) => {
  let host;
  try {
    host = new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  const site = SITE_ACCENTS.find(s => s.hosts.some(h => host === h || host.endsWith(`.${h}`)));
  if (!site) return null;
  return { name: site.name, color: theme === 'dark' ? site.dark || site.color : site.color, onAccent: site.onAccent };
};
