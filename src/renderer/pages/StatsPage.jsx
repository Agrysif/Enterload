import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { LuChartNoAxesColumn } from 'react-icons/lu';
import { EmptyState } from '../ui';
import {
  average, formatBytes, formatDateTime, formatInt, formatSpan, formatSpeed, parseResolution, pluralize,
} from '../format';

const DAYS = 14;

const Tile = ({ label, value, note, title }) => (
  <div className="tile" title={title}>
    <span>{label}</span>
    <b className="tabular">{value}</b>
    {note && <small>{note}</small>}
  </div>
);

const Section = ({ title, children }) => (
  <section className="stats-section">
    <h3 className="group-title">{title}</h3>
    <div className="tiles">{children}</div>
  </section>
);

function DailyChart({ history, accent, theme }) {
  const { labels, counts } = useMemo(() => {
    const now = new Date();
    const days = Array.from({ length: DAYS }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - (DAYS - 1 - i)));
    const index = new Map(days.map((d, i) => [d.getTime(), i]));
    const values = new Array(DAYS).fill(0);
    history.forEach(item => {
      const d = new Date(item.dateTs);
      const i = index.get(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
      if (i !== undefined) values[i] += 1;
    });
    return {
      labels: days.map(d => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')),
      counts: values,
    };
  }, [history]);

  const data = useMemo(() => ({
    labels,
    datasets: [{
      data: counts,
      backgroundColor: counts.map(c => (c ? accent : `${accent}33`)),
      borderRadius: 6,
      borderSkipped: false,
      barPercentage: 0.72,
      categoryPercentage: 0.9,
      minBarLength: 3,
    }],
  }), [labels, counts, accent]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: items => items[0].label,
          label: item => `${item.raw} ${pluralize(item.raw, 'загрузка', 'загрузки', 'загрузок')}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: theme === 'dark' ? 'rgba(235,235,245,0.5)' : 'rgba(60,60,67,0.55)',
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 7,
          font: { size: 11 },
        },
      },
      y: { display: false, beginAtZero: true },
    },
  }), [theme]);

  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <div className="hero-chart">
      <div className="hero-chart-head">
        <span>Последние {DAYS} дней</span>
        <span className="tabular">{total} {pluralize(total, 'загрузка', 'загрузки', 'загрузок')}</span>
      </div>
      <div className="hero-chart-canvas"><Bar data={data} options={options} /></div>
    </div>
  );
}

export default function StatsPage({ history, sessionStart, appSeconds, totalAppSeconds, accent, theme }) {
  const stats = useMemo(() => {
    const now = Date.now();
    const sizes = history.map(i => i.sizeBytes || 0).filter(b => b > 0);
    const sorted = [...sizes].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = !sorted.length ? 0 : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const durations = history.map(i => i.durationSeconds || 0).filter(d => d > 0);
    const speedsOf = items => items.map(i => i.avgSpeedBps || 0).filter(s => s > 0);
    const speeds = speedsOf(history);
    const session = history.filter(i => i.dateTs > sessionStart);
    const sessionSpeeds = speedsOf(session);
    const dims = history.map(i => parseResolution(i.resolution)).filter(Boolean);
    const last = history.reduce((max, i) => Math.max(max, i.dateTs || 0), 0);
    return {
      total: history.length,
      totalBytes: sizes.reduce((a, b) => a + b, 0),
      avgSize: average(sizes),
      median,
      small: sizes.filter(b => b < 100e6).length,
      medium: sizes.filter(b => b >= 100e6 && b <= 500e6).length,
      large: sizes.filter(b => b > 500e6).length,
      totalDuration: durations.reduce((a, b) => a + b, 0),
      avgDuration: average(durations),
      minDuration: durations.length ? Math.min(...durations) : 0,
      maxDuration: durations.length ? Math.max(...durations) : 0,
      avgSpeed: average(speeds),
      maxSpeed: speeds.length ? Math.max(...speeds) : 0,
      minSpeed: speeds.length ? Math.min(...speeds) : 0,
      sessionAvgSpeed: average(sessionSpeeds),
      session: session.length,
      week: history.filter(i => i.dateTs > now - 7 * 864e5).length,
      month: history.filter(i => i.dateTs > now - 30 * 864e5).length,
      horizontal: dims.filter(d => d.w >= d.h).length,
      vertical: dims.filter(d => d.h > d.w).length,
      last,
    };
  }, [history, sessionStart]);

  const sizeTotal = stats.small + stats.medium + stats.large;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Статистика</h1>
          <p className="page-subtitle">Всё о ваших загрузках</p>
        </div>
      </header>

      {stats.total ? (
        <div className="card stats-hero">
          <div>
            <div className="hero-number tabular">{formatInt(stats.total)}</div>
            <div className="hero-caption">видео скачано</div>
            <div className="hero-sub">
              {formatBytes(stats.totalBytes)} на диске
              <br />
              Последнее — {formatDateTime(stats.last)}
            </div>
          </div>
          <DailyChart history={history} accent={accent} theme={theme} />
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 26 }}>
          <EmptyState icon={<LuChartNoAxesColumn />} title="Пока нет данных" text="Скачайте первое видео — и здесь появятся графики и цифры" />
        </div>
      )}

      {stats.total > 0 && (
        <>
          <Section title="Объём">
            <Tile label="Всего" value={formatBytes(stats.totalBytes)} />
            <Tile label="Средний файл" value={formatBytes(stats.avgSize)} />
            <Tile label="Медиана" value={formatBytes(stats.median)} title="Половина файлов меньше этого размера, половина — больше" />
            {sizeTotal > 0 && (
              <div className="tile distribution">
                <span>Размеры файлов</span>
                <div className="distribution-bar">
                  <i style={{ flexGrow: stats.small }} />
                  <i style={{ flexGrow: stats.medium }} />
                  <i style={{ flexGrow: stats.large }} />
                </div>
                <div className="distribution-legend tabular">
                  <span><i /> до 100 МБ <b>{stats.small}</b></span>
                  <span><i /> 100–500 МБ <b>{stats.medium}</b></span>
                  <span><i /> от 500 МБ <b>{stats.large}</b></span>
                </div>
              </div>
            )}
          </Section>

          <Section title="Длительность видео">
            <Tile label="Всего" value={formatSpan(stats.totalDuration)} />
            <Tile label="В среднем" value={formatSpan(stats.avgDuration)} />
            <Tile label="Самое короткое" value={formatSpan(stats.minDuration)} />
            <Tile label="Самое длинное" value={formatSpan(stats.maxDuration)} />
          </Section>

          <Section title="Скорость загрузки">
            <Tile
              label="Средняя"
              value={formatSpeed(stats.avgSpeed)}
              note={stats.session ? `в этой сессии ${formatSpeed(stats.sessionAvgSpeed)}` : null}
            />
            <Tile label="Максимальная" value={formatSpeed(stats.maxSpeed)} />
            <Tile label="Минимальная" value={formatSpeed(stats.minSpeed)} />
          </Section>

          <Section title="Активность">
            <Tile label="За 7 дней" value={formatInt(stats.week)} />
            <Tile label="За 30 дней" value={formatInt(stats.month)} />
            <Tile label="В этой сессии" value={formatInt(stats.session)} />
            <Tile label="Горизонтальные" value={formatInt(stats.horizontal)} />
            <Tile label="Вертикальные" value={formatInt(stats.vertical)} />
          </Section>
        </>
      )}

      <Section title="Время в приложении">
        <Tile label="Эта сессия" value={formatSpan(appSeconds)} />
        <Tile label="Всего" value={formatSpan(totalAppSeconds)} />
      </Section>
    </div>
  );
}
