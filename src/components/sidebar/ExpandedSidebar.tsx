import { useState } from "react";
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
  onCollapseClick: () => void;
  onHomeClick: () => void;
  onSettingsClick: () => void;
  onSignOut: () => void;
  onLibraryClick?: () => void;
  isAdmin?: boolean;
}

export function ExpandedSidebar({
  brands, activeBrandId, activePath, onBrandClick, onItemClick,
  onCollapseClick, onHomeClick, onSettingsClick, onSignOut,
}: Props) {
  const [hoveredBrand, setHoveredBrand] = useState<string | null>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [moonH, setMoonH] = useState(false);
  const [settingsH, setSettingsH] = useState(false);

  const handleBgClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).dataset.bg === "true" || e.target === e.currentTarget)
      onCollapseClick();
  };

  return (
    <div
      data-bg="true"
      onClick={handleBgClick}
      style={{
        width: 240, minWidth: 240, height: "100vh",
        background: "#fff", borderRight: "1px solid #E8E8E8",
        display: "flex", flexDirection: "column",
        transition: "width 0.3s cubic-bezier(0.25,0.46,0.45,0.94)",
        flexShrink: 0,
      }}
    >
      {/* Top */}
      <div style={{ padding: "20px 20px 28px", display: "flex", gap: 16 }}>
        <HoverTopIcon icon="home" onClick={(e) => { e.stopPropagation(); onHomeClick(); }} />
        <HoverTopIcon icon="collapse" onClick={(e) => { e.stopPropagation(); onCollapseClick(); }} />
      </div>

      {/* Brands */}
      <div
        data-bg="true"
        style={{ flex: 1, overflowY: "auto", padding: "0 12px" }}
        className="scrollbar-hide"
      >
        {brands.map((b) => {
          const isActive = b.id === activeBrandId;
          const hasSub = b.sub.length > 0;
          const isH = hoveredBrand === b.id;
          return (
            <div key={b.id} data-bg="true">
              <div
                onClick={(e) => { e.stopPropagation(); onBrandClick(b.id); }}
                onMouseEnter={() => setHoveredBrand(b.id)}
                onMouseLeave={() => setHoveredBrand(null)}
                style={{
                  padding: "10px 12px", fontSize: 14,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "#2B2B2B" : isH ? "#686868" : "#CDCDCD",
                  cursor: "pointer", borderRadius: 8,
                  background: isH && !isActive ? "#FAFAFA" : "transparent",
                  transition: "color 0.15s ease, background 0.15s ease",
                }}
              >
                {b.name}
              </div>

              {isActive && hasSub && (
                <div style={{ animation: "slideDown 0.2s ease-out" }}>
                  {b.sub.map((item) => {
                    const ia = activePath === item.path;
                    const ih = hoveredItem === `${b.id}-${item.label}`;
                    return (
                      <div
                        key={item.label}
                        onClick={(e) => { e.stopPropagation(); onItemClick(item.path); }}
                        onMouseEnter={() => setHoveredItem(`${b.id}-${item.label}`)}
                        onMouseLeave={() => setHoveredItem(null)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "9px 16px", margin: "0 4px 2px", borderRadius: 15, fontSize: 14,
                          fontWeight: ia ? 500 : 400,
                          color: ia ? "#fff" : ih ? "#2B2B2B" : "#686868",
                          background: ia ? "#2B2B2B" : ih ? "#F2F2F2" : "transparent",
                          cursor: "pointer",
                          transition: "color 0.15s cubic-bezier(0.4,0,0.2,1), background 0.15s cubic-bezier(0.4,0,0.2,1), transform 0.15s cubic-bezier(0.4,0,0.2,1)",
                          transform: ih && !ia ? "translateX(2px)" : "translateX(0)",
                        }}
                      >
                        <span style={{ display: "flex", width: 17, height: 17, flexShrink: 0 }}>
                          {(SidebarIcons as any)[item.icon]?.(ia ? "#fff" : ih ? "#2B2B2B" : "#686868")}
                        </span>
                        {item.label}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom */}
      <div
        data-bg="true"
        style={{
          borderTop: "1px solid #F2F2F2",
          padding: "16px 20px 20px",
          display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        <div
          onMouseEnter={() => setMoonH(true)}
          onMouseLeave={() => setMoonH(false)}
          onClick={(e) => e.stopPropagation()}
          style={{
            cursor: "pointer", padding: 4, width: "fit-content",
            transition: "transform 0.2s ease",
            transform: moonH ? "scale(1.15)" : "scale(1)",
          }}
        >
          {SidebarIcons.moon(moonH ? "#2B2B2B" : "#9B9B9B")}
        </div>
        <div
          onMouseEnter={() => setSettingsH(true)}
          onMouseLeave={() => setSettingsH(false)}
          onClick={(e) => { e.stopPropagation(); onSettingsClick(); }}
          style={{
            cursor: "pointer", padding: 4, width: "fit-content",
            transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)",
            transform: settingsH ? "rotate(60deg)" : "rotate(0deg)",
          }}
        >
          {SidebarIcons.settings(settingsH ? "#2B2B2B" : "#9B9B9B")}
        </div>
      </div>
    </div>
  );
}

function HoverTopIcon({ icon, onClick }: { icon: string; onClick: (e: React.MouseEvent) => void }) {
  const [h, setH] = useState(false);
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={onClick}
      style={{
        cursor: "pointer",
        transition: "transform 0.15s",
        transform: h ? "scale(1.1)" : "scale(1)",
      }}
    >
      {(SidebarIcons as any)[icon]?.(h ? "#2B2B2B" : "#686868")}
    </div>
  );
}
