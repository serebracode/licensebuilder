import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { Extension } from '@tiptap/core';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
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
  DEFAULT_FRAME_BLOCKS, DEFAULT_MODULE_BLOCKS,
  FRAME_DEFAULTS, type LicenseBlock
} from './data.test-blocks';
import { parseDocx } from './docx-parser';

type SelectedBlock = { instanceId: string; block: LicenseBlock };
type PreviewLine = { text: string; type: 'heading' | 'subheading' | 'para' | 'text' };

type DocFrame = { reqLeft: string; reqRight: string };
type AppDoc = {
  id: string; name: string; updatedAt: number;
  frameBlocks: LicenseBlock[]; moduleBlocks: LicenseBlock[];
  assembledModules: { instanceId: string; blockId: string }[];
  frame: DocFrame; fontFamily: string; fontSize: number;
};
type DocMeta = { id: string; name: string; updatedAt: number };

// ── Storage abstraction (Electron = files, web = localStorage) ────────────────
type ElectronBridge = {
  platform?: string;
  onMenu?: (channel: string, fn: () => void) => () => void;
  selectDirectory?: () => Promise<string | null>;
  getSettings?: () => Promise<Record<string, string>>;
  docSave?: (doc: AppDoc) => Promise<void>;
  docLoad?: (id: string) => Promise<AppDoc | null>;
  docList?: () => Promise<DocMeta[]>;
  docDelete?: (id: string) => Promise<void>;
};
const lb = (window as Window & { licenseBuilder?: ElectronBridge }).licenseBuilder;
const IS_ELECTRON = typeof lb?.docSave === 'function';

const DOC_INDEX_KEY = 'lb_doc_index_v1';
const docKey = (id: string) => `lb_doc_${id}_v1`;
function _lsLoadIndex(): DocMeta[] {
  try { return JSON.parse(localStorage.getItem(DOC_INDEX_KEY) ?? '[]'); } catch { return []; }
}

async function storageSaveDoc(doc: AppDoc): Promise<void> {
  if (IS_ELECTRON) { await lb!.docSave!(doc); return; }
  localStorage.setItem(docKey(doc.id), JSON.stringify(doc));
  const idx = _lsLoadIndex();
  const entry: DocMeta = { id: doc.id, name: doc.name, updatedAt: doc.updatedAt };
  const i = idx.findIndex(d => d.id === doc.id);
  if (i >= 0) idx[i] = entry; else idx.push(entry);
  localStorage.setItem(DOC_INDEX_KEY, JSON.stringify(idx));
}
async function storageLoadDoc(id: string): Promise<AppDoc | null> {
  if (IS_ELECTRON) return lb!.docLoad!(id);
  try { return JSON.parse(localStorage.getItem(docKey(id)) ?? 'null'); } catch { return null; }
}
async function storageListDocs(): Promise<DocMeta[]> {
  if (IS_ELECTRON) return lb!.docList!();
  return _lsLoadIndex();
}
async function storageDeleteDoc(id: string): Promise<void> {
  if (IS_ELECTRON) { await lb!.docDelete!(id); return; }
  localStorage.removeItem(docKey(id));
  localStorage.setItem(DOC_INDEX_KEY, JSON.stringify(_lsLoadIndex().filter(d => d.id !== id)));
}

const DEFAULT_FRAME: DocFrame = {
  reqLeft: FRAME_DEFAULTS.reqLeft,
  reqRight: FRAME_DEFAULTS.reqRight,
};

const replaceVars = (text: string, values: Record<string, string>): string =>
  text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, name: string) => values[name] || `{{${name}}}`);

