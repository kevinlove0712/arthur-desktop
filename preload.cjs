const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('arthur', {
  busy: value => ipcRenderer.send('pet:busy', value),
  onWalk: callback => ipcRenderer.on('pet:walk', (_event, value) => callback(value)),
  onResetTimer: callback => ipcRenderer.on('pet:reset-timer', () => callback()),
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
