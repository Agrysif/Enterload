import { useCallback, useEffect, useRef, useState } from 'react';
import { average, isHttpUrl, newId, sourceFromUrl } from './format';
import { t } from '../i18n';

const api = window.enterload;

export const ACTIVE_PHASES = ['starting', 'downloading', 'paused', 'resuming', 'processing'];
const CHART_POINTS = 60;
const CHART_STEP_MS = 1000;
const newSpeedMeter = () => ({ samples: [], lastAt: 0, smooth: null });

// Runs the effect on updates only, not on the first render
export function useUpdateEffect(effect, deps) {
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return undefined;
    }
    return effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* ------------------------------------------------------------------ */
/* Link analysis                                                       */
/* ------------------------------------------------------------------ */

export function useMetadata(url, { logError, durations, onDuration }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [slow, setSlow] = useState(false);
  const requestRef = useRef(0);
  const durationsRef = useRef(durations || []);

  useEffect(() => {
    const target = url.trim();
    const requestId = ++requestRef.current;
    setInfo(null);
    setError(null);
    setSlow(false);
    setProgress(0);
    setAnalyzing(isHttpUrl(target));
    if (!isHttpUrl(target)) return undefined;

    let progressTimer;
    let slowTimer;
    // wait until the user stops typing
    const debounce = setTimeout(() => {
      const startedAt = Date.now();
      const expected = durationsRef.current.length ? average(durationsRef.current) : 5000;
      progressTimer = setInterval(() => {
        setProgress(Math.min(95, Math.round(((Date.now() - startedAt) / expected) * 100)));
      }, 100);
      slowTimer = setTimeout(() => setSlow(true), expected + 3000);

      api.fetchMetadata(target).then(res => {
        if (requestId !== requestRef.current) return;
        clearInterval(progressTimer);
        clearTimeout(slowTimer);
        setSlow(false);
        setAnalyzing(false);
        if (res?.ok) {
          durationsRef.current = [...durationsRef.current, Date.now() - startedAt].slice(-30);
          onDuration?.(durationsRef.current);
          setProgress(100);
          setInfo(res.data);
        } else {
          const message = res?.error || t('errors.metadataFailed');
          setError(message);
          logError({ title: t('errors.analysisTitle'), description: message, log: `${target}\n\n${res?.log || message}` });
        }
      });
    }, 450);

    return () => {
      clearTimeout(debounce);
      clearInterval(progressTimer);
      clearTimeout(slowTimer);
    };
  }, [url, logError, onDuration]);

  return { info, error, analyzing, progress, slow };
}

/* ------------------------------------------------------------------ */
/* App updates                                                         */
/* ------------------------------------------------------------------ */

export function useUpdater({ notify }) {
  const [update, setUpdate] = useState({ state: 'idle' });
  const announcedRef = useRef(null);

  useEffect(() => {
    const apply = next => {
      setUpdate(next);
      if (!['ready', 'available'].includes(next.state) || announcedRef.current === next.version) return;
      announcedRef.current = next.version;
      notify(t('app.updateNew', { version: next.version }), { force: true, tone: 'success' });
    };
    api.getUpdateState().then(apply);
    return api.on('update-status', apply);
  }, [notify]);

  const check = useCallback(() => api.checkForUpdates(), []);
  const install = useCallback(async () => {
    const res = await api.installUpdate();
    if (!res?.ok) notify(res?.error || t('app.updateInstallFailed'), { force: true, tone: 'danger' });
  }, [notify]);

  return { ...update, check, install };
}

/* ------------------------------------------------------------------ */
/* Downloads                                                           */
/* ------------------------------------------------------------------ */

const IDLE = {
  phase: 'idle',
  progress: 0,
  eta: null,
  speed: null,
  downloaded: 0,
  points: [],
  error: null,
  result: null,
  title: '',
};

