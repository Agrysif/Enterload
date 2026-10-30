const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = ['download-progress', 'download-status', 'download-complete', 'download-error', 'download-cancelled', 'update-status'];

contextBridge.exposeInMainWorld('enterload', {
  // Saved data and environment info, loaded once at startup
  bootstrap: ipcRenderer.sendSync('bootstrap'),
  store: {
    set: (key, value) => ipcRenderer.send('store-set', key, value),
  },
  setTheme: theme => ipcRenderer.send('set-theme', theme),

  getEngineInfo: () => ipcRenderer.invoke('engine-info'),
  updateEngine: () => ipcRenderer.invoke('engine-update'),

  getUpdateState: () => ipcRenderer.invoke('update-state'),
  checkForUpdates: () => ipcRenderer.invoke('update-check'),
  installUpdate: () => ipcRenderer.invoke('update-install'),

  fetchMetadata: url => ipcRenderer.invoke('fetch-metadata', url),
  startDownload: options => ipcRenderer.invoke('download-start', options),
  pauseDownload: () => ipcRenderer.invoke('download-pause'),
  resumeDownload: () => ipcRenderer.invoke('download-resume'),
  cancelDownload: () => ipcRenderer.invoke('download-cancel'),

  selectFolder: current => ipcRenderer.invoke('select-folder', current),
  openFolder: (folderPath, filePath) => ipcRenderer.invoke('open-folder', folderPath, filePath),
  openUrl: url => ipcRenderer.invoke('open-url', url),
  readClipboardText: () => ipcRenderer.invoke('read-clipboard-text'),
  copyText: text => ipcRenderer.invoke('copy-text', text),
  copyImage: url => ipcRenderer.invoke('copy-image', url),

  on: (event, callback) => {
    if (!EVENTS.includes(event)) throw new Error(`Unknown event: ${event}`);
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(event, listener);
    return () => ipcRenderer.removeListener(event, listener);
  },
});
