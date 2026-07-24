import type {
  AosAssetKind,
  AosProjectManifest,
  AosRecentProject,
  HydratedProjectPayload,
  NativeFilePayload,
} from '@ai-outfit-studio/common';

export {};

declare global {
  interface Window {
    aosDesktop?: {
      getAppVersion: () => Promise<string>;
      platform: string;
      getPathForFile: (file: File) => string;
      pickAssets: (kind: AosAssetKind) => Promise<NativeFilePayload[]>;
      exportPng: (request: { defaultName: string; data: Uint8Array }) => Promise<{ canceled: true } | { canceled: false; path: string }>;
      saveProject: (request: {
        path: string | null;
        saveAs: boolean;
        manifest: AosProjectManifest;
      }) => Promise<
        | { canceled: true }
        | {
            canceled: false;
            path: string;
            manifest: AosProjectManifest;
            recentProjects: AosRecentProject[];
          }
      >;
      openProject: () => Promise<HydratedProjectPayload | null>;
      openProjectPath: (projectPath: string) => Promise<HydratedProjectPayload>;
      getRecentProjects: () => Promise<AosRecentProject[]>;
      confirmDiscardChanges: () => Promise<boolean>;
      setDocumentState: (state: { dirty: boolean; title: string }) => Promise<void>;
      onAppCommand: (callback: (command: string) => void) => () => void;
    };
  }
}
