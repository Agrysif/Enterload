// Interface languages, shared by the main process and the renderer.
// English is the base: a language the app doesn't have means English, and so does a string
// missing from a translation. Add a language here and in src/locales, then run npm run check:locales.
const LOCALES = {
  en: require('./locales/en.json'),
  ru: require('./locales/ru.json'),
  uk: require('./locales/uk.json'),
  be: require('./locales/be.json'),
  kk: require('./locales/kk.json'),
  uz: require('./locales/uz.json'),
  az: require('./locales/az.json'),
  hy: require('./locales/hy.json'),
  ky: require('./locales/ky.json'),
  tg: require('./locales/tg.json'),
  tk: require('./locales/tk.json'),
  ro: require('./locales/ro.json'),
  zh: require('./locales/zh.json'),
};

// `numbers` is a locale with the same number format: Electron has no number data for many of these languages
const LANGUAGES = [
  { code: 'en', name: 'English', numbers: 'en-US' },
  { code: 'ru', name: 'Русский', numbers: 'ru-RU' },
  { code: 'uk', name: 'Українська', numbers: 'ru-RU' },
  { code: 'be', name: 'Беларуская', numbers: 'ru-RU' },
  { code: 'kk', name: 'Қазақша', numbers: 'ru-RU' },
  { code: 'uz', name: 'Oʻzbekcha', numbers: 'ru-RU' },
  { code: 'az', name: 'Azərbaycanca', numbers: 'de-DE' },
  { code: 'hy', name: 'Հայերեն', numbers: 'ru-RU' },
  { code: 'ky', name: 'Кыргызча', numbers: 'ru-RU' },
  { code: 'tg', name: 'Тоҷикӣ', numbers: 'ru-RU' },
  { code: 'tk', name: 'Türkmençe', numbers: 'ru-RU' },
  { code: 'ro', name: 'Română', numbers: 'ro-RO' },
  { code: 'zh', name: '简体中文', numbers: 'zh-CN' },
];

let current = 'en';
let plurals = new Intl.PluralRules('en');

// Windows lists the user's languages in order of preference: the first one the app has wins
function detectLanguage(systemLanguages) {
  const codes = (systemLanguages || []).map(tag => String(tag).toLowerCase().split(/[-_]/)[0]);
  return codes.find(code => LOCALES[code]) || 'en';
}

// `choice` is what the user picked in the settings: a language code or "system"
const resolveLanguage = (choice, systemLanguages) => (LOCALES[choice] ? choice : detectLanguage(systemLanguages));

function setLanguage(code) {
  current = LOCALES[code] ? code : 'en';
  plurals = new Intl.PluralRules(current);
  return current;
}

const getLanguage = () => current;
const numberLocale = () => LANGUAGES.find(language => language.code === current).numbers;

// A `count` parameter picks the plural form: key_one, key_few, key_many, key_other
function lookup(dict, key, count) {
  if (count === undefined) return dict[key];
  return dict[`${key}_${plurals.select(count)}`] ?? dict[`${key}_other`];
}

function t(key, params = {}) {
  const text = lookup(LOCALES[current], key, params.count) ?? lookup(LOCALES.en, key, params.count) ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : params[name]));
}

// `month` counts from 0. Month names live in the locale files, Electron lacks them for half of the languages.
function formatDate({ year, month, day }, { short = false } = {}) {
  const names = t(short ? 'date.monthsShort' : 'date.months').split(',');
  return t(year ? 'date.dayMonthYear' : 'date.dayMonth', { year, month: names[month], day });
}

// yt-dlp upload_date: "20211209"
function formatUploadDate(value, options) {
  if (!/^\d{8}$/.test(value || '')) return '';
  const [year, month, day] = [value.slice(0, 4), value.slice(4, 6), value.slice(6, 8)].map(Number);
  return formatDate({ year, month: month - 1, day }, options);
}

module.exports = {
  LANGUAGES, detectLanguage, resolveLanguage, setLanguage, getLanguage, numberLocale, t, formatDate, formatUploadDate,
};
