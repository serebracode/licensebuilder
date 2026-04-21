import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
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

const settingsStore: any = new Store<AppSettings>({
  name: 'settings'
});

const isDev = !app.isPackaged;

const createWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 15 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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
  return window;
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

const buildMenu = (win: BrowserWindow): void => {
  const send = (ch: string) => win.webContents.send(ch);
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'Файл',
      submenu: [
        { label: 'Новый документ', accelerator: 'CmdOrCtrl+N', click: () => send('menu:new') },
        { label: 'Открыть...', accelerator: 'CmdOrCtrl+O', click: () => send('menu:open') },
        { type: 'separator' },
        { label: 'Сохранить', accelerator: 'CmdOrCtrl+S', click: () => send('menu:save') },
        { label: 'Сохранить как...', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('menu:save-as') },
        { type: 'separator' },
        { label: 'Настройки...', accelerator: 'CmdOrCtrl+,', click: () => send('menu:settings') },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

app.whenReady().then(() => {
  ipcMain.handle('settings:get', () => ({
    workspacePath: settingsStore.get('workspacePath'),
    blocksPath: settingsStore.get('blocksPath'),
    templatesPath: settingsStore.get('templatesPath'),
    exportsPath: settingsStore.get('exportsPath')
  }));

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
    settingsStore.set('workspacePath', settings.workspacePath);
    settingsStore.set('blocksPath', settings.blocksPath);
    settingsStore.set('templatesPath', settings.templatesPath);
    settingsStore.set('exportsPath', settings.exportsPath);

    return settings;
  });

  const win = createWindow();
  buildMenu(win);

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