export function useDownloader({ notify, logError, addHistory }) {
  const [status, setStatus] = useState(IDLE);
  const phaseRef = useRef('idle');
  const ctxRef = useRef(null);
  const meterRef = useRef(newSpeedMeter());

  const go = useCallback((phase, patch = {}) => {
    phaseRef.current = phase;
    setStatus(s => ({ ...s, ...patch, phase }));
  }, []);

  const fail = useCallback((message, log) => {
    const ctx = ctxRef.current || {};
    go('error', { error: message, eta: null });
    logError({ title: t('errors.downloadTitle'), description: message, log: `${ctx.url || ''}\n\n${log || message}`, critical: true });
    notify(message, { tone: 'danger' });
  }, [go, logError, notify]);

  const start = useCallback(async options => {
    if (ACTIVE_PHASES.includes(phaseRef.current)) return;
    ctxRef.current = { ...options, startedAt: Date.now() };
    meterRef.current = newSpeedMeter();
    go('starting', { ...IDLE, title: options.info?.title || options.url });
    const res = await api.startDownload({
      url: options.url,
      quality: options.quality,
      embedThumbnail: options.embedThumbnail,
      embedMetadata: options.embedMetadata,
      saveThumbnail: options.saveThumbnail,
      saveInfo: options.saveInfo,
      downloadPath: options.downloadPath,
    });
    if (!res?.ok && phaseRef.current === 'starting') fail(res?.error || t('errors.startFailed'), res?.log);
  }, [go, fail]);

  const retry = useCallback(() => ctxRef.current && start(ctxRef.current), [start]);

  const pause = useCallback(() => {
    if (phaseRef.current !== 'downloading') return;
    go('paused');
    api.pauseDownload();
  }, [go]);

  const resume = useCallback(() => {
    if (phaseRef.current !== 'paused') return;
    // yt-dlp reconnects to the site first: stay in "resuming" until the first progress update
    go('resuming');
    api.resumeDownload();
  }, [go]);

  const cancel = useCallback(() => api.cancelDownload(), []);

  const dismiss = useCallback(() => {
    if (!ACTIVE_PHASES.includes(phaseRef.current)) go('idle', IDLE);
  }, [go]);

  useEffect(() => {
    const onProgress = p => {
      if (!['starting', 'downloading', 'resuming', 'processing'].includes(phaseRef.current)) return;
      if (phaseRef.current === 'starting' || phaseRef.current === 'resuming') phaseRef.current = 'downloading';
      const phase = phaseRef.current;

      // The raw speed jumps with every update: the chart, speed and time left change once a second
      const meter = meterRef.current;
      if (p.speed != null) meter.samples.push(p.speed);
      const now = Date.now();
      let speed = null;
      if (meter.samples.length && now - meter.lastAt >= CHART_STEP_MS) {
        const value = average(meter.samples);
        meter.smooth = meter.smooth == null ? value : meter.smooth * 0.6 + value * 0.4;
        meter.samples = [];
        meter.lastAt = now;
        speed = meter.smooth;
      }

      setStatus(s => ({
        ...s,
        phase,
        progress: Math.max(s.progress, p.percent || 0),
        eta: speed != null || s.eta == null ? p.eta : s.eta,
        speed: speed ?? s.speed,
        downloaded: p.downloaded ?? s.downloaded,
        points: speed != null ? [...s.points.slice(-(CHART_POINTS - 1)), speed] : s.points,
      }));
    };

    const onStatus = value => {
      if (value === 'paused') go('paused');
      if (value === 'processing') go('processing', { eta: null });
    };

    const onComplete = result => {
      const ctx = ctxRef.current || {};
      const info = ctx.info || result.info || {};
      const sizeBytes = result.sizeBytes || 0;
      const entry = {
        id: newId(),
        thumbnail: info.thumbnail || '',
        title: info.title || (result.filePath ? result.filePath.split(/[\\/]/).pop() : ctx.url),
        description: info.channelName || '',
        dateTs: Date.now(),
        sizeBytes,
        durationSeconds: info.durationSeconds || 0,
        downloadDuration: result.activeSeconds || 0,
        resolution: ctx.quality === 'audio' ? 'audio' : result.resolution || info.resolution || '',
        source: sourceFromUrl(ctx.url),
        sourceUrl: ctx.url,
        folderPath: result.folderPath,
        filePath: result.filePath,
        avgSpeedBps: result.activeSeconds > 0 ? sizeBytes / result.activeSeconds : 0,
        status: 'success',
      };
      addHistory(entry);
      go('done', { progress: 100, eta: null, result: entry, title: entry.title });
      notify(t('download.finished'), { tone: 'success' });
    };

    const onError = ({ message, log }) => fail(message, log);

    const onCancelled = () => {
      go('idle', IDLE);
      notify(t('download.cancelled'));
    };

    const offs = [
      api.on('download-progress', onProgress),
      api.on('download-status', onStatus),
      api.on('download-complete', onComplete),
      api.on('download-error', onError),
      api.on('download-cancelled', onCancelled),
    ];
    return () => offs.forEach(off => off());
  }, [go, fail, notify, addHistory]);

  return { status, isActive: ACTIVE_PHASES.includes(status.phase), start, retry, pause, resume, cancel, dismiss };
}
