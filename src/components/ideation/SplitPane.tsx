import { useRef, useState, useCallback, useEffect, ReactNode } from 'react';

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  defaultLeftWidth?: number;
  minLeftWidth?: number;
  minRightWidth?: number;
}

export function SplitPane({
  left,
  right,
  defaultLeftWidth,
  minLeftWidth = 360,
  minRightWidth = 280,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState<number | null>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // Initialize on mount
  useEffect(() => {
    if (leftWidth === null && containerRef.current) {
      const w = defaultLeftWidth ?? Math.round(containerRef.current.offsetWidth * 0.5);
      setLeftWidth(w);
    }
  }, [defaultLeftWidth, leftWidth]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = leftWidth ?? 0;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: PointerEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const delta = ev.clientX - startX.current;
      const containerW = containerRef.current.offsetWidth;
      const maxLeft = containerW - minRightWidth - 6; // 6px for handle
      const next = Math.max(minLeftWidth, Math.min(maxLeft, startWidth.current + delta));
      setLeftWidth(next);
    };

    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [leftWidth, minLeftWidth, minRightWidth]);

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      <div style={{ width: leftWidth ?? '50%', flexShrink: 0 }} className="h-full overflow-hidden">
        {left}
      </div>

      {/* Drag handle */}
      <div
        onPointerDown={onPointerDown}
        className="w-1.5 flex-shrink-0 cursor-col-resize relative group hover:bg-primary/10 transition-colors"
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-border group-hover:bg-primary/40 transition-colors" />
        {/* Visible grab indicator */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-8 rounded-full bg-border group-hover:bg-primary/30 transition-colors flex items-center justify-center">
          <div className="flex flex-col gap-[2px]">
            <div className="w-[3px] h-[3px] rounded-full bg-muted-foreground/40" />
            <div className="w-[3px] h-[3px] rounded-full bg-muted-foreground/40" />
            <div className="w-[3px] h-[3px] rounded-full bg-muted-foreground/40" />
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 h-full overflow-hidden">
        {right}
      </div>
    </div>
  );
}
