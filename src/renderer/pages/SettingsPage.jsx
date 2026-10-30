import React from 'react';
import {
  LuBell, LuCpu, LuFilm, LuFolder, LuInfo, LuKeyboard, LuLoaderCircle, LuPalette, LuRefreshCw, LuSunMoon, LuWandSparkles,
} from 'react-icons/lu';
import { Group, Row, Segmented, Switch } from '../ui';
import { ACCENTS, THEME_OPTIONS } from '../theme';

const UPDATE_TEXT = {
  unsupported: () => 'обновления работают в установленной версии',
  idle: () => 'обновления проверяются автоматически',
  checking: () => 'проверяем обновления…',
  latest: () => 'установлена последняя версия',
  available: u => `вышла версия ${u.version}`,
  downloading: u => `скачиваем версию ${u.version}… ${u.percent}%`,
  ready: u => `версия ${u.version} готова к установке`,
  error: () => 'не удалось проверить обновления',
};

export default function SettingsPage({
  theme, setTheme, resolvedTheme, accentId, setAccentId, siteAccent, setSiteAccent, activeSite,
  defaultDownloadPath, downloadsDir, onSelectDefaultPath,
  notificationsEnabled, setNotificationsEnabled, engine, onUpdateEngine, isDownloading, version, updater,
}) {
  const updateReady = updater.state === 'ready';
  const updateAvailable = updater.state === 'available';
  const updateText = (UPDATE_TEXT[updater.state] || UPDATE_TEXT.idle)(updater);

  return (
    <div className="page settings-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Настройки</h1>
          <p className="page-subtitle">Изменения сохраняются автоматически</p>
        </div>
      </header>

      <Group
        title="Оформление"
        footer="Цвет сайта работает для YouTube, VK, Rutube, Pornhub, TikTok, Twitch и других. Когда поле ссылки пустое, возвращается выбранный акцент."
      >
        <Row icon={<LuSunMoon />} title="Тема">
          <Segmented options={THEME_OPTIONS} value={theme} onChange={setTheme} />
        </Row>
        <Row icon={<LuPalette />} title="Акцентный цвет">
          <div className="accent-picker" role="radiogroup" aria-label="Акцентный цвет">
            {ACCENTS.map(a => (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={a.id === accentId}
                title={a.name}
                className={`accent-swatch${a.id === accentId ? ' selected' : ''}`}
                style={{ '--swatch': resolvedTheme === 'dark' ? a.dark : a.light }}
                onClick={() => setAccentId(a.id)}
              />
            ))}
          </div>
        </Row>
        <Row
          icon={<LuWandSparkles />}
          title="Цвет сайта"
          subtitle={activeSite ? `Сейчас — ${activeSite}` : 'Акцент меняется под сайт вставленной ссылки'}
        >
          <Switch checked={siteAccent} onChange={setSiteAccent} label="Цвет сайта" />
        </Row>
      </Group>

      <Group title="Загрузки">
        <Row icon={<LuFolder />} title="Папка по умолчанию" subtitle={defaultDownloadPath || downloadsDir} onClick={onSelectDefaultPath}>
          <span className="btn btn-plain btn-sm">Изменить</span>
        </Row>
      </Group>

      <Group title="Уведомления">
        <Row icon={<LuBell />} title="Всплывающие уведомления" subtitle="О завершении загрузок и ошибках">
          <Switch checked={notificationsEnabled} onChange={setNotificationsEnabled} label="Уведомления" />
        </Row>
      </Group>

      <Group title="Движок" footer="Если видео с YouTube перестали скачиваться — обновите yt-dlp, сайты часто меняют формат страниц.">
        <Row icon={<LuCpu />} title="yt-dlp" subtitle={engine.ytDlpVersion ? `Версия ${engine.ytDlpVersion}` : 'Проверяем…'}>
          <button
            type="button"
            className="btn btn-tinted btn-sm"
            onClick={onUpdateEngine}
            disabled={engine.updating || isDownloading}
          >
            {engine.updating ? <LuLoaderCircle className="spin" /> : <LuRefreshCw />}
            {engine.updating ? 'Обновляем…' : 'Обновить'}
          </button>
        </Row>
        <Row icon={<LuFilm />} title="ffmpeg" subtitle="Склеивает видео со звуком и встраивает обложки">
          {engine.ffmpeg == null
            ? <span className="status-pill">Проверяем…</span>
            : <span className={`status-pill ${engine.ffmpeg ? 'ok' : 'bad'}`}>{engine.ffmpeg ? 'Найден' : 'Не найден'}</span>}
        </Row>
      </Group>

      <Group title="О приложении">
        <Row icon={<LuInfo />} title="Enterload" subtitle={`Версия ${version || '—'} · ${updateText}`}>
          {updateReady || updateAvailable ? (
            <button type="button" className="btn btn-tinted btn-sm" onClick={updater.install} disabled={updateReady && isDownloading}>
              {updateReady ? 'Перезапустить' : 'Скачать'}
            </button>
          ) : updater.state !== 'unsupported' && (
            <button
              type="button"
              className="btn btn-tinted btn-sm"
              onClick={updater.check}
              disabled={updater.state === 'checking' || updater.state === 'downloading'}
            >
              Проверить
            </button>
          )}
        </Row>
        <Row
          icon={<LuKeyboard />}
          title="Горячие клавиши"
          subtitle="Ctrl+V — вставить ссылку · Alt+← / Alt+→ — назад и вперёд · F5 — очистить форму"
        />
      </Group>
    </div>
  );
}
