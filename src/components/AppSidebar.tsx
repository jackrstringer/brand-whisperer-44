import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

/* Inline SVG icons — 17×17, stroke 1.4, round caps */
const DashboardIcon = ({ color = "currentColor" }: { color?: string }) => (
  <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="5.5" height="5.5" rx="1" />
    <rect x="9.5" y="2" width="5.5" height="5.5" rx="1" />
    <rect x="2" y="9.5" width="5.5" height="5.5" rx="1" />
    <rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1" />
  </svg>
);

const SettingsIcon = ({ color = "currentColor" }: { color?: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const CampaignsIcon = ({ color = "currentColor" }: { color?: string }) => (
  <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="13" height="11" rx="1.5" />
    <path d="M2 6h13" />
    <path d="M5.5 9.5h6" />
    <path d="M5.5 11.5h3" />
  </svg>
);

const PaletteIcon = ({ color = "currentColor" }: { color?: string }) => (
  <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8.5" cy="8.5" r="6.5" />
    <circle cx="6.5" cy="6" r="1" fill={color} stroke="none" />
    <circle cx="10" cy="6" r="1" fill={color} stroke="none" />
    <circle cx="5.5" cy="9" r="1" fill={color} stroke="none" />
    <circle cx="10.5" cy="9.5" r="1.5" />
  </svg>
);

const BookIcon = ({ color = "currentColor" }: { color?: string }) => (
  <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h5a2 2 0 0 1 2 2v9.5a1.5 1.5 0 0 0-1.5-1.5H2V3z" />
    <path d="M15 3h-5a2 2 0 0 0-2 2v9.5a1.5 1.5 0 0 1 1.5-1.5H15V3z" />
  </svg>
);

const LibraryIcon = ({ color = "currentColor" }: { color?: string }) => (
  <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="2" width="3" height="13" rx="0.5" />
    <rect x="7" y="4" width="3" height="11" rx="0.5" />
    <path d="M11.5 6l3 9" />
  </svg>
);

const MoonIcon = ({ color = "currentColor" }: { color?: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const LogOutIcon = ({ color = "currentColor" }: { color?: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut } = useAuth();
  const { isAdmin } = useIsAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const brandId = params.brandId;

  const [brandName, setBrandName] = useState<string | null>(null);

  useEffect(() => {
    if (!brandId) { setBrandName(null); return; }
    supabase.from("brands").select("name").eq("id", brandId).single().then(({ data }) => {
      setBrandName(data?.name ?? null);
    });
  }, [brandId]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const isActive = (path: string) => location.pathname === path;
  const navItemClass = (path: string) =>
    isActive(path)
      ? "text-white bg-black rounded-pill"
      : "text-gray-1 hover:text-black hover:bg-gray-5 rounded-pill transition-colors duration-150";

  const iconColor = (path: string) => isActive(path) ? "#FFFFFF" : "#686868";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="bg-white border-r border-border">
        {/* App */}
        <SidebarGroup>
          <SidebarGroupLabel className="font-display text-sm tracking-normal">
            {collapsed ? "CS" : "Campaign Studio"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className={navItemClass("/dashboard")}>
                  <NavLink to="/dashboard" end>
                    <DashboardIcon color={iconColor("/dashboard")} />
                    {!collapsed && <span className="ml-2.5">Dashboard</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className={navItemClass("/settings")}>
                  <NavLink to="/settings" end>
                    <SettingsIcon color={iconColor("/settings")} />
                    {!collapsed && <span className="ml-2.5">Global Settings</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Brand context */}
        {brandId && brandName && (
          <SidebarGroup>
            <SidebarGroupLabel className="font-body text-xs font-semibold uppercase tracking-widest text-gray-2">
              {collapsed ? "B" : brandName}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={navItemClass(`/brands/${brandId}`)}>
                    <NavLink to={`/brands/${brandId}`} end>
                      <CampaignsIcon color={iconColor(`/brands/${brandId}`)} />
                      {!collapsed && <span className="ml-2.5">Campaigns</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={navItemClass(`/brands/${brandId}/settings`)}>
                    <NavLink to={`/brands/${brandId}/settings`} end>
                      <PaletteIcon color={iconColor(`/brands/${brandId}/settings`)} />
                      {!collapsed && <span className="ml-2.5">Brand Settings</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={navItemClass(`/brands/${brandId}/guide`)}>
                    <NavLink to={`/brands/${brandId}/guide`} end>
                      <BookIcon color={iconColor(`/brands/${brandId}/guide`)} />
                      {!collapsed && <span className="ml-2.5">Brand Guide</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Admin section */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="font-body text-xs font-semibold uppercase tracking-widest text-gray-2">
              {collapsed ? "A" : "Admin"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className={navItemClass("/admin/library")}>
                    <NavLink to="/admin/library" end>
                      <LibraryIcon color={iconColor("/admin/library")} />
                      {!collapsed && <span className="ml-2.5">Reference Library</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-gray-5 bg-white">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleSignOut}
              className="text-gray-2 hover:text-black transition-colors duration-150"
            >
              <LogOutIcon color="#9B9B9B" />
              {!collapsed && <span className="ml-2.5">Sign Out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
