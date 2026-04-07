import { useState, useCallback, useRef } from "react";

export function useMultiSelect<T extends { id: string }>(items: T[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedIndex = useRef<number | null>(null);

  const handleSelect = useCallback(
    (id: string, index: number, e: React.MouseEvent) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);

        if (e.shiftKey && lastClickedIndex.current !== null) {
          // Range select
          const start = Math.min(lastClickedIndex.current, index);
          const end = Math.max(lastClickedIndex.current, index);
          for (let i = start; i <= end; i++) {
            next.add(items[i].id);
          }
        } else if (e.metaKey || e.ctrlKey) {
          // Toggle single
          if (next.has(id)) next.delete(id);
          else next.add(id);
        } else {
          // Single select (replace)
          if (next.size === 1 && next.has(id)) {
            next.clear();
          } else {
            next.clear();
            next.add(id);
          }
        }

        lastClickedIndex.current = index;
        return next;
      });
    },
    [items]
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastClickedIndex.current = null;
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map((i) => i.id)));
  }, [items]);

  return { selectedIds, handleSelect, clearSelection, selectAll };
}
