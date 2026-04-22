import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('licenseBuilder', {
  platform: process.platform,

  // ── Document file storage ────────────────────────────────────────────────
  docSave:   (doc: unknown) => ipcRenderer.invoke('doc:save', doc),
  docLoad:   (id: string)   => ipcRenderer.invoke('doc:load', id),
  docList:   ()             => ipcRenderer.invoke('doc:list'),
  docDelete: (id: string)   => ipcRenderer.invoke('doc:delete', id),

  // ── Native dialogs ───────────────────────────────────────────────────────
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory') as Promise<string | null>,
  getSettings:     () => ipcRenderer.invoke('settings:get'),

  // ── Native menu events ───────────────────────────────────────────────────
  onMenu: (channel: string, fn: () => void) => {
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  },
});
