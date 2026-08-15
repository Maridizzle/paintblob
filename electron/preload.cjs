'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The renderer gets this narrow surface and nothing else — no node, no fs, no
// arbitrary ipcRenderer. Every channel below is enumerated in main.cjs.
contextBridge.exposeInMainWorld('blob', {
  readSave: () => ipcRenderer.invoke('save:read'),
  writeSave: (patch) => ipcRenderer.invoke('save:write', patch),

  listPuzzles: () => ipcRenderer.invoke('puzzles:list'),
  loadPuzzle: (id) => ipcRenderer.invoke('puzzles:load', id),
  // No pickImage here: choosing files is done with a file input in the
  // renderer, on every platform. See src/platform.js.
  suspendAlwaysOnTop: (on) => ipcRenderer.invoke('win:suspend-top', on),
  savePuzzle: (payload) => ipcRenderer.invoke('puzzles:save', payload),
  deletePuzzle: (id) => ipcRenderer.invoke('puzzles:delete', id),

  minimise: () => ipcRenderer.send('win:minimise'),
  close: () => ipcRenderer.send('win:close'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('win:toggle-top'),
  resizeBy: (dx, dy) => ipcRenderer.send('win:resize-by', dx, dy),
});
