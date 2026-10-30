import React, { useEffect, useMemo, useState } from 'react';
import { LuArrowDownToLine, LuHistory, LuListFilter, LuSearch } from 'react-icons/lu';
import { EmptyState, IconButton } from '../ui';
import HistoryItem from '../HistoryItem';
import { MB, dayKey, formatDay, pluralize, resolutionLabel } from '../format';

const PAGE = 30;
const EMPTY_FILTERS = {
  services: [], dateFrom: '', dateTo: '', sizeMin: '', sizeMax: '', durMin: '', durMax: '', resolution: '',
};

const num = value => (value === '' || value == null ? null : Number(value));

export default function HistoryPage({ history, setHistory, onOpenFolder, onGoDownload }) {
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [limit, setLimit] = useState(PAGE);

  const hasFilters = Object.entries(filters).some(([, v]) => (Array.isArray(v) ? v.length : v !== ''));
  const services = useMemo(() => Array.from(new Set(history.map(i => i.source).filter(Boolean))).sort(), [history]);
  const resolutions = useMemo(
    () => Array.from(new Set(history.map(i => resolutionLabel(i.resolution)).filter(Boolean)))
      .sort((a, b) => parseInt(b, 10) - parseInt(a, 10)),
    [history],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const from = filters.dateFrom ? new Date(filters.dateFrom).setHours(0, 0, 0, 0) : null;
    const to = filters.dateTo ? new Date(filters.dateTo).setHours(23, 59, 59, 999) : null;
    const [sizeMin, sizeMax, durMin, durMax] = [filters.sizeMin, filters.sizeMax, filters.durMin, filters.durMax].map(num);
    return history.filter(item => {
      if (q && ![item.title, item.description, item.source].some(f => String(f || '').toLowerCase().includes(q))) return false;
      if (filters.services.length && !filters.services.includes(item.source)) return false;
      if (from && item.dateTs < from) return false;
      if (to && item.dateTs > to) return false;
      const sizeMb = (item.sizeBytes || 0) / MB;
      if (sizeMin != null && sizeMb < sizeMin) return false;
      if (sizeMax != null && sizeMb > sizeMax) return false;
      const minutes = (item.durationSeconds || 0) / 60;
      if (durMin != null && minutes < durMin) return false;
      if (durMax != null && minutes > durMax) return false;
      return !(filters.resolution && resolutionLabel(item.resolution) !== filters.resolution);
    }).reverse();
  }, [history, query, filters]);

  useEffect(() => setLimit(PAGE), [query, filters]);

  // group the visible items by day, newest first
  const sections = useMemo(() => {
    const result = [];
    filtered.slice(0, limit).forEach(item => {
      const key = dayKey(item.dateTs);
      const last = result[result.length - 1];
      if (last && last.key === key) last.items.push(item);
      else result.push({ key, title: formatDay(item.dateTs), items: [item] });
    });
    return result;
  }, [filtered, limit]);

  const update = patch => setFilters(f => ({ ...f, ...patch }));
  const remove = item => setHistory(list => list.filter(i => i !== item));
  const clearAll = () => {
    if (window.confirm('Очистить всю историю загрузок? Файлы на диске останутся.')) setHistory([]);
  };

  const subtitle = hasFilters || query
    ? `Найдено ${filtered.length} из ${history.length}`
    : `${history.length} ${pluralize(history.length, 'загрузка', 'загрузки', 'загрузок')}`;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">История</h1>
          {history.length > 0 && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {history.length > 0 && (
          <div className="toolbar">
            <label className="field field-search">
              <LuSearch />
              <input type="text" placeholder="Поиск" value={query} onChange={e => setQuery(e.target.value)} />
            </label>
            <IconButton
              icon={<LuListFilter />}
              label="Фильтры"
              onClick={() => setFiltersOpen(v => !v)}
              className={filtersOpen ? 'active' : 'filled'}
            >
              {hasFilters && !filtersOpen && <span className="dot" />}
            </IconButton>
            <button type="button" className="btn btn-danger" onClick={clearAll}>Очистить</button>
          </div>
        )}
      </header>

      {filtersOpen && history.length > 0 && (
        <div className="card filters">
          {services.length > 0 && (
            <div className="filter-field wide">
              <label>Сервис</label>
              <div className="chips">
                {services.map(s => (
                  <button
                    key={s}
                    type="button"
                    className={`chip${filters.services.includes(s) ? ' selected' : ''}`}
                    onClick={() => update({
                      services: filters.services.includes(s) ? filters.services.filter(x => x !== s) : [...filters.services, s],
                    })}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="filter-field">
            <label>Дата</label>
            <div className="pair">
              <span className="field field-sm"><input type="date" value={filters.dateFrom} onChange={e => update({ dateFrom: e.target.value })} /></span>
              <span className="field field-sm"><input type="date" value={filters.dateTo} onChange={e => update({ dateTo: e.target.value })} /></span>
            </div>
          </div>
          <div className="filter-field">
            <label>Размер, МБ</label>
            <div className="pair">
              <span className="field field-sm"><input type="number" min="0" placeholder="от" value={filters.sizeMin} onChange={e => update({ sizeMin: e.target.value })} /></span>
              <span className="field field-sm"><input type="number" min="0" placeholder="до" value={filters.sizeMax} onChange={e => update({ sizeMax: e.target.value })} /></span>
            </div>
          </div>
          <div className="filter-field">
            <label>Длительность, мин</label>
            <div className="pair">
              <span className="field field-sm"><input type="number" min="0" placeholder="от" value={filters.durMin} onChange={e => update({ durMin: e.target.value })} /></span>
              <span className="field field-sm"><input type="number" min="0" placeholder="до" value={filters.durMax} onChange={e => update({ durMax: e.target.value })} /></span>
            </div>
          </div>
          <div className="filter-field">
            <label>Качество</label>
            <span className="field field-sm">
              <select value={filters.resolution} onChange={e => update({ resolution: e.target.value })}>
                <option value="">Любое</option>
                {resolutions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </span>
          </div>
          <div className="filters-footer">
            <button type="button" className="btn btn-plain btn-sm" disabled={!hasFilters} onClick={() => setFilters(EMPTY_FILTERS)}>
              Сбросить фильтры
            </button>
          </div>
        </div>
      )}

      {!history.length && (
        <div className="card">
          <EmptyState
            icon={<LuHistory />}
            title="История пуста"
            text="Здесь появятся все скачанные видео — с быстрым доступом к файлам"
            action={(
              <button type="button" className="btn btn-primary" onClick={onGoDownload}>
                <LuArrowDownToLine /> Скачать первое видео
              </button>
            )}
          />
        </div>
      )}

      {history.length > 0 && !filtered.length && (
        <div className="card">
          <EmptyState icon={<LuSearch />} title="Ничего не найдено" text="Попробуйте изменить запрос или сбросить фильтры" />
        </div>
      )}

      {sections.map(section => (
        <section className="group" key={section.key}>
          <h3 className="group-title">{section.title}</h3>
          <div className="group-body">
            {section.items.map((item, i) => (
              <HistoryItem
                key={item.id || `${item.dateTs}-${i}`}
                item={item}
                onOpenFolder={onOpenFolder}
                onDelete={remove}
              />
            ))}
          </div>
        </section>
      ))}

      {filtered.length > limit && (
        <div className="load-more">
          <button type="button" className="btn btn-gray" onClick={() => setLimit(l => l + PAGE)}>
            Показать ещё {Math.min(PAGE, filtered.length - limit)}
          </button>
        </div>
      )}
    </div>
  );
}
