import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
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
import { parseDocx } from './docx-parser';

const STORAGE_KEY = 'lb_blocks_v1';

function loadStoredBlocks(): LicenseBlock[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LicenseBlock[]) : TEST_BLOCKS;
  } catch {
    return TEST_BLOCKS;
  }
}

function saveBlocks(blocks: LicenseBlock[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
}

type LicenseBuilderApi = {
  getSettings: () => Promise<Record<string, string>>;
  selectDirectory: () => Promise<string | null>;
  initWorkspace: (payload: { basePath: string; mode: 'create' | 'useExisting' }) => Promise<Record<string, string>>;
};

type SelectedBlock = { instanceId: string; block: LicenseBlock };

const getApi = (): LicenseBuilderApi => {
  if (typeof window !== 'undefined' && window.licenseBuilder) return window.licenseBuilder;
  return {
    getSettings: async () => ({}),
    selectDirectory: async () => null,
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

function htmlToParagraphs(html: string): string[] {
  if (!html.trim().startsWith('<')) return html.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const div = document.createElement('div');
  div.innerHTML = html;
  const result: string[] = [];
  div.querySelectorAll('p, li').forEach(el => {
    const text = el.textContent?.trim();
    if (text) result.push(text);
  });
  return result;
}

function bodyToHtml(block: LicenseBlock): string {
  if (block.body.trim().startsWith('<')) return block.body;
  if (block.paragraphs?.length) return '<p>' + block.paragraphs.map(p => p.trim()).join('</p><p>') + '</p>';
  const paras = block.body.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  return paras.length ? '<p>' + paras.join('</p><p>') + '</p>' : '<p>' + block.body + '</p>';
}

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

const AvailableRow = ({ block, onOpenEditor }: { block: LicenseBlock; onOpenEditor: (id: string) => void }): JSX.Element => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `available:${block.id}` });
  return (
    <div
      ref={setNodeRef}
      className="block-row"
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }}
      onClick={() => onOpenEditor(block.id)}
    >
      <span className="drag-handle" {...attributes} {...listeners} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} title="Перетащить в сборку">
        <DragDots />
      </span>
      <div className="block-info">
        <div className="block-name">{block.title}</div>
        <div className="block-desc">{block.description}</div>
      </div>
    </div>
  );
};

const AssemblyRow = ({ item, onDelete, onOpenEditor }: { item: SelectedBlock; onDelete: (instanceId: string) => void; onOpenEditor: (id: string) => void }): JSX.Element => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.instanceId });
  return (
    <div
      ref={setNodeRef}
      className="block-row"
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      onClick={() => onOpenEditor(item.block.id)}
    >
      <span className="drag-handle" {...attributes} {...listeners} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
        <DragDots />
      </span>
      <div className="block-info">
        <div className="block-name">{item.block.title}</div>
        <div className="block-desc">{item.block.description}</div>
      </div>
      <button
        type="button"
        className="row-delete"
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onDelete(item.instanceId); }}
      >×</button>
    </div>
  );
};

