import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { generateCampaignCore } from "../_shared/generateCampaignCore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Declare Deno's EdgeRuntime for background tasks (Supabase edge runtime)
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

async function runGeneration(body: any, campaignId: string, genStartedAt: string) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  try {
    const { html } = await generateCampaignCore(body, supabase);

    // Derive a short campaign name
    const { data: existingCamp } = await supabase
      .from("campaigns")
      .select("name")
      .eq("id", campaignId)
      .single();

    const existingNameRaw = (existingCamp?.name || "").trim();
    const DEFAULT_NAMES = ["new campaign", "untitled campaign", "untitled", ""];
    const isDefaultName = DEFAULT_NAMES.includes(existingNameRaw.toLowerCase());

    let campaignName = existingNameRaw;
    if (isDefaultName) {
      if (body.brief && body.brief.trim().length > 3) {
        const briefWords = body.brief.trim().split(/\s+/);
        campaignName = briefWords.length <= 7 ? body.brief.trim() : briefWords.slice(0, 7).join(" ");
      } else {
        const h1Match = html.match(/<(?:h1|h2)[^>]*>([\s\S]*?)<\/(?:h1|h2)>/i);
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const rawTitle = (h1Match?.[1] || titleMatch?.[1] || "").replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").replace(/\s+/g, " ").trim();
        const titleWords = rawTitle.split(/\s+/);
        if (rawTitle.length > 3) {
          campaignName = titleWords.length <= 7 ? rawTitle : titleWords.slice(0, 7).join(" ");
        } else {
          const goalLabels: Record<string, string> = { promotional: "Promotional Campaign", educational: "Educational Campaign", "re-engagement": "Re-engagement Campaign", seasonal: "Seasonal Campaign", welcome: "Welcome Email", social_proof: "Social Proof Campaign", highlight: "Brand Highlight", product_launch: "Product Launch", abandoned_cart: "Abandoned Cart", win_back: "Win-back Campaign", newsletter: "Newsletter", announcement: "Announcement" };
          campaignName = goalLabels[body.goal] || "Campaign";
        }
      }
    }

    const durationSecs = Math.round((Date.now() - new Date(genStartedAt).getTime()) / 1000);

    await supabase.from("campaigns").update({
      html, status: "ready", brief: body.brief, goal: body.goal, name: campaignName, generation_duration_secs: durationSecs,
      ...(body.campaignMode === "flow" && body.flowConfig ? { flow_config: { ...body.flowConfig, klaviyo_synced_at: body.flowConfig.klaviyo_synced_at || new Date().toISOString() } } : {}),
    }).eq("id", campaignId);

    await supabase.from("chat_messages").insert({
      campaign_id: campaignId, role: "system", content: "Campaign generated",
    });
    console.log(`[generate-campaign] Background generation complete for ${campaignId} in ${durationSecs}s`);
  } catch (err: any) {
    console.error("[generate-campaign] Background error:", err);
    try {
      await supabase.from("campaigns").update({ status: "error" }).eq("id", campaignId);
    } catch {}
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { campaignId, _isSubGeneration } = body;

    // Sub-generation mode: still synchronous (used internally by other functions that expect { html })
    if (_isSubGeneration) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { html } = await generateCampaignCore(body, supabase);
      return new Response(JSON.stringify({ html }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Top-level mode: kick off in background, return immediately so we don't hit the 150s edge timeout.
    // Callers should poll the `campaigns` table for status === "ready" or "error".
    if (!campaignId) {
      return new Response(JSON.stringify({ error: "campaignId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const genStartedAt = new Date().toISOString();
    await supabase.from("campaigns").update({
      status: "generating", generation_started_at: genStartedAt, generation_duration_secs: null,
    }).eq("id", campaignId);

    // Run the heavy work as a background task. EdgeRuntime.waitUntil keeps the
    // worker alive after the response is sent, so multi-minute Opus calls can finish.
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(runGeneration(body, campaignId, genStartedAt));
    } else {
      // Fallback for local/dev where EdgeRuntime isn't defined
      runGeneration(body, campaignId, genStartedAt);
    }

    return new Response(JSON.stringify({
      status: "generating",
      campaignId,
      message: "Generation started. Poll the campaigns table for status === 'ready'.",
    }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[generate-campaign] Top-level error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
