import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

type SelectedBlock = {
  instanceId: string;
  block: LicenseBlock;
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

const DropZone = ({ id, children }: { id: string; children: ReactNode }): JSX.Element => {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div ref={setNodeRef} className={`drop-zone ${isOver ? 'drop-zone-over' : ''}`}>
      {children}
    </div>
  );
};

const AvailableDraggable = ({ block }: { block: LicenseBlock }): JSX.Element => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `available:${block.id}`
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1
      }}
      className="card modern-card"
      {...attributes}
      {...listeners}
    >
      <h3>{block.title}</h3>
      <p>{block.description}</p>
      <p className="muted tiny">Перетащите в нижнюю зону сборки</p>
    </div>
  );
};

const SelectedSortable = ({ item }: { item: SelectedBlock }): JSX.Element => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.instanceId
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1
      }}
      className="card modern-card"
      {...attributes}
      {...listeners}
    >
      <h3>{item.block.title}</h3>
      <p>{item.block.body}</p>
    </div>
  );
};

const App = (): JSX.Element => {
  const api = useMemo(() => getApi(), []);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<WorkspaceSettings>({});
  const [selectedBlocks, setSelectedBlocks] = useState<SelectedBlock[]>([]);
  const [variables, setVariables] = useState<Record<string, string>>({
    company_name: '',
    contract_date: ''
  });

  const isBrowserPreview = typeof window !== 'undefined' && !window.licenseBuilder;
  const hasWorkspace = Boolean(settings.workspacePath);

  const sensors = useSensors(useSensor(MouseSensor), useSensor(TouchSensor));

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

  const requiredVariables = useMemo(() => {
    const vars = new Set<string>(['company_name', 'contract_date']);
    selectedBlocks.forEach(({ block }) => block.variables.forEach((item) => vars.add(item)));
    return [...vars];
  }, [selectedBlocks]);

  const previewText = useMemo(() => {
    const parts = [replaceVars(TEST_FRAME.header, variables)];
    selectedBlocks.forEach(({ block }, i) => {
      parts.push(`\n${i + 1}. ${block.title}\n${replaceVars(block.body, variables)}`);
    });
    parts.push(`\n${replaceVars(TEST_FRAME.footer, variables)}`);
    return parts.join('\n');
  }, [selectedBlocks, variables]);

  const onDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;

    if (!over) {
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith('available:') && (overId === 'assembly-zone' || overId.startsWith('selected:'))) {
      const blockId = activeId.replace('available:', '');
      const block = TEST_BLOCKS.find((item) => item.id === blockId);
      if (!block) {
        return;
      }

      setSelectedBlocks((prev) => [
        ...prev,
        {
          instanceId: `selected:${block.id}:${Date.now()}:${Math.random().toString(16).slice(2, 6)}`,
          block
        }
      ]);
      return;
    }

    const activeIndex = selectedBlocks.findIndex((item) => item.instanceId === activeId);
    const overIndex = selectedBlocks.findIndex((item) => item.instanceId === overId);

    if (activeIndex >= 0 && overIndex >= 0 && activeIndex !== overIndex) {
      setSelectedBlocks((prev) => arrayMove(prev, activeIndex, overIndex));
    }
  };

  return (
    <main className="app-shell split-layout modern-bg">
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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <section className="main-split">
          <div className="left-half">
            <article className="half-panel glass">
              <h2>Блоки в наличии</h2>
              {!hasWorkspace ? (
                <div className="callout">
                  <p>Подключите workspace, чтобы в будущем загружать реальные JSON-блоки.</p>
                  <button type="button" onClick={configureWorkspace}>Настроить</button>
                </div>
              ) : null}
              <SortableContext
                items={TEST_BLOCKS.map((block) => `available:${block.id}`)}
                strategy={verticalListSortingStrategy}
              >
                <DropZone id="library-zone">
                  <div className="list-stack">
                    {TEST_BLOCKS.map((block) => (
                      <AvailableDraggable key={block.id} block={block} />
                    ))}
                  </div>
                </DropZone>
              </SortableContext>
            </article>

            <article className="half-panel glass">
              <h2>Зона сборки (Drag & Drop)</h2>
              <SortableContext
                items={selectedBlocks.map((item) => item.instanceId)}
                strategy={verticalListSortingStrategy}
              >
                <DropZone id="assembly-zone">
                  <div className="list-stack">
                    {selectedBlocks.length === 0 ? (
                      <div className="callout subtle">Перетащите блоки из верхней области сюда.</div>
                    ) : null}
                    {selectedBlocks.map((item) => (
                      <SelectedSortable key={item.instanceId} item={item} />
                    ))}
                  </div>
                </DropZone>
              </SortableContext>
            </article>
          </div>

          <article className="right-half glass">
            <h2>Предпросмотр</h2>
            <div className="preview-paper">
              <p>{replaceVars(TEST_FRAME.header, variables)}</p>
              {selectedBlocks.map(({ block }, i) => (
                <section key={block.id + i}>
                  <h3>{i + 1}. {block.title}</h3>
                  <p>{replaceVars(block.body, variables)}</p>
                </section>
              ))}
              <p>{replaceVars(TEST_FRAME.footer, variables)}</p>
            </div>

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

            <div className="row-actions">
              <button type="button" disabled={!hasWorkspace}>Экспорт .docx</button>
              <button type="button" disabled={!hasWorkspace}>Экспорт .pdf</button>
            </div>
            <p className="muted tiny">Текст preview: {previewText.length} символов</p>
          </article>
        </section>
      </DndContext>
    </main>
  );
};

export default App;