function BlockEditor({
  block,
  onSave,
  onDirtyChange,
  fontFamily,
  fontSize,
}: {
  block: LicenseBlock;
  onSave: (updated: LicenseBlock) => void;
  onDirtyChange: (id: string, dirty: boolean) => void;
  fontFamily: string;
  fontSize: number;
}): JSX.Element {
  const [title, setTitle] = useState(block.title);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDirtyRef = useRef(false);

  const markDirty = () => {
    if (!isDirtyRef.current) {
      isDirtyRef.current = true;
      onDirtyChange(block.id, true);
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ['paragraph', 'heading'] }),
    ],
    content: bodyToHtml(block),
  });

  // Listen for content changes to track dirty state
  useEffect(() => {
    if (!editor) return;
    const handler = () => markDirty();
    editor.on('update', handler);
    return () => { editor.off('update', handler); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // On unmount (tab switch away), clear dirty so closing an inactive tab never prompts
  useEffect(() => {
    const id = block.id;
    return () => {
      if (isDirtyRef.current) {
        isDirtyRef.current = false;
        onDirtyChange(id, false);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = (): void => {
    if (!editor) return;
    const html = editor.getHTML();
    const paragraphs = htmlToParagraphs(html);
    onSave({ ...block, title, body: html, paragraphs });
    isDirtyRef.current = false;
    onDirtyChange(block.id, false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleImport = async (file: File): Promise<void> => {
    try {
      const { preamble, sections } = await parseDocx(file);
      const allParas = [...preamble, ...sections.flatMap(s => [s.heading, ...s.paragraphs])];
      const html = '<p>' + allParas.map(p => p.trim()).filter(Boolean).join('</p><p>') + '</p>';
      editor?.commands.setContent(html);
      markDirty();
    } catch (e) {
      console.error('Import error:', e);
    }
  };

  return (
    <>
      <div className="block-editor-toolbar">
        <input
          className="block-editor__title-input"
          value={title}
          onChange={e => { setTitle(e.target.value); markDirty(); }}
          placeholder="Название блока"
        />
        <div className="editor-tools">
          <button type="button" className={`btn-tool${editor?.isActive('bold') ? ' active' : ''}`} onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleBold().run(); }} title="Жирный">B</button>
          <div className="format-separator" />
          <button type="button" className={`btn-tool${editor?.isActive({ textAlign: 'left' }) ? ' active' : ''}`} onMouseDown={e => { e.preventDefault(); editor?.chain().focus().setTextAlign('left').run(); }} title="По левому краю">⇤</button>
          <button type="button" className={`btn-tool${editor?.isActive({ textAlign: 'center' }) ? ' active' : ''}`} onMouseDown={e => { e.preventDefault(); editor?.chain().focus().setTextAlign('center').run(); }} title="По центру">≡</button>
          <button type="button" className={`btn-tool${editor?.isActive({ textAlign: 'right' }) ? ' active' : ''}`} onMouseDown={e => { e.preventDefault(); editor?.chain().focus().setTextAlign('right').run(); }} title="По правому краю">⇥</button>
          <div className="format-separator" />
          <button type="button" className={`btn-tool${editor?.isActive('orderedList') ? ' active' : ''}`} onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleOrderedList().run(); }} title="Нумерованный список">1.</button>
          <button type="button" className={`btn-tool${editor?.isActive('bulletList') ? ' active' : ''}`} onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleBulletList().run(); }} title="Маркированный список">•</button>
        </div>
        <div className="editor-actions">
          <button type="button" className="btn-ghost" onClick={() => fileInputRef.current?.click()}>Импорт .docx</button>
          <button type="button" className={`btn-primary${saved ? ' btn-saved' : ''}`} onClick={handleSave}>
            {saved ? '✓ Сохранено' : 'Сохранить'}
          </button>
        </div>
      </div>

      <div className="block-editor-canvas">
        <article className="docs-paper block-editor-paper" style={{ fontFamily, fontSize: `${fontSize}px` }}>
          <EditorContent editor={editor} className="tiptap-editor" />
        </article>
      </div>

      <input ref={fileInputRef} type="file" accept=".docx" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) void handleImport(f); e.target.value = ''; }}
      />
    </>
  );
}

