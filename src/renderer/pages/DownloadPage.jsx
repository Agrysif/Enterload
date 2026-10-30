import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  LuArrowDownToLine, LuCheck, LuChevronRight, LuClipboardPaste, LuCopy, LuFileText, LuFilm, LuFolder, LuFolderOpen,
  LuImage, LuImageDown, LuLink, LuLoaderCircle, LuMaximize2, LuOctagonAlert, LuPause, LuPlay, LuRotateCcw, LuScale,
  LuSlidersHorizontal, LuSparkles, LuTags, LuTriangleAlert, LuX,
} from 'react-icons/lu';
import { EmptyState, Group, IconButton, Menu, Row, Switch } from '../ui';
import { accentGradient } from '../charts';
import { ACTIVE_PHASES } from '../hooks';
import {
  basename, formatBytes, formatClock, formatCompact, formatEta, formatInt, formatSpeed, formatUploadDate, isHttpUrl,
} from '../format';

const api = window.enterload;

export const QUALITY_OPTIONS = [
  { value: 'original', label: 'Лучшее', hint: 'до 4K' },
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
  { value: '480p', label: '480p' },
  { value: '360p', label: '360p' },
  { value: 'audio', label: 'Только аудио', hint: 'MP3' },
];

const PHASE_LABELS = {
  starting: 'Подготовка',
  downloading: 'Скачивание',
  paused: 'Пауза',
  resuming: 'Возобновляем загрузку',
  processing: 'Обработка файла',
  done: 'Готово',
  error: 'Не удалось скачать',
};

const TAGS_PREVIEW = 14;
const STICKY_GAP = 16;

// The left column stays in view while the preview scrolls.
// If it doesn't fit the window, it first scrolls to its bottom edge and sticks there.
function useStickyColumn(ref) {
  useEffect(() => {
    const column = ref.current;
    const scroller = column?.closest('.content');
    if (!column || !scroller) return undefined;
    const update = () => {
      const top = Math.min(STICKY_GAP, scroller.clientHeight - column.offsetHeight - STICKY_GAP);
      column.style.setProperty('--sticky-top', `${top}px`);
    };
    const observer = new ResizeObserver(update);
    observer.observe(column);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [ref]);
}

function SpeedChart({ points, accent }) {
  const data = useMemo(() => ({
    labels: points.map((_, i) => i),
    datasets: [{
      data: points.map(p => p / 1e6),
      fill: true,
      backgroundColor: accentGradient(accent),
      borderColor: accent,
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.4,
    }],
  }), [points, accent]);
  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: { x: { display: false }, y: { display: false, beginAtZero: true } },
  }), []);
  return <div className="status-chart"><Line data={data} options={options} /></div>;
}

