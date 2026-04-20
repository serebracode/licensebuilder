import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
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

const DragDots = (): JSX.Element => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
    <circle cx="3.5" cy="3" r="1" fill="currentColor" />
    <circle cx="8.5" cy="3" r="1" fill="currentColor" />
    <circle cx="3.5" cy="6" r="1" fill="currentColor" />
    <circle cx="8.5" cy="6" r="1" fill="currentColor" />
    <circle cx="3.5" cy="9" r="1" fill="currentColor" />
    <circle cx="8.5" cy="9" r="1" fill="currentColor" />
  </svg>
);

const DropZone = ({ id, children }: { id: string; children: ReactNode }): JSX.Element => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`drop-zone ${isOver ? 'is-over' : ''}`}>
      {children}
    </div>
  );
};

const AvailableRow = ({ block }: { block: LicenseBlock }): JSX.Element => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `available:${block.id}`
  });

  return (
    <div
      ref={setNodeRef}
      className="block-row"
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }}
      {...attributes}
      {...listeners}
    >
      <span className="drag-handle"><DragDots /></span>
      <div className="block-info">
        <div className="block-name">{block.title}</div>
        <div className="block-desc">{block.description}</div>
      </div>
    </div>
  );
};

const AssemblyRow = ({
  item,
  onDelete
}: {
  item: SelectedBlock;
  onDelete: (instanceId: string) => void;
}): JSX.Element => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.instanceId
  });

  return (
    <div
      ref={setNodeRef}
      className="block-row"
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      {...attributes}
      {...listeners}
    >
      <span className="drag-handle"><DragDots /></span>
      <div className="block-info">
        <div className="block-name">{item.block.title}</div>
        <div className="block-desc">{item.block.description}</div>
      </div>
      <button
        type="button"
        className="row-delete"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => onDelete(item.instanceId)}
      >
        ×
      </button>
    </div>
  );
};

const App = (): JSX.Element => {
  const api = useMemo(() => getApi(), []);
  const sensors = useSensors(useSensor(MouseSensor), useSensor(TouchSensor));

  const [settings, setSettings] = useState<WorkspaceSettings>({});
  const [error, setError] = useState('');
  const [selectedBlocks, setSelectedBlocks] = useState<SelectedBlock[]>([]);
  const [variables, setVariables] = useState<Record<string, string>>({
    company_name: '',
    contract_date: ''
  });
  const [showVarsPopup, setShowVarsPopup] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const isBrowserPreview = typeof window !== 'undefined' && !window.licenseBuilder;
  const hasWorkspace = Boolean(settings.workspacePath);

  useEffect(() => {
    void api.getSettings().then((saved) => setSettings(saved));
  }, [api]);

  const configureWorkspace = async (): Promise<void> => {
    setError('');

    try {
      const selectedPath = await api.selectDirectory();
      if (!selectedPath) {
        return;
      }

      const saved = await api.initWorkspace({ basePath: selectedPath, mode: 'useExisting' });
      setSettings(saved);
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : 'Не удалось настроить workspace');
    }
  };

  const requiredVariables = useMemo(() => {
    const vars = new Set<string>(['company_name', 'contract_date']);
    selectedBlocks.forEach(({ block }) => block.variables.forEach((name) => vars.add(name)));
    return [...vars];
  }, [selectedBlocks]);

  const previewParts = useMemo(() => {
    const bodyLines = selectedBlocks.map(({ block }, i) => ({
      title: `${i + 1}. ${block.title}`,
      text: replaceVars(block.body, variables)
    }));

    return {
      header: replaceVars(TEST_FRAME.header, variables),
      bodyLines,
      footer: replaceVars(TEST_FRAME.footer, variables)
    };
  }, [selectedBlocks, variables]);


  const removeFromAssembly = (instanceId: string): void => {
    setSelectedBlocks((prev) => prev.filter((item) => item.instanceId !== instanceId));
  };
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
        { instanceId: `selected:${block.id}:${Date.now()}:${Math.random().toString(16).slice(2, 6)}`, block }
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
    <main className="icloud-page">
      <header className="icloud-topbar">
        <div>
          <div className="lb-title">License Builder</div>
          <div className="lb-subtitle">Конструктор лицензионных договоров</div>
        </div>

        <div className="top-actions">
          <button type="button" className="btn-ghost">
            {hasWorkspace ? `Workspace: ${settings.workspacePath}` : 'Workspace не настроен'}
          </button>
          <button type="button" className="btn-primary" onClick={configureWorkspace}>
            Настроить папки
          </button>
        </div>
      </header>

      {isBrowserPreview ? <div className="notice">Browser preview — нет доступа к файловой системе macOS.</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="layout">
          <section className="left-pane">
            <div className="section-label">Блоки</div>
            <div className="scroll-list">
              {TEST_BLOCKS.map((block) => (
                <AvailableRow key={block.id} block={block} />
              ))}
            </div>

            <div className="h-divider" />
            <div className="section-label">Сборка</div>

            <div className="assembly-wrap">
              <SortableContext
                items={selectedBlocks.map((item) => item.instanceId)}
                strategy={verticalListSortingStrategy}
              >
                <DropZone id="assembly-zone">
                  <div className="scroll-list">
                    {selectedBlocks.length === 0 ? <div className="drop-hint">Перетащите блоки сюда</div> : null}
                    {selectedBlocks.map((item) => (
                      <AssemblyRow key={item.instanceId} item={item} onDelete={removeFromAssembly} />
                    ))}
                  </div>
                </DropZone>
              </SortableContext>
            </div>
          </section>

          <section className="right-pane">
            <div className="preview-toolbar">
              <button className="btn-ghost" type="button" onClick={() => setShowVarsPopup((v) => !v)}>
                Настройки переменных
              </button>

              <div className="export-menu-wrap">
                <button className="btn-ghost" type="button" onClick={() => setShowExportMenu((v) => !v)}>
                  Экспорт ▾
                </button>
                {showExportMenu ? (
                  <div className="export-menu">
                    <button type="button" disabled={!hasWorkspace}>Экспорт .docx</button>
                    <button type="button" disabled={!hasWorkspace}>Экспорт .pdf</button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="docs-canvas">
              <article className="docs-paper">
                <p className="preview-line">{previewParts.header}</p>
                {previewParts.bodyLines.map((line) => (
                  <div key={line.title}>
                    <p className="preview-line"><strong>{line.title}</strong></p>
                    <p className="preview-line">{line.text}</p>
                  </div>
                ))}
                <p className="preview-line">{previewParts.footer}</p>
              </article>
            </div>
          </section>
        </div>
      </DndContext>

      {showVarsPopup ? (
        <div className="popup-backdrop" onClick={() => setShowVarsPopup(false)}>
          <div className="popup" onClick={(e) => e.stopPropagation()}>
            <h3>Переменные договора</h3>
            <div className="popup-grid">
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
            <div className="popup-actions">
              <button className="btn-primary" type="button" onClick={() => setShowVarsPopup(false)}>
                Готово
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
};

export default App;
