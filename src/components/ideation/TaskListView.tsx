import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DesignQueueItem } from '@/hooks/useDesignQueue';
import { X, Calendar, Zap, Loader2, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useMultiSelect } from '@/hooks/useMultiSelect';
import { useCallback, useRef, useState, useEffect } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';

const STATUS_STYLES: Record<string, { bg: string; dot: string; label: string }> = {
  draft: { bg: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground', label: 'Draft' },
  generating: { bg: 'bg-amber-100 text-amber-700 animate-pulse', dot: 'bg-amber-500', label: 'Generating' },
  designed: { bg: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500', label: 'Designed' },
  templated: { bg: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500', label: 'Templated' },
  sent: { bg: 'bg-green-100 text-green-700', dot: 'bg-green-600', label: 'Sent' },
};

interface ColumnDef {
  key: string;
  label: string;
  defaultWidth: number;
  minWidth: number;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'status', label: 'Status', defaultWidth: 100, minWidth: 70 },
  { key: 'title', label: 'Title', defaultWidth: 0, minWidth: 120 }, // 0 = flex
  { key: 'send_date', label: 'Send Date', defaultWidth: 110, minWidth: 80 },
  { key: 'campaign_info', label: 'Brief', defaultWidth: 160, minWidth: 80 },
  { key: 'copy_direction', label: 'Copy', defaultWidth: 140, minWidth: 80 },
  { key: 'design_notes', label: 'Design Notes', defaultWidth: 140, minWidth: 80 },
];

const STORAGE_KEY = 'task-list-columns';

function loadColumnConfig(): { visible: string[]; widths: Record<string, number>; order: string[] } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return {
    visible: ['status', 'title', 'send_date', 'campaign_info', 'copy_direction', 'design_notes'],
    widths: Object.fromEntries(ALL_COLUMNS.map(c => [c.key, c.defaultWidth])),
    order: ALL_COLUMNS.map(c => c.key),
  };
}

function saveColumnConfig(cfg: { visible: string[]; widths: Record<string, number>; order: string[] }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

interface Props {
  items: DesignQueueItem[];
  onRemove: (id: string) => void;
  onBulkRemove?: (ids: string[]) => void;
  onItemClick: (item: DesignQueueItem) => void;
  bulkEligibleCount: number;
  onBulkGenerate: () => void;
  bulkProgress: { completed: number; total: number } | null;
}

export function TaskListView({ items, onRemove, onBulkRemove, onItemClick, bulkEligibleCount, onBulkGenerate, bulkProgress }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'design-queue' });
  const { selectedIds, handleSelect, clearSelection, selectAll } = useMultiSelect(items);
  const selectedCount = selectedIds.size;

  const [colConfig, setColConfig] = useState(loadColumnConfig);
  const resizingRef = useRef<{ col: string; startX: number; startWidthLeft: number; colRight: string; startWidthRight: number } | null>(null);

  useEffect(() => { saveColumnConfig(colConfig); }, [colConfig]);

  const visibleCols = colConfig.order.filter(k => colConfig.visible.includes(k));

  const handleResizeStart = useCallback((colLeft: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const leftIdx = visibleCols.indexOf(colLeft);
    const rightCol = visibleCols[leftIdx + 1];
    if (!rightCol) return;

    const leftDef = ALL_COLUMNS.find(c => c.key === colLeft);
    const rightDef = ALL_COLUMNS.find(c => c.key === rightCol);
    if (!leftDef || !rightDef) return;

    // For flex column (title), measure actual rendered width
    const leftW = colConfig.widths[colLeft] || leftDef.defaultWidth;
    const rightW = colConfig.widths[rightCol] || rightDef.defaultWidth;

    resizingRef.current = {
      col: colLeft,
      startX: e.clientX,
      startWidthLeft: leftW,
      colRight: rightCol,
      startWidthRight: rightW,
    };

    const onMove = (ev: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const delta = ev.clientX - r.startX;
      const leftMin = leftDef.minWidth;
      const rightMin = rightDef.minWidth;
      const newLeft = Math.max(leftMin, r.startWidthLeft + delta);
      const newRight = Math.max(rightMin, r.startWidthRight - delta);
      setColConfig(prev => ({
        ...prev,
        widths: { ...prev.widths, [r.col]: newLeft, [r.colRight]: newRight },
      }));
    };
    const onUp = () => {
      resizingRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [colConfig, visibleCols]);

  const toggleColumn = (key: string) => {
    setColConfig(prev => {
      const vis = prev.visible.includes(key)
        ? prev.visible.filter(k => k !== key)
        : [...prev.visible, key];
      return { ...prev, visible: vis };
    });
  };

  const allSelected = items.length > 0 && selectedCount === items.length;

  return (
    <div className="flex flex-col h-full relative">
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
      <div className="flex items-center px-3 py-1.5 border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex-shrink-0 select-none">
        <div className="w-7 flex-shrink-0 flex items-center justify-center">
          <Checkbox
            checked={allSelected}
            onCheckedChange={() => allSelected ? clearSelection() : selectAll()}
            className="w-3.5 h-3.5"
          />
        </div>
        {visibleCols.map((key, idx) => {
          const col = ALL_COLUMNS.find(c => c.key === key)!;
          const w = colConfig.widths[key] || col.defaultWidth;
          const isFlex = w === 0 || key === 'title';
          const isLast = idx === visibleCols.length - 1;

          return (
            <div
              key={key}
              className={`relative px-2 ${isFlex ? 'flex-1 min-w-0' : 'flex-shrink-0'}`}
              style={isFlex ? undefined : { width: w }}
            >
              {col.label}
              {!isLast && (
                <div
                  onMouseDown={(e) => handleResizeStart(key, e)}
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/20 transition-colors z-10"
                >
                  <div className="absolute right-0 top-1 bottom-1 w-px bg-border" />
                </div>
              )}
            </div>
          );
        })}
        <div className="w-8 flex-shrink-0 flex items-center justify-center">
          <Popover>
            <PopoverTrigger asChild>
              <button className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <Settings2 className="w-3 h-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Show fields</p>
              {ALL_COLUMNS.map(col => (
                <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer">
                  <Checkbox
                    checked={colConfig.visible.includes(col.key)}
                    onCheckedChange={() => toggleColumn(col.key)}
                    disabled={col.key === 'title'}
                    className="w-3.5 h-3.5"
                  />
                  <span className="text-xs text-foreground">{col.label}</span>
                </label>
              ))}
            </PopoverContent>
          </Popover>
        </div>
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
                visibleCols={visibleCols}
                colWidths={colConfig.widths}
              />
            ))}
          </SortableContext>
        )}
      </div>

      {/* Floating bulk action bar */}
      {selectedCount > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-xl shadow-lg px-4 py-2.5 flex items-center gap-3 animate-in slide-in-from-bottom-2">
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
            className="text-xs text-destructive hover:text-destructive/80 transition-colors font-medium"
          >
            Delete
          </button>
          <button
            onClick={clearSelection}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        </div>
      )}
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
  visibleCols,
  colWidths,
}: {
  item: DesignQueueItem;
  index: number;
  isSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onRemove: () => void;
  onClick: () => void;
  visibleCols: string[];
  colWidths: Record<string, number>;
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

  const status = STATUS_STYLES[item.status] || STATUS_STYLES.draft;
  const prefs = (item.preferences as any) || {};

  const getCellValue = (key: string): string => {
    switch (key) {
      case 'title': return item.title;
      case 'campaign_info': return item.campaign_info || '';
      case 'copy_direction': return item.copy_direction || '';
      case 'design_notes': return prefs.design_notes || '';
      case 'send_date': return item.send_date
        ? new Date(item.send_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : '';
      default: return '';
    }
  };

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
      className={`flex items-center px-3 py-2 border-b border-border/50 cursor-pointer transition-colors group ${
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

      {visibleCols.map(key => {
        const colDef = ALL_COLUMNS.find(c => c.key === key)!;
        const w = colWidths[key] || colDef.defaultWidth;
        const isFlex = w === 0 || key === 'title';

        if (key === 'status') {
          return (
            <div key={key} className="flex-shrink-0 px-2" style={{ width: w }}>
              <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full ${status.bg}`}>
                {status.label}
              </span>
            </div>
          );
        }

        if (key === 'title') {
          return (
            <div key={key} className="flex-1 min-w-0 px-2">
              <span className="text-sm font-medium text-foreground truncate block">{item.title}</span>
            </div>
          );
        }

        return (
          <div key={key} className="flex-shrink-0 px-2 truncate" style={{ width: w }}>
            <span className="text-xs text-muted-foreground truncate block">{getCellValue(key) || '—'}</span>
          </div>
        );
      })}

      <div className="w-8 flex-shrink-0 flex items-center justify-center">
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
