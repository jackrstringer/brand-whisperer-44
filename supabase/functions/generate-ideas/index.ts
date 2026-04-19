import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CHAOS_ANCHORS = [
  "Channel the energy of vintage Apple advertising — bold, simple, iconic.",
  "Think 90s infomercial confidence but with modern taste.",
  "Wes Anderson art direction meets email — quirky, specific, beautifully composed.",
  "Patagonia catalog vibes — earnest, outdoorsy, quietly anti-corporate.",
  "Glossier's friend-to-friend intimacy.",
  "Nike manifesto energy — declarative, empowering, rhythmic.",
  "Oatly's irreverent, fourth-wall-breaking voice.",
  "J. Peterman catalog storytelling — romantic, detailed, transporting.",
  "Supreme drop energy — scarcity, coolness, zero explanation.",
  "Mailchimp's playful warmth.",
  "The Economist poster wit — smart, dry, rewards the reader.",
  "Liquid Death's absurdist commitment to the bit.",
  "Sony 90s campaign energy — cinematic, aspirational, emotionally charged.",
  "VW 'Think Small' minimalism — honest, self-aware, understated confidence.",
  "Got Milk? problem-first framing — make them feel the absence before the solution.",
  "Old Spice absurdist confidence — over-the-top, self-aware, impossible to ignore.",
  "Absolut Vodka visual concept commitment — one idea, executed endlessly.",
];

// ─── URL ENRICHMENT ─────────────────────────────────────────────────────────

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;

async function fetchUrlContent(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LucyBot/1.0)" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) return null;
    let html = await resp.text();
    html = html.replace(/<(script|style|nav|footer|header|noscript)[^>]*>[\s\S]*?<\/\1>/gi, "");
    let text = html.replace(/<[^>]+>/g, " ");
    text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
    text = text.replace(/\s+/g, " ").trim();
    return text.slice(0, 4000);
  } catch {
    return null;
  }
}

async function enrichTextWithUrls(text: string): Promise<string> {
  const urls = text.match(URL_REGEX);
  if (!urls || urls.length === 0) return text;
  const unique = [...new Set(urls)].slice(0, 3);
  const results = await Promise.all(unique.map(async (url) => {
    const content = await fetchUrlContent(url);
    return content ? { url, content } : null;
  }));
  const fetched = results.filter(Boolean) as { url: string; content: string }[];
  if (fetched.length === 0) return text;
  let enriched = text;
  for (const r of fetched) {
    enriched += `\n\n--- Content from ${r.url} ---\n${r.content}\n--- End content ---`;
  }
  return enriched;
}

const RESEARCH_PROMPTS: Record<string, (brand: string, industry: string, products: string, audience: string) => string> = {
  "Social Proof": (brand, industry, products, audience) =>
    `Find recent customer reviews, testimonials, and UGC for ${brand} (${industry}). Products: ${products}. Target audience: ${audience}.`,
  "FAQ/Overcoming Objections": (brand, industry, products, audience) =>
    `Find the most common customer objections, hesitations, and FAQs about ${brand} in the ${industry} space. Products: ${products}. Target audience: ${audience}. Focus on real purchase barriers.`,
  'Press/"As Seen In"': (brand, industry) =>
    `Find recent press mentions, media coverage, and editorial features about ${brand} in the ${industry} industry.`,
  "Loyalty Program": (brand) =>
    `Find details about ${brand}'s loyalty or rewards program — tiers, points system, perks, how it works.`,
  "Comparison": (brand, industry) =>
    `Find ${brand}'s main competitors and key differentiators in the ${industry} space.`,
};

