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
function buildTemplateDefinition(slices: any[], name: string) {
  // Group slices by row_index (falls back to position for legacy image_slices mode
  // that pre-dates the row/column columns).
  const rowsMap = new Map<number, any[]>();
  for (const s of slices) {
    const rowKey = typeof s.row_index === "number" ? s.row_index : s.position;
    if (!rowsMap.has(rowKey)) rowsMap.set(rowKey, []);
    rowsMap.get(rowKey)!.push(s);
  }
  const orderedRowKeys = Array.from(rowsMap.keys()).sort((a, b) => a - b);

  const buildImageBlock = (s: any) => ({
    content_type: "block",
    type: "image",
    data: {
      properties: {
        alt_text: s.region_label || s.headline_copy || name,
        href: s.cta_url || "",
        src: s.image_url,
        dynamic: false,
      },
      styles: {
        block_padding_top: "0px",
        block_padding_bottom: "0px",
        block_padding_left: "0px",
        block_padding_right: "0px",
      },
      display_options: {},
    },
  });

  // Klaviyo column layouts. Multi-column rows use equal-width layouts and
  // disable mobile stacking so the horizontal split survives on mobile.
  const COLUMN_LAYOUT: Record<number, string> = {
    1: "1-column-full-width",
    2: "2-columns-equal",
    3: "3-columns-equal",
    4: "4-columns-equal",
  };

  const templateRows = orderedRowKeys.map((rk) => {
    const rowSlices = rowsMap.get(rk)!.sort((a, b) => (a.column_index ?? 0) - (b.column_index ?? 0));
    const cols = Math.min(4, Math.max(1, rowSlices[0]?.columns_in_row || rowSlices.length || 1));
    const layout = COLUMN_LAYOUT[cols] || "1-column-full-width";

    if (cols === 1) {
      return {
        data: { styles: { column_layout: layout } },
        columns: [{ data: {}, blocks: rowSlices.map(buildImageBlock) }],
      };
    }

    // Multi-column row: one image block per column, no mobile stacking.
    return {
      data: {
        styles: {
          column_layout: layout,
          stack_on_mobile: false,
        },
      },
      columns: rowSlices.slice(0, cols).map((s) => ({
        data: {},
        blocks: [buildImageBlock(s)],
      })),
    };
  });

  return {
    body: {
      properties: {},
      styles: { background_color: "#ffffff" },
      sections: [{
        content_type: "section",
        type: "section",
        data: { properties: {}, display_options: {}, styles: {} },
        rows: templateRows,
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