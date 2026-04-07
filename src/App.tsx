import { useEffect, useMemo, useState } from 'react';

type SetupMode = 'create' | 'useExisting';

type WorkspaceSettings = {
  workspacePath?: string;
  blocksPath?: string;
  templatesPath?: string;
  exportsPath?: string;
};

const App = (): JSX.Element => {
  const [mode, setMode] = useState<SetupMode>('create');
  const [basePath, setBasePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<WorkspaceSettings>({});

  useEffect(() => {
    void window.licenseBuilder.getSettings().then((saved) => {
      setSettings(saved);
      if (saved.workspacePath) {
        setBasePath(saved.workspacePath);
      }
    });
  }, []);

  const statusText = useMemo(() => {
    if (settings.workspacePath) {
      return `Текущий workspace: ${settings.workspacePath}`;
    }

    return 'Workspace ещё не настроен';
  }, [settings.workspacePath]);

  const onSelectFolder = async (): Promise<void> => {
    const selected = await window.licenseBuilder.selectDirectory();
    if (selected) {
      setBasePath(selected);
    }
  };

  const onInitWorkspace = async (): Promise<void> => {
    setLoading(true);
    setError('');

    try {
      const saved = await window.licenseBuilder.initWorkspace({
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
