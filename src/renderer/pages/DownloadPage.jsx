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
import { t } from '../../i18n';

const api = window.enterload;

const qualityOptions = () => [
  { value: 'original', label: t('quality.best'), hint: t('quality.bestHint') },
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
  { value: '480p', label: '480p' },
  { value: '360p', label: '360p' },
  { value: 'audio', label: t('quality.audio'), hint: 'MP3' },
];

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
          <b>{t(`phase.${phase}`)}</b>
          <small title={status.title}>{status.title}</small>
        </span>
        {showPercent && <span className="status-percent tabular">{Math.floor(progress)}%</span>}
        {active ? (
          <>
            <IconButton
              icon={phase === 'paused' ? <LuPlay /> : <LuPause />}
              label={phase === 'paused' ? t('status.resume') : t('status.pause')}
              onClick={phase === 'paused' ? downloader.resume : downloader.pause}
              disabled={indeterminate}
              className="filled"
            />
            <IconButton icon={<LuX />} label={t('status.cancel')} onClick={downloader.cancel} className="filled danger" />
          </>
        ) : (
          <IconButton icon={<LuX />} label={t('status.dismiss')} onClick={downloader.dismiss} />
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
          <span>{phase === 'paused' ? t('status.onPause') : formatEta(status.eta)}</span>
        </div>
      )}
      {phase === 'resuming' && (
        <div className="status-meta"><span>{t('status.resumingNote')}</span></div>
      )}
      {phase === 'processing' && (
        <div className="status-meta"><span>{t('status.processingNote')}</span></div>
      )}
      {active && status.points.length > 1 && <SpeedChart points={status.points} accent={accent} />}

      {phase === 'done' && result && (
        <>
          <div className="status-meta tabular">
            <span>{formatBytes(result.sizeBytes)}</span>
            <span>{t('status.average', { speed: formatSpeed(result.avgSpeedBps) })}</span>
          </div>
          <div className="status-actions">
            <button type="button" className="btn btn-tinted btn-sm" onClick={() => onOpenFolder(result)}>
              <LuFolderOpen /> {t('common.showInFolder')}
            </button>
          </div>
        </>
      )}
      {phase === 'error' && (
        <div className="status-actions">
          <button type="button" className="btn btn-tinted btn-sm" onClick={downloader.retry}>
            <LuRotateCcw /> {t('status.retry')}
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
        <button type="button" className="btn btn-gray" onClick={onCopy}><LuCopy /> {t('common.copy')}</button>
        <button type="button" className="btn btn-gray" onClick={onClose}>{t('common.close')}</button>
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
        <button type="button" className="btn btn-plain btn-sm" onClick={() => copyText(items.join(', '), t('video.copiedList', { what: title.toLowerCase() }))}>
          {t('video.copyAll')}
        </button>
      </div>
      <div className="tags">
        {visible.map(item => (
          <button type="button" key={item} className="chip" title={t('video.copyItem')} onClick={() => copyText(item, t('video.copiedItem', { item }))}>
            {item}
          </button>
        ))}
        {items.length > TAGS_PREVIEW && (
          <button type="button" className="chip" onClick={() => setExpanded(v => !v)}>
            {expanded ? t('video.less') : `+${items.length - TAGS_PREVIEW}`}
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
    if (res?.ok) notify(t('video.coverCopied'), { force: true, tone: 'success' });
    else notify(t('video.copyFailed', { error: res?.error || t('common.error') }), { force: true, tone: 'danger' });
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
            <button type="button" className="glass-btn" title={t('video.copyCover')} onClick={copyImage}><LuCopy /></button>
            <button type="button" className="glass-btn" title={t('video.openCover')} onClick={() => setLightbox(true)}><LuMaximize2 /></button>
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
        {info.resolution && <Metric label={t('video.resolution')} value={info.resolution.replace('x', '×')} />}
        {info.fps && <Metric label={t('video.fps')} value={`${info.fps} fps`} />}
        {info.filesize && <Metric label={t('video.size')} value={`≈ ${formatBytes(info.filesize)}`} />}
        {info.views != null && <Metric label={t('video.views')} value={formatCompact(info.views)} title={formatInt(info.views)} />}
        {info.likes != null && <Metric label={t('video.likes')} value={formatCompact(info.likes)} title={formatInt(info.likes)} />}
        {uploadDate && <Metric label={t('video.published')} value={uploadDate} />}
      </div>

      {info.license && <div className="license-line"><LuScale /> {info.license}</div>}

      {info.description && (
        <div className="video-section">
          <div className="video-section-head">
            <h4>{t('video.description')}</h4>
            <div className="toolbar">
              <button type="button" className="btn btn-plain btn-sm" onClick={() => setDescExpanded(v => !v)}>
                {descExpanded ? t('video.collapse') : t('video.expand')}
              </button>
              <button type="button" className="btn btn-plain btn-sm" onClick={() => copyText(info.description, t('video.descriptionCopied'))}>
                {t('common.copy')}
              </button>
            </div>
          </div>
          <p className={`description${descExpanded ? ' expanded' : ''}`}>{info.description}</p>
        </div>
      )}

      <ChipSection title={t('video.cast')} items={info.cast || []} copyText={copyText} />
      <ChipSection title={t('video.categories')} items={info.categories || []} copyText={copyText} />
      <ChipSection title={t('video.tags')} items={info.tags || []} copyText={copyText} />

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
          title={t('preview.emptyTitle')}
          text={t('preview.emptyText')}
        />
      </div>
    );
  }
  if (!isHttpUrl(target)) {
    return (
      <div className="card preview">
        <EmptyState icon={<LuLink />} title={t('preview.notLinkTitle')} text={t('download.linkHint')} />
      </div>
    );
  }
  if (meta.error) {
    return (
      <div className="card preview">
        <EmptyState tone="danger" icon={<LuOctagonAlert />} title={t('preview.errorTitle')} text={t('preview.errorText', { error: meta.error })} />
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
          <span>{meta.slow ? t('preview.slow') : t('preview.analyzing')}</span>
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
    else notify(t('download.noClipboardText'), { force: true });
  };

  const start = () => {
    if (!canDownload) return;
    downloader.start({ url: target, ...options, downloadPath, info: meta.info });
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('nav.download')}</h1>
          <p className="page-subtitle">{t('download.subtitle')}</p>
        </div>
      </header>

      <div className="download-layout">
        <div className="composer" ref={columnRef}>
          <div>
            <div className="url-box">
              <LuLink />
              <input
                type="text"
                placeholder={t('download.linkPlaceholder')}
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && start()}
                spellCheck={false}
                autoFocus
              />
              {url ? (
                <IconButton icon={<LuX />} label={t('common.clear')} onClick={() => setUrl('')} />
              ) : (
                <button type="button" className="btn btn-tinted btn-sm" onClick={paste}>
                  <LuClipboardPaste /> {t('download.paste')}
                </button>
              )}
            </div>
            {target && !isHttpUrl(target) && <p className="url-hint danger">{t('download.linkHint')}</p>}
          </div>

          <Group title={t('download.options')}>
            <Row icon={<LuSlidersHorizontal />} title={t('option.quality')}>
              <Menu value={options.quality} options={qualityOptions()} onChange={v => setOption('quality', v)} label={t('option.quality')} />
            </Row>
            <Row icon={<LuImage />} title={t('option.cover')} subtitle={t('option.coverHint')}>
              <Switch checked={options.embedThumbnail} onChange={v => setOption('embedThumbnail', v)} label={t('option.cover')} />
            </Row>
            <Row icon={<LuTags />} title={t('option.metadata')} subtitle={t('option.metadataHint')}>
              <Switch checked={options.embedMetadata} onChange={v => setOption('embedMetadata', v)} label={t('option.metadata')} />
            </Row>
            <Row icon={<LuImageDown />} title={t('option.saveCover')} subtitle={t('option.saveCoverHint')}>
              <Switch checked={options.saveThumbnail} onChange={v => setOption('saveThumbnail', v)} label={t('option.saveCover')} />
            </Row>
            <Row icon={<LuFileText />} title={t('option.saveInfo')} subtitle={t('option.saveInfoHint')}>
              <Switch checked={options.saveInfo} onChange={v => setOption('saveInfo', v)} label={t('option.saveInfo')} />
            </Row>
            <Row icon={<LuFolder />} title={t('option.folder')} onClick={onSelectFolder} hint={downloadPath}>
              <span className="row-value">{basename(downloadPath) || t('option.chooseFolder')}</span>
              <LuChevronRight className="row-chevron" />
            </Row>
          </Group>

          {engine.ffmpeg === false && (
            <div className="engine-note">
              <LuTriangleAlert />
              <span>{t('download.noFfmpeg')}</span>
            </div>
          )}

          <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!canDownload} onClick={start}>
            {isActive ? <><LuLoaderCircle className="spin" /> {t('download.inProgress')}</> : <><LuArrowDownToLine /> {t('download.start')}</>}
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
