import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DesignQueueItem } from '@/hooks/useDesignQueue';
import { X, Loader2, Settings2, Pencil, GripVertical, Zap } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useMultiSelect } from '@/hooks/useMultiSelect';
import { useCallback, useRef, useState, useEffect } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

const STATUS_OPTIONS = [
  { value: 'draft', dot: 'bg-muted-foreground', label: 'Draft' },
  { value: 'designed', dot: 'bg-blue-500', label: 'Designed' },
  { value: 'templated', dot: 'bg-purple-500', label: 'Templated' },
  { value: 'sent', dot: 'bg-green-600', label: 'Sent' },
];

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
  editPattern: 'inline' | 'popover' | 'expanded' | 'title';
  locked?: boolean; // cannot be hidden
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'status', label: 'Status', defaultWidth: 100, minWidth: 70, editPattern: 'popover', locked: true },
  { key: 'title', label: 'Title', defaultWidth: 0, minWidth: 120, editPattern: 'title', locked: true },
  { key: 'send_date', label: 'Send Date', defaultWidth: 110, minWidth: 80, editPattern: 'popover', locked: true },
  { key: 'campaign_info', label: 'Brief', defaultWidth: 160, minWidth: 80, editPattern: 'expanded' },
  { key: 'copy_direction', label: 'Copy', defaultWidth: 140, minWidth: 80, editPattern: 'expanded' },
  { key: 'design_notes', label: 'Design Notes', defaultWidth: 140, minWidth: 80, editPattern: 'expanded' },
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

interface EditingCell {
  rowId: string;
  columnKey: string;
}

export function TaskListView({ items, onRemove, onBulkRemove, onItemClick, bulkEligibleCount, onBulkGenerate, bulkProgress }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'design-queue' });
  const queryClient = useQueryClient();
  const { selectedIds, handleSelect, clearSelection, selectAll } = useMultiSelect(items);
  const selectedCount = selectedIds.size;

  const [colConfig, setColConfig] = useState(loadColumnConfig);
  const resizingRef = useRef<{ col: string; startX: number; startWidthLeft: number; colRight: string; startWidthRight: number } | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  useEffect(() => { saveColumnConfig(colConfig); }, [colConfig]);

  // Click-outside handler: dismiss editing cell when clicking outside overlays
  useEffect(() => {
    if (!editingCell) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-editing-overlay]') || target.closest('[data-radix-popper-content-wrapper]')) return;
      // Don't close if clicking another cell (that cell's handler will manage the switch)
      if (target.closest('[data-cell-key]')) return;
      setEditingCell(null);
    };
    // Use bubble phase so component handlers fire first in capture
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editingCell]);

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
    const col = ALL_COLUMNS.find(c => c.key === key);
    if (col?.locked) return; // can't hide locked columns
    setColConfig(prev => {
      const vis = prev.visible.includes(key)
        ? prev.visible.filter(k => k !== key)
        : [...prev.visible, key];
      return { ...prev, visible: vis };
    });
  };

  const handleCellSave = useCallback(async (itemId: string, field: string, value: any) => {
    setEditingCell(null);
    if (field === 'design_notes') {
      const item = items.find(i => i.id === itemId);
      const prefs = { ...((item?.preferences as any) || {}), design_notes: value || undefined };
      await supabase.from('design_queue_items').update({ preferences: prefs } as any).eq('id', itemId);
    } else if (field === 'status') {
      await supabase.from('design_queue_items').update({ status: value }).eq('id', itemId);
    } else if (field === 'send_date') {
      await supabase.from('design_queue_items').update({ send_date: value }).eq('id', itemId);
    } else {
      await supabase.from('design_queue_items').update({ [field]: value || null } as any).eq('id', itemId);
    }
    queryClient.invalidateQueries({ queryKey: ['design-queue'] });
    queryClient.invalidateQueries({ queryKey: ['calendar-queue'] });
  }, [items, queryClient]);

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

      {/* Horizontally scrollable table wrapper */}
      <div className="flex-1 overflow-auto" style={{ scrollbarWidth: 'none' }}>
        {/* Header */}
        <div className="flex items-center px-3 py-1.5 border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex-shrink-0 select-none sticky top-0 bg-card z-10 min-w-max group/header">
          <div className="w-10 flex-shrink-0 flex items-center justify-center">
            <Checkbox
              checked={allSelected}
              onCheckedChange={() => allSelected ? clearSelection() : selectAll()}
              className={`w-3.5 h-3.5 transition-opacity ${selectedCount > 0 ? 'opacity-100' : 'opacity-0 group-hover/header:opacity-100'}`}
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
                className={`relative px-2 ${isFlex ? 'flex-1 min-w-[120px]' : 'flex-shrink-0'}`}
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
                      disabled={!!col.locked}
                      className="w-3.5 h-3.5"
                    />
                    <span className="text-xs text-foreground">{col.label}</span>
                    {col.locked && <span className="text-[9px] text-muted-foreground ml-auto">Required</span>}
                  </label>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* List */}
        <div
          ref={setNodeRef}
          className={`transition-colors min-w-max ${isOver ? 'bg-primary/[0.03]' : ''}`}
        >
          {items.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-center px-6">
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
                  onOpenTask={() => onItemClick(item)}
                  visibleCols={visibleCols}
                  colWidths={colConfig.widths}
                  editingCell={editingCell}
                  onStartEdit={(cellKey) => setEditingCell({ rowId: item.id, columnKey: cellKey })}
                  onEndEdit={() => setEditingCell(null)}
                  onCellSave={handleCellSave}
                />
              ))}
            </SortableContext>
          )}
        </div>
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