function StatusCard({ status, accent, downloader, onOpenFolder }) {
  const { phase, progress, result } = status;
  const active = ACTIVE_PHASES.includes(phase);
  const indeterminate = ['starting', 'resuming', 'processing'].includes(phase);
  const showPercent = active && phase !== 'starting' && phase !== 'processing';
  const icon = {
    done: <LuCheck />,
    error: <LuOctagonAlert />,
    paused: <LuPause />,
    resuming: <LuLoaderCircle className="spin" />,
  }[phase] || <LuArrowDownToLine />;
  const track = indeterminate ? 'indeterminate' : phase === 'done' ? 'success' : '';

  return (
    <div className={`card status-card ${phase}`}>
      <div className="status-head">
        <span className="status-icon">{icon}</span>
        <span className="status-title">
          <b>{PHASE_LABELS[phase]}</b>
          <small title={status.title}>{status.title}</small>
        </span>
        {showPercent && <span className="status-percent tabular">{Math.floor(progress)}%</span>}
        {active ? (
          <>
            <IconButton
              icon={phase === 'paused' ? <LuPlay /> : <LuPause />}
              label={phase === 'paused' ? 'Продолжить' : 'Пауза'}
              onClick={phase === 'paused' ? downloader.resume : downloader.pause}
              disabled={indeterminate}
              className="filled"
            />
            <IconButton icon={<LuX />} label="Отменить" onClick={downloader.cancel} className="filled danger" />
          </>
        ) : (
          <IconButton icon={<LuX />} label="Скрыть" onClick={downloader.dismiss} />
        )}
      </div>

      {phase === 'error' ? (
        <p className="status-error">{status.error}</p>
      ) : (
        <div className={`progress-track ${track}`}>
          <div className="progress-fill" style={{ width: `${phase === 'done' ? 100 : progress}%` }} />
        </div>
      )}

      {(phase === 'downloading' || phase === 'paused') && (
        <div className="status-meta tabular">
          <span>{formatSpeed(status.speed)} · {formatBytes(status.downloaded)}</span>
          <span>{phase === 'paused' ? 'на паузе' : formatEta(status.eta)}</span>
        </div>
      )}
      {phase === 'resuming' && (
        <div className="status-meta"><span>Подождите, подключаемся к сайту — обычно это несколько секунд</span></div>
      )}
      {phase === 'processing' && (
        <div className="status-meta"><span>Склеиваем видео и звук, встраиваем обложку…</span></div>
      )}
      {active && status.points.length > 1 && <SpeedChart points={status.points} accent={accent} />}

      {phase === 'done' && result && (
        <>
          <div className="status-meta tabular">
            <span>{formatBytes(result.sizeBytes)}</span>
            <span>в среднем {formatSpeed(result.avgSpeedBps)}</span>
          </div>
          <div className="status-actions">
            <button type="button" className="btn btn-tinted btn-sm" onClick={() => onOpenFolder(result)}>
              <LuFolderOpen /> Показать в папке
            </button>
          </div>
        </>
      )}
      {phase === 'error' && (
        <div className="status-actions">
          <button type="button" className="btn btn-tinted btn-sm" onClick={downloader.retry}>
            <LuRotateCcw /> Повторить
          </button>
        </div>
      )}
    </div>
  );
}

const Metric = ({ label, value, title }) => (
  <div className="metric" title={title}>
    <span>{label}</span>
    <b className="tabular">{value}</b>
  </div>
);

function Lightbox({ src, onCopy, onClose }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="lightbox" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <img src={src} alt="" />
      <div className="toolbar">
        <button type="button" className="btn btn-gray" onClick={onCopy}><LuCopy /> Копировать</button>
        <button type="button" className="btn btn-gray" onClick={onClose}>Закрыть</button>
      </div>
    </div>
  );
}

function ChipSection({ title, items, copyText }) {
  const [expanded, setExpanded] = useState(false);
  if (!items.length) return null;
  const visible = expanded ? items : items.slice(0, TAGS_PREVIEW);
  return (
    <div className="video-section">
      <div className="video-section-head">
        <h4>{title}</h4>
        <button type="button" className="btn btn-plain btn-sm" onClick={() => copyText(items.join(', '), `Скопировано: ${title.toLowerCase()}`)}>
          Копировать все
        </button>
      </div>
      <div className="tags">
        {visible.map(item => (
          <button type="button" key={item} className="chip" title="Скопировать" onClick={() => copyText(item, `Скопировано «${item}»`)}>
            {item}
          </button>
        ))}
        {items.length > TAGS_PREVIEW && (
          <button type="button" className="chip" onClick={() => setExpanded(v => !v)}>
            {expanded ? 'Меньше' : `+${items.length - TAGS_PREVIEW}`}
          </button>
        )}
      </div>
    </div>
  );
}