function htmlToParagraphs(html: string): string[] {
  if (!html.trim().startsWith('<')) return html.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const div = document.createElement('div');
  div.innerHTML = html;
  const result: string[] = [];
  div.querySelectorAll('p, li').forEach(el => {
    const text = el.textContent ?? '';
    if (text.trim()) result.push(text);
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

type RowActions = { onRename: () => void; onDuplicate: () => void; onDelete: () => void };

// Singleton: tracks close-fn of whichever RowMenu is currently open
let _closeActiveRowMenu: (() => void) | null = null;

const RowMenu = ({ btnRef, actions, onClose }: { btnRef: React.RefObject<HTMLButtonElement | null>; actions: RowActions; onClose: () => void }): JSX.Element | null => {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const menuW = 152;
    const left = Math.max(4, Math.min(r.right - menuW, window.innerWidth - menuW - 4));
    setPos({ top: r.bottom + 4, left });
  }, [btnRef]);

  useEffect(() => {
    // Close whatever other menu is open, then register ourselves
    _closeActiveRowMenu?.();
    const selfClose = () => onCloseRef.current();
    _closeActiveRowMenu = selfClose;

    let removeListener: (() => void) | null = null;
    const timerId = window.setTimeout(() => {
      const handler = () => onCloseRef.current();
      document.addEventListener('mousedown', handler);
      removeListener = () => document.removeEventListener('mousedown', handler);
    }, 0);

    return () => {
      clearTimeout(timerId);
      removeListener?.();
      if (_closeActiveRowMenu === selfClose) _closeActiveRowMenu = null;
    };
  }, []);

  if (!pos) return null;

  return createPortal(
    <div
      className="row-menu"
      style={{ position: 'fixed', top: pos.top, left: pos.left, right: 'auto' }}
      onMouseDown={e => e.stopPropagation()}
    >
      <button type="button" onClick={() => { actions.onRename(); onCloseRef.current(); }}>Переименовать</button>
      <button type="button" onClick={() => { actions.onDuplicate(); onCloseRef.current(); }}>Дублировать</button>
      <button type="button" className="row-menu-delete" onClick={() => { actions.onDelete(); onCloseRef.current(); }}>Удалить</button>
    </div>,
    document.body
  );
};

const FrameRow = ({ block, onOpenEditor, actions, isActive }: { block: LicenseBlock; onOpenEditor: (id: string) => void; actions: RowActions; isActive: boolean }): JSX.Element => {
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <div className={`block-row${isActive ? ' block-row--active' : ''}`} onClick={() => onOpenEditor(block.id)}>
      <div className="block-info">
        <div className="block-name">{block.title}</div>
        <div className="block-desc">{block.description}</div>
      </div>
      <div className="row-menu-wrap" onClick={e => e.stopPropagation()}>
        <button ref={btnRef} type="button" className="row-more-btn" onMouseDown={e => { e.stopPropagation(); setMenuOpen(v => !v); }}>⋯</button>
        {menuOpen && <RowMenu btnRef={btnRef} actions={actions} onClose={() => setMenuOpen(false)} />}
      </div>
    </div>
  );
};

const AvailableRow = ({ block, onOpenEditor, actions, isActive }: { block: LicenseBlock; onOpenEditor: (id: string) => void; actions: RowActions; isActive: boolean }): JSX.Element => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `available:${block.id}` });
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <div
      ref={setNodeRef}
      className={`block-row${isActive ? ' block-row--active' : ''}`}
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
      <div className="row-menu-wrap" onClick={e => e.stopPropagation()}>
        <button ref={btnRef} type="button" className="row-more-btn" onMouseDown={e => { e.stopPropagation(); setMenuOpen(v => !v); }}>⋯</button>
        {menuOpen && <RowMenu btnRef={btnRef} actions={actions} onClose={() => setMenuOpen(false)} />}
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

