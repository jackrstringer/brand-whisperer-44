import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface SliceRecord {
  index: number;
  label: string;
  url: string;
  yTop: number;
  yBottom: number;
}

interface ReferenceCampaign {
  id: string;
  slicing_status: string | null;
  image_slice_urls: SliceRecord[] | null;
  image_total_height: number | null;
}

interface Props {
  campaign: ReferenceCampaign;
  onRefresh: () => void;
}

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  processing: "outline",
  complete: "default",
  failed: "destructive",
};

export function ReferenceCampaignSlicesTab({ campaign, onRefresh }: Props) {
  const status = campaign.slicing_status ?? "pending";
  const slices = (campaign.image_slice_urls ?? []) as SliceRecord[];
  const [triggering, setTriggering] = useState(false);

  const triggerSlicing = async () => {
    setTriggering(true);
    try {
      const { error } = await supabase.functions.invoke("slice-reference", {
        body: { referenceCampaignId: campaign.id },
      });
      if (error) throw error;
      toast.success("Slicing triggered — refresh in 15-30s to see results");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to trigger slicing");
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">Slicing status:</span>
        <Badge variant={STATUS_BADGE_VARIANT[status] ?? "secondary"}>{status}</Badge>
        {campaign.image_total_height && (
          <span className="text-xs text-muted-foreground">
            Original height: {campaign.image_total_height}px
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={triggerSlicing}
          disabled={triggering}
          className="ml-auto"
        >
          {triggering ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          {status === "pending" ? "Start Slicing" : "Re-slice"}
        </Button>
      </div>

      {/* Pending / processing states */}
      {(status === "pending" || status === "processing") && (
        <p className="text-sm text-muted-foreground">
          {status === "processing"
            ? "Slicing in progress — this usually takes 15–30 seconds. Refresh to check status."
            : "Slicing has not started yet. Click 'Start Slicing' above."}
        </p>
      )}

      {/* Failed state */}
      {status === "failed" && (
        <p className="text-sm text-destructive">
          Slicing failed. Check edge function logs for details. Click 'Re-slice' to retry.
        </p>
      )}

      {/* Complete: show slices */}
      {status === "complete" && slices.length > 0 && (
        <div className="grid gap-4">
          {slices.map((slice) => (
            <div key={slice.index} className="border border-border rounded-lg overflow-hidden bg-card">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    #{slice.index}
                  </Badge>
                  <span className="text-xs font-medium">{slice.label}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  y {slice.yTop} – {slice.yBottom}
                  {campaign.image_total_height
                    ? ` (${slice.yBottom - slice.yTop}px)`
                    : ""}
                </span>
              </div>
              <div className="p-2">
                <img
                  src={slice.url}
                  alt={`Slice ${slice.index}: ${slice.label}`}
                  className="w-full rounded"
                  loading="lazy"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Complete but empty */}
      {status === "complete" && slices.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Slicing completed but no slices were saved. Click 'Re-slice' to retry.
        </p>
      )}
    </div>
  );
}