function VideoDetails({ info, notify }) {
  const [lightbox, setLightbox] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  const copyText = (text, message) => {
    api.copyText(text);
    notify(message, { force: true, tone: 'success' });
  };
  const copyImage = async () => {
    const res = await api.copyImage(info.thumbnail);
    if (res?.ok) notify('Обложка скопирована', { force: true, tone: 'success' });
    else notify(`Не удалось скопировать: ${res?.error || 'ошибка'}`, { force: true, tone: 'danger' });
  };

  const uploadDate = formatUploadDate(info.uploadDate);

  return (
    <div className="card preview">
      <div className="thumb">
        {info.thumbnail ? <img src={info.thumbnail} alt="" /> : <LuFilm />}
        {info.durationSeconds > 0 && <span className="thumb-badge tabular">{formatClock(info.durationSeconds)}</span>}
        {info.ageLimit >= 18 && <span className="thumb-badge age">18+</span>}
        {info.thumbnail && (
          <div className="thumb-actions">
            <button type="button" className="glass-btn" title="Скопировать обложку" onClick={copyImage}><LuCopy /></button>
            <button type="button" className="glass-btn" title="Открыть обложку" onClick={() => setLightbox(true)}><LuMaximize2 /></button>
          </div>
        )}
      </div>

      <div className="video-head">
        <h2 className="video-title">{info.title}</h2>
        {info.channelName && (
          <div className="video-channel">
            <span className="avatar">{info.channelName.trim()[0]}</span>
            <b>{info.channelName}</b>
            {info.extractor && <span>· {info.extractor}</span>}
          </div>
        )}
      </div>

      <div className="metrics">
        {info.resolution && <Metric label="Разрешение" value={info.resolution.replace('x', '×')} />}
        {info.fps && <Metric label="Кадры" value={`${info.fps} fps`} />}
        {info.filesize && <Metric label="Размер" value={`≈ ${formatBytes(info.filesize)}`} />}
        {info.views != null && <Metric label="Просмотры" value={formatCompact(info.views)} title={formatInt(info.views)} />}
        {info.likes != null && <Metric label="Лайки" value={formatCompact(info.likes)} title={formatInt(info.likes)} />}
        {uploadDate && <Metric label="Опубликовано" value={uploadDate} />}
      </div>

      {info.license && <div className="license-line"><LuScale /> {info.license}</div>}

      {info.description && (
        <div className="video-section">
          <div className="video-section-head">
            <h4>Описание</h4>
            <div className="toolbar">
              <button type="button" className="btn btn-plain btn-sm" onClick={() => setDescExpanded(v => !v)}>
                {descExpanded ? 'Свернуть' : 'Развернуть'}
              </button>
              <button type="button" className="btn btn-plain btn-sm" onClick={() => copyText(info.description, 'Описание скопировано')}>
                Копировать
              </button>
            </div>
          </div>
          <p className={`description${descExpanded ? ' expanded' : ''}`}>{info.description}</p>
        </div>
      )}

      <ChipSection title="В ролях" items={info.cast || []} copyText={copyText} />
      <ChipSection title="Категории" items={info.categories || []} copyText={copyText} />
      <ChipSection title="Теги" items={info.tags || []} copyText={copyText} />

      {lightbox && <Lightbox src={info.thumbnail} onCopy={copyImage} onClose={() => setLightbox(false)} />}
    </div>
  );
}

function Preview({ url, meta, notify }) {
  const target = url.trim();
  if (!target) {
    return (
      <div className="card preview">
        <EmptyState
          icon={<LuSparkles />}
          title="Вставьте ссылку"
          text="YouTube, VK Видео, Rutube и сотни других сайтов — обложка и подробности появятся здесь"
        />
      </div>
    );
  }
  if (!isHttpUrl(target)) {
    return (
      <div className="card preview">
        <EmptyState icon={<LuLink />} title="Это не похоже на ссылку" text="Ссылка должна начинаться с http:// или https://" />
      </div>
    );
  }
  if (meta.error) {
    return (
      <div className="card preview">
        <EmptyState tone="danger" icon={<LuOctagonAlert />} title="Не удалось открыть ссылку" text={`${meta.error}. Подробности — в разделе «Ошибки».`} />
      </div>
    );
  }
  if (!meta.info) {
    return (
      <div className="card preview preview-skeleton">
        <div className="thumb skeleton" />
        <div className="skeleton line" style={{ width: '85%', height: 20, marginTop: 18 }} />
        <div className="skeleton line" style={{ width: '45%' }} />
        <div className="metrics">
          {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 54, borderRadius: 14 }} />)}
        </div>
        <div className="analysis-note">
          <span>{meta.slow ? 'Это занимает больше времени, чем обычно…' : 'Анализируем ссылку…'}</span>
          <span className="tabular">{meta.progress}%</span>
        </div>
      </div>
    );
  }
  return <VideoDetails key={target} info={meta.info} notify={notify} />;
}

