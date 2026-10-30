import React, { useMemo, useState } from 'react';
import { LuCircleCheckBig, LuCopy, LuFileText, LuOctagonAlert, LuSearch, LuTrash2, LuTriangleAlert } from 'react-icons/lu';
import { EmptyState, IconButton, Segmented, Sheet } from '../ui';
import { formatDateTime } from '../format';
import { t } from '../../i18n';

const api = window.enterload;

const fullText = err => `${err.title}\n\n${err.log || err.description}`;

export default function ErrorsPage({ errorLog, setErrorLog, notify }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('new');
  const [selectedId, setSelectedId] = useState(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = sort === 'new' ? [...errorLog].reverse() : errorLog;
    if (!q) return sorted;
    return sorted.filter(e => [e.title, e.description, e.log].some(f => String(f || '').toLowerCase().includes(q)));
  }, [errorLog, query, sort]);
  const selected = errorLog.find(e => e.id === selectedId) || null;

  const copy = err => {
    api.copyText(fullText(err));
    notify(t('errors.copied'), { force: true, tone: 'success' });
  };
  const remove = err => setErrorLog(list => list.filter(e => e.id !== err.id));
  const clearAll = () => {
    if (window.confirm(t('errors.clearConfirm'))) setErrorLog([]);
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('nav.errors')}</h1>
          <p className="page-subtitle">
            {errorLog.length ? t('errors.count', { count: errorLog.length }) : t('errors.subtitle')}
          </p>
        </div>
        {errorLog.length > 0 && (
          <div className="toolbar">
            <Segmented
              options={[{ value: 'new', label: t('errors.sortNew') }, { value: 'old', label: t('errors.sortOld') }]}
              value={sort}
              onChange={setSort}
            />
            <label className="field field-search">
              <LuSearch />
              <input type="text" placeholder={t('common.search')} value={query} onChange={e => setQuery(e.target.value)} />
            </label>
            <button type="button" className="btn btn-danger" onClick={clearAll}>{t('common.clear')}</button>
          </div>
        )}
      </header>

      {!errorLog.length && (
        <div className="card">
          <EmptyState tone="success" icon={<LuCircleCheckBig />} title={t('errors.emptyTitle')} text={t('errors.emptyText')} />
        </div>
      )}

      {errorLog.length > 0 && !visible.length && (
        <div className="card">
          <EmptyState icon={<LuSearch />} title={t('common.nothingFound')} text={t('errors.nothingText')} />
        </div>
      )}

      {visible.length > 0 && (
        <div className="group-body">
          {visible.map(err => (
            <div className="error-row" key={err.id}>
              <span className={`error-dot${err.critical ? ' critical' : ''}`}>
                {err.critical ? <LuOctagonAlert /> : <LuTriangleAlert />}
              </span>
              <div className="error-body">
                <div className="error-title">
                  {err.title}
                  <time className="tabular">{formatDateTime(err.timestamp)}</time>
                </div>
                <div className="error-desc">{err.description}</div>
                <div className="error-actions">
                  <button type="button" className="btn btn-plain btn-sm" onClick={() => setSelectedId(err.id)}>
                    <LuFileText /> {t('errors.details')}
                  </button>
                  <button type="button" className="btn btn-plain btn-sm" onClick={() => copy(err)}>
                    <LuCopy /> {t('common.copy')}
                  </button>
                  <IconButton icon={<LuTrash2 />} label={t('common.delete')} className="danger" onClick={() => remove(err)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <Sheet
          title={selected.title}
          onClose={() => setSelectedId(null)}
          footer={(
            <>
              <button type="button" className="btn btn-gray" onClick={() => copy(selected)}><LuCopy /> {t('common.copy')}</button>
              <button type="button" className="btn btn-primary" onClick={() => setSelectedId(null)}>{t('common.done')}</button>
            </>
          )}
        >
          <p className="page-subtitle" style={{ marginTop: 0, marginBottom: 12 }}>
            {formatDateTime(selected.timestamp)} · {selected.critical ? t('errors.critical') : t('errors.nonCritical')}
          </p>
          <pre className="code">{selected.log || selected.description}</pre>
        </Sheet>
      )}
    </div>
  );
}
