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
          .select("compiled_context, klaviyo_compiled")
          .eq("brand_id", brand_id)
          .maybeSingle(),
        sb
          .from("klaviyo_connections")
          .select("cached_stats")
          .eq("brand_id", brand_id)
          .maybeSingle(),
        sb.from("brands").select("name, industry").eq("id", brand_id).maybeSingle(),
        sb.from("flows").select("messages, skeleton_markdown").eq("id", flow_id).maybeSingle(),
      ]);

    const conversation: Array<{ role: string; content: string }> = Array.isArray(
      flowRow?.messages
    )
      ? (flowRow!.messages as any)
      : [];

    const systemPrompt = `You are an expert Klaviyo email flow strategist for DTC brands. You build complete, implementable email flow skeletons through a tight, low-friction conversation.

SKILL DOCUMENTS:
${baseSkill}

FLOW-SPECIFIC SKILL:
${flowSkills.filter(Boolean).join("\n\n---\n\n")}

DESIGN ELEMENT LIBRARY:
${designLibrary}

BRAND:
${brand?.name || "Unknown"} — Industry: ${brand?.industry || "Unknown"}

BRAND INTELLIGENCE:
${brandIntel?.compiled_context || "(no compiled brand intelligence yet)"}

KLAVIYO PERFORMANCE DATA:
${brandIntel?.klaviyo_compiled || "(no klaviyo data)"}

CONVERSATION RULES (CRITICAL):
- YOU are the email marketing expert. The user is NOT. Never ask them to make expert/strategic decisions (email count, timing, cadence, split logic, channel mix, sequencing, etc.). Decide those yourself based on best practices and brand intelligence, then TELL them what you're building.
- Only ask the user for things ONLY they can know: the specific offer/incentive (if not in brand intel), the hero product to feature (if ambiguous), brand-specific proof points you can't infer, or explicit preferences they've stated.
- Default behavior: propose the complete strategy confidently in 2–4 short bullets ("Here's what I'm building: 5 emails over 10 days, E1 immediate with offer, E2 social proof at 24h…"), then ask AT MOST ONE genuinely necessary clarifying question — or skip straight to generating the skeleton.
- ONE question at a time. Never bundle multiple questions in a single turn.
- Be terse. No preamble, no recap of brand intelligence, no "great question" filler.
- NEVER ask whether they have an existing flow to replace — assume this is always net new.
- Infer aggressively from brand intelligence. When in doubt, decide and move on rather than asking.
- Whenever a question has a finite set of likely answers, you MUST present them as clickable options using a fenced code block (see below). Do NOT list options inline as bullets/prose — emit the JSON block instead.
- After the user answers, confirm in one short line and move to the next step (or generate the skeleton).

QUESTION FORMAT (use for every question with discrete options):
Output exactly one fenced code block per turn, on its own line, with this shape:

\`\`\`flow-question
{
  "question": "What's the welcome offer?",
  "options": ["15% off", "Free shipping", "Free gift with purchase"],
  "allow_other": true
}
\`\`\`

- "options" must be 2–5 short labels (≤5 words each).
- "allow_other": true means the UI also shows a free-text "Something else?" box.
- For genuinely open-ended questions where there are no good preset options, omit the code block and just ask in plain text.
- Never repeat the question text outside the code block — the UI renders it from the JSON.

SKELETON GENERATION:
- When you have enough info, generate the complete flow skeleton in the format from base-flow.md.
- Wrap the skeleton in a \`\`\`flow-skeleton code fence so the UI can parse it.
- When a skeleton exists and the user requests changes, return the full updated skeleton in the same code fence.
- Reference design elements by their exact names from the library (e.g. [Review Card], [Scrolling Benefits Banner]).

CURRENT SKELETON:
${current_skeleton || "(none yet — build from scratch when ready)"}`;

    // Build messages array
    const isInit = message === "__FLOW_INIT__";
    const messages = [
      ...conversation.map((m) => ({ role: m.role, content: m.content })),
    ];
    if (isInit && conversation.length === 0) {
      messages.push({
        role: "user",
        content: `Begin building a ${flow_type.replace(/_/g, " ")} flow. Skip any greeting, brand recap, or preamble. Ask ONLY your first clarifying question, following the QUESTION FORMAT rules (use a flow-question JSON block when there are discrete options). If brand intelligence already covers everything, generate the skeleton directly.`,
      });
    } else if (!isInit) {
      messages.push({ role: "user", content: message });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (obj: unknown) =>
          controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

        let fullText = "";
        try {
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
            ...(isInit && conversation.length === 0
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