export default function DownloadPage({
  url, setUrl, meta, options, setOption, downloadPath, onSelectFolder, downloader, engine, accent, notify, onOpenFolder,
}) {
  const { status, isActive } = downloader;
  const target = url.trim();
  const canDownload = isHttpUrl(target) && !isActive;
  const columnRef = useRef(null);
  useStickyColumn(columnRef);

  const paste = async () => {
    const res = await api.readClipboardText();
    const text = res?.text?.trim();
    if (text) setUrl(text);
    else notify('В буфере обмена нет текста', { force: true });
  };

  const start = () => {
    if (!canDownload) return;
    downloader.start({ url: target, ...options, downloadPath, info: meta.info });
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Загрузка</h1>
          <p className="page-subtitle">Видео и музыка по ссылке — в один клик</p>
        </div>
      </header>

      <div className="download-layout">
        <div className="composer" ref={columnRef}>
          <div>
            <div className="url-box">
              <LuLink />
              <input
                type="text"
                placeholder="Ссылка на видео"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && start()}
                spellCheck={false}
                autoFocus
              />
              {url ? (
                <IconButton icon={<LuX />} label="Очистить" onClick={() => setUrl('')} />
              ) : (
                <button type="button" className="btn btn-tinted btn-sm" onClick={paste}>
                  <LuClipboardPaste /> Вставить
                </button>
              )}
            </div>
            {target && !isHttpUrl(target) && <p className="url-hint danger">Ссылка должна начинаться с http:// или https://</p>}
          </div>

          <Group title="Параметры">
            <Row icon={<LuSlidersHorizontal />} title="Качество">
              <Menu value={options.quality} options={QUALITY_OPTIONS} onChange={v => setOption('quality', v)} label="Качество" />
            </Row>
            <Row icon={<LuImage />} title="Обложка" subtitle="Встроить превью в файл">
              <Switch checked={options.embedThumbnail} onChange={v => setOption('embedThumbnail', v)} label="Обложка" />
            </Row>
            <Row icon={<LuTags />} title="Метаданные" subtitle="Название, автор и описание">
              <Switch checked={options.embedMetadata} onChange={v => setOption('embedMetadata', v)} label="Метаданные" />
            </Row>
            <Row icon={<LuImageDown />} title="Обложка отдельно" subtitle="Сохранить .jpg рядом с видео">
              <Switch checked={options.saveThumbnail} onChange={v => setOption('saveThumbnail', v)} label="Обложка отдельно" />
            </Row>
            <Row icon={<LuFileText />} title="Описание в .txt" subtitle="Ссылка, описание, категории и теги рядом с видео">
              <Switch checked={options.saveInfo} onChange={v => setOption('saveInfo', v)} label="Описание в .txt" />
            </Row>
            <Row icon={<LuFolder />} title="Папка" onClick={onSelectFolder} hint={downloadPath}>
              <span className="row-value">{basename(downloadPath) || 'Выбрать'}</span>
              <LuChevronRight className="row-chevron" />
            </Row>
          </Group>

          {engine.ffmpeg === false && (
            <div className="engine-note">
              <LuTriangleAlert />
              <span>ffmpeg не найден — доступны только готовые форматы (обычно до 720p), обложка и метаданные не встраиваются.</span>
            </div>
          )}

          <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!canDownload} onClick={start}>
            {isActive ? <><LuLoaderCircle className="spin" /> Идёт загрузка</> : <><LuArrowDownToLine /> Скачать</>}
          </button>

          {status.phase !== 'idle' && (
            <StatusCard status={status} accent={accent} downloader={downloader} onOpenFolder={onOpenFolder} />
          )}
        </div>

        <Preview url={url} meta={meta} notify={notify} />
      </div>
    </div>
  );
}
