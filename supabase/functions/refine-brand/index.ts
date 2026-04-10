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

    const { brandId, feedback, attachmentUrls } = await req.json();
    if (!brandId || !feedback) {
      return new Response(JSON.stringify({ error: "brandId and feedback required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch current brand profile
    const { data: profile, error: profileErr } = await supabase
      .from("brand_profiles")
      .select("system_prompt")
      .eq("brand_id", brandId)
      .single();

    if (profileErr || !profile) throw new Error("Brand profile not found");

    const feedbackText = feedback
      .map((f: any) => `Q: ${f.question}\nSentiment: ${f.sentiment || "neutral"}\nDetails: ${f.text || "none"}`)
      .join("\n\n");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: `You are an expert email design system maintainer. You will receive a current brand design system prompt and user feedback about generated campaigns. Your job is to update the design system prompt to incorporate the feedback while maintaining all existing rules that weren't criticized. Return ONLY the updated system prompt text — no commentary, no markdown fences.`,
        messages: [{
          role: "user",
          content: `Current brand system prompt:\n\n${profile.system_prompt}\n\nUser feedback on generated campaigns:\n\n${feedbackText}\n\nUpdate the system prompt to incorporate this feedback. Keep all existing rules that weren't criticized. Add new rules based on the feedback. Return ONLY the updated prompt.`,
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    const updatedPrompt = result.content?.[0]?.text || profile.system_prompt;

    // Save updated system prompt
    await supabase
      .from("brand_profiles")
      .update({ system_prompt: updatedPrompt })
      .eq("brand_id", brandId);

    return new Response(JSON.stringify({ success: true, system_prompt: updatedPrompt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as any).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
