export {};

declare global {
  interface Window {
    licenseBuilder: {
      platform: string;
      getSettings: () => Promise<Record<string, string>>;
      selectDirectory: () => Promise<string | null>;
      initWorkspace: (payload: { basePath: string; mode: 'create' | 'useExisting' }) => Promise<Record<string, string>>;
      onMenu: (channel: string, fn: () => void) => () => void;
    };
  }
}
