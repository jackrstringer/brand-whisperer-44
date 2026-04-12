import { useState } from "react";
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
  onCollapseClick: () => void;
  onHomeClick: () => void;
  onSettingsClick: () => void;
  onSignOut: () => void;
  onLibraryClick?: () => void;
  isAdmin?: boolean;
}

export function ExpandedSidebar({
  brands, activeBrandId, activePath, onBrandClick, onItemClick,
  onCollapseClick, onHomeClick, onSettingsClick, onSignOut, onLibraryClick, isAdmin,
}: Props) {
  const { theme, setTheme } = useTheme();
  const [hoveredBrand, setHoveredBrand] = useState<string | null>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [moonH, setMoonH] = useState(false);
  const [settingsH, setSettingsH] = useState(false);
  const [libraryH, setLibraryH] = useState(false);

  const handleBgClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).dataset.bg === "true" || e.target === e.currentTarget)
      onCollapseClick();
  };

  const toggleTheme = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div
      data-bg="true"
      onClick={handleBgClick}
      className="bg-sidebar border-r border-sidebar-border"
      style={{
        width: 240, minWidth: 240, height: "100vh",
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
                className={`rounded-lg transition-colors duration-150 cursor-pointer ${
                  isActive ? "text-foreground font-semibold" :
                  isH ? "text-muted-foreground bg-muted/50" : "text-gray-3"
                }`}
                style={{ padding: "10px 12px", fontSize: 14 }}
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
                        className={`flex items-center gap-2.5 cursor-pointer transition-all duration-150 ${
                          ia ? "bg-primary text-primary-foreground font-medium" :
                          ih ? "bg-muted text-foreground translate-x-0.5" : "text-gray-1"
                        }`}
                        style={{
                          padding: "9px 16px", margin: "0 4px 2px", borderRadius: 15, fontSize: 14,
                        }}
                      >
                        <span style={{ display: "flex", width: 17, height: 17, flexShrink: 0 }}>
                          {(SidebarIcons as any)[item.icon]?.("currentColor")}
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
        className="border-t border-border/50"
        style={{
          padding: "16px 20px 20px",
          display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        {isAdmin && onLibraryClick && (
          <div
            onMouseEnter={() => setLibraryH(true)}
            onMouseLeave={() => setLibraryH(false)}
            onClick={(e) => { e.stopPropagation(); onLibraryClick(); }}
            className={`cursor-pointer flex items-center gap-2 p-1 w-fit transition-transform duration-150 ${
              libraryH ? "scale-105 text-foreground" : "text-muted-foreground"
            }`}
          >
            {SidebarIcons.library("currentColor")}
            <span className="text-xs">Library</span>
          </div>
        )}
        <div
          onMouseEnter={() => setMoonH(true)}
          onMouseLeave={() => setMoonH(false)}
          onClick={toggleTheme}
          className={`cursor-pointer p-1 w-fit transition-transform duration-200 ${
            moonH ? "scale-115 text-foreground" : "text-muted-foreground"
          }`}
        >
          {SidebarIcons.moon("currentColor")}
        </div>
        <div
          onMouseEnter={() => setSettingsH(true)}
          onMouseLeave={() => setSettingsH(false)}
          onClick={(e) => { e.stopPropagation(); onSettingsClick(); }}
          className={`cursor-pointer p-1 w-fit transition-transform duration-350 ${
            settingsH ? "text-foreground" : "text-muted-foreground"
          }`}
          style={{
            transform: settingsH ? "rotate(60deg)" : "rotate(0deg)",
            transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1), color 0.15s",
          }}
        >
          {SidebarIcons.settings("currentColor")}
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
      className={`cursor-pointer transition-transform duration-150 ${
        h ? "scale-110 text-foreground" : "text-gray-1"
      }`}
    >
      {(SidebarIcons as any)[icon]?.("currentColor")}
    </div>
  );
}