function sseEncode(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function doResearch(
  campaignType: string,
  brandName: string,
  industry: string,
  products: string,
  audience: string,
  websiteUrl: string,
): Promise<string | null> {
  const promptFn = RESEARCH_PROMPTS[campaignType];
  if (!promptFn) return null;

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    console.error("[generate-ideas] ANTHROPIC_API_KEY not set — cannot run web research");
    return null;
  }

  // Build a research prompt that forces real web search anchored to the brand domain
  const domainHint = websiteUrl ? ` (official site: ${websiteUrl})` : "";
  const basePrompt = promptFn(brandName, industry, products, audience);
  const userPrompt = `${basePrompt}

CRITICAL: Use the web_search tool to find REAL, CURRENT information. Do not hallucinate.
- The brand is "${brandName}"${domainHint}.
- Always include the brand name${websiteUrl ? ` and/or domain (${websiteUrl})` : ""} in your search queries to disambiguate from unrelated companies with similar names.
- If you cannot find real evidence after multiple searches, say so explicitly — do not invent press mentions, reviews, competitors, or program details.

Return a concise factual brief (≤500 words) with bullet points and direct quotes/links where useful. No fluff.`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 4096,
        system: "You are a marketing researcher. Use the web_search tool aggressively to find real, current, brand-specific information. Never fabricate facts. Always disambiguate brands with generic names by including the official domain in queries.",
        tools: [
          { type: "web_search_20250305", name: "web_search", max_uses: 8 },
        ],
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[generate-ideas] Anthropic web_search error:", resp.status, errText);
      return null;
    }

    const result = await resp.json();
    const textBlocks = (result.content || []).filter((b: any) => b.type === "text");
    const text = textBlocks.map((b: any) => b.text).join("\n").trim();
    console.log(`[generate-ideas] Web research complete for "${campaignType}" — ${text.length} chars`);
    return text || null;
  } catch (err) {
    console.error("[generate-ideas] Research error:", err);
    return null;
  }
}

