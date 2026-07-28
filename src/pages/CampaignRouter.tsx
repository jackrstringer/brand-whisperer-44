import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import CampaignEditor from "./CampaignEditor";
import ImageCampaignEditor from "./ImageCampaignEditor";

/** Dispatches to the right editor based on `campaign_mode`.
 *  Image-mode campaigns get the slice editor; everything else uses the
 *  existing full-featured HTML editor. */
export default function CampaignRouter() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [mode, setMode] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    supabase
      .from("campaigns")
      .select("campaign_mode")
      .eq("id", campaignId)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        setMode((data as any)?.campaign_mode || "campaign");
      });
    return () => { cancelled = true; };
  }, [campaignId]);

  if (!mode) {
    return <div className="flex items-center justify-center h-screen"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  if (mode === "image") return <ImageCampaignEditor />;
  return <CampaignEditor />;
}