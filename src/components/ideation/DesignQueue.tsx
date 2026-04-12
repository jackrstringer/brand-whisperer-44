import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DesignQueueItem } from '@/hooks/useDesignQueue';
import { GripVertical, X, Calendar, Zap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

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
  bulkEligibleCount?: number;
  onBulkGenerate?: () => void;
  bulkProgress?: { completed: number; total: number } | null;
}

export function DesignQueue({ items, onRemove, onItemClick, bulkEligibleCount, onBulkGenerate, bulkProgress }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'design-queue' });

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[15px] font-semibold text-foreground">Design Queue</h3>
          {items.length > 0 && (
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
              {items.length}
            </span>
          )}
        </div>
        {onBulkGenerate && (bulkEligibleCount ?? 0) > 0 && !bulkProgress && (
          <Button size="sm" variant="outline" onClick={onBulkGenerate} className="h-8 text-xs gap-1.5 hover:scale-[1.02] transition-all duration-150">
            <Zap className="w-3.5 h-3.5" />
            Bulk Generate ({bulkEligibleCount})
          </Button>
        )}
      </div>

      {/* Bulk progress */}
      {bulkProgress && (
        <div className="px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-2 mb-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              Generating {bulkProgress.completed}/{bulkProgress.total}...
            </span>
          </div>
          <Progress value={(bulkProgress.completed / bulkProgress.total) * 100} className="h-1.5" />
        </div>
      )}

      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto p-2.5 transition-colors ${
          isOver ? 'bg-foreground/[0.03]' : ''
        }`}
      >
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center px-6">
            <p className="text-sm text-muted-foreground">
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
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border mb-2 bg-card hover:border-foreground/20 hover:shadow-sm cursor-pointer transition-all duration-150 group"
    >
      <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground transition-colors">
        <GripVertical className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {item.campaign_type && (
            <span className="text-xs text-muted-foreground">{item.campaign_type}</span>
          )}
          {item.send_date && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(item.send_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>

      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[item.status] || STATUS_STYLES.queued}`}>
        {item.status}
      </span>

      <button
        onClick={e => { e.stopPropagation(); onRemove(); }}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all duration-150 hover:scale-110 p-0.5"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
