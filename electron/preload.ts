import { contextBridge, ipcRenderer } from 'electron';

type WorkspaceMode = 'create' | 'useExisting';

type InitWorkspacePayload = {
  basePath: string;
  mode: WorkspaceMode;
};

contextBridge.exposeInMainWorld('licenseBuilder', {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<Record<string, string>>,
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory') as Promise<string | null>,
  initWorkspace: (payload: InitWorkspacePayload) =>
    ipcRenderer.invoke('workspace:init', payload) as Promise<Record<string, string>>,
  onMenu: (channel: string, fn: () => void) => {
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  },
});
