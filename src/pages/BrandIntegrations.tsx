import { useParams } from "react-router-dom";
import KlaviyoSetup from "@/components/brand/KlaviyoSetup";
import ShopifySetup from "@/components/brand/ShopifySetup";
import ClickUpSetup from "@/components/brand/ClickUpSetup";

export default function BrandIntegrations() {
  const { brandId } = useParams<{ brandId: string }>();

  if (!brandId) return null;

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold">Integrations</h1>

      <div>
        <h3 className="text-lg font-semibold mb-1">Klaviyo</h3>
        <p className="text-sm text-gray-2 mb-4">Connect your Klaviyo account for list/segment targeting and campaign syncing.</p>
        <KlaviyoSetup brandId={brandId} />
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="text-lg font-semibold mb-1">Shopify</h3>
        <p className="text-sm text-gray-2 mb-4">Connect your Shopify store to sync products and images.</p>
        <ShopifySetup brandId={brandId} />
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="text-lg font-semibold mb-1">ClickUp</h3>
        <p className="text-sm text-gray-2 mb-4">Connect ClickUp to pull campaign briefs from tasks.</p>
        <ClickUpSetup brandId={brandId} />
      </div>
    </div>
  );
}
