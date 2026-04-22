import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import Store from 'electron-store';

type AppSettings = { workspacePath?: string };
type DocMeta = { id: string; name: string; updatedAt: number };

const settingsStore: any = new Store<AppSettings>({ name: 'settings' });

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

const buildMenu = (win: BrowserWindow): void => {
  const send = (ch: string) => win.webContents.send(ch);
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'Файл',
      submenu: [
        { label: 'Новый документ',   accelerator: 'CmdOrCtrl+N',       click: () => send('menu:new') },
        { label: 'Открыть...',       accelerator: 'CmdOrCtrl+O',       click: () => send('menu:open') },
        { type: 'separator' },
        { label: 'Сохранить',        accelerator: 'CmdOrCtrl+S',       click: () => send('menu:save') },
        { label: 'Сохранить как...', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('menu:save-as') },
        { type: 'separator' },
        { label: 'Настройки...',     accelerator: 'CmdOrCtrl+,',       click: () => send('menu:settings') },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

// ── Document file storage ─────────────────────────────────────────────────────

const getProjectsDir = async (): Promise<string> => {
  const dir = path.join(app.getPath('userData'), 'projects');
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

const getIndexPath = async (): Promise<string> => path.join(await getProjectsDir(), 'index.json');

const readIndex = async (): Promise<DocMeta[]> => {
  try { return JSON.parse(await fs.readFile(await getIndexPath(), 'utf-8')); }
  catch { return []; }
};

const writeIndex = async (index: DocMeta[]): Promise<void> =>
  fs.writeFile(await getIndexPath(), JSON.stringify(index, null, 2), 'utf-8');

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  ipcMain.handle('doc:save', async (_e, doc: Record<string, unknown>) => {
    const dir = await getProjectsDir();
    await fs.writeFile(path.join(dir, `${doc.id}.json`), JSON.stringify(doc, null, 2), 'utf-8');
    const index = await readIndex();
    const entry: DocMeta = { id: doc.id as string, name: doc.name as string, updatedAt: doc.updatedAt as number };
    const i = index.findIndex(d => d.id === entry.id);
    if (i >= 0) index[i] = entry; else index.push(entry);
    await writeIndex(index);
  });

  ipcMain.handle('doc:load', async (_e, id: string) => {
    const dir = await getProjectsDir();
    try { return JSON.parse(await fs.readFile(path.join(dir, `${id}.json`), 'utf-8')); }
    catch { return null; }
  });

  ipcMain.handle('doc:list', async () => readIndex());

  ipcMain.handle('doc:delete', async (_e, id: string) => {
    const dir = await getProjectsDir();
    try { await fs.unlink(path.join(dir, `${id}.json`)); } catch {}
    const index = await readIndex();
    await writeIndex(index.filter(d => d.id !== id));
  });

  ipcMain.handle('settings:get', () => ({
    workspacePath: settingsStore.get('workspacePath'),
  }));

  ipcMain.handle('dialog:select-directory', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  const win = createWindow();
  buildMenu(win);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

