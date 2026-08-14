'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The renderer gets this narrow surface and nothing else — no node, no fs, no
// arbitrary ipcRenderer. Every channel below is enumerated in main.cjs.
contextBridge.exposeInMainWorld('blob', {
  readSave: () => ipcRenderer.invoke('save:read'),
  writeSave: (patch) => ipcRenderer.invoke('save:write', patch),

  listPuzzles: () => ipcRenderer.invoke('puzzles:list'),
  loadPuzzle: (id) => ipcRenderer.invoke('puzzles:load', id),

  minimise: () => ipcRenderer.send('win:minimise'),
  close: () => ipcRenderer.send('win:close'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('win:toggle-top'),
  resizeBy: (dx, dy) => ipcRenderer.send('win:resize-by', dx, dy),
});
