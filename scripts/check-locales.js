// Checks the translations against English and the code against the strings.
// usage: node scripts/check-locales.js [language codes]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'src', 'locales');
const read = code => JSON.parse(fs.readFileSync(path.join(DIR, `${code}.json`), 'utf8'));
const placeholders = text => (text.match(/\{\w+\}/g) || []).sort().join(' ');
const baseKey = key => key.replace(/_(one|few|many|other)$/, '');

// Plural forms a language really uses with whole numbers; languages with one form need only _other
function pluralForms(code) {
  const rules = new Intl.PluralRules(code);
  const forms = new Set(Array.from({ length: 1000 }, (_, n) => rules.select(n)));
  return forms.size > 1 ? [...forms, 'other'] : ['other'];
}

const en = read('en');
const pluralKeys = new Set(Object.keys(en).filter(key => /_(one|other)$/.test(key)).map(baseKey));
const plainKeys = Object.keys(en).filter(key => !pluralKeys.has(baseKey(key)));
const problems = [];

function checkLanguage(code) {
  const dict = read(code);
  const report = text => problems.push(`${code}: ${text}`);
  plainKeys.forEach(key => {
    if (!dict[key]?.trim()) return report(`missing ${key}`);
    if (placeholders(dict[key]) !== placeholders(en[key])) report(`placeholders differ in ${key}: ${dict[key]}`);
    return undefined;
  });
  pluralKeys.forEach(key => {
    pluralForms(code).forEach(form => {
      const text = dict[`${key}_${form}`];
      if (!text?.trim()) return report(`missing ${key}_${form}`);
      if (placeholders(text) !== placeholders(en[`${key}_other`])) report(`placeholders differ in ${key}_${form}: ${text}`);
      return undefined;
    });
  });
  Object.keys(dict).forEach(key => {
    if (!(key in en) && !pluralKeys.has(baseKey(key))) report(`unknown key ${key}`);
  });
  ['date.months', 'date.monthsShort'].forEach(key => {
    if (dict[key] && dict[key].split(',').length !== 12) report(`${key} must have 12 comma-separated names`);
  });
}

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'locales' ? [] : sourceFiles(file);
    return /\.jsx?$/.test(entry.name) ? [file] : [];
  });
}

function checkCode() {
  const used = new Set();
  sourceFiles(path.join(ROOT, 'src')).forEach(file => {
    const code = fs.readFileSync(file, 'utf8');
    const relative = path.relative(ROOT, file);
    [...code.matchAll(/\bt\('([\w.]+)'/g)].forEach(([, key]) => {
      used.add(key);
      if (!(key in en) && !pluralKeys.has(key)) problems.push(`${relative}: unknown string ${key}`);
    });
    [...code.matchAll(/(?:[A-Za-z]+Key|label|title): '([a-z]+\.[\w.]+)'/g)].forEach(([, key]) => used.add(key));
  });
  return used;
}

const codes = process.argv.slice(2);
const all = fs.readdirSync(DIR).map(file => path.basename(file, '.json')).filter(code => code !== 'en');
(codes.length ? codes : all).forEach(checkLanguage);
if (!codes.length) checkCode();

if (problems.length) {
  console.log(problems.join('\n'));
  console.log(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`OK: ${(codes.length ? codes : all).join(', ')}`);
