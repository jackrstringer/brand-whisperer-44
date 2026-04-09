import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { brand_id, html } = await req.json();
    if (!brand_id || !html)
      throw new Error("brand_id and html are required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: conn, error: connErr } = await supabase
      .from("klaviyo_connections")
      .select("api_key")
      .eq("brand_id", brand_id)
      .single();

    if (connErr || !conn) {
      return new Response(
        JSON.stringify({ valid: false, skipped: true, error: "No Klaviyo connection found for this brand" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = conn.api_key;

    // Step 1: Create temporary template
    let createResp: Response;
    try {
      createResp = await fetch(`${KLAVIYO_API_BASE}/templates/`, {
        method: "POST",
        headers: {
          Authorization: `Klaviyo-API-Key ${apiKey}`,
          revision: "2024-02-15",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: {
            type: "template",
            attributes: {
              name: "Campaign Studio Validation - DELETE ME",
              editor_type: "CODE",
              html,
            },
          },
        }),
      });
    } catch (networkErr: unknown) {
      console.error("[klaviyo-validate] Network error:", networkErr);
      return new Response(
        JSON.stringify({ valid: false, error: `Network error connecting to Klaviyo: ${String(networkErr)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!createResp.ok) {
      const errBody = await createResp.json().catch(() => null);
      const detail =
        errBody?.errors?.[0]?.detail ||
        errBody?.errors?.[0]?.title ||
        `Klaviyo template creation failed with status ${createResp.status}`;
      console.log("[klaviyo-validate] Template rejected:", detail);
      return new Response(
        JSON.stringify({ valid: false, error: detail }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Template created successfully — extract ID and delete it
    const createData = await createResp.json();
    const templateId = createData?.data?.id;

    if (templateId) {
      // Step 2: Delete immediately
      try {
        await fetch(`${KLAVIYO_API_BASE}/templates/${templateId}/`, {
          method: "DELETE",
          headers: {
            Authorization: `Klaviyo-API-Key ${apiKey}`,
            revision: "2024-02-15",
          },
        });
        console.log("[klaviyo-validate] Temp template deleted:", templateId);
      } catch (delErr: unknown) {
        console.warn("[klaviyo-validate] Failed to delete temp template:", delErr);
      }
    }

    return new Response(
      JSON.stringify({ valid: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    console.error("[klaviyo-validate] Error:", err);
    return new Response(
      JSON.stringify({ valid: false, error: `Validation error: ${String(err)}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
