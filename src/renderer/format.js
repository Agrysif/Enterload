// Shared helpers: URL checks and Russian-friendly formatting

export const MB = 1024 * 1024;

export const isHttpUrl = value => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

export const sourceFromUrl = value => {
  try {
    const host = new URL(value).hostname;
    const parts = host.split('.').filter(p => p !== 'www' && p !== 'm' && p !== 'mobile');
    return parts.length ? parts.join('.') : host;
  } catch {
    return 'unknown';
  }
};

const fraction = (value, digits = 1) => value.toLocaleString('ru-RU', { maximumFractionDigits: digits });

// 447 114 984 → "447,1 млн"
const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });
export const formatCompact = n => (n == null ? '—' : compact.format(n));
export const formatInt = n => (n == null ? '—' : Math.round(n).toLocaleString('ru-RU'));

export const formatBytes = b => {
  if (!b) return '—';
  if (b >= 1e9) return `${fraction(b / 1e9, 2)} ГБ`;
  if (b >= 1e6) return `${fraction(b / 1e6)} МБ`;
  if (b >= 1e3) return `${fraction(b / 1e3, 0)} КБ`;
  return `${b} Б`;
};

// bytes per second
export const formatSpeed = bps => {
  if (!bps) return '—';
  if (bps >= 1e6) return `${fraction(bps / 1e6)} МБ/с`;
  return `${fraction(bps / 1e3, 0)} КБ/с`;
};

// video length: 3:07, 1:02:03
export const formatClock = sec => {
  const total = Math.round(sec || 0);
  if (!total) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

// totals: "2 ч 15 мин", "4 мин", "37 с"
export const formatSpan = sec => {
  const total = Math.round(sec || 0);
  if (!total) return '—';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h) return m ? `${h} ч ${m} мин` : `${h} ч`;
  if (m) return `${m} мин`;
  return `${total} с`;
};

export const formatEta = sec => {
  if (!(sec > 0)) return '';
  if (sec >= 3600) return `осталось ${formatSpan(sec)}`;
  if (sec >= 60) return `осталось ${Math.round(sec / 60)} мин`;
  return `осталось ${Math.max(1, Math.round(sec))} с`;
};

const startOfDay = ts => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

export const dayKey = ts => startOfDay(ts);

// "Сегодня", "Вчера", "28 октября", "3 марта 2025"
export const formatDay = ts => {
  const diff = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / 864e5);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  const date = new Date(ts);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
};

export const formatTime = ts => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export const formatDateTime = ts => `${formatDay(ts)}, ${formatTime(ts)}`;

// yt-dlp upload_date "20211209" → "09.12.2021"
export const formatUploadDate = value =>
  /^\d{8}$/.test(value || '') ? `${value.slice(6, 8)}.${value.slice(4, 6)}.${value.slice(0, 4)}` : '';

export const parseResolution = res => {
  const [w, h] = String(res || '').split('x').map(Number);
  return w > 0 && h > 0 ? { w, h } : null;
};

// "1920x1080" → "1080p", vertical videos use the short side too
export const resolutionLabel = res => {
  const dims = parseResolution(res);
  if (dims) return `${Math.min(dims.w, dims.h)}p`;
  return res || '';
};

export const average = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);

export const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const basename = p => String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';

export const pluralize = (n, one, few, many) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};
