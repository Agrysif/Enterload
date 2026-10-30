// Shared helpers: URL checks and formatting in the interface language
import { formatDate, formatUploadDate as uploadDate, getLanguage, numberLocale, t } from '../i18n';

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

const fraction = (value, digits = 1) => value.toLocaleString(numberLocale(), { maximumFractionDigits: digits });

export const formatInt = n => (n == null ? '—' : Math.round(n).toLocaleString(numberLocale()));

const COMPACT_UNITS = [[1e9, 'number.billion'], [1e6, 'number.million'], [1e3, 'number.thousand']];

// 447 114 984 → "447,1 млн". Chinese counts in 万 and 亿, so Intl does it there.
export const formatCompact = n => {
  if (n == null) return '—';
  if (getLanguage() === 'zh') return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  const unit = COMPACT_UNITS.find(([size]) => n >= size);
  return unit ? t(unit[1], { n: fraction(n / unit[0]) }) : formatInt(n);
};

export const formatBytes = b => {
  if (!b) return '—';
  if (b >= 1e9) return `${fraction(b / 1e9, 2)} ${t('unit.gb')}`;
  if (b >= 1e6) return `${fraction(b / 1e6)} ${t('unit.mb')}`;
  if (b >= 1e3) return `${fraction(b / 1e3, 0)} ${t('unit.kb')}`;
  return `${b} ${t('unit.b')}`;
};

// bytes per second
export const formatSpeed = bps => {
  if (!bps) return '—';
  if (bps >= 1e6) return `${fraction(bps / 1e6)} ${t('unit.mbps')}`;
  return `${fraction(bps / 1e3, 0)} ${t('unit.kbps')}`;
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
  if (h) return m ? `${h} ${t('unit.h')} ${m} ${t('unit.min')}` : `${h} ${t('unit.h')}`;
  if (m) return `${m} ${t('unit.min')}`;
  return `${total} ${t('unit.s')}`;
};

export const formatEta = sec => {
  if (!(sec > 0)) return '';
  if (sec >= 3600) return t('time.left', { time: formatSpan(sec) });
  if (sec >= 60) return t('time.left', { time: `${Math.round(sec / 60)} ${t('unit.min')}` });
  return t('time.left', { time: `${Math.max(1, Math.round(sec))} ${t('unit.s')}` });
};

const startOfDay = ts => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

export const dayKey = ts => startOfDay(ts);

// "Сегодня", "Вчера", "28 октября", "3 марта 2025"
export const formatDay = ts => {
  const diff = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / 864e5);
  if (diff === 0) return t('date.today');
  if (diff === 1) return t('date.yesterday');
  const date = new Date(ts);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return formatDate({ year: sameYear ? null : date.getFullYear(), month: date.getMonth(), day: date.getDate() });
};

export const formatTime = ts => {
  const date = new Date(ts);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export const formatDateTime = ts => `${formatDay(ts)}, ${formatTime(ts)}`;

// yt-dlp upload_date "20211209" → "9 дек 2021"
export const formatUploadDate = value => uploadDate(value, { short: true });

export const parseResolution = res => {
  const [w, h] = String(res || '').split('x').map(Number);
  return w > 0 && h > 0 ? { w, h } : null;
};

// older versions stored the Russian word
export const isAudioResolution = res => res === 'audio' || res === 'аудио';

// "1920x1080" → "1080p", vertical videos use the short side too
export const resolutionLabel = res => {
  if (isAudioResolution(res)) return t('history.audio');
  const dims = parseResolution(res);
  if (dims) return `${Math.min(dims.w, dims.h)}p`;
  return res || '';
};

export const average = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);

export const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const basename = p => String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