/* ---- Inline editing cell components ---- */

function InlineCellInput({
  value,
  onSave,
  onCancel,
}: {
  value: string;
  onSave: (val: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      data-editing-overlay="true"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onSave(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); onSave(draft); }
        if (e.key === 'Escape') onCancel();
      }}
      className="w-full h-full bg-transparent border-0 outline-none text-sm text-foreground px-0 py-0"
    />
  );
}

function StatusPopover({
  currentStatus,
  onSelect,
  onClose,
}: {
  currentStatus: string;
  onSelect: (status: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [onClose]);

  return (
    <div ref={ref} data-editing-overlay="true" className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-1 min-w-[140px] animate-in fade-in-0 zoom-in-95 duration-100">
      {STATUS_OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={(e) => { e.stopPropagation(); onSelect(opt.value); }}
          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left hover:bg-muted transition-colors ${
            currentStatus === opt.value ? 'bg-muted/70 font-medium' : ''
          }`}
        >
          <div className={`w-2 h-2 rounded-full ${opt.dot}`} />
          {opt.label}
          {currentStatus === opt.value && <span className="ml-auto text-primary">✓</span>}
        </button>
      ))}
    </div>
  );
}

function DatePopover({
  currentDate,
  onSelect,
  onClose,
}: {
  currentDate: Date | undefined;
  onSelect: (date: Date | undefined) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [onClose]);

  return (
    <div ref={ref} data-editing-overlay="true" className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-2 animate-in fade-in-0 zoom-in-95 duration-100">
      <Calendar
        mode="single"
        selected={currentDate}
        onSelect={(d) => { onSelect(d); }}
        initialFocus
      />
      <div className="border-t border-border pt-1.5 mt-1 flex justify-between">
        <button
          onClick={() => { onSelect(new Date()); }}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
        >
          Today
        </button>
        <button
          onClick={() => { onSelect(undefined); }}
          className="text-[10px] text-destructive hover:text-destructive/80 transition-colors px-2 py-1"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function ExpandedEditorPopover({
  fieldName,
  value,
  open,
  onSave,
  onCancel,
  children,
}: {
  fieldName: string;
  value: string;
  open: boolean;
  onSave: (val: string) => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef(value);
  const savedRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!open) return;

    setDraft(value);
    draftRef.current = value;
    savedRef.current = false;
    cancelledRef.current = false;

    const frame = requestAnimationFrame(() => {
      textareaRef.current?.focus();
      if (textareaRef.current) {
        textareaRef.current.selectionStart = textareaRef.current.value.length;
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [open, value]);

  const doSave = useCallback(() => {
    if (savedRef.current || cancelledRef.current) return;
    savedRef.current = true;
    onSave(draftRef.current);
  }, [onSave]);

  const doCancel = useCallback(() => {
    cancelledRef.current = true;
    savedRef.current = true;
    onCancel();
  }, [onCancel]);

  useEffect(() => {
    if (!open) return;
    return () => {
      if (!cancelledRef.current) doSave();
    };
  }, [open, doSave]);

  return (
    <Popover open={open} onOpenChange={(nextOpen) => { if (!nextOpen && open) doSave(); }}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        data-editing-overlay="true"
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-[min(760px,calc(100vw-4rem))] max-w-[760px] rounded-lg border border-border bg-popover p-0 shadow-lg"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-medium text-foreground">{fieldName}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={doCancel}
              className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={doSave}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:opacity-90"
            >
              Save
            </button>
          </div>
        </div>
        <div className="p-4">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') {
                e.preventDefault();
                doCancel();
              }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                doSave();
              }
            }}
            className="min-h-[280px] max-h-[520px] w-full resize-y overflow-y-auto rounded-md border border-border bg-background px-4 py-3 text-sm leading-6 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
            placeholder={`Enter ${fieldName.toLowerCase()}...`}
          />
          <p className="mt-2 text-[11px] text-muted-foreground">Press Cmd/Ctrl + Enter to save. Clicking outside also saves.</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ---- Row ---- */

function SortableTaskRow({
  item,
  index,
  isSelected,
  onSelect,
  onRemove,
  onOpenTask,
  visibleCols,
  colWidths,
  editingCell,
  onStartEdit,
  onEndEdit,
  onCellSave,
}: {
  item: DesignQueueItem;
  index: number;
  isSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onRemove: () => void;
  onOpenTask: () => void;
  visibleCols: string[];
  colWidths: Record<string, number>;
  editingCell: EditingCell | null;
  onStartEdit: (cellKey: string) => void;
  onEndEdit: () => void;
  onCellSave: (itemId: string, field: string, value: any) => Promise<void>;
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
      case 'send_date': return item.send_date || '';
      default: return '';
    }
  };

  const isEditing = (key: string) => editingCell?.rowId === item.id && editingCell?.columnKey === key;

  const handleCellClick = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      onSelect(e);
      return;
    }
    onStartEdit(key);
  };

  const handleSave = async (key: string, value: any) => {
    await onCellSave(item.id, key, value);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
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
        const editing = isEditing(key);

        if (key === 'status') {
          return (
            <div
              key={key}
              data-cell-key={key}
              className={`flex-shrink-0 px-2 relative ${editing ? 'ring-2 ring-primary rounded' : ''}`}
              style={{ width: w }}
              onClick={(e) => handleCellClick(key, e)}
            >
              <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full cursor-pointer ${status.bg}`}>
                {status.label}
              </span>
              {editing && (
                <StatusPopover
                  currentStatus={item.status}
                  onSelect={(val) => handleSave('status', val)}
                  onClose={onEndEdit}
                />
              )}
            </div>
          );
        }

        if (key === 'title') {
          return (
            <div
              key={key}
              className={`flex-1 min-w-[120px] px-2 flex items-center gap-1 ${editing ? 'ring-2 ring-primary rounded' : ''}`}
            >
              {editing ? (
                <InlineCellInput
                  value={item.title}
                  onSave={(val) => handleSave('title', val)}
                  onCancel={onEndEdit}
                />
              ) : (
                <>
                  <span
                    className="text-sm font-medium text-foreground truncate block cursor-pointer hover:underline"
                    onClick={(e) => { e.stopPropagation(); onOpenTask(); }}
                  >
                    {item.title}
                  </span>
                  <button
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all flex-shrink-0"
                    onClick={(e) => { e.stopPropagation(); onStartEdit('title'); }}
                    title="Rename"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          );
        }

        if (key === 'send_date') {
          const dateVal = item.send_date ? new Date(item.send_date + 'T00:00:00') : undefined;
          const display = dateVal
            ? dateVal.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '';
          return (
            <div
              key={key}
              data-cell-key={key}
              className={`flex-shrink-0 px-2 relative ${editing ? 'ring-2 ring-primary rounded' : ''}`}
              style={{ width: w }}
              onClick={(e) => handleCellClick(key, e)}
            >
              <span className={`text-xs block truncate ${display ? 'text-foreground' : 'text-muted-foreground/0 group-hover:text-muted-foreground/50'}`}>
                {display || 'Add date'}
              </span>
              {editing && (
                <DatePopover
                  currentDate={dateVal}
                  onSelect={(d) => handleSave('send_date', d ? d.toISOString().split('T')[0] : null)}
                  onClose={onEndEdit}
                />
              )}
            </div>
          );
        }

        // Brief, Copy, Design Notes — ClickUp-style anchored flyout editor
        const val = getCellValue(key);
        return (
          <ExpandedEditorPopover
            key={key}
            fieldName={colDef.label}
            value={val}
            open={editing}
            onSave={(v) => handleSave(key, v)}
            onCancel={onEndEdit}
          >
            <div
              data-cell-key={key}
              className={`flex-shrink-0 px-2 relative overflow-visible ${editing ? 'z-20 ring-2 ring-primary rounded' : ''}`}
              style={{ width: w }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => handleCellClick(key, e)}
            >
              <span className={`text-xs block truncate ${val ? 'text-muted-foreground' : 'text-muted-foreground/0 group-hover:text-muted-foreground/50'}`}>
                {val || 'Add a value'}
              </span>
            </div>
          </ExpandedEditorPopover>
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
