const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('arthur', {
  ready: () => ipcRenderer.send('pet:ready'),
  hit: value => ipcRenderer.send('pet:hit', value),
  menu: () => ipcRenderer.send('pet:menu'),
  dragStart: point => ipcRenderer.send('pet:drag-start', point),
  dragMove: point => ipcRenderer.send('pet:drag-move', point),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  onSettings: callback => ipcRenderer.on('pet:settings', (_event, value) => callback(value)),
  onAction: callback => ipcRenderer.on('pet:action', (_event, value) => callback(value)),
  onPointer: callback => ipcRenderer.on('pet:pointer', (_event, value) => callback(value)),
  onDrag: callback => ipcRenderer.on('pet:drag', (_event, value) => callback(value))
});
