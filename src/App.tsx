import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react';
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
import {
  loadFrameBlocks, saveFrameBlocks,
  loadModuleBlocks, saveModuleBlocks,
  FRAME_DEFAULTS, type LicenseBlock
} from './data.test-blocks';
import { parseDocx } from './docx-parser';

type SelectedBlock = { instanceId: string; block: LicenseBlock };
type PreviewLine = { text: string; type: 'heading' | 'subheading' | 'para' | 'text' };

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

const FrameRow = ({ block, onOpenEditor }: { block: LicenseBlock; onOpenEditor: (id: string) => void }): JSX.Element => (
  <div className="block-row" onClick={() => onOpenEditor(block.id)}>
    <div className="block-info">
      <div className="block-name">{block.title}</div>
      <div className="block-desc">{block.description}</div>
    </div>
  </div>
);

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

  useEffect(() => {
    if (!editor) return;
    const handler = () => markDirty();
    editor.on('update', handler);
    return () => { editor.off('update', handler); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

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
        <article className="docs-paper block-editor-paper" style={{ fontFamily, fontSize: `${fontSize}pt` }}>
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
  const sensors = useSensors(useSensor(MouseSensor), useSensor(TouchSensor));

  const [frameBlocks, setFrameBlocks] = useState<LicenseBlock[]>(loadFrameBlocks);
  const [availableBlocks, setAvailableBlocks] = useState<LicenseBlock[]>(loadModuleBlocks);
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
  const [fontSize, setFontSize] = useState(11);
  const [frame, setFrame] = useState({
    header: FRAME_DEFAULTS.header,
    article3Title: FRAME_DEFAULTS.article3Title,
    reqLeft: FRAME_DEFAULTS.reqLeft,
    reqRight: FRAME_DEFAULTS.reqRight,
  });

  const dirtyTabsRef = useRef(new Set<string>());
  const measureRef = useRef<HTMLDivElement>(null);
  const [pagedLines, setPagedLines] = useState<PreviewLine[][] | null>(null);

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
    frameBlocks.find(b => b.id === id)
    ?? availableBlocks.find(b => b.id === id)
    ?? selectedBlocks.find(s => s.block.id === id)?.block;

  const saveBlockEdit = (updated: LicenseBlock): void => {
    if (frameBlocks.some(b => b.id === updated.id)) {
      setFrameBlocks(prev => { const next = prev.map(b => b.id === updated.id ? updated : b); saveFrameBlocks(next); return next; });
    } else {
      setAvailableBlocks(prev => { const next = prev.map(b => b.id === updated.id ? updated : b); saveModuleBlocks(next); return next; });
      setSelectedBlocks(prev => prev.map(s => s.block.id === updated.id ? { ...s, block: updated } : s));
    }
  };

  const addFromLibrary = (block: LicenseBlock): void => {
    setSelectedBlocks(prev => [...prev, { instanceId: `selected:${block.id}:${Date.now()}:${Math.random().toString(16).slice(2, 6)}`, block }]);
    setAvailableBlocks(prev => prev.filter(item => item.id !== block.id));
  };

  const addFrameBlock = (): void => {
    const newBlock: LicenseBlock = {
      id: `frame-custom-${Date.now()}`,
      title: 'Новая статья',
      description: 'Настраиваемая статья',
      body: '',
      paragraphs: [],
      variables: [],
    };
    setFrameBlocks(prev => { const next = [...prev, newBlock]; saveFrameBlocks(next); return next; });
    openBlockEditor(newBlock.id);
  };

  const addModuleBlock = (): void => {
    const newBlock: LicenseBlock = {
      id: `module-custom-${Date.now()}`,
      title: 'Новый модуль',
      description: 'Настраиваемый модуль',
      body: '',
      paragraphs: [],
      variables: [],
    };
    setAvailableBlocks(prev => { const next = [...prev, newBlock]; saveModuleBlocks(next); return next; });
    openBlockEditor(newBlock.id);
  };

  const requiredVariables = useMemo(() => {
    const vars = new Set<string>(['company_name', 'contract_date']);
    selectedBlocks.forEach(({ block }) => block.variables.forEach(name => vars.add(name)));
    return [...vars];
  }, [selectedBlocks]);

  const previewLines = useMemo((): PreviewLine[] => {
    const lines: PreviewLine[] = [];

    // Preamble / header
    frame.header.trim().split('\n').forEach(line => {
      if (line.trim()) lines.push({ text: replaceVars(line.trim(), variables), type: 'text' });
    });

    const renderFrameArticle = (block: LicenseBlock, artNum: number) => {
      lines.push({ text: `${artNum}. ${block.title}`, type: 'heading' });
      const paras = block.paragraphs?.length ? block.paragraphs : htmlToParagraphs(block.body);
      paras.forEach((p, j) => {
        lines.push({ text: `${artNum}.${j + 1}. ${replaceVars(p, variables)}`, type: 'para' });
      });
    };

    // Articles 1, 2
    frameBlocks.slice(0, 2).forEach((block, i) => renderFrameArticle(block, i + 1));

    // Article 3 – assembled from modules
    lines.push({ text: `3. ${replaceVars(frame.article3Title, variables)}`, type: 'heading' });
    if (selectedBlocks.length === 0) {
      lines.push({ text: '(добавьте модули в сборку)', type: 'para' });
    } else {
      selectedBlocks.forEach(({ block }, si) => {
        const sub = si + 1;
        lines.push({ text: `3.${sub}. ${block.title}`, type: 'subheading' });
        const paras = block.paragraphs?.length ? block.paragraphs : htmlToParagraphs(block.body);
        paras.forEach((p, j) => {
          lines.push({ text: `3.${sub}.${j + 1}. ${replaceVars(p, variables)}`, type: 'para' });
        });
      });
    }

    // Articles 4-9 (frameBlocks[2+])
    frameBlocks.slice(2).forEach((block, i) => renderFrameArticle(block, i + 4));

    return lines;
  }, [frameBlocks, selectedBlocks, variables, frame]);

  // Measure actual rendered heights and split into A4 pages
  const A4_CONTENT_H = 1123 - 38 - 76; // content height minus top/bottom padding
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const children = Array.from(el.children) as HTMLElement[];
    if (children.length === 0) { setPagedLines([]); return; }

    const pages: PreviewLine[][] = [];
    let cur: PreviewLine[] = [];
    let usedH = 0;

    children.forEach((child, i) => {
      const lineH = i + 1 < children.length
        ? children[i + 1].offsetTop - child.offsetTop
        : child.offsetHeight;

      if (usedH + lineH > A4_CONTENT_H && cur.length > 0) {
        pages.push(cur);
        cur = [previewLines[i]];
        usedH = lineH;
      } else {
        cur.push(previewLines[i]);
        usedH += lineH;
      }
    });
    if (cur.length > 0) pages.push(cur);
    setPagedLines(pages);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewLines, fontFamily, fontSize, isBold, isItalic]);

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

  const paperStyle = {
    fontFamily,
    fontWeight: isBold ? 700 : 400,
    fontStyle: isItalic ? 'italic' : 'normal',
    fontSize: `${fontSize}pt`,
  } as const;

  return (
    <main className="icloud-page">
      <header className="icloud-topbar">
        <span className="brand-copyright">© LicenseConstructor</span>
      </header>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragCancel={onDragCancel} onDragEnd={onDragEnd}>
        <div className="layout">
          <section className="left-pane">
            <div className="left-pane-library">
              {/* РАМКА */}
              <div className="section-header">
                <span className="section-label">Рамка</span>
                <button type="button" className="btn-add" onClick={addFrameBlock}>+ Добавить</button>
              </div>
              {frameBlocks.map(block => <FrameRow key={block.id} block={block} onOpenEditor={openBlockEditor} />)}
              <div className="h-divider" />
              {/* МОДУЛИ */}
              <div className="section-header">
                <span className="section-label">Модули</span>
                <button type="button" className="btn-add" onClick={addModuleBlock}>+ Добавить</button>
              </div>
              {availableBlocks.map(block => <AvailableRow key={block.id} block={block} onOpenEditor={openBlockEditor} />)}
            </div>

            <div className="h-divider" />
            <div className="section-label">Сборка</div>
            <div className="assembly-wrap">
              <SortableContext items={selectedBlocks.map(item => item.instanceId)} strategy={verticalListSortingStrategy}>
                <DropZone id="assembly-zone">
                  <div className="scroll-list">
                    {selectedBlocks.length === 0 ? <div className="drop-hint">Перетащите модули сюда</div> : null}
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

            {/* Hidden measurement container — same font styles, same classNames, invisible */}
            <div
              ref={measureRef}
              aria-hidden
              style={{
                position: 'fixed',
                top: 0,
                left: '-9999px',
                width: `${794 - 76 - 38}px`,
                fontFamily,
                fontSize: `${fontSize}pt`,
                lineHeight: 1.2,
                fontWeight: isBold ? 700 : 400,
                fontStyle: isItalic ? 'italic' : 'normal',
                pointerEvents: 'none',
              }}
            >
              {previewLines.map((line, i) => (
                <p
                  key={i}
                  className={
                    line.type === 'heading' ? 'preview-line preview-heading' :
                    line.type === 'subheading' ? 'preview-line preview-subheading' :
                    'preview-line'
                  }
                >{line.text}</p>
              ))}
            </div>

            <div className="docs-canvas" style={{ display: activeTab === 'preview' ? 'flex' : 'none' }}>
              {(pagedLines ?? [previewLines]).map((pageLines, pi) => (
                <article key={pi} className="docs-paper" style={paperStyle}>
                  {pageLines.length === 0
                    ? <p className="preview-empty">Нет данных для предпросмотра</p>
                    : pageLines.map((line, li) => (
                      <p
                        key={li}
                        className={
                          line.type === 'heading' ? 'preview-line preview-heading' :
                          line.type === 'subheading' ? 'preview-line preview-subheading' :
                          'preview-line'
                        }
                      >{line.text}</p>
                    ))
                  }
                  <div className="page-number" style={{ fontSize: `${fontSize - 1}pt` }}>{pi + 1}</div>
                </article>
              ))}
              {/* Requisites sheet */}
              <article className="docs-paper docs-paper--reqs" style={paperStyle}>
                <div className="reqs-columns">
                  <div className="reqs-col">{replaceVars(frame.reqLeft, variables)}</div>
                  <div className="reqs-col">{replaceVars(frame.reqRight, variables)}</div>
                </div>
              </article>
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
            </div>

            <div className="popup-divider" />
            <h4 className="popup-section-title">Рамка договора</h4>
            <label className="popup-full-label">
              Шапка договора
              <textarea
                className="popup-textarea"
                value={frame.header}
                onChange={e => setFrame(prev => ({ ...prev, header: e.target.value }))}
                rows={4}
              />
            </label>
            <label className="popup-full-label">
              Заголовок статьи 3
              <input
                className="popup-textarea"
                style={{ padding: '6px 8px' }}
                value={frame.article3Title}
                onChange={e => setFrame(prev => ({ ...prev, article3Title: e.target.value }))}
              />
            </label>
            <label className="popup-full-label">
              Реквизиты — лицензиар
              <textarea
                className="popup-textarea"
                value={frame.reqLeft}
                onChange={e => setFrame(prev => ({ ...prev, reqLeft: e.target.value }))}
                rows={5}
              />
            </label>
            <label className="popup-full-label">
              Реквизиты — лицензиат
              <textarea
                className="popup-textarea"
                value={frame.reqRight}
                onChange={e => setFrame(prev => ({ ...prev, reqRight: e.target.value }))}
                rows={5}
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
