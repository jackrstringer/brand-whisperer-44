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
  onItemClick: (item: DesignQueueItem) => void;
  bulkEligibleCount: number;
  onBulkGenerate: () => void;
  bulkProgress: { completed: number; total: number } | null;
}

export function TaskListView({ items, onRemove, onItemClick, bulkEligibleCount, onBulkGenerate, bulkProgress }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'design-queue' });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Tasks</h3>
          {items.length > 0 && (
            <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
              {items.length}
            </span>
          )}
        </div>
        {bulkEligibleCount > 0 && !bulkProgress && (
          <Button size="sm" variant="outline" onClick={onBulkGenerate} className="h-7 text-xs gap-1">
            <Zap className="w-3 h-3" />
            Bulk Generate ({bulkEligibleCount})
          </Button>
        )}
      </div>

      {/* Bulk progress */}
      {bulkProgress && (
        <div className="px-4 py-2 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <Loader2 className="w-3 h-3 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">
              Generating {bulkProgress.completed}/{bulkProgress.total}...
            </span>
          </div>
          <Progress value={(bulkProgress.completed / bulkProgress.total) * 100} className="h-1.5" />
        </div>
      )}

      {/* Table header */}
      <div className="grid grid-cols-[auto_1fr_100px_90px_28px] gap-2 px-4 py-1.5 border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex-shrink-0">
        <div className="w-5" />
        <div>Title</div>
        <div>Type</div>
        <div>Date</div>
        <div />
      </div>

      {/* List */}
      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto transition-colors ${isOver ? 'bg-primary/[0.03]' : ''}`}
      >
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center px-6">
            <p className="text-xs text-muted-foreground">
              Drag ideas here or click + on any idea row
            </p>
          </div>
        ) : (
          <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
            {items.map(item => (
              <SortableTaskRow
                key={item.id}
                item={item}
                onRemove={() => onRemove(item.id)}
                onClick={() => onItemClick(item)}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  );
}

function SortableTaskRow({
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
    transition: transition || 'transform 200ms ease',
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className="grid grid-cols-[auto_1fr_100px_90px_28px] gap-2 items-center px-4 py-2 border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors group"
    >
      <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground w-5 flex items-center justify-center">
        <GripVertical className="w-3.5 h-3.5" />
      </div>

      <div className="min-w-0 flex items-center gap-2">
        <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_STYLES[item.status]?.split(' ')[0] || 'bg-muted'}`} />
        <span className="text-sm font-medium text-foreground truncate">{item.title}</span>
      </div>

      <span className="text-xs text-muted-foreground truncate">{item.campaign_type || '—'}</span>

      <span className="text-xs text-muted-foreground flex items-center gap-1">
        {item.send_date ? (
          <>
            <Calendar className="w-3 h-3" />
            {new Date(item.send_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </>
        ) : '—'}
      </span>

      <button
        onClick={e => { e.stopPropagation(); onRemove(); }}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