// ── Toolbar SVG icons ────────────────────────────────────────────────────────
const IcBold = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 5h6a3.5 3.5 0 0 1 0 7h-6l0 -7" />
    <path d="M13 12h1a3.5 3.5 0 0 1 0 7h-7v-7" />
  </svg>
);
const IcItalic = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M11 5l6 0" />
    <path d="M7 19l6 0" />
    <path d="M14 5l-4 14" />
  </svg>
);
const IcAlignLeft = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 6l16 0" /><path d="M4 12l16 0" /><path d="M4 18l12 0" />
  </svg>
);
const IcAlignCenter = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 6l16 0" /><path d="M8 12l8 0" /><path d="M6 18l12 0" />
  </svg>
);
const IcAlignRight = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
    <rect x="1"   y="2"   width="12" height="1.5" rx=".75"/><rect x="5.5" y="5.5" width="7.5" height="1.5" rx=".75"/>
    <rect x="1"   y="9"   width="12" height="1.5" rx=".75"/><rect x="5.5" y="12.5" width="7.5" height="1.5" rx=".75"/>
  </svg>
);
const IcBulletList = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M21 6a1 1 0 0 1 -1 1h-10a1 1 0 1 1 0 -2h10a1 1 0 0 1 1 1" />
    <path d="M21 12a1 1 0 0 1 -1 1h-10a1 1 0 0 1 0 -2h10a1 1 0 0 1 1 1" />
    <path d="M21 18a1 1 0 0 1 -1 1h-10a1 1 0 0 1 0 -2h10a1 1 0 0 1 1 1" />
    <path d="M7 5.995v.02c0 1.099 -.895 1.99 -2 1.99s-2 -.891 -2 -1.99v-.02c0 -1.099 .895 -1.99 2 -1.99s2 .891 2 1.99" />
    <path d="M7 11.995v.02c0 1.099 -.895 1.99 -2 1.99s-2 -.891 -2 -1.99v-.02c0 -1.099 .895 -1.99 2 -1.99s2 .891 2 1.99" />
    <path d="M7 17.995v.02c0 1.099 -.895 1.99 -2 1.99s-2 -.891 -2 -1.99v-.02c0 -1.099 .895 -1.99 2 -1.99s2 .891 2 1.99" />
  </svg>
);
const IcOrderedList = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M11 6h9" /><path d="M11 12h9" /><path d="M12 18h8" />
    <path d="M4 16a2 2 0 1 1 4 0c0 .591 -.5 1 -1 1.5l-3 2.5h4" />
    <path d="M6 10v-6l-2 2" />
  </svg>
);
const IcTable = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14" />
    <path d="M3 10h18" /><path d="M10 3v18" />
  </svg>
);
const IcAddCol = () => (
  <svg width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
    <rect x="1" y="1" width="9" height="12" rx="1.5"/>
    <path d="M1 5h9M1 9h9M4.5 1v12"/>
    <path d="M12 4.5v5M9.5 7H14" strokeLinecap="round"/>
  </svg>
);
const IcAddRow = () => (
  <svg width="14" height="16" viewBox="0 0 14 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
    <rect x="1" y="1" width="12" height="9" rx="1.5"/>
    <path d="M1 5h12M1 7h12M5 1v9M9 1v9"/>
    <path d="M3.5 12h7M7 9.5v5" strokeLinecap="round"/>
  </svg>
);
const IcDelTable = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 3h12a2 2 0 0 1 2 2v12m-.585 3.413a1.994 1.994 0 0 1 -1.415 .587h-14a2 2 0 0 1 -2 -2v-14c0 -.55 .223 -1.05 .583 -1.412" />
    <path d="M3 10h7m4 0h7" /><path d="M10 3v3m0 4v11" />
    <path d="M3 3l18 18" />
  </svg>
);
const IcCols1 = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
    <rect x="2" y="2" width="10" height="10" rx="1"/>
  </svg>
);
const IcCols2 = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
    <rect x="1"   y="2" width="5.5" height="10" rx="1"/>
    <rect x="7.5" y="2" width="5.5" height="10" rx="1"/>
  </svg>
);
const IcCols3 = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
    <rect x="1"    y="2" width="3.5" height="10" rx="1"/>
    <rect x="5.25" y="2" width="3.5" height="10" rx="1"/>
    <rect x="9.5"  y="2" width="3.5" height="10" rx="1"/>
  </svg>
);

