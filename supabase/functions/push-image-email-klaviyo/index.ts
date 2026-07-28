// Assembles the completed slice sequence into a Klaviyo SYSTEM_DRAGGABLE
// template. Every slice becomes one `image` block wrapped in an href.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KLAVIYO_TEMPLATE_REVISION = "2026-07-15";

async function klaviyoCall(path: string, apiKey: string, method: string, body: any) {
  const res = await fetch(`https://a.klaviyo.com/api${path}`, {
    method,
    headers: {
      "Authorization": `Klaviyo-API-Key ${apiKey}`,
      "revision": KLAVIYO_TEMPLATE_REVISION,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = Array.isArray(data?.errors) ? data.errors[0]?.detail || data.errors[0]?.title : JSON.stringify(data);
    throw new Error(`Klaviyo ${method} ${path} ${res.status}: ${err}`);
  }
  return data;
}

function buildTemplateDefinition(slices: any[], name: string) {
  const blocks = slices.map((s) => ({
    content_type: "block",
    type: "image",
    data: {
      properties: {
        alt_text: s.headline_copy || name,
        href: s.cta_url || "",
        src: s.image_url,
        dynamic: false,
      },
      styles: {
        width: "600px",
        block_padding_top: "0px",
        block_padding_bottom: "0px",
        block_padding_left: "0px",
        block_padding_right: "0px",
      },
      display_options: {},
    },
  }));

  return {
    body: {
      properties: {},
      styles: { background_color: "#ffffff" },
      sections: [{
        content_type: "section",
        type: "section",
        data: { properties: {}, display_options: {}, styles: {} },
        rows: [{
          data: { styles: { column_layout: "1-column-full-width" } },
          columns: [{ data: {}, blocks }],
        }],
      }],
    },
    styles: [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) throw new Error("Unauthorized");

    const { campaignId } = await req.json();
    if (!campaignId) throw new Error("campaignId is required");

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns").select("*, brands!inner(user_id)").eq("id", campaignId).single();
    if (cErr || !campaign) throw new Error(`Campaign not found: ${cErr?.message}`);
    if ((campaign as any).brands.user_id !== user.id) throw new Error("Not authorized for this campaign");

    const { data: connection } = await supabase
      .from("klaviyo_connections").select("api_key").eq("brand_id", campaign.brand_id).single();
    if (!connection?.api_key) throw new Error("No Klaviyo connection for this brand");

    const { data: slices } = await supabase
      .from("campaign_slices")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("generation_status", "complete")
      .order("position");

    if (!slices || slices.length === 0) throw new Error("No completed slices to push");

    const templateName = `${campaign.name || "Image Email"} — ${new Date().toISOString().slice(0, 10)}`;
    const definition = buildTemplateDefinition(slices, campaign.name || "Image Email");

    const created = await klaviyoCall("/templates", connection.api_key, "POST", {
      data: {
        type: "template",
        attributes: {
          name: templateName,
          editor_type: "SYSTEM_DRAGGABLE",
          definition,
        },
      },
    });

    const templateId = created?.data?.id;
    if (!templateId) throw new Error("Klaviyo returned no template id");

    await supabase.from("campaigns")
      .update({ klaviyo_template_id: templateId })
      .eq("id", campaignId);

    return new Response(JSON.stringify({
      success: true,
      templateId,
      editUrl: `https://www.klaviyo.com/template/${templateId}/edit`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[push-image-email-klaviyo] error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});