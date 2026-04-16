import { useEffect, useMemo, useState } from 'react';
import { TEST_BLOCKS, TEST_FRAME, type LicenseBlock } from './data.test-blocks';

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

const replaceVars = (text: string, values: Record<string, string>): string =>
  text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, name: string) => values[name] || `{{${name}}}`);

const App = (): JSX.Element => {
  const api = useMemo(() => getApi(), []);
  const [mode, setMode] = useState<SetupMode>('create');
  const [basePath, setBasePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<WorkspaceSettings>({});
  const [selectedBlocks, setSelectedBlocks] = useState<LicenseBlock[]>([]);
  const [variables, setVariables] = useState<Record<string, string>>({
    company_name: '',
    contract_date: ''
  });

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

  const addBlock = (block: LicenseBlock): void => {
    setSelectedBlocks((prev) => [...prev, block]);
  };

  const removeBlock = (index: number): void => {
    setSelectedBlocks((prev) => prev.filter((_item, i) => i !== index));
  };

  const moveBlock = (index: number, direction: -1 | 1): void => {
    setSelectedBlocks((prev) => {
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= prev.length) {
        return prev;
      }

      const clone = [...prev];
      const temp = clone[index];
      clone[index] = clone[newIndex];
      clone[newIndex] = temp;
      return clone;
    });
  };

  const requiredVariables = useMemo(() => {
    const vars = new Set<string>(['company_name', 'contract_date']);
    selectedBlocks.forEach((block) => block.variables.forEach((item) => vars.add(item)));
    return [...vars];
  }, [selectedBlocks]);

  const previewText = useMemo(() => {
    const parts = [replaceVars(TEST_FRAME.header, variables)];
    selectedBlocks.forEach((block, i) => {
      parts.push(`\n${i + 1}. ${block.title}\n${replaceVars(block.body, variables)}`);
    });
    parts.push(`\n${replaceVars(TEST_FRAME.footer, variables)}`);
    return parts.join('\n');
  }, [selectedBlocks, variables]);

  if (settings.workspacePath) {
    return (
      <main className="app-shell app-builder">
        <header className="builder-header">
          <h1>License Builder</h1>
          <p>{statusText}</p>
        </header>

        <section className="builder-grid">
          <article className="column panel-column">
            <h2>Библиотека блоков</h2>
            {TEST_BLOCKS.map((block) => (
              <div key={block.id} className="card">
                <h3>{block.title}</h3>
                <p>{block.description}</p>
                <button type="button" onClick={() => addBlock(block)}>
                  Добавить
                </button>
              </div>
            ))}
          </article>

          <article className="column panel-column">
            <h2>Зона сборки</h2>
            <p className="muted">{TEST_FRAME.header}</p>
            {selectedBlocks.length === 0 ? <p className="muted">Блоки пока не добавлены.</p> : null}
            {selectedBlocks.map((block, index) => (
              <div key={`${block.id}-${index}`} className="card">
                <h3>{index + 1}. {block.title}</h3>
                <p>{block.body}</p>
                <div className="row-actions">
                  <button type="button" onClick={() => moveBlock(index, -1)}>
                    ↑
                  </button>
                  <button type="button" onClick={() => moveBlock(index, 1)}>
                    ↓
                  </button>
                  <button type="button" onClick={() => removeBlock(index)}>
                    Удалить
                  </button>
                </div>
              </div>
            ))}
            <p className="muted">{TEST_FRAME.footer}</p>
          </article>

          <article className="column panel-column">
            <h2>Предпросмотр</h2>
            <div className="vars-grid">
              {requiredVariables.map((name) => (
                <label key={name}>
                  {name}
                  <input
                    value={variables[name] ?? ''}
                    onChange={(event) =>
                      setVariables((prev) => ({
                        ...prev,
                        [name]: event.target.value
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <pre className="preview-box">{previewText}</pre>
            <div className="row-actions">
              <button type="button" disabled>Экспорт .docx</button>
              <button type="button" disabled>Экспорт .pdf</button>
            </div>
          </article>
        </section>
      </main>
    );
  }

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
      </section>
    </main>
  );
};

export default App;
