const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('preferences', {
  get: () => ipcRenderer.invoke('settings:get'),
  save: value => ipcRenderer.invoke('settings:save', value),
  folder: () => ipcRenderer.invoke('settings:folder'),
  update: () => ipcRenderer.invoke('settings:update'),
  preview: () => ipcRenderer.send('settings:preview')
});
