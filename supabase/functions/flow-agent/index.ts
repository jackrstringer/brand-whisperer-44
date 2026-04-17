import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FLOW_SKILL_FILES: Record<string, string[]> = {
  welcome: ["welcome-flow.md", "welcome-templates.md"],
  abandoned_checkout: ["abandoned-checkout-flow.md"],
  post_purchase: ["post-purchase-flow.md"],
  browse_abandonment: ["browse-abandonment-flow.md"],
  winback: ["winback-flow.md"],
};

async function readSkill(filename: string): Promise<string> {
  try {
    const url = new URL(`../_shared/flow-skills/${filename}`, import.meta.url);
    return await Deno.readTextFile(url);
  } catch (err) {
    console.error(`[flow-agent] Failed to read skill ${filename}:`, err);
    return "";
  }
}

const INTEL_SELECT = "compiled_context, klaviyo_compiled, ai_research, research_status";

async function invokeInternalFunction(name: string, payload: Record<string, unknown>) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Backend environment not configured");

  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`${name} failed: ${errorText.slice(0, 300)}`);
  }

  return res;
}

async function pollBrandIntelligence(
  sb: ReturnType<typeof createClient>,
  brandId: string,
  predicate: (intel: any) => boolean,
  timeoutMs = 120000
) {
  const startedAt = Date.now();
  let lastStatus = "unknown";

  while (Date.now() - startedAt < timeoutMs) {
    const { data, error } = await sb
      .from("brand_intelligence")
      .select(INTEL_SELECT)
      .eq("brand_id", brandId)
      .maybeSingle();

    if (error) throw error;
    lastStatus = data?.research_status || "unknown";

    if (lastStatus === "failed") {
      throw new Error("Brand research failed. Re-run brand intelligence, then try Flow Mode again.");
    }

    if (data && predicate(data)) return data;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(`Timed out while preparing brand context (last status: ${lastStatus}).`);
}

async function ensureCompiledContext({
  sb,
  brandId,
  brandName,
  domain,
  existingIntel,
}: {
  sb: ReturnType<typeof createClient>;
  brandId: string;
  brandName: string;
  domain: string | null | undefined;
  existingIntel: any;
}) {
  if (existingIntel?.compiled_context?.trim()) return existingIntel;

  if (existingIntel?.research_status === "compiling") {
    return await pollBrandIntelligence(sb, brandId, (intel) => !!intel?.compiled_context?.trim());
  }

  if (existingIntel?.research_status === "researching") {
    await pollBrandIntelligence(
      sb,
      brandId,
      (intel) => !!intel?.ai_research || intel?.research_status === "ai_complete",
      180000
    );
    await invokeInternalFunction("compile-brand-context", { brand_id: brandId });
    return await pollBrandIntelligence(sb, brandId, (intel) => !!intel?.compiled_context?.trim());
  }

  if (!existingIntel?.ai_research) {
    if (!domain?.trim()) {
      throw new Error("A website URL is required before Flow Mode can research and build a custom skeleton.");
    }

    await invokeInternalFunction("research-brand", {
      brand_id: brandId,
      brand_name: brandName,
      domain,
    });

    await pollBrandIntelligence(
      sb,
      brandId,
      (intel) => !!intel?.ai_research || intel?.research_status === "ai_complete",
      180000
    );
  }

  await invokeInternalFunction("compile-brand-context", { brand_id: brandId });
  return await pollBrandIntelligence(sb, brandId, (intel) => !!intel?.compiled_context?.trim());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { flow_id, brand_id, message, flow_type, current_skeleton } = await req.json();

    if (!flow_id || !brand_id || !flow_type || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load skills
    const flowSkillFiles = FLOW_SKILL_FILES[flow_type] || [];
    const [baseSkill, designLibrary, ...flowSkills] = await Promise.all([
      readSkill("base-flow.md"),
      readSkill("email-design-element-library.md"),
      ...flowSkillFiles.map(readSkill),
    ]);

    // Load brand context
    const [{ data: brandIntel }, { data: klaviyoConn }, { data: brand }, { data: flowRow }] =
      await Promise.all([
        sb
          .from("brand_intelligence")
          .select(`${INTEL_SELECT}`)
          .eq("brand_id", brand_id)
          .maybeSingle(),
        sb
          .from("klaviyo_connections")
          .select("cached_stats")
          .eq("brand_id", brand_id)
          .maybeSingle(),
        sb.from("brands").select("name, industry, website_url").eq("id", brand_id).maybeSingle(),
        sb.from("flows").select("messages, skeleton_markdown").eq("id", flow_id).maybeSingle(),
      ]);

    const isInit = message === "__FLOW_INIT__";
    const isRestart = message === "__FLOW_RESTART__";
    const bootingFreshFlow = isInit || isRestart;
    const conversation: Array<{ role: string; content: string }> = isRestart
      ? []
      : Array.isArray(flowRow?.messages)
        ? (flowRow!.messages as any)
        : [];

    const preparedIntel = bootingFreshFlow && !current_skeleton
      ? await ensureCompiledContext({
          sb,
          brandId: brand_id,
          brandName: brand?.name || "Unknown brand",
          domain: brand?.website_url,
          existingIntel: brandIntel,
        })
      : brandIntel;

    const systemPrompt = `You are an elite Klaviyo email flow strategist for DTC brands. You build BRIEF, structural flow skeletons — NOT copy.

SKILL DOCUMENTS (reference only — strategic principles, not copy templates):
${baseSkill}

FLOW-SPECIFIC SKILL (reference only — extract structure, IGNORE the per-email "Subject line direction / Sections / Copy spec" verbose format; use the BRACKET FORMAT below instead):
${flowSkills.filter(Boolean).join("\n\n---\n\n")}

DESIGN ELEMENT LIBRARY (reference only — name elements, do not write copy):
${designLibrary}

BRAND:
${brand?.name || "Unknown"} — Industry: ${brand?.industry || "Unknown"}

BRAND INTELLIGENCE (your source of truth — READ IT FULLY before deciding what to ask):
${preparedIntel?.compiled_context || "(no compiled brand intelligence yet)"}

KLAVIYO PERFORMANCE DATA:
${preparedIntel?.klaviyo_compiled || "(no klaviyo data)"}

CORE PRINCIPLE — RESEARCH FIRST, ASK LAST:
The brand intelligence above is the result of deep research. Before you ask ANY question, you MUST:
1. Read the brand intelligence end-to-end.
2. Extract every fact relevant to this flow type (hero products, offers, codes, proof points, objections, send times, voice).
3. Make every strategic decision yourself (email count, timing, cadence, hooks, sequencing, channel).
4. Only ask the user about things that are GENUINELY missing or AMBIGUOUS in the research AND that only the user can answer.

If the hero product, primary offer, social proof, and core value props are already in the research, you have enough — generate the skeleton immediately. Do NOT ask "which product should we feature?" if the research names a clear hero product. Do NOT ask about discount strength if known welcome codes are listed. Do NOT ask about positioning if the brand voice and objections are documented.

CONVERSATION RULES (CRITICAL):
- YOU are the email marketing expert. Never ask the user to make strategic decisions.
- ONE question at a time, only when truly blocking.
- Be terse. No preamble, no recap of brand intelligence in prose, no "great question" filler.
- NEVER ask whether they have an existing flow — assume net new.
- NEVER ask about facts that already appear in the brand intelligence above. Re-read before asking.
- If you find yourself wanting to ask something, first quote the relevant line from the brand intelligence in your reasoning. If you can quote it, you do not need to ask.

RESPONSE FORMAT — BRAND SYNTHESIS BLOCK (use on the FIRST turn or when re-orienting):
Before any question or skeleton, output a tight synthesis block in this exact shape (a fenced \`flow-synth\` JSON block):

\`\`\`flow-synth
{
  "headline": "One-line strategic angle for this flow.",
  "facts": [
    {"label": "Hero product", "value": "Larineco Remineralizing Gum — $29.99"},
    {"label": "Welcome offer", "value": "25% off (code: WELCOME25)"},
    {"label": "Top objection", "value": "Subscription anxiety"},
    {"label": "Best send window", "value": "4:30–8pm Tue/Sun/Sat"}
  ],
  "plan": [
    "E1 (immediate) — Welcome + offer reveal, hero product, dentist proof.",
    "E2 (24h) — Address subscription anxiety, transparency, easy-cancel guarantee.",
    "E3 (48h) — Founder/origin story + Andrew Habib endorsement.",
    "E4 (72h) — Last-call urgency, social proof carousel."
  ]
}
\`\`\`

- "facts": 3–6 short label/value pairs of the most decision-critical facts you extracted from the brand intelligence. The UI renders these as pills.
- "plan": 3–6 short lines describing the flow structure you've decided on. The UI renders this as a clean numbered list.
- After the synth block, either generate the skeleton (if you have enough) or ask ONE clarifying question.

QUESTION FORMAT (use only when truly necessary):
Output exactly one fenced code block per turn:

\`\`\`flow-question
{
  "question": "Short, specific question.",
  "options": ["Option 1", "Option 2", "Option 3"],
  "allow_other": true
}
\`\`\`

- 2–5 short labels (≤5 words each).
- "allow_other": true shows a free-text fallback.
- Omit the block (plain text) only for genuinely open-ended questions.
- Never repeat the question text outside the block.

SKELETON GENERATION:
- When you have enough info, output the complete flow skeleton in the format from base-flow.md, wrapped in \`\`\`flow-skeleton.
- When a skeleton exists and the user requests changes, return the FULL updated skeleton in the same fence.
- Reference design elements by their exact names from the library.

CURRENT SKELETON:
${current_skeleton || "(none yet — build from scratch when ready)"}`;

    // Build messages array
    const messages = [
      ...conversation.map((m) => ({ role: m.role, content: m.content })),
    ];
    if (bootingFreshFlow && conversation.length === 0) {
      messages.push({
        role: "user",
        content: `Begin building a ${flow_type.replace(/_/g, " ")} flow for this brand. First, synthesize the actual researched brand context you were given. If there is enough information, generate the full custom skeleton immediately in a single response. Only ask one clarifying question if a missing brand-specific fact truly blocks you. Do not ask a generic template question before doing the research-based synthesis. No greetings. No recap. No placeholder defaults.`,
      });
    } else if (!isInit && !isRestart) {
      messages.push({ role: "user", content: message });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (obj: unknown) =>
          controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

        let fullText = "";
        try {
          if (bootingFreshFlow) {
            send({ type: "progress", stage: "reading", label: "Reading brand research" });
            await new Promise((r) => setTimeout(r, 150));
            send({ type: "progress", stage: "analyzing", label: "Analyzing performance data" });
            await new Promise((r) => setTimeout(r, 150));
            send({ type: "progress", stage: "strategizing", label: "Designing flow strategy" });
          }

          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-5-20250929",
              max_tokens: 8000,
              system: systemPrompt,
              messages,
              stream: true,
            }),
          });

          if (!res.ok || !res.body) {
            const errText = await res.text();
            console.error("[flow-agent] Anthropic error:", res.status, errText);
            send({ type: "error", error: `Anthropic ${res.status}: ${errText.slice(0, 300)}` });
            controller.close();
            return;
          }

          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() || "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (!data || data === "[DONE]") continue;
              try {
                const evt = JSON.parse(data);
                if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                  const chunk = evt.delta.text || "";
                  fullText += chunk;
                  send({ type: "text", content: chunk });
                }
              } catch {}
            }
          }

          // Persist conversation + extract skeleton
          const newConversation = [
            ...conversation,
            ...(bootingFreshFlow && conversation.length === 0
              ? []
              : [{ role: "user", content: message, ts: new Date().toISOString() }]),
            { role: "assistant", content: fullText, ts: new Date().toISOString() },
          ];

          const skeletonMatch = fullText.match(/```flow-skeleton\s*([\s\S]*?)```/);
          const updates: Record<string, unknown> = {
            messages: newConversation,
            updated_at: new Date().toISOString(),
          };
          if (skeletonMatch) {
            updates.skeleton_markdown = skeletonMatch[1].trim();
            updates.status = "skeleton_ready";
          }

          await sb.from("flows").update(updates).eq("id", flow_id);
          send({ type: "done", skeleton_updated: !!skeletonMatch });
          controller.close();
        } catch (err: any) {
          console.error("[flow-agent] Stream error:", err);
          send({ type: "error", error: err.message || "Unknown error" });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    console.error("[flow-agent] Top-level error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
