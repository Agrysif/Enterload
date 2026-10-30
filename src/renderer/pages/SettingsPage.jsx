import React from 'react';
import {
  LuBell, LuCpu, LuFilm, LuFolder, LuInfo, LuKeyboard, LuLanguages, LuLoaderCircle, LuPalette, LuRefreshCw, LuSunMoon, LuWandSparkles,
} from 'react-icons/lu';
import { Group, Menu, Row, Segmented, Switch } from '../ui';
import { ACCENTS } from '../theme';
import { detectLanguage, LANGUAGES, t } from '../../i18n';

const THEMES = ['system', 'light', 'dark'];
const UPDATE_STATES = ['unsupported', 'idle', 'checking', 'latest', 'available', 'downloading', 'ready', 'error'];

export default function SettingsPage({
  languageChoice, setLanguageChoice, systemLanguages, theme, setTheme, resolvedTheme, accentId, setAccentId, siteAccent, setSiteAccent, activeSite,
  defaultDownloadPath, downloadsDir, onSelectDefaultPath,
  notificationsEnabled, setNotificationsEnabled, engine, onUpdateEngine, isDownloading, version, updater,
}) {
  const updateReady = updater.state === 'ready';
  const updateAvailable = updater.state === 'available';
  const updateText = t(`update.${UPDATE_STATES.includes(updater.state) ? updater.state : 'idle'}`, updater);
  const systemLanguage = LANGUAGES.find(language => language.code === detectLanguage(systemLanguages)).name;
  const languageOptions = [
    { value: 'system', label: t('settings.languageSystem', { language: systemLanguage }) },
    ...LANGUAGES.map(language => ({ value: language.code, label: language.name })),
  ];

  return (
    <div className="page settings-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('nav.settings')}</h1>
          <p className="page-subtitle">{t('settings.subtitle')}</p>
        </div>
      </header>

      <Group
        title={t('settings.appearance')}
        footer={t('settings.appearanceHint')}
      >
        <Row icon={<LuLanguages />} title={t('settings.language')}>
          <Menu value={languageChoice} options={languageOptions} onChange={setLanguageChoice} label={t('settings.language')} />
        </Row>
        <Row icon={<LuSunMoon />} title={t('settings.theme')}>
          <Segmented options={THEMES.map(value => ({ value, label: t(`theme.${value}`) }))} value={theme} onChange={setTheme} />
        </Row>
        <Row icon={<LuPalette />} title={t('settings.accent')}>
          <div className="accent-picker" role="radiogroup" aria-label={t('settings.accent')}>
            {ACCENTS.map(a => (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={a.id === accentId}
                title={t(`accent.${a.id}`)}
                data-accent={a.id}
                className={`accent-swatch${a.id === accentId ? ' selected' : ''}`}
                style={{ '--swatch': resolvedTheme === 'dark' ? a.dark : a.light }}
                onClick={() => setAccentId(a.id)}
              />
            ))}
          </div>
        </Row>
        <Row
          icon={<LuWandSparkles />}
          title={t('settings.siteColor')}
          subtitle={activeSite ? t('settings.siteColorNow', { site: activeSite }) : t('settings.siteColorHint')}
        >
          <Switch checked={siteAccent} onChange={setSiteAccent} label={t('settings.siteColor')} />
        </Row>
      </Group>

      <Group title={t('settings.downloads')}>
        <Row icon={<LuFolder />} title={t('settings.defaultFolder')} subtitle={<span className="row-path">{defaultDownloadPath || downloadsDir}</span>} onClick={onSelectDefaultPath}>
          <span className="btn btn-plain btn-sm">{t('settings.change')}</span>
        </Row>
      </Group>

      <Group title={t('settings.notifications')}>
        <Row icon={<LuBell />} title={t('settings.popups')} subtitle={t('settings.popupsHint')}>
          <Switch checked={notificationsEnabled} onChange={setNotificationsEnabled} label={t('settings.notifications')} />
        </Row>
      </Group>

      <Group title={t('settings.engine')} footer={t('settings.engineHint')}>
        <Row icon={<LuCpu />} title="yt-dlp" subtitle={engine.ytDlpVersion ? t('settings.version', { version: engine.ytDlpVersion }) : t('common.checking')}>
          <button
            type="button"
            className="btn btn-tinted btn-sm"
            onClick={onUpdateEngine}
            disabled={engine.updating || isDownloading}
          >
            {engine.updating ? <LuLoaderCircle className="spin" /> : <LuRefreshCw />}
            {engine.updating ? t('settings.updating') : t('settings.update')}
          </button>
        </Row>
        <Row icon={<LuFilm />} title="ffmpeg" subtitle={t('settings.ffmpegHint')}>
          {engine.ffmpeg == null
            ? <span className="status-pill">{t('common.checking')}</span>
            : <span className={`status-pill ${engine.ffmpeg ? 'ok' : 'bad'}`}>{engine.ffmpeg ? t('settings.found') : t('settings.notFound')}</span>}
        </Row>
      </Group>

      <Group title={t('settings.about')}>
        <Row icon={<LuInfo />} title="Enterload" subtitle={`${t('settings.version', { version: version || '—' })} · ${updateText}`}>
          {updateReady || updateAvailable ? (
            <button type="button" className="btn btn-tinted btn-sm" onClick={updater.install} disabled={updateReady && isDownloading}>
              {updateReady ? t('settings.restart') : t('settings.getUpdate')}
            </button>
          ) : updater.state !== 'unsupported' && (
            <button
              type="button"
              className="btn btn-tinted btn-sm"
              onClick={updater.check}
              disabled={updater.state === 'checking' || updater.state === 'downloading'}
            >
              {t('settings.check')}
            </button>
          )}
        </Row>
        <Row
          icon={<LuKeyboard />}
          title={t('settings.shortcuts')}
          subtitle={t('settings.shortcutsHint')}
        />
      </Group>
    </div>
  );
}
