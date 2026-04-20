import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import Store from 'electron-store';

type WorkspaceMode = 'create' | 'useExisting';

type InitWorkspacePayload = {
  basePath: string;
  mode: WorkspaceMode;
};

type AppSettings = {
  workspacePath?: string;
  blocksPath?: string;
  templatesPath?: string;
  exportsPath?: string;
};

const settingsStore = new Store<AppSettings>({
  name: 'settings'
});
import { app, BrowserWindow } from 'electron';
import path from 'node:path';

const isDev = !app.isPackaged;

const createWindow = (): void => {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    void window.loadFile(path.join(__dirname, '../dist/index.html'));
  }
};

const ensureWorkspaceStructure = async (basePath: string): Promise<AppSettings> => {
  const blocksPath = path.join(basePath, 'blocks');
  const templatesPath = path.join(basePath, 'templates');
  const exportsPath = path.join(basePath, 'exports');

  await fs.mkdir(blocksPath, { recursive: true });
  await fs.mkdir(templatesPath, { recursive: true });
  await fs.mkdir(exportsPath, { recursive: true });

  return {
    workspacePath: basePath,
    blocksPath,
    templatesPath,
    exportsPath
  };
};

app.whenReady().then(() => {
  ipcMain.handle('settings:get', () => settingsStore.store);

  ipcMain.handle('dialog:select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle('workspace:init', async (_event, payload: InitWorkspacePayload) => {
    if (!payload.basePath) {
      throw new Error('Не выбрана папка для workspace.');
    }

    if (payload.mode === 'create') {
      await fs.mkdir(payload.basePath, { recursive: true });
    }

    const settings = await ensureWorkspaceStructure(payload.basePath);
    settingsStore.set(settings);

    return settings;
  });

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
