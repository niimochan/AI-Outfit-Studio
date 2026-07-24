import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('aosDesktop', {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  platform: process.platform,
});
