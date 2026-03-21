import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { campaignId, message, currentHtml } = await req.json();

    // Fetch campaign
    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();
    if (cErr || !campaign) throw new Error("Campaign not found");

    // Fetch brand profile
    const { data: profile, error: pErr } = await supabase
      .from("brand_profiles")
      .select("*")
      .eq("brand_id", campaign.brand_id)
      .single();
    if (pErr || !profile) throw new Error("Brand profile not found");

    // Fetch top 3 reference images
    const imageBlocks: any[] = [];
    const urls = (profile.reference_image_urls || []).slice(0, 3);
    for (const url of urls) {
      try {
        const imgResp = await fetch(url);
        const buf = await imgResp.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        imageBlocks.push({
          type: "image",
          source: { type: "base64", media_type: "image/png", data: b64 },
        });
      } catch { /* skip */ }
    }

    const systemMsg = `You are editing an existing HTML email.
Apply only the change described. Do not rewrite sections not mentioned.
Maintain all inline styles, table structure, and Gmail dark mode fixes.
The email must continue to match the brand reference images.
Return only the complete updated HTML. No commentary. No markdown fences.`;

    const userContent: any[] = [];
    if (imageBlocks.length > 0) userContent.push(...imageBlocks);
    userContent.push({
      type: "text",
      text: `Brand rules: ${profile.system_prompt}\n\nCurrent HTML:\n${currentHtml}\n\nChange requested: ${message}\n\nReturn only the updated HTML.`,
    });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 8192,
        system: systemMsg,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    let html = result.content?.[0]?.text || "";
    html = html.replace(/^```html?\n?/i, "").replace(/\n?```$/i, "").trim();

    // Append previous HTML to history
    const history = Array.isArray(campaign.html_history) ? campaign.html_history : [];
    history.push(campaign.html);

    // Update campaign
    await supabase.from("campaigns").update({
      html,
      html_history: history,
    }).eq("id", campaignId);

    // Save chat messages
    await supabase.from("chat_messages").insert([
      { campaign_id: campaignId, role: "user", content: message },
      { campaign_id: campaignId, role: "assistant", content: "Changes applied." },
    ]);

    return new Response(JSON.stringify({ html }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
