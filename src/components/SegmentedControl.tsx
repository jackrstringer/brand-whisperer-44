import { useState, useRef, useEffect, useCallback } from "react";

const REACH = 12;
const GROW = 6;

interface SegmentedControlProps {
  options?: string[];
  value?: string;
  onChange?: (value: string) => void;
}

export default function SegmentedControl({ options = ["Chat", "Cowork", "Code"], value, onChange }: SegmentedControlProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [coveredIndices, setCoveredIndices] = useState<Set<number>>(new Set([0]));
  const selected = value !== undefined ? options.indexOf(value) : activeIndex;
  const safeSelected = selected >= 0 ? selected : 0;

  const containerRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const dragging = useRef(false);
  const startX = useRef(0);
  const committedIndex = useRef(0);
  const hoveredIndex = useRef(-1);
  const metaRef = useRef<{ left: number; width: number; right: number; center: number }[]>([]);
  const isAnimatingClickRef = useRef(false);
  const animationTimeoutRef = useRef<number | null>(null);

  function calcMeta() {
    const seg = containerRef.current;
    if (!seg) return;
    metaRef.current = btnRefs.current.map((b) => {
      if (!b) return { left: 0, width: 0, right: 0, center: 0 };
      return {
        left: b.offsetLeft,
        width: b.offsetWidth,
        right: seg.offsetWidth - b.offsetLeft - b.offsetWidth,
        center: b.offsetLeft + b.offsetWidth / 2,
      };
    });
  }

  function setPill(left: number, right: number, transition?: string) {
    const p = pillRef.current;
    if (!p) return;
    if (transition !== undefined) p.style.transition = transition;
    p.style.left = left + "px";
    p.style.right = right + "px";
  }

  function restPill(idx: number, transition: string) {
    const m = metaRef.current[idx];
    if (!m) return;
    setPill(m.left, m.right, transition);
  }

  const select = useCallback(
    (idx: number) => {
      if (value !== undefined) {
        onChange?.(options[idx]);
      } else {
        setActiveIndex(idx);
      }
    },
    [value, onChange, options]
  );

  useEffect(() => {
    calcMeta();
    if (isAnimatingClickRef.current) {
      updateCoveredButtons();
      return;
    }
    restPill(safeSelected, "none");
    setCoveredIndices(new Set([safeSelected]));
  }, [safeSelected, options]);

  useEffect(() => {
    const onResize = () => {
      calcMeta();
      restPill(safeSelected, "none");
      setCoveredIndices(new Set([safeSelected]));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [safeSelected]);

  function updateCoveredButtons() {
    const pill = pillRef.current;
    const seg = containerRef.current;
    if (!pill || !seg) return;
    const pillLeft = parseFloat(pill.style.left || '0');
    const pillRight = parseFloat(pill.style.right || '0');
    const pillLeftEdge = pillLeft;
    const pillRightEdge = seg.offsetWidth - pillRight;
    const covered = new Set<number>();
    metaRef.current.forEach((m, i) => {
      const btnCenter = m.center;
      if (btnCenter >= pillLeftEdge && btnCenter <= pillRightEdge) {
        covered.add(i);
      }
    });
    setCoveredIndices(covered);
  }

  function snapTo(idx: number, blobby: boolean) {
    calcMeta();
    const old = selected;
    if (blobby && idx !== old) {
      const right = idx > old;
      const distance = Math.abs(idx - old);
      const trailMs = 320 + distance * 60;
      const leadMs = 200 + distance * 40;
      setPill(
        metaRef.current[idx].left,
        metaRef.current[idx].right,
        right
          ? `left ${trailMs}ms cubic-bezier(0.4,0,0.2,1.4), right ${leadMs}ms cubic-bezier(0.4,0,0.2,1)`
          : `right ${trailMs}ms cubic-bezier(0.4,0,0.2,1.4), left ${leadMs}ms cubic-bezier(0.4,0,0.2,1)`
      );
    } else {
      restPill(idx, "left 220ms cubic-bezier(0.4,0,0.2,1), right 220ms cubic-bezier(0.4,0,0.2,1)");
    }
    hoveredIndex.current = -1;
    setCoveredIndices(new Set([idx]));
    select(idx);
  }

  function applyHover(idx: number) {
    if (idx === hoveredIndex.current || dragging.current) return;
    hoveredIndex.current = idx;
    calcMeta();
    const m = metaRef.current;
    const cur = selected;
    const ease = "left 200ms cubic-bezier(0.3,0,0.2,1), right 200ms cubic-bezier(0.3,0,0.2,1)";
    const retract = "left 250ms cubic-bezier(0.3,0,0.2,1.15), right 250ms cubic-bezier(0.3,0,0.2,1.15)";

    if (idx === -1) { restPill(cur, retract); return; }

    if (idx === cur) {
      const last = options.length - 1;
      if (cur === 0) setPill(m[cur].left, m[cur].right - GROW, ease);
      else if (cur === last) setPill(m[cur].left - GROW, m[cur].right, ease);
      else setPill(m[cur].left - GROW, m[cur].right - GROW, ease);
      return;
    }

    const dir = idx > cur ? 1 : -1;
    if (dir > 0) setPill(m[cur].left, m[cur].right - REACH, ease);
    else setPill(m[cur].left - REACH, m[cur].right, ease);
  }

  function onPointerDown(e: React.PointerEvent) {
    const btn = (e.target as HTMLElement).closest("[data-seg-btn]") as HTMLElement | null;
    if (!btn) return;
    const idx = parseInt(btn.dataset.segBtn!);
    hoveredIndex.current = -1;
    if (idx !== selected) { snapTo(idx, true); return; }
    dragging.current = true;
    committedIndex.current = selected;
    containerRef.current!.setPointerCapture(e.pointerId);
    startX.current = e.clientX;
    calcMeta();
    pillRef.current!.style.transition = "none";
    e.preventDefault();
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const seg = containerRef.current!;
    const pill = pillRef.current!;
    const dx = e.clientX - startX.current;
    const anchor = metaRef.current[committedIndex.current];
    const meta = metaRef.current;

    if (dx > 0) {
      let leadR = Math.max(0, anchor.right - dx);
      const leadEdge = seg.offsetWidth - leadR;
      for (let i = committedIndex.current + 1; i < options.length; i++) {
        if (leadEdge > meta[i].center) {
          committedIndex.current = i;
          pill.style.transition = "left 140ms cubic-bezier(0.4,0,0.2,1.3)";
          pill.style.left = meta[i].left + "px";
          startX.current = e.clientX;
          leadR = meta[i].right;
          setTimeout(() => { if (dragging.current) pill.style.transition = "none"; }, 150);
          break;
        }
      }
      pill.style.right = Math.max(0, leadR) + "px";
      if (e.clientX === startX.current) { updateCoveredButtons(); return; }
      pill.style.left = meta[committedIndex.current].left + "px";
    } else {
      let leadL = Math.max(0, anchor.left + dx);
      for (let j = committedIndex.current - 1; j >= 0; j--) {
        if (leadL < meta[j].center) {
          committedIndex.current = j;
          pill.style.transition = "right 140ms cubic-bezier(0.4,0,0.2,1.3)";
          pill.style.right = meta[j].right + "px";
          startX.current = e.clientX;
          leadL = meta[j].left;
          setTimeout(() => { if (dragging.current) pill.style.transition = "none"; }, 150);
          break;
        }
      }
      pill.style.left = Math.max(0, leadL) + "px";
      if (e.clientX === startX.current) { updateCoveredButtons(); return; }
      pill.style.right = meta[committedIndex.current].right + "px";
    }
    updateCoveredButtons();
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!dragging.current) return;
    dragging.current = false;
    containerRef.current!.releasePointerCapture(e.pointerId);
    snapTo(committedIndex.current, false);
  }

  function onMouseMoveContainer(e: React.MouseEvent) {
    if (dragging.current) return;
    const btn = (e.target as HTMLElement).closest("[data-seg-btn]") as HTMLElement | null;
    applyHover(btn ? parseInt(btn.dataset.segBtn!) : -1);
  }

  function onMouseLeave() {
    if (dragging.current) return;
    applyHover(-1);
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        if (!dragging.current) return;
        dragging.current = false;
        snapTo(selected, false);
      }}
      onMouseMove={onMouseMoveContainer}
      onMouseLeave={onMouseLeave}
      className="seg-control"
    >
      <div ref={pillRef} className="seg-pill" />
      {options.map((label, i) => (
        <button
          key={label}
          ref={(el) => { btnRefs.current[i] = el; }}
          data-seg-btn={i}
          className={`seg-btn ${coveredIndices.has(i) ? 'seg-btn-active' : ''}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
