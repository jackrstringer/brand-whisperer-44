import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { brandId } = await req.json();
    if (!brandId) throw new Error("brandId is required");

    const { data: intel } = await supabase
      .from("brand_intelligence")
      .select("klaviyo_report")
      .eq("brand_id", brandId)
      .single();

    if (!intel?.klaviyo_report) throw new Error("No Klaviyo report found");

    console.log("[compile-klaviyo] Compiling context for brand", brandId);

    // Update sync_status to 'compiling'
    await supabase.from("klaviyo_connections").update({ sync_status: "compiling" }).eq("brand_id", brandId);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: `Convert the following Klaviyo performance report into a concise prose briefing optimized for injection into an AI email generation prompt. Write it as a strategist briefing a copywriter. Cover: what offer types and subject line patterns this audience responds to, best performing campaign types, what to avoid, send timing, and the top 3 subject line examples with their open rates. Max 800 tokens. Be specific.

Report: ${JSON.stringify(intel.klaviyo_report)}`,
        }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errBody}`);
    }

    const result = await response.json();
    const compiled = result.content?.[0]?.text || "";

    // Save compiled context
    await supabase.from("brand_intelligence").update({
      klaviyo_compiled: compiled,
    }).eq("brand_id", brandId);

    console.log("[compile-klaviyo] Context saved. Setting status to complete...");

    // Mark sync as complete
    await supabase.from("klaviyo_connections").update({ sync_status: "complete", sync_error: null }).eq("brand_id", brandId);

    // Trigger compile-brand-context to regenerate master compiled_context
    try {
      await fetch(`${supabaseUrl}/functions/v1/compile-brand-context`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ brandId }),
      });
    } catch (e) {
      console.warn("[compile-klaviyo] Failed to trigger master compile:", e);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[compile-klaviyo] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
