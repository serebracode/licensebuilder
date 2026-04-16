import { useEffect, useMemo, useState } from 'react';

type SetupMode = 'create' | 'useExisting';

type WorkspaceSettings = {
  workspacePath?: string;
  blocksPath?: string;
  templatesPath?: string;
  exportsPath?: string;
};

type LicenseBuilderApi = {
  getSettings: () => Promise<Record<string, string>>;
  selectDirectory: () => Promise<string | null>;
  initWorkspace: (payload: {
    basePath: string;
    mode: 'create' | 'useExisting';
  }) => Promise<Record<string, string>>;
};

const getApi = (): LicenseBuilderApi => {
  if (typeof window !== 'undefined' && window.licenseBuilder) {
    return window.licenseBuilder;
  }

  return {
    getSettings: async () => ({}),
    selectDirectory: async () => {
      const value = window.prompt('Эмулятор режима браузера: введите путь к папке вручную');
      return value?.trim() || null;
    },
    initWorkspace: async ({ basePath }) => ({
      workspacePath: basePath,
      blocksPath: `${basePath}/blocks`,
      templatesPath: `${basePath}/templates`,
      exportsPath: `${basePath}/exports`
    })
  };
};

const App = (): JSX.Element => {
  const api = useMemo(() => getApi(), []);
  const [mode, setMode] = useState<SetupMode>('create');
  const [basePath, setBasePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<WorkspaceSettings>({});

  const isBrowserPreview = typeof window !== 'undefined' && !window.licenseBuilder;

  useEffect(() => {
    void api.getSettings().then((saved) => {
      setSettings(saved);
      if (saved.workspacePath) {
        setBasePath(saved.workspacePath);
      }
    });
  }, [api]);

  const statusText = useMemo(() => {
    if (settings.workspacePath) {
      return `Текущий workspace: ${settings.workspacePath}`;
    }

    return 'Workspace ещё не настроен';
  }, [settings.workspacePath]);

  const onSelectFolder = async (): Promise<void> => {
    const selected = await api.selectDirectory();
    if (selected) {
      setBasePath(selected);
    }
  };

  const onInitWorkspace = async (): Promise<void> => {
    setLoading(true);
    setError('');

    try {
      const saved = await api.initWorkspace({
        basePath,
        mode
      });
      setSettings(saved);
    } catch (initError) {
      setError(initError instanceof Error ? initError.message : 'Ошибка инициализации workspace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-shell">
      <h1>License Builder</h1>

      <section className="panel">
        <h2>Первичная настройка данных</h2>
        {isBrowserPreview ? (
          <p className="preview-badge">
            Режим предпросмотра в браузере: это эмулятор UI без доступа к файловой системе macOS.
          </p>
        ) : null}
        <p>
          После установки выберите: <strong>создать новую структуру папок</strong> или{' '}
          <strong>использовать существующую папку</strong>. Содержимое документов заполняется вручную.
        </p>

        <div className="mode-group">
          <label>
            <input
              type="radio"
              checked={mode === 'create'}
              onChange={() => setMode('create')}
            />
            Создать новую папку договора
          </label>

          <label>
            <input
              type="radio"
              checked={mode === 'useExisting'}
              onChange={() => setMode('useExisting')}
            />
            Выбрать уже существующую папку
          </label>
        </div>

        <div className="path-row">
          <input
            type="text"
            value={basePath}
            onChange={(event) => setBasePath(event.target.value)}
            placeholder="Путь к workspace-папке"
          />
          <button type="button" onClick={onSelectFolder}>
            Выбрать…
          </button>
        </div>

        <p className="hint">
          Приложение создаёт только структуру папок: <code>blocks/</code>, <code>templates/</code>, <code>exports/</code>.
          Блоки и рамку договора вы добавляете вручную в редакторе на следующих шагах.
        </p>

        <button type="button" onClick={onInitWorkspace} disabled={loading || !basePath}>
          {loading ? 'Подождите…' : 'Подтвердить и подготовить структуру'}
        </button>

        {error ? <p className="error">{error}</p> : null}

        <p className="status">{statusText}</p>

        {settings.blocksPath ? (
          <ul className="summary-list">
            <li>Блоки: {settings.blocksPath}</li>
            <li>Шаблоны: {settings.templatesPath}</li>
            <li>Экспорт: {settings.exportsPath}</li>
          </ul>
        ) : null}
      </section>
    </main>
  );
};

export default App;
