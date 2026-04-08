import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { CollapsedStrip } from "./sidebar/CollapsedStrip";
import { ExpandedSidebar } from "./sidebar/ExpandedSidebar";

interface Brand {
  id: string;
  name: string;
}

interface SubItem {
  label: string;
  icon: string;
  path: string;
}

function getBrandSubItems(brandId: string): SubItem[] {
  return [
    { label: "Campaigns", icon: "campaigns", path: `/brands/${brandId}` },
    { label: "Brand Settings", icon: "brand", path: `/brands/${brandId}/settings` },
    { label: "Intelligence", icon: "intelligence", path: `/brands/${brandId}/intelligence` },
    { label: "Brand Guide", icon: "guide", path: `/brands/${brandId}/guide` },
  ];
}

export function AppSidebar() {
  const { signOut } = useAuth();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const currentBrandId = params.brandId || null;

  const [brands, setBrands] = useState<Brand[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("brands")
      .select("id, name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setBrands(data);
      });
  }, [user]);

  const sidebarBrands = brands.map((b) => ({
    id: b.id,
    name: b.name,
    sub: getBrandSubItems(b.id),
  }));

  // Add admin library as a pseudo-brand if admin
  // (we'll handle admin nav items via settings for now)

  const handleBrandClick = (id: string) => {
    navigate(`/brands/${id}`);
  };

  const handleItemClick = (path: string) => {
    navigate(path);
  };

  const handleHomeClick = () => {
    navigate("/dashboard");
  };

  const handleSettingsClick = () => {
    navigate("/settings");
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const sharedProps = {
    brands: sidebarBrands,
    activeBrandId: currentBrandId,
    activePath: location.pathname,
    onBrandClick: handleBrandClick,
    onItemClick: handleItemClick,
    onHomeClick: handleHomeClick,
    onSettingsClick: handleSettingsClick,
    onSignOut: handleSignOut,
  };

  if (collapsed) {
    return (
      <CollapsedStrip
        {...sharedProps}
        onExpandClick={() => setCollapsed(false)}
      />
    );
  }

  return (
    <ExpandedSidebar
      {...sharedProps}
      onCollapseClick={() => setCollapsed(true)}
    />
  );
}
