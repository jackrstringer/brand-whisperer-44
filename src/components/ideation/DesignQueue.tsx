import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DesignQueueItem } from '@/hooks/useDesignQueue';
import { GripVertical, X, Calendar } from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-muted text-muted-foreground',
  configured: 'bg-blue-100 text-blue-700',
  generating: 'bg-amber-100 text-amber-700 animate-pulse',
  generated: 'bg-green-100 text-green-700',
  sent: 'bg-green-600 text-white',
};

interface Props {
  items: DesignQueueItem[];
  onRemove: (id: string) => void;
  onItemClick?: (item: DesignQueueItem) => void;
}

export function DesignQueue({ items, onRemove, onItemClick }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'design-queue' });

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Design Queue</h3>
          {items.length > 0 && (
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
              {items.length}
            </span>
          )}
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto p-2 transition-colors ${
          isOver ? 'bg-foreground/[0.03]' : ''
        }`}
      >
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center px-6">
            <p className="text-xs text-muted-foreground">
              Drag ideas here or click "Add to Queue" on any idea card
            </p>
          </div>
        ) : (
          <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
            {items.map(item => (
              <SortableQueueItem
                key={item.id}
                item={item}
                onRemove={() => onRemove(item.id)}
                onClick={() => onItemClick?.(item)}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  );
}

function SortableQueueItem({
  item,
  onRemove,
  onClick,
}: {
  item: DesignQueueItem;
  onRemove: () => void;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: 'queue-item', item },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border mb-1.5 bg-card hover:border-foreground/20 cursor-pointer transition-colors group"
    >
      <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground">
        <GripVertical className="w-3.5 h-3.5" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{item.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {item.campaign_type && (
            <span className="text-[10px] text-muted-foreground">{item.campaign_type}</span>
          )}
          {item.send_date && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Calendar className="w-2.5 h-2.5" />
              {new Date(item.send_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>

      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_STYLES[item.status] || STATUS_STYLES.queued}`}>
        {item.status}
      </span>

      <button
        onClick={e => { e.stopPropagation(); onRemove(); }}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