async function getFatigueConstraints(supabase: any, brandId: string): Promise<string> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: decisions } = await supabase
    .from("creative_decisions")
    .select("decision_type, value")
    .eq("brand_id", brandId)
    .gte("created_at", thirtyDaysAgo);

  if (!decisions || decisions.length === 0) return "";

  // Count usage
  const counts: Record<string, number> = {};
  for (const d of decisions) {
    const key = `${d.decision_type}:${d.value}`;
    counts[key] = (counts[key] || 0) + 1;
  }

  const overused = Object.entries(counts)
    .filter(([, count]) => count >= 3)
    .map(([key]) => key.split(":").slice(1).join(":"));

  const knownAngles = ["urgency", "scarcity", "social_proof", "educational", "behind_the_scenes", "seasonal", "product_launch"];
  const usedAngles = new Set(decisions.filter((d: any) => d.decision_type === "angle").map((d: any) => d.value));
  const freshAngles = knownAngles.filter(a => !usedAngles.has(a));

  if (overused.length === 0 && freshAngles.length === 0) return "";

  let constraints = "\nCREATIVE FATIGUE CONSTRAINTS:\n";
  if (overused.length > 0) constraints += `AVOID (overused recently): ${overused.join(", ")}\n`;
  if (freshAngles.length > 0) constraints += `EXPLORE (fresh angles): ${freshAngles.join(", ")}\n`;
  return constraints;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    let {
      brand_id,
      brief,
      parent_ideas,
      feedback,
      mode = "initial",
      campaign_type_filter,
      campaign_subtype_filter,
      needs_research = false,
      chaos_mode = false,
      turbo_mode = false,
      stream = true,
    } = body;

    // URL enrichment: fetch and inline content from any URLs in brief/feedback
    if (brief) brief = await enrichTextWithUrls(brief);
    if (feedback) feedback = await enrichTextWithUrls(feedback);

    if (!brand_id) {
      return new Response(JSON.stringify({ error: "brand_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load brand context + intelligence status
    let { data: brandData } = await supabase
      .from("brands")
      .select("name, industry, website_url, ideation_prompt, ideation_prompt_built_at")
      .eq("id", brand_id)
      .single();

    const { data: intel } = await supabase
      .from("brand_intelligence")
      .select("research_status, last_researched_at, compiled_context, merged_profile, ai_research")
      .eq("brand_id", brand_id)
      .maybeSingle();

    const brandName = brandData?.name || "Unknown Brand";
    const industry = brandData?.industry || "consumer products";
    const researchStatus = intel?.research_status || "pending";
    const researchComplete = ["ai_complete", "complete", "survey_complete"].includes(researchStatus);

    const currentPrompt = brandData?.ideation_prompt || "";
    const promptHasCoreBrandContext = [
      "--- BRAND STRATEGY BRIEF ---",
      "--- AI RESEARCH PROFILE ---",
      "--- PRODUCTS ---",
      "Target audience:",
      "Hero products:",
      "Category:",
      "Positioning:",
    ].some((marker) => currentPrompt.includes(marker));
    const hasMergedProfile = !!intel?.merged_profile && typeof intel.merged_profile === "object" && Object.keys(intel.merged_profile as Record<string, unknown>).length > 0;
    const hasAiResearch = !!intel?.ai_research && typeof intel.ai_research === "object" && Object.keys(intel.ai_research as Record<string, unknown>).length > 0;
    const hasCoreResearchData = !!intel?.compiled_context || hasMergedProfile || hasAiResearch;

    // Check if ideation prompt needs building or rebuilding
    const promptIsMissing = !brandData?.ideation_prompt;
    const promptIsStale = researchComplete && brandData?.ideation_prompt_built_at && intel?.last_researched_at &&
      new Date(brandData.ideation_prompt_built_at) < new Date(intel.last_researched_at);
    const promptIsThin = currentPrompt.length < 300;
    const promptMissingAvailableResearch = hasCoreResearchData && !promptHasCoreBrandContext;

    if (promptIsMissing || promptIsStale || promptIsThin || promptMissingAvailableResearch) {
      console.log(`[generate-ideas] Building ideation prompt (missing=${promptIsMissing}, stale=${!!promptIsStale}, thin=${promptIsThin}, missing_core=${promptMissingAvailableResearch})`);
      const buildResp = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/build-ideation-prompt`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ brand_id }),
        },
      );
      if (!buildResp.ok) {
        console.error("[generate-ideas] Failed to build ideation prompt:", await buildResp.text());
      } else {
        const { data: refreshed } = await supabase
          .from("brands")
          .select("name, industry, website_url, ideation_prompt, ideation_prompt_built_at")
          .eq("id", brand_id)
          .single();
        if (refreshed) brandData = refreshed;
        console.log(`[generate-ideas] Built ideation prompt, length: ${brandData?.ideation_prompt?.length || 0}`);
      }
    }

    const rebuiltPrompt = brandData?.ideation_prompt || "";
    const rebuiltPromptHasCoreBrandContext = [
      "--- BRAND STRATEGY BRIEF ---",
      "--- AI RESEARCH PROFILE ---",
      "--- PRODUCTS ---",
      "Target audience:",
      "Hero products:",
      "Category:",
      "Positioning:",
    ].some((marker) => rebuiltPrompt.includes(marker));

    // Guard: never ideate from an ungrounded prompt
    if (!rebuiltPromptHasCoreBrandContext) {
      const message = researchComplete
        ? "Ideation blocked: brand context is still too thin for reliable idea generation. Re-run brand intelligence or rebuild the ideation prompt."
        : "Brand intelligence is still processing. Please wait a moment and try again.";
      return new Response(JSON.stringify({
        error: message,
        retry: !researchComplete,
      }), {
        status: researchComplete ? 409 : 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build system prompt
    let systemPrompt = rebuiltPrompt ||
      `You are a senior creative strategist at a top-tier email marketing agency. Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`;

    if (chaos_mode) {
      const anchor = CHAOS_ANCHORS[Math.floor(Math.random() * CHAOS_ANCHORS.length)];
      systemPrompt += `\n\nCREATIVE MODE ACTIVATED.\nInspiration: ${anchor}\nBreak your usual patterns. Be surprising, but keep it professional and on-brand.`;
    }

    if (mode === "bank") {
      const fatigueConstraints = await getFatigueConstraints(supabase, brand_id);
      if (fatigueConstraints) systemPrompt += fatigueConstraints;
    }

    // Research pre-step
    let researchData: string | null = null;
    if (needs_research && campaign_type_filter) {
      // Get product/audience info from merged profile
      const { data: intel } = await supabase
        .from("brand_intelligence")
        .select("merged_profile")
        .eq("brand_id", brand_id)
        .single();

      const mp = (intel?.merged_profile as any) || {};
      const products = mp.hero_products
        ? (Array.isArray(mp.hero_products) ? mp.hero_products.join(", ") : mp.hero_products)
        : "various products";
      const audience = mp.target_audience || "general consumers";

      researchData = await doResearch(campaign_type_filter, brandName, industry, products, audience, brandData?.website_url || "");
    }

    // Build user prompt based on mode
    const ideaCount = turbo_mode ? 20 : 5;
    let userPrompt = "";

    // Parse subtype from campaign_type_filter if colon-delimited
    let parsedParentType = campaign_type_filter;
    let parsedSubtype = campaign_subtype_filter;
    if (campaign_type_filter && campaign_type_filter.includes(":") && !campaign_subtype_filter) {
      const colonIndex = campaign_type_filter.indexOf(":");
      parsedParentType = campaign_type_filter.slice(0, colonIndex).trim();
      parsedSubtype = campaign_type_filter.slice(colonIndex + 1).trim();
    }

    switch (mode) {
      case "evergreen":
        userPrompt = `Generate ${ideaCount} EVERGREEN email campaign ideas for ${brandName} — a deliberately VARIED MIX of campaign types and angles (product highlight, blog/editorial, social proof, brand values, listicle, bundle, sale, FAQ, etc.). No two ideas should share the same campaign_type. Lean into the brand's actual products and positioning. These should feel like a strong evergreen lineup that could be sent any week of the year.\n`;
        if (brief) userPrompt += `Direction: ${brief}\n`;
        break;

      case "initial":
      case "bank":
        userPrompt = `Generate ${ideaCount} email campaign ideas for ${brandName}.\n`;
        if (parsedParentType) userPrompt += `Campaign type: ${parsedParentType}\n`;
        if (parsedSubtype) userPrompt += `Campaign subtype: ${parsedSubtype}\n`;
        if (brief) userPrompt += `Direction: ${brief}\n`;
        break;

      case "variations":
        userPrompt = `Create variations of these concepts — same core insight, completely different executions:\n`;
        if (parent_ideas) {
          parent_ideas.forEach((idea: any) => {
            userPrompt += `- "${idea.title}": ${idea.description}\n`;
          });
        }
        if (brief) userPrompt += `\nDirection: ${brief}\n`;
        break;

      case "feedback":
        userPrompt = `Direction: ${feedback || brief}\nBuilding on:\n`;
        if (parent_ideas) {
          parent_ideas.forEach((idea: any) => {
            userPrompt += `- "${idea.title}": ${idea.description}\n`;
          });
        }
        break;

      case "different":
        userPrompt = `Generate completely different campaign ideas for ${brandName}.\nAvoid these angles:\n`;
        if (parent_ideas) {
          parent_ideas.forEach((idea: any) => {
            userPrompt += `- "${idea.title}"\n`;
          });
        }
        if (brief) userPrompt += `\nDirection: ${brief}\n`;
        break;
    }

    // Append research data
    if (researchData) {
      userPrompt += `\n\nRESEARCH DATA (${campaign_type_filter}):\n${researchData}`;
    }

    // Output format
    if (turbo_mode) {
      userPrompt += `\n\nFor each idea, give me ONLY a title, campaign_type, and featured_design_elements (1–3 slugs from the library).\nReturn ONLY a JSON array:\n[{ "title": "…", "campaign_type": "…", "featured_design_elements": ["slug-1"] }]`;
    } else {
      userPrompt += `\n\nFor each idea, return a JSON object with these fields:
- "title": Campaign name (punchy, specific, max 8 words)
- "description": One-sentence summary (max 15 words, punchy and clear)
- "subject_line": Email subject line
- "campaign_type": The campaign type category (e.g., "Product Highlight", "Sale/Promo")
- "featured_design_elements": Array of 1–3 EXACT slugs from the design element library above (e.g. ["feature-checklist-matrix","founder-expert-quote-card"]) — the named visual blocks this email leads with.
- "campaign_info": 2-3 sentences describing what this email should contain — the key message, product focus, offer details, and structural approach. Reference the chosen design elements by name where useful. This will pre-fill the campaign brief field in the generation screen.
- "copy_direction": 1-2 sentences describing the tone, voice angle, and any specific copy hooks to use.

Return ONLY a JSON array. No other text, no markdown:
[{ "title": "…", "description": "…", "subject_line": "…", "campaign_type": "…", "featured_design_elements": ["…"], "campaign_info": "…", "copy_direction": "…" }]`;
    }

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
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      console.error("[generate-ideas] Anthropic error:", anthropicResp.status, errText);
      throw new Error(`Anthropic API error: ${anthropicResp.status}`);
    }

    if (!stream) {
      // Non-streaming: collect full response
      const fullText = await collectAnthropicStream(anthropicResp);
      const ideas = parseIdeasFromText(fullText);
      return new Response(JSON.stringify({ ideas }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SSE streaming response
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // If research happened, emit status
          if (researchData) {
            controller.enqueue(encoder.encode(sseEncode("research_status", { status: "complete" })));
          }

          const reader = anthropicResp.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let jsonBuffer = "";
          let braceDepth = 0;
          let inString = false;
          let escapeNext = false;
          let inArray = false;
          let ideaIndex = 0;
          let currentFieldKey = "";
          let currentFieldValue = "";
          let parsingFieldValue = false;

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
                const delta = event.delta?.text || event.delta?.content?.[0]?.text || "";
                if (!delta) continue;

                // Parse character by character for JSON extraction
                for (const char of delta) {
                  if (escapeNext) {
                    escapeNext = false;
                    if (parsingFieldValue) {
                      currentFieldValue += char;
                    }
                    jsonBuffer += char;
                    continue;
                  }

                  if (char === "\\") {
                    escapeNext = true;
                    if (parsingFieldValue) {
                      currentFieldValue += char;
                    }
                    jsonBuffer += char;
                    continue;
                  }

                  if (char === '"' && !escapeNext) {
                    inString = !inString;
                    jsonBuffer += char;

                    if (inString && braceDepth === 1 && !parsingFieldValue) {
                      // Starting a key or value
                      currentFieldKey = "";
                    } else if (!inString && braceDepth === 1) {
                      // Ended a string - check if it's a field key or value
                      const trimmed = jsonBuffer.trim();
                      if (parsingFieldValue) {
                        // Emit the complete field
                        const streamableFields = ["title", "description", "subject_line", "campaign_type", "campaign_info", "copy_direction", "featured_design_elements"];
                        if (streamableFields.includes(currentFieldKey)) {
                          controller.enqueue(encoder.encode(sseEncode("idea_field", {
                            index: ideaIndex,
                            field: currentFieldKey,
                            value: currentFieldValue,
                          })));
                        }
                        parsingFieldValue = false;
                        currentFieldValue = "";
                      }
                    }
                    continue;
                  }

                  if (inString) {
                    jsonBuffer += char;
                    if (parsingFieldValue) {
                      currentFieldValue += char;
                    } else if (braceDepth === 1) {
                      currentFieldKey += char;
                    }
                    continue;
                  }

                  jsonBuffer += char;

                  if (char === "[" && braceDepth === 0) {
                    inArray = true;
                    continue;
                  }

                  if (char === "{") {
                    braceDepth++;
                    if (braceDepth === 1) {
                      jsonBuffer = "{";
                      controller.enqueue(encoder.encode(sseEncode("idea_start", { index: ideaIndex })));
                    }
                    continue;
                  }

                  if (char === ":") {
                    if (braceDepth === 1 && !inString) {
                      parsingFieldValue = true;
                      currentFieldValue = "";
                    }
                    continue;
                  }

                  if (char === ",") {
                    if (braceDepth === 1 && !inString) {
                      parsingFieldValue = false;
                      currentFieldKey = "";
                      currentFieldValue = "";
                    }
                    continue;
                  }

                  if (char === "}") {
                    braceDepth--;
                    if (braceDepth === 0 && inArray) {
                      // Complete idea object
                      try {
                        const ideaObj = JSON.parse(jsonBuffer);
                        ideaObj.id = crypto.randomUUID();
                        controller.enqueue(encoder.encode(sseEncode("idea_complete", {
                          index: ideaIndex,
                          idea: ideaObj,
                        })));
                      } catch {
                        // Best effort parse failed, skip
                        console.warn("[generate-ideas] Failed to parse idea object at index", ideaIndex);
                      }
                      ideaIndex++;
                      jsonBuffer = "";
                      parsingFieldValue = false;
                      currentFieldKey = "";
                      currentFieldValue = "";
                    }
                    continue;
                  }
                }
              } catch {
                // Skip unparseable SSE lines
              }
            }
          }

          controller.enqueue(encoder.encode(sseEncode("done", {})));
          controller.close();
        } catch (err) {
          console.error("[generate-ideas] Stream error:", err);
          controller.enqueue(encoder.encode(sseEncode("error", { message: (err as Error).message })));
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
    console.error("[generate-ideas] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function collectAnthropicStream(resp: Response): Promise<string> {
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

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
        fullText += event.delta?.text || event.delta?.content?.[0]?.text || "";
      } catch {}
    }
  }
  return fullText;
}

function parseIdeasFromText(text: string): any[] {
  // Extract JSON array from response
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const ideas = JSON.parse(match[0]);
    return ideas.map((idea: any) => ({ ...idea, id: crypto.randomUUID() }));
  } catch {
    return [];
  }
}