// Tab key inserts «красная строка» (two em spaces) when outside a list
const TabIndent = Extension.create({
  name: 'tabIndent',
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (editor.isActive('listItem')) return false;
        return editor.commands.insertContent('  ');
      },
    };
  },
});

// Table extension that preserves class attribute (needed for cols-layout)
const TableWithClass = Table.configure({ resizable: false }).extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: null,
        parseHTML: el => el.getAttribute('class'),
        renderHTML: attrs => (attrs.class ? { class: attrs.class } : {}),
      },
    };
  },
});

function BlockEditor({ block, onSave, fontFamily, fontSize }: {
  block: LicenseBlock; onSave: (updated: LicenseBlock) => void; fontFamily: string; fontSize: number;
}): JSX.Element {
  const [isDirty, setIsDirty] = useState(false);

  const isDirtyRef = useRef(false);
  const blockRef = useRef(block);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  blockRef.current = block;

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ['paragraph', 'heading'] }),
      TableWithClass,
      TableRow, TableHeader, TableCell,
      TabIndent,
    ],
    content: bodyToHtml(block),
    onUpdate: () => {
      setIsDirty(true);
      isDirtyRef.current = true;
    },
  });

  const editorRef = useRef(editor);
  useEffect(() => { editorRef.current = editor; }, [editor]);

  useEffect(() => {
    return () => {
      if (isDirtyRef.current && editorRef.current) {
        const html = editorRef.current.getHTML();
        onSaveRef.current({
          ...blockRef.current,
          body: html,
          paragraphs: htmlToParagraphs(html),
        });
      }
    };
  }, []);

  const handleApply = () => {
    if (!editor) return;
    const html = editor.getHTML();
    onSave({ ...block, body: html, paragraphs: htmlToParagraphs(html) });
    setIsDirty(false);
    isDirtyRef.current = false;
  };

  const insertColLayout = (cols: number) => {
    if (!editor) return;
    const cells = Array.from({ length: cols }, () => '<td><p></p></td>').join('');
    editor.chain().focus().insertContent(
      `<table class="cols-layout"><tbody><tr>${cells}</tr></tbody></table>`
    ).run();
  };

  const T = (active: boolean, onClick: () => void, title: string, Icon: () => JSX.Element) => (
    <button type="button" className={`btn-tool${active ? ' active' : ''}`} onMouseDown={e => { e.preventDefault(); onClick(); }} title={title}>
      <Icon />
    </button>
  );

  return (
    <>
      <div className="block-editor-toolbar">
        <div className="editor-tools">
          {T(!!editor?.isActive('bold'),   () => editor?.chain().focus().toggleBold().run(),       'Жирный',     IcBold)}
          {T(!!editor?.isActive('italic'), () => editor?.chain().focus().toggleItalic().run(),     'Курсив',     IcItalic)}
          <div className="format-separator" />
          {T(!!editor?.isActive({ textAlign: 'left' }),   () => editor?.chain().focus().setTextAlign('left').run(),   'По левому краю', IcAlignLeft)}
          {T(!!editor?.isActive({ textAlign: 'center' }), () => editor?.chain().focus().setTextAlign('center').run(), 'По центру',      IcAlignCenter)}
          <div className="format-separator" />
          {T(!!editor?.isActive('bulletList'),  () => editor?.chain().focus().toggleBulletList().run(),  'Маркированный список', IcBulletList)}
          {T(!!editor?.isActive('orderedList'), () => editor?.chain().focus().toggleOrderedList().run(), 'Нумерованный список',  IcOrderedList)}
          <div className="format-separator" />
          <button type="button" className="btn-tool" onMouseDown={e => { e.preventDefault(); editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); }} title="Вставить таблицу"><IcTable /></button>
          <button type="button" className="btn-tool" onMouseDown={e => { e.preventDefault(); editor?.chain().focus().addColumnAfter().run(); }} title="Добавить столбец"><IcAddCol /></button>
          <button type="button" className="btn-tool" onMouseDown={e => { e.preventDefault(); editor?.chain().focus().addRowAfter().run(); }} title="Добавить строку"><IcAddRow /></button>
          <button type="button" className="btn-tool" onMouseDown={e => { e.preventDefault(); editor?.chain().focus().deleteTable().run(); }} title="Удалить таблицу"><IcDelTable /></button>
          <div className="format-separator" />
          <button type="button" className="btn-tool" onMouseDown={e => { e.preventDefault(); insertColLayout(1); }} title="1 колонка"><IcCols1 /></button>
          <button type="button" className="btn-tool" onMouseDown={e => { e.preventDefault(); insertColLayout(2); }} title="2 колонки"><IcCols2 /></button>
          <button type="button" className="btn-tool" onMouseDown={e => { e.preventDefault(); insertColLayout(3); }} title="3 колонки"><IcCols3 /></button>
        </div>
        <div className="editor-actions">
          {isDirty && (
            <button type="button" className="btn-apply" onClick={handleApply}>Применить</button>
          )}
        </div>
      </div>

      <div className="block-editor-canvas">
        <article className="docs-paper block-editor-paper" style={{ fontFamily, fontSize: `${fontSize}pt` }}>
          <EditorContent editor={editor} className="tiptap-editor" />
        </article>
      </div>
    </>
  );
}

