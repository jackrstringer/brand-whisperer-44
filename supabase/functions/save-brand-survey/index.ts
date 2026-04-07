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
    const { brand_id, survey_answers } = await req.json();
    if (!brand_id || !survey_answers) {
      return new Response(JSON.stringify({ error: "brand_id and survey_answers required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Upsert survey answers
    const { error: upsertError } = await supabase
      .from("brand_intelligence")
      .upsert({
        brand_id,
        survey_answers,
        research_status: "survey_complete",
        last_surveyed_at: new Date().toISOString(),
      }, { onConflict: "brand_id" });

    if (upsertError) {
      console.error("[save-brand-survey] Upsert error:", upsertError);
      throw new Error(`Database error: ${upsertError.message}`);
    }

    // Fire-and-forget: compile brand context
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    fetch(`${supabaseUrl}/functions/v1/compile-brand-context`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ brand_id }),
    }).catch((err) => console.error("[save-brand-survey] compile fire-and-forget error:", err));

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[save-brand-survey] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
