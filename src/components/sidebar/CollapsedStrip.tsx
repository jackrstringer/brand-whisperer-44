import { useState, useRef, useCallback } from "react";
import { useTheme } from "next-themes";
import { SidebarIcons } from "./SidebarIcons";

interface SubItem {
  label: string;
  icon: string;
  path: string;
}

interface Brand {
  id: string;
  name: string;
  sub: SubItem[];
}

interface Props {
  brands: Brand[];
  activeBrandId: string | null;
  activePath: string;
  onBrandClick: (id: string) => void;
  onItemClick: (path: string) => void;
  onExpandClick: () => void;
  onHomeClick: () => void;
  onSettingsClick: () => void;
  onSignOut: () => void;
  onLibraryClick?: () => void;
  isAdmin?: boolean;
}

function PeekSubItem({ item, isActive, delay, onClick }: {
  item: SubItem; isActive: boolean; delay: number; onClick: () => void;
}) {
  const [h, setH] = useState(false);
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      className={`flex items-center gap-2.5 cursor-pointer transition-colors duration-120 ${
        isActive ? "bg-primary text-primary-foreground font-medium" :
        h ? "bg-muted text-foreground" : "text-gray-1"
      }`}
      style={{
        height: 34, paddingLeft: 20, marginLeft: 40, marginRight: 12,
        borderRadius: 15, fontSize: 13,
        animation: `peekSlide 0.2s ease both`,
        animationDelay: `${delay}ms`,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ display: "flex", width: 17, height: 17, flexShrink: 0 }}>
        {(SidebarIcons as any)[item.icon]?.("currentColor")}
      </span>
      {item.label}
    </div>
  );
}

export function CollapsedStrip({
  brands, activeBrandId, activePath, onBrandClick, onItemClick,
  onExpandClick, onHomeClick, onSettingsClick, onSignOut, onLibraryClick, isAdmin,
}: Props) {
  const { theme, setTheme } = useTheme();
  const [mouseY, setMouseY] = useState<number | null>(null);
  const [peeking, setPeeking] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const brandStartY = 68;
  const brandRowH = 40;

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!stripRef.current) return;
    const rect = stripRef.current.getBoundingClientRect();
    setMouseY(e.clientY - rect.top);
  }, []);

  const handleMouseEnter = () => {
    peekTimer.current = setTimeout(() => setPeeking(true), 250);
  };
  const handleMouseLeave = () => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    setPeeking(false);
    setMouseY(null);
  };

  const handleBgClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).dataset.bg === "true" || e.target === e.currentTarget)
      onExpandClick();
  };

  const activeBrand = brands.find(b => b.id === activeBrandId);
  const activeSub = activeBrand?.sub || [];

  const toggleTheme = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div
      ref={stripRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleBgClick}
      data-bg="true"
      className="bg-sidebar border-r border-sidebar-border"
      style={{
        width: peeking ? 264 : 56,
        minWidth: peeking ? 264 : 56,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.3s cubic-bezier(0.25,0.46,0.45,0.94), min-width 0.3s cubic-bezier(0.25,0.46,0.45,0.94)",
        overflow: "hidden",
        position: "relative",
        flexShrink: 0,
      }}
    >
      {/* Home */}
      <div data-bg="true" style={{ padding: "20px 0 28px", display: "flex", justifyContent: "center" }}>
        <HoverIcon icon="home" onClick={(e) => { e.stopPropagation(); onHomeClick(); }} />
      </div>

      {/* Brand list */}
      <div
        data-bg="true"
        style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}
        className="scrollbar-hide"
      >
        {brands.map((b, idx) => {
          const isActive = b.id === activeBrandId;
          const hasSub = b.sub.length > 0;
          const dotCenterY = brandStartY + idx * brandRowH + brandRowH / 2;

          let scale = 1;
          if (mouseY !== null && !peeking) {
            const dist = Math.abs(mouseY - dotCenterY);
            const maxDist = 90;
            scale = dist < maxDist ? 1 + 0.7 * Math.cos((dist / maxDist) * Math.PI * 0.5) : 1;
          }

          return (
            <div key={b.id} data-bg="true">
              <div
                onClick={(e) => { e.stopPropagation(); onBrandClick(b.id); }}
                style={{ display: "flex", alignItems: "center", height: brandRowH, cursor: "pointer" }}
              >
                {/* Dot */}
                <div style={{ width: 56, display: "flex", justifyContent: "center", flexShrink: 0 }}>
                  <div className={isActive ? "bg-foreground" : "bg-gray-3"}
                    style={{
                      width: isActive ? 10 : 7,
                      height: isActive ? 10 : 7,
                      borderRadius: "50%",
                      transform: `scale(${scale})`,
                      transition: "transform 0.18s cubic-bezier(0.34,1.56,0.64,1)",
                    }} />
                </div>
                {/* Label (only in peek) */}
                <div className={isActive ? "text-foreground font-semibold" : "text-gray-3"}
                  style={{
                    fontSize: 14,
                    whiteSpace: "nowrap",
                    opacity: peeking ? 1 : 0,
                    transform: peeking ? "translateX(0)" : "translateX(-10px)",
                    transition: `opacity 0.22s ease ${idx * 25}ms, transform 0.22s ease ${idx * 25}ms`,
                  }}>
                  {b.name}
                </div>
              </div>

              {/* Sub-nav in peek */}
              {isActive && hasSub && peeking && (
                <div style={{ paddingBottom: 8 }}>
                  {b.sub.map((item, si) => (
                    <PeekSubItem
                      key={item.label}
                      item={item}
                      isActive={activePath === item.path}
                      delay={si * 20 + 60}
                      onClick={() => onItemClick(item.path)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom */}
      <div
        data-bg="true"
        className="border-t border-border/50"
        style={{
          padding: "16px 0 20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        {isAdmin && onLibraryClick && (
          <HoverIcon icon="library" onClick={(e) => { e.stopPropagation(); onLibraryClick(); }} />
        )}
        <HoverIcon icon="moon" onClick={toggleTheme} />
        <HoverIcon icon="settings" onClick={(e) => { e.stopPropagation(); onSettingsClick(); }} />
      </div>
    </div>
  );
}

function HoverIcon({ icon, onClick }: { icon: string; onClick: (e: React.MouseEvent) => void }) {
  const [h, setH] = useState(false);
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={onClick}
      className={`cursor-pointer transition-transform duration-150 p-1 ${
        h ? "scale-110 text-foreground" : icon === "home" ? "text-gray-1" : "text-muted-foreground"
      }`}
    >
      {(SidebarIcons as any)[icon]?.("currentColor")}
    </div>
  );
}