const App = (): JSX.Element => {
  const sensors = useSensors(useSensor(MouseSensor), useSensor(TouchSensor));

  const [frameBlocks, setFrameBlocks] = useState<LicenseBlock[]>(loadFrameBlocks);
  const [availableBlocks, setAvailableBlocks] = useState<LicenseBlock[]>(loadModuleBlocks);
  const [selectedBlocks, setSelectedBlocks] = useState<SelectedBlock[]>([]);
  const [activeDragBlock, setActiveDragBlock] = useState<LicenseBlock | null>(null);
  const [leftTab, setLeftTab] = useState<'frame' | 'assembly'>('frame');
  const [activeTab, setActiveTab] = useState<'preview' | string>('preview');
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [docIndex, setDocIndex] = useState<DocMeta[]>([]);
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);
  const [currentDocName, setCurrentDocName] = useState('Новый');
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const [fontFamily, setFontFamily] = useState('Times New Roman');
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [fontSize, setFontSize] = useState(11);
  const [frame, setFrame] = useState<DocFrame>({
    reqLeft: FRAME_DEFAULTS.reqLeft,
    reqRight: FRAME_DEFAULTS.reqRight,
  });

  // Load doc index on mount
  useEffect(() => { storageListDocs().then(setDocIndex); }, []);

  // Autosave document 2s after any state change
  useEffect(() => {
    setAutoSaveStatus('Сохраняется...');
    const t = setTimeout(() => { void saveCurrentDoc(); }, 2000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameBlocks, availableBlocks, selectedBlocks, frame, fontFamily, fontSize]);

  // Wire Electron native menu → renderer actions
  useEffect(() => {
    if (!lb?.onMenu) return;
    const offs = [
      lb.onMenu('menu:new', () => newDocument()),
      lb.onMenu('menu:open', () => setShowDocPicker(true)),
      lb.onMenu('menu:save', () => saveCurrentDoc()),
      lb.onMenu('menu:save-as', () => { const n = window.prompt('Название:', currentDocName); if (n) { setCurrentDocName(n); saveCurrentDoc(n); } }),
      lb.onMenu('menu:settings', () => setShowSettings(true)),
    ];
    return () => offs.forEach(off => off());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDocName]);

  const measureRef = useRef<HTMLDivElement>(null);
  const [pagedLines, setPagedLines] = useState<PreviewLine[][] | null>(null);

  const openBlockEditor = (id: string): void => {
    setOpenTabIds(prev => prev.includes(id) ? prev : [...prev, id]);
    setActiveTab(id);
  };

  const closeTab = (id: string): void => {
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
  };

  const renameBlock = (id: string, isFrame: boolean): void => {
    const block = isFrame ? frameBlocks.find(b => b.id === id) : availableBlocks.find(b => b.id === id);
    if (!block) return;
    const name = window.prompt('Новое название:', block.title);
    if (!name || name === block.title) return;
    const updated = { ...block, title: name };
    if (isFrame) setFrameBlocks(prev => { const next = prev.map(b => b.id === id ? updated : b); saveFrameBlocks(next); return next; });
    else setAvailableBlocks(prev => { const next = prev.map(b => b.id === id ? updated : b); saveModuleBlocks(next); return next; });
  };

  const duplicateBlock = (id: string, isFrame: boolean): void => {
    const block = isFrame ? frameBlocks.find(b => b.id === id) : availableBlocks.find(b => b.id === id);
    if (!block) return;
    const copy = { ...block, id: `${isFrame ? 'frame' : 'module'}-copy-${Date.now()}`, title: `${block.title} (копия)` };
    if (isFrame) setFrameBlocks(prev => { const next = [...prev, copy]; saveFrameBlocks(next); return next; });
    else setAvailableBlocks(prev => { const next = [...prev, copy]; saveModuleBlocks(next); return next; });
  };

  const deleteBlock = (id: string, isFrame: boolean): void => {
    if (!window.confirm('Удалить блок?')) return;
    setOpenTabIds(prev => prev.filter(t => t !== id));
    setActiveTab(prev => prev === id ? 'preview' : prev);
    if (isFrame) setFrameBlocks(prev => { const next = prev.filter(b => b.id !== id); saveFrameBlocks(next); return next; });
    else setAvailableBlocks(prev => { const next = prev.filter(b => b.id !== id); saveModuleBlocks(next); return next; });
  };

  const applyDoc = (doc: AppDoc) => {
    setFrameBlocks(doc.frameBlocks);
    setAvailableBlocks(doc.moduleBlocks);
    const assembled = doc.assembledModules.map(({ instanceId, blockId }) => {
      const block = doc.moduleBlocks.find(b => b.id === blockId);
      return block ? { instanceId, block } : null;
    }).filter(Boolean) as SelectedBlock[];
    setSelectedBlocks(assembled);
    setFrame({
      reqLeft: doc.frame.reqLeft ?? FRAME_DEFAULTS.reqLeft,
      reqRight: doc.frame.reqRight ?? FRAME_DEFAULTS.reqRight,
    });
    setFontFamily(doc.fontFamily ?? 'Times New Roman');
    setFontSize(doc.fontSize ?? 11);
    setCurrentDocId(doc.id);
    setCurrentDocName(doc.name);
    setOpenTabIds([]); setActiveTab('preview');
  };

  const saveCurrentDoc = useCallback(async (nameOverride?: string) => {
    const name = nameOverride ?? currentDocName;
    const id = currentDocId ?? `doc-${Date.now()}`;
    const doc: AppDoc = {
      id, name, updatedAt: Date.now(),
      frameBlocks, moduleBlocks: availableBlocks,
      assembledModules: selectedBlocks.map(s => ({ instanceId: s.instanceId, blockId: s.block.id })),
      frame, fontFamily, fontSize,
    };
    await storageSaveDoc(doc);
    setCurrentDocId(id);
    storageListDocs().then(setDocIndex);
    setAutoSaveStatus('Сохранено');
    setTimeout(() => setAutoSaveStatus(''), 2000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDocId, currentDocName, frameBlocks, availableBlocks, selectedBlocks, frame, fontFamily, fontSize]);

  const openDocById = async (id: string) => {
    const doc = await storageLoadDoc(id);
    if (doc) { applyDoc(doc); setShowDocPicker(false); }
  };

  const newDocument = () => {
    if (!window.confirm('Создать новый документ?')) return;
    setFrameBlocks(DEFAULT_FRAME_BLOCKS);
    setAvailableBlocks(DEFAULT_MODULE_BLOCKS);
    setSelectedBlocks([]); setFrame(DEFAULT_FRAME);
    setFontFamily('Times New Roman'); setFontSize(11);
    setCurrentDocId(null); setCurrentDocName('Новый');
    setOpenTabIds([]); setActiveTab('preview');
  };

  const deleteDocById = async (id: string) => {
    if (!window.confirm('Удалить документ?')) return;
    await storageDeleteDoc(id);
    storageListDocs().then(setDocIndex);
    if (currentDocId === id) { setCurrentDocId(null); setCurrentDocName('Новый'); }
  };

  const previewLines = useMemo((): PreviewLine[] => {
    const lines: PreviewLine[] = [];
    let articleNum = 0;

    for (const block of frameBlocks) {
      const btype = block.blockType ?? 'article';

      if (btype === 'title') {
        const paras = block.paragraphs?.length ? block.paragraphs : htmlToParagraphs(block.body);
        paras.forEach(p => { if (p.trim()) lines.push({ text: p, type: 'heading' }); });
        continue;
      }

      if (btype === 'preamble') {
        const paras = block.paragraphs?.length ? block.paragraphs : htmlToParagraphs(block.body);
        paras.forEach(p => { if (p.trim()) lines.push({ text: p, type: 'text' }); });
        continue;
      }

      if (btype === 'modules') {
        articleNum++;
        lines.push({ text: `${articleNum}. ${block.title}`, type: 'heading' });
        if (selectedBlocks.length === 0) {
          lines.push({ text: '(добавьте модули в сборку)', type: 'para' });
        } else {
          selectedBlocks.forEach(({ block: mod }, si) => {
            const sub = si + 1;
            const paras = mod.paragraphs?.length ? mod.paragraphs : htmlToParagraphs(mod.body);
            paras.forEach((p, j) => {
              lines.push({ text: `${articleNum}.${sub}.${j + 1}. ${p}`, type: 'para' });
            });
          });
        }
        continue;
      }

      // default: article
      articleNum++;
      lines.push({ text: `${articleNum}. ${block.title}`, type: 'heading' });
      const paras = block.paragraphs?.length ? block.paragraphs : htmlToParagraphs(block.body);
      paras.forEach((p, j) => {
        lines.push({ text: `${articleNum}.${j + 1}. ${p}`, type: 'para' });
      });
    }

    return lines;
  }, [frameBlocks, selectedBlocks]);

  // Measure actual rendered heights and split into A4 pages
  const A4_CONTENT_H = 1123 - 38 - 50; // content height: A4 minus top(38) and bottom(50) padding
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

  const isMac = (window as typeof window & { licenseBuilder?: { platform?: string } }).licenseBuilder?.platform === 'darwin';

  return (
    <main className={`icloud-page${isMac ? ' icloud-page--mac' : ''}`}>
      <header className="icloud-topbar">
        <span className="brand-copyright">© LicenseConstructor</span>
        <div className="topbar-doc">
          <input
            className="doc-name-input"
            value={currentDocName}
            onChange={e => setCurrentDocName(e.target.value)}
            onBlur={() => saveCurrentDoc()}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </div>
        <div className="topbar-right">
          <span className="autosave-status">{autoSaveStatus}</span>
          <div className="export-menu-wrap">
            <button className="btn-ghost" type="button" onClick={() => setShowExportMenu(v => !v)}>Экспорт ▾</button>
            {showExportMenu && (
              <div className="export-menu">
                <button type="button">Экспорт .docx</button>
                <button type="button">Экспорт .pdf</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragCancel={onDragCancel} onDragEnd={onDragEnd}>
        <div className="layout">
          <section className="left-pane">
            <div className="left-tab-bar">
              <button type="button" className={`left-tab${leftTab === 'frame' ? ' left-tab--active' : ''}`} onClick={() => setLeftTab('frame')}>Рамка</button>
              <button type="button" className={`left-tab${leftTab === 'assembly' ? ' left-tab--active' : ''}`} onClick={() => setLeftTab('assembly')}>Сборка</button>
            </div>

            {leftTab === 'frame' && (
              <div className="left-pane-library">
                <div className="section-header">
                  <span className="section-label">Статьи рамки</span>
                  <button type="button" className="btn-add" onClick={addFrameBlock}>+ Добавить</button>
                </div>
                {frameBlocks.map(block => <FrameRow key={block.id} block={block} onOpenEditor={openBlockEditor} isActive={activeTab === block.id} actions={{ onRename: () => renameBlock(block.id, true), onDuplicate: () => duplicateBlock(block.id, true), onDelete: () => deleteBlock(block.id, true) }} />)}
              </div>
            )}

            {leftTab === 'assembly' && (
              <>
                <div className="left-pane-library">
                  <div className="section-header">
                    <span className="section-label">Модули</span>
                    <button type="button" className="btn-add" onClick={addModuleBlock}>+ Добавить</button>
                  </div>
                  {availableBlocks.map(block => <AvailableRow key={block.id} block={block} onOpenEditor={openBlockEditor} isActive={activeTab === block.id} actions={{ onRename: () => renameBlock(block.id, false), onDuplicate: () => duplicateBlock(block.id, false), onDelete: () => deleteBlock(block.id, false) }} />)}
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
              </>
            )}
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


            {openTabIds.map(id => {
              const b = findBlock(id);
              if (!b || activeTab !== id) return null;
              return (
                <BlockEditor
                  key={id}
                  block={b}
                  onSave={saveBlockEdit}
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
                  <div className="reqs-col">{frame.reqLeft}</div>
                  <div className="reqs-col">{frame.reqRight}</div>
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

      {showDocPicker && (
        <div className="popup-backdrop" onClick={() => setShowDocPicker(false)}>
          <div className="popup" onClick={e => e.stopPropagation()}>
            <h3>Документы</h3>
            {docIndex.length === 0
              ? <p style={{ fontSize: 12, color: '#999', marginTop: 8 }}>Нет сохранённых документов</p>
              : docIndex.map(d => (
                <div key={d.id} className="doc-picker-row">
                  <button type="button" className="doc-picker-name" onClick={() => openDocById(d.id)}>
                    {d.name}
                    <span className="doc-picker-date">{new Date(d.updatedAt).toLocaleDateString('ru')}</span>
                  </button>
                  <button type="button" className="row-delete" onClick={() => deleteDocById(d.id)}>×</button>
                </div>
              ))
            }
            <div className="popup-actions">
              <button type="button" className="btn-ghost" onClick={() => { newDocument(); setShowDocPicker(false); }}>Новый документ</button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="popup-backdrop" onClick={() => setShowSettings(false)}>
          <div className="popup" onClick={e => e.stopPropagation()}>
            <h3>Настройки</h3>
            <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
              Рабочая папка используется для хранения документов при работе в десктоп-приложении.
            </p>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                style={{ flex: 1, border: '0.5px solid #d8d8dd', borderRadius: 6, padding: '6px 8px', fontSize: 12 }}
                placeholder="Путь к рабочей папке"
                readOnly
                value={typeof window !== 'undefined' && (window as typeof window & { licenseBuilder?: { platform?: string } }).licenseBuilder?.platform ? '(выбрать через кнопку)' : 'localStorage (веб-режим)'}
              />
              <button type="button" className="btn-ghost" onClick={async () => {
                const w = (window as typeof window & { licenseBuilder?: { selectDirectory?: () => Promise<string | null> } }).licenseBuilder;
                if (!w?.selectDirectory) { alert('Недоступно в веб-режиме'); return; }
                const p = await w.selectDirectory();
                if (p) alert(`Папка выбрана: ${p}`);
              }}>Выбрать...</button>
            </div>
            <div className="popup-actions" style={{ marginTop: 16 }}>
              <button className="btn-primary" type="button" onClick={() => setShowSettings(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default App;
