const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dsm', {
  getDashboard: () => ipcRenderer.invoke('dashboard:get'),
  refresh: () => ipcRenderer.invoke('dashboard:refresh'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  validateKey: (key) => ipcRenderer.invoke('apikey:validate', key),
  importUsage: () => ipcRenderer.invoke('usage:import'),
  openSettings: () => ipcRenderer.send('open-settings'),
  hideWindow: () => ipcRenderer.send('window:hide'),
  closeWindow: () => ipcRenderer.send('window:close'),
  onUpdate: (cb) => ipcRenderer.on('dashboard:update', (e, state) => cb(state))
});
