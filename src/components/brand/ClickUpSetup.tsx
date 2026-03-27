import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Check, Eye, EyeOff } from "lucide-react";

export default function ClickUpSetup({ brandId }: { brandId: string }) {
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    supabase
      .from("brands")
      .select("clickup_api_key")
      .eq("id", brandId)
      .single()
      .then(({ data }) => {
        if (data?.clickup_api_key) {
          setApiKey(data.clickup_api_key);
          setHasKey(true);
        }
        setLoading(false);
      });
  }, [brandId]);

  const save = async () => {
    setSaving(true);
    await supabase
      .from("brands")
      .update({ clickup_api_key: apiKey.trim() || null } as any)
      .eq("id", brandId);
    setHasKey(!!apiKey.trim());
    toast.success(apiKey.trim() ? "ClickUp API key saved" : "ClickUp API key removed");
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>ClickUp Personal API Token</Label>
        <p className="text-xs text-muted-foreground mt-1 mb-2">
          Find this in ClickUp → Settings → Apps → API Token. Used to import task details into campaigns.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="pk_..."
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </div>
      {hasKey && (
        <div className="flex items-center gap-1.5 text-xs text-primary">
          <Check className="w-3.5 h-3.5" /> Connected
        </div>
      )}
    </div>
  );
}
