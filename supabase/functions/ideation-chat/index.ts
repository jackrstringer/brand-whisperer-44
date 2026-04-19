import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { DESIGN_ELEMENT_LIBRARY_COMPACT } from "../_shared/emailCopywriterSkill.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function fmt(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(fmt).filter(Boolean).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => { const f = fmt(v); return f ? `${k.replace(/_/g, " ")}: ${f}` : ""; })
      .filter(Boolean).join("; ");
  }
  return String(value);
}

function buildResearchExcerpt(ai: Record<string, any>): string {
  const parts: string[] = [];
  const bo = ai.brand_overview || {};
  const pl = ai.product_landscape || {};
  const ci = ai.customer_intelligence || {};

  if (bo.primary_category) parts.push(`Category: ${fmt(bo.primary_category)}`);
  if (bo.brand_positioning) parts.push(`Positioning: ${fmt(bo.brand_positioning)}`);
  if (bo.brand_voice_and_tone) parts.push(`Voice: ${fmt(bo.brand_voice_and_tone)}`);
  if (bo.target_demographic) parts.push(`Audience: ${fmt(bo.target_demographic)}`);

  if (pl.hero_products && Array.isArray(pl.hero_products)) {
    const names = pl.hero_products.map((p: any) => p.name).filter(Boolean);
    if (names.length) parts.push(`Hero products: ${names.join(", ")}`);
  }

  if (ci.primary_pain_points_solved && Array.isArray(ci.primary_pain_points_solved)) {
    parts.push(`Pain points: ${ci.primary_pain_points_solved.join(", ")}`);
  }

  return parts.length > 0 ? `\n\nBrand research:\n${parts.join("\n")}` : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { brand_id, message, history } = await req.json();
    if (!brand_id || !message) {
      return new Response(JSON.stringify({ error: "brand_id and message required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load brand context
    const [brandResult, intelResult, profileResult, campaignsResult] = await Promise.all([
      supabase.from("brands").select("name, industry, website_url").eq("id", brand_id).single(),
      supabase.from("brand_intelligence").select("compiled_context, merged_profile, ai_research").eq("brand_id", brand_id).single(),
      supabase.from("brand_profiles").select("raw_extraction").eq("brand_id", brand_id).single(),
      supabase.from("campaigns").select("name").eq("brand_id", brand_id).order("created_at", { ascending: false }).limit(10),
    ]);

    const brand = brandResult.data;
    const intel = intelResult.data as any;
    const profile = profileResult.data;
    const pastCampaigns = campaignsResult.data || [];

    const brandName = brand?.name || "Unknown Brand";
    const industry = brand?.industry ? ` in the ${brand.industry} industry` : "";
    const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    // Build voice context
    let voiceContext = "";
    if (profile?.raw_extraction) {
      const rx = profile.raw_extraction as any;
      if (rx.voice) {
        const parts: string[] = [];
        if (rx.voice.tone_descriptors) parts.push(`Tone: ${Array.isArray(rx.voice.tone_descriptors) ? rx.voice.tone_descriptors.join(", ") : rx.voice.tone_descriptors}`);
        if (rx.voice.headline_style) parts.push(`Headline style: ${rx.voice.headline_style}`);
        if (rx.voice.cta_style) parts.push(`CTA style: ${rx.voice.cta_style}`);
        if (parts.length) voiceContext = `\nBrand voice: ${parts.join(". ")}`;
      }
    }

    const pastCampaignContext = pastCampaigns.length > 0
      ? `\nRecent campaigns: ${pastCampaigns.map((c: any) => c.name).join(", ")}`
      : "";

    // Use compiled_context if available, otherwise build excerpt from nested ai_research
    let compiledExcerpt = "";
    if (intel?.compiled_context) {
      compiledExcerpt = `\n\nBrand brief:\n${intel.compiled_context.slice(0, 1500)}`;
    } else if (intel?.ai_research && typeof intel.ai_research === "object") {
      compiledExcerpt = buildResearchExcerpt(intel.ai_research as Record<string, any>);
    }

    const systemPrompt = `You are a senior creative strategist at a top-tier agency, helping brainstorm email marketing campaigns for ${brandName}${industry}.

Today is ${today}. Factor in seasonality, upcoming holidays, and cultural timing.
${voiceContext}${pastCampaignContext}${compiledExcerpt}

${DESIGN_ELEMENT_LIBRARY_COMPACT}

Your role is to give sharp, strategic guidance — not generic advice. When the user gives a direction, acknowledge it and add ONE specific strategic insight they might not have considered. When useful, name specific design block(s) from the library above (by slug) that would carry the message — e.g. "lead with a feature-checklist-matrix and close with a founder-expert-quote-card." Be conversational but substantive.

Keep responses to 2-3 sentences max. Be direct, skip pleasantries. Reference the brand's actual products, voice, and past work when relevant. New campaign ideas based on their direction will be generated alongside your response, so don't list out ideas yourself — focus on strategic framing.`;

    // Build messages
    const messages: Array<{ role: string; content: string }> = [];
    if (history && Array.isArray(history)) {
      for (const entry of history.slice(-10)) {
        messages.push({
          role: entry.role === "user" ? "user" : "assistant",
          content: entry.content,
        });
      }
    }
    messages.push({ role: "user", content: message });

    // Call Claude Haiku 4.5
    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 16384,
        stream: true,
        system: systemPrompt,
        messages,
      }),
    });

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      console.error("[ideation-chat] Anthropic error:", anthropicResp.status, errText);
      throw new Error(`Anthropic API error: ${anthropicResp.status}`);
    }

    // Stream SSE text tokens
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          const reader = anthropicResp.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;

              try {
                const event = JSON.parse(data);
                const text = event.delta?.text || event.delta?.content?.[0]?.text || "";
                if (text) {
                  controller.enqueue(encoder.encode(`event: text\ndata: ${JSON.stringify({ token: text })}\n\n`));
                }
              } catch {}
            }
          }

          controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
          controller.close();
        } catch (err) {
          console.error("[ideation-chat] Stream error:", err);
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    console.error("[ideation-chat] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
