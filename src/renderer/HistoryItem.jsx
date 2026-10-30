import React, { useState } from 'react';
import { LuExternalLink, LuFilm, LuFolderOpen, LuMusic, LuTrash2 } from 'react-icons/lu';
import { IconButton } from './ui';
import { formatBytes, formatClock, formatTime, isAudioResolution, resolutionLabel } from './format';
import { t } from '../i18n';

const api = window.enterload;

const HistoryItem = ({ item, onOpenFolder, onDelete }) => {
  const [thumbFailed, setThumbFailed] = useState(false);
  const isAudio = isAudioResolution(item.resolution);
  const meta = [
    resolutionLabel(item.resolution),
    item.sizeBytes ? formatBytes(item.sizeBytes) : '',
    formatClock(item.durationSeconds),
  ].filter(Boolean);

  return (
    <div className="history-row">
      <div className="history-thumb">
        {isAudio ? <LuMusic /> : <LuFilm />}
        {item.thumbnail && !thumbFailed && (
          <img src={item.thumbnail} alt="" loading="lazy" onError={() => setThumbFailed(true)} />
        )}
      </div>
      <div className="history-body">
        <div className="history-title" title={item.title}>{item.title}</div>
        <div className="history-meta tabular">
          {item.source && (
            <img src={`https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(item.source)}`} alt="" />
          )}
          <span>{item.description || item.source}</span>
          {meta.map(part => (
            <React.Fragment key={part}>
              <span className="sep">·</span>
              <span>{part}</span>
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="history-side">
        <span className="history-time tabular">{formatTime(item.dateTs)}</span>
        <div className="history-actions">
          <IconButton icon={<LuFolderOpen />} label={t('common.showInFolder')} onClick={() => onOpenFolder(item)} />
          <IconButton icon={<LuExternalLink />} label={t('history.openPage')} onClick={() => api.openUrl(item.sourceUrl)} />
          <IconButton icon={<LuTrash2 />} label={t('history.remove')} className="danger" onClick={() => onDelete(item)} />
        </div>
      </div>
    </div>
  );
};

export default HistoryItem;
