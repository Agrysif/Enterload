import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  LuArrowDownToLine, LuChartNoAxesColumn, LuChevronLeft, LuChevronRight, LuCircleArrowUp, LuCircleCheck, LuCloudDownload,
  LuHeart, LuHistory, LuInfo, LuOctagonAlert, LuSettings, LuTriangleAlert,
} from 'react-icons/lu';
import './charts';
import { IconButton } from './ui';
import { useDownloader, useMetadata, useUpdateEffect, useUpdater } from './hooks';
import { accentColor, ACCENTS, siteAccentFor } from './theme';
import { newId } from './format';
import { resolveLanguage, setLanguage, t } from '../i18n';
import DownloadPage from './pages/DownloadPage';
import HistoryPage from './pages/HistoryPage';
import StatsPage from './pages/StatsPage';
import ErrorsPage from './pages/ErrorsPage';
import SettingsPage from './pages/SettingsPage';
import logo from '../../icon.svg';

const api = window.enterload;
const boot = api.bootstrap || {};
const THEMES = ['system', 'light', 'dark'];
const DONATE_URL = 'https://www.donationalerts.com/r/agrysif';

// Saved data lives in a JSON file managed by the main process.
// Older versions kept everything in localStorage — move it over once.
function loadPersisted() {
  const data = { ...(boot.data || {}) };
  if (!data.migrated) {
    const read = key => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    };
    const parse = raw => {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    };
    ['history', 'theme', 'notificationsEnabled', 'defaultDownloadPath', 'totalAppTime'].forEach(key => {
      const raw = read(key);
      if (raw !== null && data[key] === undefined) data[key] = parse(raw);
    });
    data.totalAppTime = Number(data.totalAppTime) || 0;
    data.migrated = true;
    Object.entries(data).forEach(([key, value]) => api.store.set(key, value));
  }
  // the old "custom" theme is replaced by accent colors
  if (!THEMES.includes(data.theme)) data.theme = 'system';
  return data;
}
const persisted = loadPersisted();
const persist = (key, value) => {
  persisted[key] = value;
  api.store.set(key, value);
};
const persistDurations = list => persist('analysisDurations', list);

const NAV = [
  { tab: 'download', label: 'nav.download', icon: <LuArrowDownToLine /> },
  { tab: 'history', label: 'nav.history', icon: <LuHistory /> },
  { tab: 'stats', label: 'nav.stats', icon: <LuChartNoAxesColumn /> },
  { tab: 'errors', label: 'nav.errors', icon: <LuTriangleAlert /> },
  { tab: 'settings', label: 'nav.settings', icon: <LuSettings /> },
];

const TOAST_ICONS = { success: <LuCircleCheck />, danger: <LuOctagonAlert /> };

const systemPrefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

