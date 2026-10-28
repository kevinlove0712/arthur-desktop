const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('reminder', { onText: callback => ipcRenderer.on('reminder:text', (_event, text) => callback(text)) });
