import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DesignQueueItem } from '@/hooks/useDesignQueue';
import { X, Calendar, Zap, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useMultiSelect } from '@/hooks/useMultiSelect';
import { useCallback, useRef, useState, useEffect } from 'react';
import { Checkbox } from '@/components/ui/checkbox';

const STATUS_STYLES: Record<string, { bg: string; label: string }> = {
  queued: { bg: 'bg-muted text-muted-foreground', label: 'Queued' },
  configured: { bg: 'bg-blue-100 text-blue-700', label: 'Configured' },
  generating: { bg: 'bg-amber-100 text-amber-700 animate-pulse', label: 'Generating' },
  generated: { bg: 'bg-green-100 text-green-700', label: 'Generated' },
  sent: { bg: 'bg-green-600 text-white', label: 'Sent' },
};

interface Props {
  items: DesignQueueItem[];
  onRemove: (id: string) => void;
  onBulkRemove?: (ids: string[]) => void;
  onItemClick: (item: DesignQueueItem) => void;
  bulkEligibleCount: number;
  onBulkGenerate: () => void;
  bulkProgress: { completed: number; total: number } | null;
}

// Default column widths as percentages of available space
const DEFAULT_COL_WIDTHS = {
  status: 90,
  title: 999, // flex
  type: 120,
  date: 100,
};

export function TaskListView({ items, onRemove, onBulkRemove, onItemClick, bulkEligibleCount, onBulkGenerate, bulkProgress }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'design-queue' });
  const { selectedIds, handleSelect, clearSelection, selectAll } = useMultiSelect(items);
  const selectedCount = selectedIds.size;

  const [colWidths, setColWidths] = useState(DEFAULT_COL_WIDTHS);
  const resizingCol = useRef<string | null>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleResizeStart = useCallback((col: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingCol.current = col;
    startX.current = e.clientX;
    startWidth.current = colWidths[col as keyof typeof colWidths];

    const onMove = (ev: MouseEvent) => {
      if (!resizingCol.current) return;
      const delta = ev.clientX - startX.current;
      const newWidth = Math.max(60, startWidth.current + delta);
      setColWidths(prev => ({ ...prev, [resizingCol.current!]: newWidth }));
    };
    const onUp = () => {
      resizingCol.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [colWidths]);

  const allSelected = items.length > 0 && selectedCount === items.length;

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

      {/* Bulk selection bar */}
      {selectedCount > 0 && (
        <div className="px-4 py-2 border-b border-border flex-shrink-0 bg-muted/50 flex items-center gap-3">
          <span className="text-xs font-medium text-foreground">{selectedCount} selected</span>
          <div className="h-4 w-px bg-border" />
          <button
            onClick={() => {
              if (onBulkRemove) {
                onBulkRemove(Array.from(selectedIds));
              } else {
                selectedIds.forEach(id => onRemove(id));
              }
              clearSelection();
            }}
            className="text-xs text-destructive hover:text-destructive/80 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={clearSelection}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table header with resizable columns */}
      <div className="flex items-center px-4 py-1.5 border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex-shrink-0 select-none">
        <div className="w-7 flex-shrink-0 flex items-center justify-center">
          <Checkbox
            checked={allSelected}
            onCheckedChange={() => allSelected ? clearSelection() : selectAll()}
            className="w-3.5 h-3.5"
          />
        </div>
        <ResizableHeader label="Status" width={colWidths.status} onResizeStart={(e) => handleResizeStart('status', e)} />
        <div className="flex-1 min-w-0 px-2">Title</div>
        <ResizableHeader label="Type" width={colWidths.type} onResizeStart={(e) => handleResizeStart('type', e)} />
        <ResizableHeader label="Date" width={colWidths.date} onResizeStart={(e) => handleResizeStart('date', e)} />
        <div className="w-7 flex-shrink-0" />
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
            {items.map((item, index) => (
              <SortableTaskRow
                key={item.id}
                item={item}
                index={index}
                isSelected={selectedIds.has(item.id)}
                onSelect={(e) => handleSelect(item.id, index, e)}
                onRemove={() => onRemove(item.id)}
                onClick={() => onItemClick(item)}
                colWidths={colWidths}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  );
}

function ResizableHeader({ label, width, onResizeStart }: { label: string; width: number; onResizeStart: (e: React.MouseEvent) => void }) {
  return (
    <div className="relative flex-shrink-0 px-2" style={{ width }}>
      {label}
      <div
        onMouseDown={onResizeStart}
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/20 transition-colors group"
      >
        <div className="absolute right-0 top-1 bottom-1 w-px bg-border group-hover:bg-primary/40" />
      </div>
    </div>
  );
}

function SortableTaskRow({
  item,
  index,
  isSelected,
  onSelect,
  onRemove,
  onClick,
  colWidths,
}: {
  item: DesignQueueItem;
  index: number;
  isSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onRemove: () => void;
  onClick: () => void;
  colWidths: typeof DEFAULT_COL_WIDTHS;
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

  const status = STATUS_STYLES[item.status] || STATUS_STYLES.queued;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          onSelect(e);
        } else {
          onClick();
        }
      }}
      className={`flex items-center px-4 py-2 border-b border-border/50 cursor-pointer transition-colors group ${
        isSelected ? 'bg-primary/[0.06]' : 'hover:bg-muted/50'
      }`}
    >
      <div className="w-7 flex-shrink-0 flex items-center justify-center" onClick={(e) => { e.stopPropagation(); onSelect(e); }}>
        <Checkbox
          checked={isSelected}
          className="w-3.5 h-3.5"
          onCheckedChange={() => {}}
        />
      </div>

      <div className="flex-shrink-0 px-2" style={{ width: colWidths.status }}>
        <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full ${status.bg}`}>
          {status.label}
        </span>
      </div>

      <div className="flex-1 min-w-0 px-2">
        <span className="text-sm font-medium text-foreground truncate block">{item.title}</span>
      </div>

      <div className="flex-shrink-0 px-2 truncate" style={{ width: colWidths.type }}>
        <span className="text-xs text-muted-foreground truncate">{item.campaign_type || '—'}</span>
      </div>

      <div className="flex-shrink-0 px-2" style={{ width: colWidths.date }}>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          {item.send_date ? (
            <>
              <Calendar className="w-3 h-3" />
              {new Date(item.send_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </>
          ) : '—'}
        </span>
      </div>

      <div className="w-7 flex-shrink-0 flex items-center justify-center">
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
