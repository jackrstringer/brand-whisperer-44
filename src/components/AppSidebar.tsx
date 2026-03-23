import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Settings, LogOut, FolderOpen, Palette } from "lucide-react";
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
import { Button } from "@/components/ui/button";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut } = useAuth();
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

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* App */}
        <SidebarGroup>
          <SidebarGroupLabel>{collapsed ? "CS" : "Campaign Studio"}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/dashboard" end activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium">
                    <LayoutDashboard className="mr-2 h-4 w-4 shrink-0" />
                    {!collapsed && <span>Dashboard</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/settings" end activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium">
                    <Settings className="mr-2 h-4 w-4 shrink-0" />
                    {!collapsed && <span>Global Settings</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Brand context */}
        {brandId && brandName && (
          <SidebarGroup>
            <SidebarGroupLabel>{collapsed ? "B" : brandName}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to={`/brands/${brandId}`} end activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium">
                      <FolderOpen className="mr-2 h-4 w-4 shrink-0" />
                      {!collapsed && <span>Campaigns</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to={`/brands/${brandId}/settings`} end activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium">
                      <Palette className="mr-2 h-4 w-4 shrink-0" />
                      {!collapsed && <span>Brand Settings</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut} className="text-muted-foreground hover:text-foreground">
              <LogOut className="mr-2 h-4 w-4 shrink-0" />
              {!collapsed && <span>Sign Out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
