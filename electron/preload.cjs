'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The renderer gets this narrow surface and nothing else — no node, no fs, no
// arbitrary ipcRenderer. Every channel below is enumerated in main.cjs.
contextBridge.exposeInMainWorld('blob', {
  readSave: () => ipcRenderer.invoke('save:read'),
  writeSave: (patch) => ipcRenderer.invoke('save:write', patch),

  listPuzzles: () => ipcRenderer.invoke('puzzles:list'),
  loadPuzzle: (id) => ipcRenderer.invoke('puzzles:load', id),
  // The picker runs entirely in the main process as a parentless native
  // dialog — a transparent window on Windows crashes when it owns an OS file
  // dialog, so it must own none. Returns [{ name, bytes }], or [] if cancelled.
  pickImage: () => ipcRenderer.invoke('win:pick-image'),
  savePuzzle: (payload) => ipcRenderer.invoke('puzzles:save', payload),
  deletePuzzle: (id) => ipcRenderer.invoke('puzzles:delete', id),

  minimise: () => ipcRenderer.send('win:minimise'),
  close: () => ipcRenderer.send('win:close'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('win:toggle-top'),
  resizeBy: (dx, dy) => ipcRenderer.send('win:resize-by', dx, dy),
});
