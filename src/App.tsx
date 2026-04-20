import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
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


const LogoMark = (): JSX.Element => (
  <svg className="brand-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64.17 64.07" aria-hidden>
    <path
      fill="#231f20"
      d="M0,32.04C0,14.32,14.32,0,32.13,0s32.04,14.32,32.04,32.04-14.32,32.04-32.04,32.04S0,49.85,0,32.04ZM57.46,32.04c0-14.14-11.29-25.34-25.43-25.34S6.79,17.9,6.79,32.04s11.2,25.34,25.24,25.34,25.43-11.2,25.43-25.34ZM40.67,27.91c-1.1-3.21-4.22-5.6-8.35-5.6-5.78,0-9.46,4.31-9.46,9.64s3.67,9.73,9.46,9.73c4.04,0,7.25-2.39,8.35-5.78h7.53c-1.38,7.34-7.53,12.85-15.97,12.85-10.1,0-16.62-7.44-16.62-16.8s6.52-16.71,16.62-16.71c8.45,0,14.69,5.42,15.97,12.67h-7.53Z"
    />
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

const AvailableRow = ({
  block,
  onAdd
}: {
  block: LicenseBlock;
  onAdd: (block: LicenseBlock) => void;
}): JSX.Element => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `available:${block.id}`
  });

  return (
    <div
      ref={setNodeRef}
      className="block-row"
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }}
      onClick={() => onAdd(block)}
    >
      <span className="drag-handle"><DragDots /></span>
      <div className="block-info" {...attributes} {...listeners}>
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
    >
      <span className="drag-handle"><DragDots /></span>
      <div className="block-info" {...attributes} {...listeners}>
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
  const [availableBlocks, setAvailableBlocks] = useState<LicenseBlock[]>(TEST_BLOCKS);
  const [selectedBlocks, setSelectedBlocks] = useState<SelectedBlock[]>([]);
  const [activeDragBlock, setActiveDragBlock] = useState<LicenseBlock | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({
    company_name: '',
    contract_date: ''
  });
  const [showVarsPopup, setShowVarsPopup] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [fontFamily, setFontFamily] = useState('Times New Roman');
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left');
  const [fontSize, setFontSize] = useState(13);
  const [numberingEnabled, setNumberingEnabled] = useState(true);

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


  const addFromLibrary = (block: LicenseBlock): void => {
    setSelectedBlocks((prev) => [
      ...prev,
      { instanceId: `selected:${block.id}:${Date.now()}:${Math.random().toString(16).slice(2, 6)}`, block }
    ]);
    setAvailableBlocks((prev) => prev.filter((item) => item.id !== block.id));
  };
  const requiredVariables = useMemo(() => {
    const vars = new Set<string>(['company_name', 'contract_date']);
    selectedBlocks.forEach(({ block }) => block.variables.forEach((name) => vars.add(name)));
    return [...vars];
  }, [selectedBlocks]);

  const previewParts = useMemo(() => {
    const bodyLines = selectedBlocks.map(({ block }, i) => ({
      title: numberingEnabled ? `${i + 1}. ${block.title}` : block.title,
      text: replaceVars(block.body, variables)
    }));
    return {
      header: replaceVars(TEST_FRAME.header, variables),
      bodyLines,
      footer: replaceVars(TEST_FRAME.footer, variables)
    };
  }, [numberingEnabled, selectedBlocks, variables]);

  const removeFromAssembly = (instanceId: string): void => {
    setSelectedBlocks((prev) => {
      const removed = prev.find((item) => item.instanceId === instanceId);
      if (removed) {
        setAvailableBlocks((blocks) => [...blocks, removed.block]);
      }
      return prev.filter((item) => item.instanceId !== instanceId);
    });
  };

  const onDragStart = (event: DragStartEvent): void => {
    const activeId = String(event.active.id);
    if (activeId.startsWith('available:')) {
      const block = availableBlocks.find((item) => item.id === activeId.replace('available:', '')) ?? null;
      setActiveDragBlock(block);
      return;
    }
    const selected = selectedBlocks.find((item) => item.instanceId === activeId);
    setActiveDragBlock(selected?.block ?? null);
  };

  const onDragCancel = (): void => setActiveDragBlock(null);

  const onDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over) {
      setActiveDragBlock(null);
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith('available:') && (overId === 'assembly-zone' || overId.startsWith('selected:'))) {
      const block = availableBlocks.find((item) => item.id === activeId.replace('available:', ''));
      if (!block) {
        return;
      }

      addFromLibrary(block);
      setActiveDragBlock(null);
      return;
    }

    const activeIndex = selectedBlocks.findIndex((item) => item.instanceId === activeId);
    const overIndex = selectedBlocks.findIndex((item) => item.instanceId === overId);
    if (activeIndex >= 0 && overIndex >= 0 && activeIndex !== overIndex) {
      setSelectedBlocks((prev) => arrayMove(prev, activeIndex, overIndex));
    }
    setActiveDragBlock(null);
  };

  const previewTextStyle = {
    fontFamily,
    fontWeight: isBold ? 700 : 400,
    fontStyle: isItalic ? 'italic' : 'normal',
    textAlign,
    fontSize: `${fontSize}px`
  } as const;

  return (
    <main className="icloud-page">
      <header className="icloud-topbar">
        <div className="brand-wrap">
          <LogoMark />
          <div className="lb-title">License Constructor</div>
        </div>
        <div className="top-actions">
          <button type="button" className="btn-ghost">
            {hasWorkspace ? `Workspace: ${settings.workspacePath}` : 'Workspace не настроен'}
          </button>
          <button type="button" className="btn-primary" onClick={configureWorkspace}>Настроить папки</button>
        </div>
      </header>

      {error ? <div className="notice error">{error}</div> : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragCancel={onDragCancel}
        onDragEnd={onDragEnd}
      >
        <div className="layout">
          <section className="left-pane">
            <div className="section-label">Блоки</div>
            <div className="scroll-list">
              {availableBlocks.map((block) => (
                <AvailableRow key={block.id} block={block} onAdd={addFromLibrary} />
              ))}
            </div>

            <div className="h-divider" />
            <div className="section-label">Сборка</div>

            <div className="assembly-wrap">
              <SortableContext items={selectedBlocks.map((item) => item.instanceId)} strategy={verticalListSortingStrategy}>
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
              <div className="editor-tools">
                <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
                  <option>Times New Roman</option>
                  <option>Arial</option>
                  <option>Helvetica</option>
                  <option>Georgia</option>
                </select>
                <select value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))}>
                  <option value={11}>11</option>
                  <option value={12}>12</option>
                  <option value={13}>13</option>
                  <option value={14}>14</option>
                  <option value={16}>16</option>
                  <option value={18}>18</option>
                </select>
                <button type="button" className={`btn-tool ${isBold ? 'active' : ''}`} onClick={() => setIsBold((v) => !v)}>B</button>
                <button type="button" className={`btn-tool ${isItalic ? 'active' : ''}`} onClick={() => setIsItalic((v) => !v)}>I</button>
                <button type="button" className={`btn-tool ${textAlign === 'left' ? 'active' : ''}`} onClick={() => setTextAlign('left')}>⇤</button>
                <button type="button" className={`btn-tool ${textAlign === 'center' ? 'active' : ''}`} onClick={() => setTextAlign('center')}>≡</button>
                <button type="button" className={`btn-tool ${textAlign === 'right' ? 'active' : ''}`} onClick={() => setTextAlign('right')}>⇥</button>
              </div>

              <button className="btn-ghost" type="button" onClick={() => setShowVarsPopup((v) => !v)}>Настройки переменных</button>

              <div className="export-menu-wrap">
                <button className="btn-ghost" type="button" onClick={() => setShowExportMenu((v) => !v)}>Экспорт ▾</button>
                {showExportMenu ? (
                  <div className="export-menu">
                    <button type="button" disabled={!hasWorkspace}>Экспорт .docx</button>
                    <button type="button" disabled={!hasWorkspace}>Экспорт .pdf</button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="docs-canvas">
              {(() => {
                const lines = [previewParts.header, ...previewParts.bodyLines.flatMap((line) => [line.title, line.text]), previewParts.footer];
                const pages: string[][] = [];
                const maxCharsPerPage = 1800;
                let current: string[] = [];
                let count = 0;

                lines.forEach((line) => {
                  const nextCount = count + line.length;
                  if (nextCount > maxCharsPerPage && current.length > 0) {
                    pages.push(current);
                    current = [line];
                    count = line.length;
                  } else {
                    current.push(line);
                    count = nextCount;
                  }
                });

                if (current.length > 0) {
                  pages.push(current);
                }

                return pages.map((pageLines, pageIndex) => (
                  <article key={pageIndex} className="docs-paper" style={previewTextStyle}>
                    {pageLines.map((line, index) => (
                      <p key={`${pageIndex}-${index}`} className="preview-line">{line}</p>
                    ))}
                  </article>
                ));
              })()}
            </div>
          </section>
        </div>

        <DragOverlay>
          {activeDragBlock ? (
            <div className="block-row block-row-overlay">
              <span className="drag-handle"><DragDots /></span>
              <div className="block-info">
                <div className="block-name">{activeDragBlock.title}</div>
                <div className="block-desc">{activeDragBlock.description}</div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
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
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={numberingEnabled}
                onChange={(event) => setNumberingEnabled(event.target.checked)}
              />
              Включить нумерацию пунктов
            </label>

            <div className="popup-actions">
              <button className="btn-primary" type="button" onClick={() => setShowVarsPopup(false)}>Готово</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
};

export default App;
