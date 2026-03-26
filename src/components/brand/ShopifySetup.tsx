import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Unlink, ShoppingBag, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface ShopifyConnection {
  id: string;
  brand_id: string;
  shop_domain: string;
  connected_at: string;
  last_synced_at: string | null;
}

export default function ShopifySetup({ brandId }: { brandId: string }) {
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<ShopifyConnection | null>(null);
  const [shopDomain, setShopDomain] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [productCount, setProductCount] = useState(0);
  const [imageCount, setImageCount] = useState(0);

  const fetchConnection = async () => {
    const { data } = await supabase
      .from("shopify_connections")
      .select("*")
      .eq("brand_id", brandId)
      .maybeSingle();
    setConnection(data as ShopifyConnection | null);

    if (data) {
      const [{ count: pCount }, { count: iCount }] = await Promise.all([
        supabase.from("shopify_products").select("*", { count: "exact", head: true }).eq("brand_id", brandId),
        supabase.from("shopify_product_images").select("*", { count: "exact", head: true }).eq("brand_id", brandId),
      ]);
      setProductCount(pCount || 0);
      setImageCount(iCount || 0);
    }
    setLoading(false);
  };

  useEffect(() => { fetchConnection(); }, [brandId]);

  const handleConnect = async () => {
    if (!shopDomain.trim()) return;
    setConnecting(true);

    try {
      const { data, error } = await supabase.functions.invoke("shopify-install", {
        body: { brandId, shopDomain: shopDomain.trim() },
      });
      if (error) throw new Error(error.message);
      if (data?.installUrl) {
        window.location.href = data.installUrl;
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to start Shopify connection");
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("shopify-sync-products", {
        body: { brandId },
      });
      if (error) throw new Error(error.message);
      toast.success(`Synced ${data?.products_synced || 0} products, ${data?.images_queued || 0} images queued for processing`);
      await fetchConnection();
    } catch (err: any) {
      toast.error(err.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect Shopify? This will remove all synced product data.")) return;

    // Delete connection — cascading will remove products and images
    await supabase.from("shopify_product_images").delete().eq("brand_id", brandId);
    await supabase.from("shopify_products").delete().eq("brand_id", brandId);
    await supabase.from("shopify_connections").delete().eq("brand_id", brandId);
    setConnection(null);
    setProductCount(0);
    setImageCount(0);
    toast.success("Shopify disconnected");
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  if (connection) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <ShoppingBag className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm font-medium">Connected to {connection.shop_domain}</p>
            {connection.last_synced_at && (
              <p className="text-xs text-muted-foreground">
                Last synced {formatDistanceToNow(new Date(connection.last_synced_at), { addSuffix: true })}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <Badge variant="secondary">{productCount} products</Badge>
          <Badge variant="secondary">{imageCount} images</Badge>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSync} disabled={syncing}>
            {syncing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Sync Now
          </Button>
          <Button variant="outline" className="text-destructive" onClick={handleDisconnect}>
            <Unlink className="w-4 h-4 mr-1" /> Disconnect
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Your Shopify Store URL</Label>
        <p className="text-xs text-muted-foreground mt-1 mb-2">
          Connect your Shopify store to automatically sync product images for campaigns.
        </p>
        <Input
          value={shopDomain}
          onChange={(e) => setShopDomain(e.target.value)}
          placeholder="yourstore.myshopify.com"
          className="mt-1"
          onKeyDown={(e) => e.key === "Enter" && handleConnect()}
        />
      </div>
      <Button onClick={handleConnect} disabled={connecting || !shopDomain.trim()}>
        {connecting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-1" />}
        Connect Shopify
      </Button>
    </div>
  );
}
