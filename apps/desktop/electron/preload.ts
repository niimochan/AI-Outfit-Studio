import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { AosAssetKind, AosProjectManifest, ComfyUiRunRequest } from './ipc-types';

contextBridge.exposeInMainWorld('aosDesktop', {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  platform: process.platform,
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  pickAssets: (kind: AosAssetKind) => ipcRenderer.invoke('asset:pick', kind),
  exportPng: (request: { defaultName: string; data: Uint8Array }) => ipcRenderer.invoke('texture:export-png', request),
  saveProject: (request: { path: string | null; saveAs: boolean; manifest: AosProjectManifest }) =>
    ipcRenderer.invoke('project:save', request),
  openProject: () => ipcRenderer.invoke('project:open'),
  openProjectPath: (projectPath: string) => ipcRenderer.invoke('project:open-path', projectPath),
  getRecentProjects: () => ipcRenderer.invoke('project:get-recent'),
  pickWorkflowJson: () => ipcRenderer.invoke('ai:pick-workflow'),
  testComfyUi: (endpoint: string) => ipcRenderer.invoke('ai:comfy-test', endpoint),
  runComfyUi: (request: ComfyUiRunRequest) => ipcRenderer.invoke('ai:comfy-run', request),
  confirmDiscardChanges: (): Promise<boolean> => ipcRenderer.invoke('dialog:confirm-discard'),
  setDocumentState: (state: { dirty: boolean; title: string }): Promise<void> =>
    ipcRenderer.invoke('app:set-document-state', state),
  onAppCommand: (callback: (command: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: string) => callback(command);
    ipcRenderer.on('app:command', listener);
    return () => ipcRenderer.removeListener('app:command', listener);
  },
});