const App = (): JSX.Element => {
  const api = useMemo(() => getApi(), []);
  const sensors = useSensors(useSensor(MouseSensor), useSensor(TouchSensor));

  const [availableBlocks, setAvailableBlocks] = useState<LicenseBlock[]>(loadStoredBlocks);
  const [selectedBlocks, setSelectedBlocks] = useState<SelectedBlock[]>([]);
  const [activeDragBlock, setActiveDragBlock] = useState<LicenseBlock | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | string>('preview');
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [variables, setVariables] = useState<Record<string, string>>({ company_name: '', contract_date: '' });
  const [showVarsPopup, setShowVarsPopup] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [fontFamily, setFontFamily] = useState('Times New Roman');
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left');
  const [fontSize, setFontSize] = useState(13);
  const [numberingEnabled, setNumberingEnabled] = useState(true);
  const [frame, setFrame] = useState({ header: TEST_FRAME.header, footer: TEST_FRAME.footer });

  // Tracks which open tabs have unsaved edits (managed via ref to avoid re-renders)
  const dirtyTabsRef = useRef(new Set<string>());

  const handleDirtyChange = useCallback((id: string, dirty: boolean) => {
    if (dirty) dirtyTabsRef.current.add(id);
    else dirtyTabsRef.current.delete(id);
  }, []);

  const openBlockEditor = (id: string): void => {
    setOpenTabIds(prev => prev.includes(id) ? prev : [...prev, id]);
    setActiveTab(id);
  };

  const closeTab = (id: string): void => {
    if (dirtyTabsRef.current.has(id)) {
      const ok = window.confirm('Блок изменён, но не сохранён. Закрыть без сохранения?');
      if (!ok) return;
    }
    dirtyTabsRef.current.delete(id);
    setOpenTabIds(prev => prev.filter(t => t !== id));
    setActiveTab(prev => prev === id ? 'preview' : prev);
  };

  const findBlock = (id: string): LicenseBlock | undefined =>
    availableBlocks.find(b => b.id === id) ?? selectedBlocks.find(s => s.block.id === id)?.block;

  const saveBlockEdit = (updated: LicenseBlock): void => {
    setAvailableBlocks(prev => { const next = prev.map(b => b.id === updated.id ? updated : b); saveBlocks(next); return next; });
    setSelectedBlocks(prev => prev.map(s => s.block.id === updated.id ? { ...s, block: updated } : s));
  };

  const addFromLibrary = (block: LicenseBlock): void => {
    setSelectedBlocks(prev => [...prev, { instanceId: `selected:${block.id}:${Date.now()}:${Math.random().toString(16).slice(2, 6)}`, block }]);
    setAvailableBlocks(prev => prev.filter(item => item.id !== block.id));
  };

  const requiredVariables = useMemo(() => {
    const vars = new Set<string>(['company_name', 'contract_date']);
    selectedBlocks.forEach(({ block }) => block.variables.forEach(name => vars.add(name)));
    return [...vars];
  }, [selectedBlocks]);

  const previewParts = useMemo(() => {
    const bodyLines = selectedBlocks.flatMap(({ block }, i) => {
      const artNum = i + 1;
      const heading = numberingEnabled ? `СТАТЬЯ ${artNum}. ${block.title}` : block.title;
      const paragraphs = block.paragraphs?.length ? block.paragraphs : htmlToParagraphs(block.body);
      if (paragraphs.length > 0) {
        return [
          { isHeading: true, text: heading },
          ...paragraphs.map((p, j) => ({
            isHeading: false,
            text: numberingEnabled ? `${artNum}.${j + 1} ${replaceVars(p, variables)}` : replaceVars(p, variables),
          }))
        ];
      }
      const rawText = block.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return [{ isHeading: true, text: heading }, { isHeading: false, text: replaceVars(rawText, variables) }];
    });
    return {
      header: replaceVars(frame.header, variables),
      bodyLines,
      footer: replaceVars(frame.footer, variables)
    };
  }, [numberingEnabled, selectedBlocks, variables, frame]);

  const removeFromAssembly = (instanceId: string): void => {
    setSelectedBlocks(prev => {
      const removed = prev.find(item => item.instanceId === instanceId);
      if (removed) setAvailableBlocks(blocks => [...blocks, removed.block]);
      return prev.filter(item => item.instanceId !== instanceId);
    });
  };

  const onDragStart = (event: DragStartEvent): void => {
    const activeId = String(event.active.id);
    if (activeId.startsWith('available:')) {
      setActiveDragBlock(availableBlocks.find(item => item.id === activeId.replace('available:', '')) ?? null);
      return;
    }
    setActiveDragBlock(selectedBlocks.find(item => item.instanceId === activeId)?.block ?? null);
  };

  const onDragCancel = (): void => setActiveDragBlock(null);

  const onDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over) { setActiveDragBlock(null); return; }
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId.startsWith('available:') && (overId === 'assembly-zone' || overId.startsWith('selected:'))) {
      const block = availableBlocks.find(item => item.id === activeId.replace('available:', ''));
      if (block) addFromLibrary(block);
      setActiveDragBlock(null);
      return;
    }
    const activeIndex = selectedBlocks.findIndex(item => item.instanceId === activeId);
    const overIndex = selectedBlocks.findIndex(item => item.instanceId === overId);
    if (activeIndex >= 0 && overIndex >= 0 && activeIndex !== overIndex) {
      setSelectedBlocks(prev => arrayMove(prev, activeIndex, overIndex));
    }
    setActiveDragBlock(null);
  };

  const previewTextStyle = { fontFamily, fontWeight: isBold ? 700 : 400, fontStyle: isItalic ? 'italic' : 'normal', textAlign, fontSize: `${fontSize}px` } as const;

  return (
    <main className="icloud-page">
      <header className="icloud-topbar">
        <span className="brand-copyright">© LicenseConstructor</span>
      </header>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragCancel={onDragCancel} onDragEnd={onDragEnd}>
        <div className="layout">
          <section className="left-pane">
            <div className="section-label">Блоки</div>
            <div className="scroll-list">
              {availableBlocks.map(block => <AvailableRow key={block.id} block={block} onOpenEditor={openBlockEditor} />)}
            </div>
            <div className="h-divider" />
            <div className="section-label">Сборка</div>
            <div className="assembly-wrap">
              <SortableContext items={selectedBlocks.map(item => item.instanceId)} strategy={verticalListSortingStrategy}>
                <DropZone id="assembly-zone">
                  <div className="scroll-list">
                    {selectedBlocks.length === 0 ? <div className="drop-hint">Перетащите блоки сюда</div> : null}
                    {selectedBlocks.map(item => <AssemblyRow key={item.instanceId} item={item} onDelete={removeFromAssembly} onOpenEditor={openBlockEditor} />)}
                  </div>
                </DropZone>
              </SortableContext>
            </div>
          </section>

          <section className="right-pane">
            <div className="tab-bar">
              <button type="button" className={`tab${activeTab === 'preview' ? ' tab--active' : ''}`} onClick={() => setActiveTab('preview')}>Договор</button>
              {openTabIds.map(id => {
                const b = findBlock(id);
                return (
                  <button key={id} type="button" className={`tab${activeTab === id ? ' tab--active' : ''}`} onClick={() => setActiveTab(id)}>
                    <span className="tab__label">{b?.title ?? id}</span>
                    <span className="tab__close" role="button" onClick={e => { e.stopPropagation(); closeTab(id); }}>×</span>
                  </button>
                );
              })}
            </div>

            {activeTab === 'preview' && (
              <div className="preview-toolbar">
                <div className="editor-tools" />
                <button className="btn-ghost" type="button" onClick={() => setShowVarsPopup(v => !v)}>Переменные</button>
                <div className="export-menu-wrap">
                  <button className="btn-ghost" type="button" onClick={() => setShowExportMenu(v => !v)}>Экспорт ▾</button>
                  {showExportMenu ? (
                    <div className="export-menu">
                      <button type="button">Экспорт .docx</button>
                      <button type="button">Экспорт .pdf</button>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {openTabIds.map(id => {
              const b = findBlock(id);
              if (!b || activeTab !== id) return null;
              return (
                <BlockEditor
                  key={id}
                  block={b}
                  onSave={saveBlockEdit}
                  onDirtyChange={handleDirtyChange}
                  fontFamily={fontFamily}
                  fontSize={fontSize}
                />
              );
            })}

            <div className="docs-canvas" style={{ display: activeTab === 'preview' ? 'flex' : 'none' }}>
              {(() => {
                type PL = { text: string; isHeading: boolean };
                const allLines: PL[] = [
                  { text: previewParts.header, isHeading: false },
                  ...previewParts.bodyLines,
                  { text: previewParts.footer, isHeading: false },
                ];
                const pages: PL[][] = [];
                const MAX = 1800;
                let page: PL[] = [], count = 0;
                for (const line of allLines) {
                  if (line.text.length + count > MAX && page.length > 0) { pages.push(page); page = [line]; count = line.text.length; }
                  else { page.push(line); count += line.text.length; }
                }
                if (page.length > 0) pages.push(page);
                if (pages.length === 0) return (
                  <article className="docs-paper" style={previewTextStyle}>
                    <p className="preview-empty">Добавьте блоки в сборку, чтобы увидеть предпросмотр</p>
                  </article>
                );
                return pages.map((pageLines, pi) => (
                  <article key={pi} className="docs-paper" style={previewTextStyle}>
                    {pageLines.map((line, li) => (
                      <p key={`${pi}-${li}`} className={`preview-line${line.isHeading ? ' preview-heading' : ''}`}>{line.text}</p>
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
          <div className="popup" onClick={e => e.stopPropagation()}>
            <h3>Переменные договора</h3>
            <div className="popup-grid">
              {requiredVariables.map(name => (
                <label key={name}>
                  {name}
                  <input value={variables[name] ?? ''} onChange={e => setVariables(prev => ({ ...prev, [name]: e.target.value }))} />
                </label>
              ))}
            </div>
            <label className="toggle-row">
              <input type="checkbox" checked={numberingEnabled} onChange={e => setNumberingEnabled(e.target.checked)} />
              Включить нумерацию пунктов
            </label>

            <div className="popup-divider" />
            <h4 className="popup-section-title">Настройки документа</h4>
            <div className="doc-settings-grid">
              <label>
                Шрифт
                <select value={fontFamily} onChange={e => setFontFamily(e.target.value)}>
                  <option>Times New Roman</option>
                  <option>Arial</option>
                  <option>Helvetica</option>
                  <option>Georgia</option>
                </select>
              </label>
              <label>
                Размер
                <select value={fontSize} onChange={e => setFontSize(Number(e.target.value))}>
                  <option value={11}>11</option><option value={12}>12</option><option value={13}>13</option>
                  <option value={14}>14</option><option value={16}>16</option><option value={18}>18</option>
                </select>
              </label>
              <label>
                Начертание
                <div className="doc-settings-row">
                  <button type="button" className={`btn-tool${isBold ? ' active' : ''}`} onClick={() => setIsBold(v => !v)}>B</button>
                  <button type="button" className={`btn-tool${isItalic ? ' active' : ''}`} onClick={() => setIsItalic(v => !v)}>I</button>
                </div>
              </label>
              <label>
                Выравнивание
                <div className="doc-settings-row">
                  <button type="button" className={`btn-tool${textAlign === 'left' ? ' active' : ''}`} onClick={() => setTextAlign('left')}>⇤</button>
                  <button type="button" className={`btn-tool${textAlign === 'center' ? ' active' : ''}`} onClick={() => setTextAlign('center')}>≡</button>
                  <button type="button" className={`btn-tool${textAlign === 'right' ? ' active' : ''}`} onClick={() => setTextAlign('right')}>⇥</button>
                </div>
              </label>
            </div>

            <div className="popup-divider" />
            <h4 className="popup-section-title">Рамка договора</h4>
            <label className="popup-full-label">
              Шапка (текст до статей)
              <textarea
                className="popup-textarea"
                value={frame.header}
                onChange={e => setFrame(prev => ({ ...prev, header: e.target.value }))}
                rows={4}
              />
            </label>
            <label className="popup-full-label">
              Подвал (текст после статей)
              <textarea
                className="popup-textarea"
                value={frame.footer}
                onChange={e => setFrame(prev => ({ ...prev, footer: e.target.value }))}
                rows={3}
              />
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
