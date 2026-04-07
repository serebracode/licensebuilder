import { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import type { CSSProperties } from 'react';

interface Block {
  id: string;
  title: string;
  description: string;
  body: string;
}

interface ConstructorItem {
  instanceId: string;
  block: Block;
}

const LIBRARY_BLOCKS: Block[] = [
  {
    id: 'web',
    title: 'Веб-лицензия',
    description: 'Использование шрифта на сайтах через CSS',
    body: 'Лицензиат вправе использовать Шрифт на веб-сайтах путём встраивания через CSS @font-face. Количество доменов: {{domain_count}}.',
  },
  {
    id: 'print',
    title: 'Печатная лицензия',
    description: 'Полиграфия, упаковка, рекламные материалы',
    body: 'Лицензиат вправе использовать Шрифт в печатных материалах тиражом до {{print_count}} экземпляров в год.',
  },
  {
    id: 'app',
    title: 'Приложение',
    description: 'Встраивание в мобильные и десктопные приложения',
    body: 'Лицензиат вправе встроить Шрифт в программное обеспечение. Количество приложений: {{app_count}}.',
  },
  {
    id: 'broadcast',
    title: 'Вещание',
    description: 'ТВ, радио, стриминг',
    body: 'Лицензиат вправе использовать Шрифт в эфирном и онлайн-вещании.',
  },
  {
    id: 'logo',
    title: 'Логотип / Бренд',
    description: 'Использование в товарных знаках',
    body: 'Лицензиат вправе использовать Шрифт при создании логотипа и фирменной символики.',
  },
];

// ── Draggable card from the library ──────────────────────────────────────────

function LibraryCard({ block }: { block: Block }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lib-${block.id}`,
    data: { source: 'library', block },
  });

  return (
    <div
      ref={setNodeRef}
      className={`block-card library-card${isDragging ? ' is-dragging' : ''}`}
      {...listeners}
      {...attributes}
    >
      <div className="block-card__title">{block.title}</div>
      <div className="block-card__desc">{block.description}</div>
    </div>
  );
}

// ── Sortable card inside the constructor ──────────────────────────────────────

function ConstructorCard({
  item,
  onRemove,
}: {
  item: ConstructorItem;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.instanceId });

  const style: CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="block-card constructor-card">
      <div
        className="constructor-card__drag-handle"
        {...listeners}
        {...attributes}
        title="Перетащить"
      >
        ⠿
      </div>
      <div className="constructor-card__content">
        <div className="block-card__title">{item.block.title}</div>
        <div className="block-card__desc">{item.block.description}</div>
      </div>
      <button
        className="constructor-card__remove"
        onClick={onRemove}
        title="Удалить"
      >
        ×
      </button>
    </div>
  );
}

// ── Drop zone ─────────────────────────────────────────────────────────────────

function ConstructorZone({
  items,
  onRemove,
}: {
  items: ConstructorItem[];
  onRemove: (instanceId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'constructor-zone' });

  return (
    <div
      ref={setNodeRef}
      className={`constructor-zone${isOver ? ' is-over' : ''}${items.length === 0 ? ' is-empty' : ''}`}
    >
      {items.length === 0 ? (
        <div className="constructor-zone__empty">Перетащите блоки сюда</div>
      ) : (
        <SortableContext
          items={items.map((i) => i.instanceId)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item) => (
            <ConstructorCard
              key={item.instanceId}
              item={item}
              onRemove={() => onRemove(item.instanceId)}
            />
          ))}
        </SortableContext>
      )}
    </div>
  );
}

// ── Right-side document preview ───────────────────────────────────────────────

function DocumentPreview({ items }: { items: ConstructorItem[] }) {
  return (
    <div className="preview-panel">
      <div className="preview-document">
        <h1 className="preview-document__title">Licence Agreement</h1>
        <div className="preview-document__body">
          {items.length === 0 ? (
            <p className="preview-document__empty">
              Добавьте блоки в конструктор, чтобы увидеть предпросмотр
            </p>
          ) : (
            items.map((item, i) => (
              <p key={item.instanceId} className="preview-document__para">
                <strong>
                  {i + 1}. {item.block.title}.
                </strong>{' '}
                {item.block.body}
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

const App = () => {
  const [constructorItems, setConstructorItems] = useState<ConstructorItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const activeBlock: Block | undefined = activeId?.startsWith('lib-')
    ? LIBRARY_BLOCKS.find((b) => b.id === activeId.replace('lib-', ''))
    : constructorItems.find((i) => i.instanceId === activeId)?.block;

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    if (activeIdStr.startsWith('lib-')) {
      // Drop from library → add to constructor
      const isOverConstructor =
        overIdStr === 'constructor-zone' || overIdStr.startsWith('ctor-');
      if (isOverConstructor) {
        const blockId = activeIdStr.replace('lib-', '');
        const block = LIBRARY_BLOCKS.find((b) => b.id === blockId);
        if (block) {
          setConstructorItems((prev) => [
            ...prev,
            { instanceId: `ctor-${blockId}-${Date.now()}`, block },
          ]);
        }
      }
    } else if (activeIdStr.startsWith('ctor-') && overIdStr.startsWith('ctor-')) {
      // Reorder within constructor
      const oldIndex = constructorItems.findIndex((i) => i.instanceId === activeIdStr);
      const newIndex = constructorItems.findIndex((i) => i.instanceId === overIdStr);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        setConstructorItems(arrayMove(constructorItems, oldIndex, newIndex));
      }
    }
  };

  const removeItem = (instanceId: string) => {
    setConstructorItems((prev) => prev.filter((i) => i.instanceId !== instanceId));
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="app-shell">
        {/* ── Left panel ── */}
        <div className="left-panel">
          <div className="library-section">
            <div className="section-header">Блоки лицензий</div>
            <div className="library-list">
              {LIBRARY_BLOCKS.map((block) => (
                <LibraryCard key={block.id} block={block} />
              ))}
            </div>
          </div>

          <div className="panel-divider" />

          <div className="constructor-section">
            <div className="section-header">Конструктор</div>
            <ConstructorZone items={constructorItems} onRemove={removeItem} />
          </div>

          <div className="export-bar">
            <button
              className="export-btn"
              disabled={constructorItems.length === 0}
              onClick={() => alert('Экспорт в .docx — будет реализован')}
            >
              Экспорт →
            </button>
          </div>
        </div>

        {/* ── Right panel: preview ── */}
        <DocumentPreview items={constructorItems} />
      </div>

      <DragOverlay dropAnimation={null}>
        {activeBlock && (
          <div className="block-card drag-overlay-card">
            <div className="block-card__title">{activeBlock.title}</div>
            <div className="block-card__desc">{activeBlock.description}</div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};

export default App;
