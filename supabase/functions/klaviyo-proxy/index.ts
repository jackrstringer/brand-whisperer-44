import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";
const KLAVIYO_REVISION = "2024-10-15";

async function klaviyoFetch(path: string, apiKey: string, options: RequestInit = {}) {
  const res = await fetch(`${KLAVIYO_API_BASE}${path}`, {
    ...options,
    headers: {
      "Authorization": `Klaviyo-API-Key ${apiKey}`,
      "revision": KLAVIYO_REVISION,
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Klaviyo API error ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { action, brandId } = body;

    if (!brandId) throw new Error("brandId is required");

    // Verify brand ownership
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("id, user_id")
      .eq("id", brandId)
      .single();
    if (brandError || !brand || brand.user_id !== user.id) throw new Error("Brand not found or unauthorized");

    if (action === "validate-key") {
      const { apiKey } = body;
      if (!apiKey) throw new Error("apiKey is required");
      
      // Test the key by fetching lists
      const data = await klaviyoFetch("/lists", apiKey);
      
      // Store the key in the connection table
      const { error: upsertError } = await supabase
        .from("klaviyo_connections")
        .upsert({
          brand_id: brandId,
          api_key_encrypted: apiKey,
          cached_lists: data.data || [],
          last_synced_at: new Date().toISOString(),
        }, { onConflict: "brand_id" });
      
      if (upsertError) throw new Error(`Failed to save connection: ${upsertError.message}`);
      
      return new Response(JSON.stringify({ success: true, listCount: (data.data || []).length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For all other actions, get the stored API key
    const { data: connection, error: connError } = await supabase
      .from("klaviyo_connections")
      .select("*")
      .eq("brand_id", brandId)
      .single();
    if (connError || !connection) throw new Error("No Klaviyo connection found for this brand");
    const apiKey = connection.api_key_encrypted;

    if (action === "sync") {
      const [listsData, segmentsData] = await Promise.all([
        klaviyoFetch("/lists", apiKey),
        klaviyoFetch("/segments", apiKey),
      ]);

      await supabase.from("klaviyo_connections").update({
        cached_lists: listsData.data || [],
        cached_segments: segmentsData.data || [],
        last_synced_at: new Date().toISOString(),
      }).eq("brand_id", brandId);

      return new Response(JSON.stringify({
        lists: listsData.data || [],
        segments: segmentsData.data || [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "get-cached") {
      return new Response(JSON.stringify({
        lists: connection.cached_lists || [],
        segments: connection.cached_segments || [],
        lastSynced: connection.last_synced_at,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "create-template") {
      const { name, html } = body;
      if (!name || !html) throw new Error("name and html are required");

      const templateData = await klaviyoFetch("/templates", apiKey, {
        method: "POST",
        body: JSON.stringify({
          data: {
            type: "template",
            attributes: { name, html },
          },
        }),
      });

      // Store template ID on campaign if provided
      if (body.campaignId) {
        await supabase.from("campaigns").update({
          klaviyo_template_id: templateData.data.id,
        }).eq("id", body.campaignId);
      }

      return new Response(JSON.stringify({
        templateId: templateData.data.id,
        success: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "create-campaign") {
      const { name, html, subjectLine, previewText, listIds, segmentIds, campaignId } = body;
      if (!name || !html) throw new Error("name and html are required");

      // 1. Create template
      const templateData = await klaviyoFetch("/templates", apiKey, {
        method: "POST",
        body: JSON.stringify({
          data: { type: "template", attributes: { name: `${name} - Template`, html } },
        }),
      });
      const templateId = templateData.data.id;

      // 2. Create campaign
      const audienceFilters: any[] = [];
      if (listIds?.length) {
        audienceFilters.push(...listIds.map((id: string) => ({
          type: "list", id
        })));
      }
      if (segmentIds?.length) {
        audienceFilters.push(...segmentIds.map((id: string) => ({
          type: "segment", id
        })));
      }

      const campaignPayload: any = {
        data: {
          type: "campaign",
          attributes: {
            name,
            audiences: {
              included: audienceFilters.length > 0 ? audienceFilters : undefined,
              excluded: [],
            },
            "campaign-messages": {
              data: [{
                type: "campaign-message",
                attributes: {
                  channel: "email",
                  label: name,
                  content: {
                    subject: subjectLine || name,
                    preview_text: previewText || "",
                    template_id: templateId,
                  },
                },
              }],
            },
            "send-strategy": {
              method: "static",
              "options-static": { datetime: null },
            },
          },
        },
      };

      const campaignResult = await klaviyoFetch("/campaigns", apiKey, {
        method: "POST",
        body: JSON.stringify(campaignPayload),
      });

      // Update our campaign record
      if (campaignId) {
        await supabase.from("campaigns").update({
          klaviyo_template_id: templateId,
          klaviyo_campaign_id: campaignResult.data.id,
        }).eq("id", campaignId);
      }

      return new Response(JSON.stringify({
        templateId,
        klaviyoCampaignId: campaignResult.data.id,
        success: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "disconnect") {
      await supabase.from("klaviyo_connections").delete().eq("brand_id", brandId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error: any) {
    console.error("Klaviyo proxy error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
