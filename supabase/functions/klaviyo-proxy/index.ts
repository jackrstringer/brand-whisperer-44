import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";
const KLAVIYO_DEFAULT_REVISION = "2024-10-15";
const TEMPLATE_CREATE_REVISION = "2025-01-15";
const CAMPAIGN_REVISION = "2025-10-15";
const JSON_API_CONTENT_TYPE = "application/vnd.api+json";

type KlaviyoFetchOptions = RequestInit & {
  revision?: string;
  contentType?: string;
  accept?: string;
};

function formatKlaviyoError(status: number, data: any) {
  const firstError = Array.isArray(data?.errors) ? data.errors[0] : null;
  if (!firstError) return `Klaviyo API error ${status}: ${JSON.stringify(data)}`;

  const detail = firstError.detail || firstError.title || "Unknown error";
  const pointer = firstError?.source?.pointer;
  return `Klaviyo API error ${status}: ${detail}${pointer ? ` (${pointer})` : ""}`;
}

async function klaviyoFetch(path: string, apiKey: string, options: KlaviyoFetchOptions = {}) {
  const {
    revision = KLAVIYO_DEFAULT_REVISION,
    contentType = "application/json",
    accept = "application/json",
    headers,
    ...rest
  } = options;

  const res = await fetch(`${KLAVIYO_API_BASE}${path}`, {
    ...rest,
    headers: {
      "Authorization": `Klaviyo-API-Key ${apiKey}`,
      "revision": revision,
      "Content-Type": contentType,
      "Accept": accept,
      ...(headers || {}),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(formatKlaviyoError(res.status, data));
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
            attributes: { name, html, editor_type: "CODE" },
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
      const { name, html, subjectLine, previewText, segmentIds, excludeSegmentIds, campaignId } = body;
      if (!name || !html) throw new Error("name and html are required");

      const includedSegments = Array.isArray(segmentIds)
        ? segmentIds.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
        : [];
      const excludedSegments = Array.isArray(excludeSegmentIds)
        ? excludeSegmentIds.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
        : [];

      if (includedSegments.length === 0) throw new Error("Select at least one segment to include.");

      const normalizedSubject = typeof subjectLine === "string" ? subjectLine : String(subjectLine ?? name);
      const normalizedPreviewText = typeof previewText === "string" ? previewText : String(previewText ?? "");
      const content = {
        subject: normalizedSubject || name,
        preview_text: normalizedPreviewText,
      };

      // Step 1: Create template
      console.log("[create-campaign] Step 1: Creating template...");
      const templateData = await klaviyoFetch("/templates", apiKey, {
        method: "POST",
        revision: TEMPLATE_CREATE_REVISION,
        body: JSON.stringify({
          data: { type: "template", attributes: { name: `${name} - Template`, html, editor_type: "USER_DRAGGABLE" } },
        }),
      });
      const templateId = templateData.data.id;
      console.log("[create-campaign] Template created:", templateId);

      const buildCampaignPayload = (useDefinition: boolean) => {
        const audiences: { included: string[]; excluded?: string[] } = {
          included: includedSegments,
        };
        if (excludedSegments.length > 0) {
          audiences.excluded = excludedSegments;
        }

        const messageAttributes = useDefinition
          ? {
              definition: {
                channel: "email",
                label: name,
                content,
              },
            }
          : {
              channel: "email",
              label: name,
              content,
            };

        return {
          data: {
            type: "campaign",
            attributes: {
              name,
              audiences,
              send_strategy: {
                method: "immediate",
              },
              send_options: {
                use_smart_sending: true,
              },
              "campaign-messages": {
                data: [{
                  type: "campaign-message",
                  attributes: messageAttributes,
                }],
              },
            },
          },
        };
      };

      const createCampaign = async (payload: unknown) => {
        return await klaviyoFetch("/campaigns", apiKey, {
          method: "POST",
          revision: CAMPAIGN_REVISION,
          contentType: JSON_API_CONTENT_TYPE,
          accept: JSON_API_CONTENT_TYPE,
          body: JSON.stringify(payload),
        });
      };

      let usedDefinitionShape = true;
      let campaignPayload = buildCampaignPayload(usedDefinitionShape);
      console.log("[create-campaign] Step 2: Creating campaign with payload:", JSON.stringify(campaignPayload, null, 2));

      let campaignResult: any;
      try {
        campaignResult = await createCampaign(campaignPayload);
      } catch (primaryError: any) {
        const primaryMessage = primaryError?.message || "Unknown campaign creation error";
        const shouldFallback = primaryMessage.includes("/attributes/channel") || primaryMessage.includes("/attributes/definition");

        if (!shouldFallback) {
          throw new Error(`create-campaign failed: ${primaryMessage}`);
        }

        console.warn("[create-campaign] Falling back to legacy campaign-message shape for compatibility.");
        usedDefinitionShape = false;
        campaignPayload = buildCampaignPayload(usedDefinitionShape);
        console.log("[create-campaign] Step 2b: Retrying with compatibility payload:", JSON.stringify(campaignPayload, null, 2));

        try {
          campaignResult = await createCampaign(campaignPayload);
        } catch (fallbackError: any) {
          throw new Error(`create-campaign failed: ${fallbackError?.message || "Unknown campaign creation error"}`);
        }
      }

      const klaviyoCampaignId = campaignResult.data.id;
      console.log("[create-campaign] Campaign created:", klaviyoCampaignId);

      // Step 3: Get the campaign message ID
      let messageId = campaignResult.data.relationships?.["campaign-messages"]?.data?.[0]?.id;

      // Fallback: fetch messages if not in relationships
      if (!messageId) {
        console.log("[create-campaign] Step 3: Fetching campaign messages as fallback...");
        try {
          const msgsResult = await klaviyoFetch(`/campaigns/${klaviyoCampaignId}/campaign-messages`, apiKey, {
            revision: CAMPAIGN_REVISION,
            contentType: JSON_API_CONTENT_TYPE,
            accept: JSON_API_CONTENT_TYPE,
          });
          messageId = msgsResult.data?.[0]?.id;
        } catch (e: any) {
          console.error("[create-campaign] Failed to fetch campaign messages:", e.message);
        }
      }

      // Step 4 + Step 5: Assign template and re-apply subject/preview on the message
      if (messageId) {
        console.log("[create-campaign] Step 4: Assigning template to message:", messageId);
        try {
          await klaviyoFetch("/campaign-message-assign-template", apiKey, {
            method: "POST",
            revision: CAMPAIGN_REVISION,
            contentType: JSON_API_CONTENT_TYPE,
            accept: JSON_API_CONTENT_TYPE,
            body: JSON.stringify({
              data: {
                type: "campaign-message",
                id: messageId,
                relationships: {
                  template: {
                    data: { type: "template", id: templateId },
                  },
                },
              },
            }),
          });
        } catch (e: any) {
          throw new Error(`assign-template failed: ${e.message}`);
        }

        const messageAttributes = usedDefinitionShape
          ? {
              definition: {
                channel: "email",
                label: name,
                content,
              },
            }
          : {
              channel: "email",
              label: name,
              content,
            };

        console.log("[create-campaign] Step 5: Updating message subject and preview text...");
        try {
          await klaviyoFetch(`/campaign-messages/${messageId}`, apiKey, {
            method: "PATCH",
            revision: CAMPAIGN_REVISION,
            contentType: JSON_API_CONTENT_TYPE,
            accept: JSON_API_CONTENT_TYPE,
            body: JSON.stringify({
              data: {
                type: "campaign-message",
                id: messageId,
                attributes: messageAttributes,
              },
            }),
          });
        } catch (e: any) {
          throw new Error(`update-message failed: ${e.message}`);
        }
      } else {
        console.warn("[create-campaign] No message ID found — template not assigned.");
      }

      // Update our campaign record
      if (campaignId) {
        await supabase.from("campaigns").update({
          klaviyo_template_id: templateId,
          klaviyo_campaign_id: klaviyoCampaignId,
        }).eq("id", campaignId);
      }

      return new Response(JSON.stringify({
        templateId,
        klaviyoCampaignId,
        klaviyoEditUrl: `https://www.klaviyo.com/email-template-editor/campaign/${klaviyoCampaignId}/content/edit`,
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