const App = () => {
  // ---------------- language ----------------
  // "system" or a language code. Strings read the current language while rendering, so it's set first.
  const [languageChoice, setLanguageChoice] = useState(persisted.language || 'system');
  const language = setLanguage(resolveLanguage(languageChoice, boot.systemLanguages));

  useLayoutEffect(() => {
    document.documentElement.lang = language;
    api.setLanguage(language);
  }, [language]);
  useUpdateEffect(() => persist('language', languageChoice), [languageChoice]);

  // ---------------- theme ----------------
  const [theme, setTheme] = useState(persisted.theme);
  const [accentId, setAccentId] = useState(ACCENTS.some(a => a.id === persisted.accent) ? persisted.accent : 'blue');
  const [siteAccent, setSiteAccent] = useState(persisted.siteAccent ?? true);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  // the link in the download field: while it points to a known site, the accent takes that site's color
  const [url, setUrl] = useState('');
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  const site = siteAccent ? siteAccentFor(url, resolvedTheme) : null;
  const accent = site?.color || accentColor(accentId, resolvedTheme);
  const onAccent = site?.onAccent;

  useEffect(() => {
    // follows the OS while the theme is "system" (the main process keeps nativeTheme in sync)
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = e => setSystemDark(e.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.style.setProperty('--accent', accent);
    if (onAccent) root.style.setProperty('--on-accent', onAccent);
    else root.style.removeProperty('--on-accent');
    root.classList.toggle('has-material', !!boot.material);
  }, [resolvedTheme, accent, onAccent]);

  useEffect(() => {
    api.setTheme(theme);
  }, [theme]);
  useUpdateEffect(() => persist('theme', theme), [theme]);
  useUpdateEffect(() => persist('accent', accentId), [accentId]);
  useUpdateEffect(() => persist('siteAccent', siteAccent), [siteAccent]);

  // ---------------- session timer ----------------
  const sessionStartRef = useRef(Date.now());
  const totalAppTimeBase = useRef(Number(persisted.totalAppTime) || 0);
  const [appSeconds, setAppSeconds] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => setAppSeconds(Math.floor((Date.now() - sessionStartRef.current) / 1000)), 1000);
    const save = () => persist('totalAppTime', totalAppTimeBase.current + Math.floor((Date.now() - sessionStartRef.current) / 1000));
    const saver = setInterval(save, 15000);
    window.addEventListener('beforeunload', save);
    return () => {
      clearInterval(tick);
      clearInterval(saver);
      window.removeEventListener('beforeunload', save);
    };
  }, []);

  // ---------------- notifications ----------------
  const [notificationsEnabled, setNotificationsEnabled] = useState(persisted.notificationsEnabled ?? true);
  const notificationsRef = useRef(notificationsEnabled);
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((msg, { tone = '', force = false } = {}) => {
    if (!force && !notificationsRef.current) return;
    const id = newId();
    setToasts(list => [...list.slice(-2), { id, msg, tone }]);
    setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), 3200);
  }, []);

  useUpdateEffect(() => {
    notificationsRef.current = notificationsEnabled;
    persist('notificationsEnabled', notificationsEnabled);
  }, [notificationsEnabled]);

  // ---------------- navigation (with back / forward) ----------------
  const [activeTab, setActiveTab] = useState('download');
  const navRef = useRef({ stack: ['download'], index: 0 });
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const navigate = useCallback(tab => {
    const nav = navRef.current;
    if (nav.stack[nav.index] === tab) return;
    nav.stack = [...nav.stack.slice(0, nav.index + 1), tab];
    nav.index = nav.stack.length - 1;
    setActiveTab(tab);
  }, []);
  const goBack = useCallback(() => {
    const nav = navRef.current;
    if (nav.index > 0) setActiveTab(nav.stack[--nav.index]);
  }, []);
  const goForward = useCallback(() => {
    const nav = navRef.current;
    if (nav.index < nav.stack.length - 1) setActiveTab(nav.stack[++nav.index]);
  }, []);

  // ---------------- error log ----------------
  const [errorLog, setErrorLog] = useState(() => (Array.isArray(persisted.errorLog) ? persisted.errorLog : []));
  const logError = useCallback(entry => {
    setErrorLog(list => [...list, { id: newId(), timestamp: Date.now(), critical: false, log: '', ...entry }].slice(-200));
  }, []);
  useUpdateEffect(() => persist('errorLog', errorLog), [errorLog]);

  // ---------------- history ----------------
  const [history, setHistory] = useState(() => (Array.isArray(persisted.history) ? persisted.history : []));
  const addHistory = useCallback(entry => setHistory(list => [...list, entry]), []);
  useUpdateEffect(() => persist('history', history), [history]);

  const openFolder = useCallback(async item => {
    const res = await api.openFolder(item.folderPath, item.filePath);
    if (!res?.ok) notify(res?.error || t('app.folderOpenFailed'), { force: true, tone: 'danger' });
  }, [notify]);

  // ---------------- download form ----------------
  const [options, setOptions] = useState({
    quality: persisted.quality || 'original',
    embedThumbnail: persisted.embedThumbnail ?? true,
    embedMetadata: persisted.embedMetadata ?? true,
    saveThumbnail: persisted.saveThumbnail ?? true,
    saveInfo: persisted.saveInfo ?? true,
  });
  const setOption = useCallback((key, value) => {
    setOptions(o => ({ ...o, [key]: value }));
    persist(key, value);
  }, []);

  const [defaultDownloadPath, setDefaultDownloadPath] = useState(persisted.defaultDownloadPath || '');
  const [downloadPath, setDownloadPath] = useState(persisted.defaultDownloadPath || boot.downloadsDir || '');

  const selectDownloadPath = async () => {
    const dir = await api.selectFolder(downloadPath);
    if (dir) setDownloadPath(dir);
  };
  const selectDefaultPath = async () => {
    const dir = await api.selectFolder(defaultDownloadPath || boot.downloadsDir);
    if (!dir) return;
    setDefaultDownloadPath(dir);
    setDownloadPath(dir);
    persist('defaultDownloadPath', dir);
  };

  const meta = useMetadata(url, { logError, durations: persisted.analysisDurations, onDuration: persistDurations });
  const downloader = useDownloader({ notify, logError, addHistory });
  const updater = useUpdater({ notify });

  // ---------------- download engine ----------------
  const [engine, setEngine] = useState({ ytDlpVersion: null, ffmpeg: null, updating: false });
  useEffect(() => {
    api.getEngineInfo().then(info => {
      if (info?.ok) setEngine(e => ({ ...e, ytDlpVersion: info.ytDlpVersion, ffmpeg: info.ffmpeg }));
    });
  }, []);
  const updateEngine = async () => {
    setEngine(e => ({ ...e, updating: true }));
    const res = await api.updateEngine();
    setEngine(e => ({ ...e, updating: false, ytDlpVersion: res?.version || e.ytDlpVersion }));
    if (res?.ok) notify(t('app.engineUpdated', { version: res.version }), { force: true, tone: 'success' });
    else notify(t('app.engineUpdateFailed', { error: res?.error || t('common.error') }), { force: true, tone: 'danger' });
  };

  // ---------------- keyboard, mouse and clipboard shortcuts ----------------
  const downloaderRef = useRef(downloader);
  downloaderRef.current = downloader;

  useEffect(() => {
    const isEditable = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    const onKey = e => {
      if (e.key === 'F5') {
        e.preventDefault();
        if (downloaderRef.current.isActive) return;
        setUrl('');
        downloaderRef.current.dismiss();
        navigate('download');
      }
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
      }
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        goForward();
      }
    };
    const onMouse = e => {
      if (e.button === 3) goBack();
      if (e.button === 4) goForward();
    };
    // Ctrl+V anywhere on the download page fills the link field
    const onPaste = e => {
      if (activeTabRef.current !== 'download' || isEditable(e.target)) return;
      const text = e.clipboardData?.getData('text')?.trim();
      if (text) {
        e.preventDefault();
        setUrl(text);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onMouse);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mouseup', onMouse);
      window.removeEventListener('paste', onPaste);
    };
  }, [navigate, goBack, goForward]);

  // ---------------- render ----------------
  const nav = navRef.current;
  const { status, isActive } = downloader;
  const badges = {
    download: isActive && status.phase !== 'starting' ? { text: `${Math.floor(status.progress)}%`, kind: 'activity' } : null,
    errors: errorLog.length ? { text: errorLog.length > 99 ? '99+' : String(errorLog.length) } : null,
  };
  const username = boot.username || t('app.defaultUser');

  let page = null;
  if (activeTab === 'download') {
    page = (
      <DownloadPage
        url={url}
        setUrl={setUrl}
        meta={meta}
        options={options}
        setOption={setOption}
        downloadPath={downloadPath}
        onSelectFolder={selectDownloadPath}
        downloader={downloader}
        engine={engine}
        accent={accent}
        notify={notify}
        onOpenFolder={openFolder}
      />
    );
  } else if (activeTab === 'history') {
    page = <HistoryPage history={history} setHistory={setHistory} onOpenFolder={openFolder} onGoDownload={() => navigate('download')} />;
  } else if (activeTab === 'stats') {
    page = (
      <StatsPage
        history={history}
        sessionStart={sessionStartRef.current}
        appSeconds={appSeconds}
        totalAppSeconds={totalAppTimeBase.current + appSeconds}
        accent={accent}
        theme={resolvedTheme}
      />
    );
  } else if (activeTab === 'errors') {
    page = <ErrorsPage errorLog={errorLog} setErrorLog={setErrorLog} notify={notify} />;
  } else if (activeTab === 'settings') {
    page = (
      <SettingsPage
        languageChoice={languageChoice}
        setLanguageChoice={setLanguageChoice}
        systemLanguages={boot.systemLanguages}
        theme={theme}
        setTheme={setTheme}
        resolvedTheme={resolvedTheme}
        accentId={accentId}
        setAccentId={setAccentId}
        siteAccent={siteAccent}
        setSiteAccent={setSiteAccent}
        activeSite={site?.name}
        defaultDownloadPath={defaultDownloadPath}
        downloadsDir={boot.downloadsDir}
        onSelectDefaultPath={selectDefaultPath}
        notificationsEnabled={notificationsEnabled}
        setNotificationsEnabled={setNotificationsEnabled}
        engine={engine}
        onUpdateEngine={updateEngine}
        isDownloading={isActive}
        version={boot.version}
        updater={updater}
      />
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-head">
          <img src={logo} alt="" />
          <span>Enterload</span>
        </div>
        <nav className="nav">
          {NAV.map(item => {
            const badge = badges[item.tab];
            return (
              <button
                key={item.tab}
                type="button"
                className={`nav-item${activeTab === item.tab ? ' active' : ''}`}
                onClick={() => navigate(item.tab)}
              >
                {item.icon}
                <span>{t(item.label)}</span>
                {badge && <span className={`nav-badge tabular ${badge.kind || ''}`}>{badge.text}</span>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          {updater.state === 'downloading' && (
            <div className="update-note tabular">
              <LuCloudDownload />
              <span>{t('app.updateDownloading', { percent: updater.percent })}</span>
            </div>
          )}
          {(updater.state === 'ready' || updater.state === 'available') && (
            <button
              type="button"
              className="btn btn-primary btn-sm btn-block"
              onClick={updater.install}
              disabled={updater.state === 'ready' && isActive}
              title={updater.state === 'ready' && isActive ? t('common.waitDownload') : undefined}
            >
              <LuCircleArrowUp />
              {updater.state === 'ready' ? t('app.updateRestart') : t('app.updateGetVersion', { version: updater.version })}
            </button>
          )}
          <button
            type="button"
            className="nav-item support"
            title={t('app.supportHint')}
            onClick={() => api.openUrl(DONATE_URL)}
          >
            <LuHeart />
            <span>{t('app.support')}</span>
          </button>
        </div>
        <div className="sidebar-footer">
          <span className="avatar">{username[0]}</span>
          <span className="who">
            <b>{username}</b>
            <small>Enterload {boot.version}</small>
          </span>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <IconButton icon={<LuChevronLeft />} label={t('app.back')} onClick={goBack} disabled={nav.index === 0} />
          <IconButton icon={<LuChevronRight />} label={t('app.forward')} onClick={goForward} disabled={nav.index >= nav.stack.length - 1} />
        </div>
        {/* a new language remounts the page: its memoized labels hold the old strings */}
        <main className="content" key={`${activeTab}-${language}`}>
          {page}
        </main>
      </div>

      <div className="toasts" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {TOAST_ICONS[t.tone] || <LuInfo />}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
