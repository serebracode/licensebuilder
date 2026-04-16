import { useEffect, useMemo, useState } from 'react';
import { TEST_BLOCKS, TEST_FRAME, type LicenseBlock } from './data.test-blocks';

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
      const value = window.prompt('Введите путь к рабочей папке');
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
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<WorkspaceSettings>({});
  const [selectedBlocks, setSelectedBlocks] = useState<LicenseBlock[]>([]);
  const [variables, setVariables] = useState<Record<string, string>>({
    company_name: '',
    contract_date: ''
  });

  const isBrowserPreview = typeof window !== 'undefined' && !window.licenseBuilder;
  const hasWorkspace = Boolean(settings.workspacePath);

  useEffect(() => {
    void api.getSettings().then((saved) => {
      setSettings(saved);
    });
  }, [api]);

  const configureWorkspace = async (): Promise<void> => {
    setError('');

    try {
      const selectedPath = await api.selectDirectory();
      if (!selectedPath) {
        return;
      }

      const saved = await api.initWorkspace({
        basePath: selectedPath,
        mode: 'useExisting'
      });
      setSettings(saved);
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : 'Не удалось настроить workspace');
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

  return (
    <main className="app-shell app-builder modern-bg">
      <header className="builder-topbar glass">
        <div>
          <h1>License Builder</h1>
          <p className="muted">Конструктор лицензионных договоров</p>
        </div>
        <div className="topbar-actions">
          <span className={`pill ${hasWorkspace ? 'pill-ok' : 'pill-warn'}`}>
            {hasWorkspace ? `Workspace: ${settings.workspacePath}` : 'Workspace не настроен'}
          </span>
          <button type="button" onClick={configureWorkspace}>
            Настроить папки
          </button>
        </div>
      </header>

      {isBrowserPreview ? (
        <p className="preview-badge panel-inline">
          Browser preview: UI-режим без нативного доступа к файловой системе macOS.
        </p>
      ) : null}

      {error ? <p className="error panel-inline">{error}</p> : null}

      <section className="builder-grid">
        <article className="column panel-column glass">
          <h2>Библиотека блоков</h2>
          {!hasWorkspace ? (
            <div className="callout">
              <p>Чтобы подгружать реальные блоки из папки, сначала настройте workspace.</p>
              <button type="button" onClick={configureWorkspace}>Настроить</button>
            </div>
          ) : null}
          {TEST_BLOCKS.map((block) => (
            <div key={block.id} className="card modern-card">
              <h3>{block.title}</h3>
              <p>{block.description}</p>
              <button type="button" onClick={() => addBlock(block)}>
                Добавить
              </button>
            </div>
          ))}
        </article>

        <article className="column panel-column glass">
          <h2>Зона сборки</h2>
          <p className="muted">{TEST_FRAME.header}</p>

          {selectedBlocks.length === 0 ? (
            <div className="callout subtle">
              Перетащите или добавьте блоки из библиотеки слева. (Drag & Drop добавим следующим шагом.)
            </div>
          ) : null}

          {selectedBlocks.map((block, index) => (
            <div key={`${block.id}-${index}`} className="card modern-card">
              <h3>
                {index + 1}. {block.title}
              </h3>
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

        <article className="column panel-column glass">
          <h2>Предпросмотр</h2>

          {!hasWorkspace ? (
            <div className="callout">
              Экспорт будет доступен после настройки workspace-папок.
            </div>
          ) : null}

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
            <button type="button" disabled={!hasWorkspace}>
              Экспорт .docx
            </button>
            <button type="button" disabled={!hasWorkspace}>
              Экспорт .pdf
            </button>
          </div>
        </article>
      </section>
    </main>
  );
};

export default App;
