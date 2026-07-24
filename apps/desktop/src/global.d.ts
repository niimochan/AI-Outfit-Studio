export {};

declare global {
  interface Window {
    aosDesktop?: {
      getAppVersion: () => Promise<string>;
      platform: string;
    };
  }
}
