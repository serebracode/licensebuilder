import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('licenseBuilder', {
  platform: process.platform
});
