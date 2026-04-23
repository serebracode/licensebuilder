export {};

declare global {
  interface Window {
    licenseBuilder: {
      platform: string;
      getSettings: () => Promise<Record<string, string>>;
      setWorkspacePath: (workspacePath: string) => Promise<{ workspacePath?: string }>;
      selectDirectory: () => Promise<string | null>;
      onMenu: (channel: string, fn: () => void) => () => void;
    };
  }
}
