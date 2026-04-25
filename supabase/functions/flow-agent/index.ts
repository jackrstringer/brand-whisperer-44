import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Skills are imported as TypeScript modules so they bundle with the deploy.
// (.md files are NOT included in the edge-runtime bundle, .ts files are.)
import baseFlow from "./skills/base-flow.ts";
import emailDesignLibrary from "./skills/email-design-element-library.ts";
import welcomeFlow from "./skills/welcome-flow.ts";
import welcomeTemplates from "./skills/welcome-templates.ts";
import abandonedCheckoutFlow from "./skills/abandoned-checkout-flow.ts";
import postPurchaseFlow from "./skills/post-purchase-flow.ts";
import browseAbandonmentFlow from "./skills/browse-abandonment-flow.ts";
import winbackFlow from "./skills/winback-flow.ts";

const SKILL_REGISTRY: Record<string, string> = {
  "base-flow.md": baseFlow,
  "email-design-element-library.md": emailDesignLibrary,
  "welcome-flow.md": welcomeFlow,
  "welcome-templates.md": welcomeTemplates,
  "abandoned-checkout-flow.md": abandonedCheckoutFlow,
  "post-purchase-flow.md": postPurchaseFlow,
  "browse-abandonment-flow.md": browseAbandonmentFlow,
  "winback-flow.md": winbackFlow,
};

const FLOW_SKILL_FILES: Record<string, string[]> = {
  welcome: ["welcome-flow.md", "welcome-templates.md"],
  abandoned_checkout: ["abandoned-checkout-flow.md"],
  post_purchase: ["post-purchase-flow.md"],
  browse_abandonment: ["browse-abandonment-flow.md"],
  winback: ["winback-flow.md"],
};

function readSkill(filename: string): string {
  const content = SKILL_REGISTRY[filename];
  if (!content) {
    console.error(`[flow-agent] Skill not found in registry: ${filename}`);
    return "";
  }
  return content;
}

const INTEL_SELECT = "compiled_context, klaviyo_compiled, ai_research, research_status";

function compact(value: unknown, max = 6000) {
  const text = typeof value === "string" ? value : JSON.stringify(value || {}, null, 2);
  return text.length > max ? `${text.slice(0, max)}\n...[truncated]` : text;
}

function deriveSetupCandidates(intel: any, klaviyoConn: any) {
  const source = `${compact(intel?.ai_research, 5000)}\n\n${intel?.compiled_context || ""}`;
  const offerLines = source
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /\b(offer|discount|coupon|code|% off|free shipping|welcome|subscribe|save)\b/i.test(line))
    .slice(0, 6);
  const productLines = source
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /\b(hero product|primary product|best seller|bestseller|product|collection|catalog)\b/i.test(line))
    .slice(0, 6);
  return {
    offer: { detected_candidates: offerLines },
    products: { detected_hero_products: productLines },
    merchandising: { klaviyo_stats_available: !!klaviyoConn?.cached_stats },
    confirmations: {},
  };
}

function mergeSetupData(base: any, incoming: any) {
  const next = { ...(base || {}) };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      next[key] = { ...(next[key] || {}), ...(value as Record<string, unknown>) };
    } else {
      next[key] = value;
    }
  }
  return next;
}

function extractSetupDataFromResponse(text: string) {
  const match = text.match(/```flow-setup\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch (err) {
    console.error("[flow-agent] Malformed flow-setup JSON", err, match[1].slice(0, 500));
    return null;
  }
}

function setupLooksConfirmed(setup: any) {
  return !!(
    setup?.confirmations?.offer_confirmed &&
    setup?.confirmations?.product_priority_confirmed &&
    setup?.confirmations?.complexity_confirmed &&
    setup?.offer?.confirmed_mode &&
    setup?.products?.scope
  );
}

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
  sb: any,
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
    lastStatus = (data as any)?.research_status || "unknown";

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
  sb: any;
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

    // Load skills (synchronous - bundled at deploy time)
    const flowSkillFiles = FLOW_SKILL_FILES[flow_type] || [];
    const baseSkill = readSkill("base-flow.md");
    const designLibrary = readSkill("email-design-element-library.md");
    const flowSkills = flowSkillFiles.map(readSkill);

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
        sb.from("flows").select("messages, skeleton_markdown, setup_status, setup_data").eq("id", flow_id).maybeSingle(),
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

    const researchedSetup = deriveSetupCandidates(preparedIntel, klaviyoConn);
    const existingSetupData = mergeSetupData(researchedSetup, flowRow?.setup_data || {});
    const setupConfirmed = setupLooksConfirmed(existingSetupData);

    // Per-flow audience constraints — prevents content drift (e.g. post-purchase
    // content like "your order has arrived" appearing in a welcome flow).
    const FLOW_AUDIENCE_RULES: Record<string, string> = {
      welcome:
        "AUDIENCE: Brand-new email subscribers who have JUST opted in. They have NEVER purchased. They may have never even visited the product page. " +
        "FORBIDDEN CONTENT: order confirmations, shipping/delivery updates, 'your order arrived', 'how is your [product] working out', subscription replenishment reminders, post-purchase upsells, review requests, any reference to a past purchase. " +
        "REQUIRED CONTENT: warm welcome, brand story / why this exists, the welcome offer, hero product introduction, social proof / press, founder voice, gentle objection-handling, last-call urgency on the welcome offer.",
      abandoned_checkout:
        "AUDIENCE: People who started checkout in the last few hours but have NOT completed it. " +
        "FORBIDDEN: welcome-style brand intros, post-purchase content, content assuming they're a customer. " +
        "REQUIRED: cart reminder with their item, urgency, friction-reducer (shipping/returns/guarantee), social proof, optional incentive in later step.",
      post_purchase:
        "AUDIENCE: Customers who JUST placed an order. " +
        "FORBIDDEN: welcome-discount style offers, prospect re-engagement. " +
        "REQUIRED: thank you, what's next / shipping expectation, how to use, education, review request, replenishment / cross-sell.",
      browse_abandonment:
        "AUDIENCE: People who viewed a product page but did NOT add to cart or buy. " +
        "FORBIDDEN: order/shipping content, deep welcome series content. " +
        "REQUIRED: 'you were checking out X' reminder with the dynamic product, social proof, why-this-product, gentle CTA back.",
      winback:
        "AUDIENCE: Lapsed customers who haven't purchased in 60+ days. " +
        "FORBIDDEN: welcome-discount intros, post-purchase content. " +
        "REQUIRED: we miss you, what's new, win-back incentive, urgency.",
    };

    const audienceRules = FLOW_AUDIENCE_RULES[flow_type] || "";
    const triggerLabel = ({
      welcome: "Added to List (newsletter signup list)",
      abandoned_checkout: "Started Checkout",
      post_purchase: "Placed Order",
      browse_abandonment: "Viewed Product",
      winback: "Has Placed Order — at least once, with a 60+ day inactivity filter",
    } as Record<string, string>)[flow_type] || "(unspecified)";

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

CURRENT STRUCTURED FLOW SETUP DATA:
${JSON.stringify(existingSetupData, null, 2)}

============================================================
FLOW TYPE: ${flow_type.toUpperCase().replace(/_/g, " ")}
TRIGGER: ${triggerLabel}
${audienceRules}
============================================================

The audience definition above is HARD. Every email you spec MUST be appropriate for that audience. If you catch yourself writing a "your gum has arrived" email inside a welcome flow, you have failed the assignment. Re-read the audience rule before writing each email.

CORE PRINCIPLE — RESEARCH, PROPOSE, CONFIRM, THEN BUILD:
The brand intelligence above is the result of deep research. Before you ask ANY question, you MUST:
1. Read the brand intelligence end-to-end.
2. Extract every fact relevant to this flow type (hero products, offers, codes, proof points, objections, send times, voice).
3. Propose researched defaults for operator-controlled choices.
4. Confirm the setup with structured interaction before skeleton generation.

HARD SETUP GATE:
NEVER generate a flow skeleton until these are confirmed in CURRENT STRUCTURED FLOW SETUP DATA or in this turn via a flow-setup block:
- offer_confirmed = true
- product_priority_confirmed = true
- offer.confirmed_mode is one of: none, static_code, dynamic_coupon
- products.scope is one of: hero, category, catalog
- if offer.confirmed_mode = dynamic_coupon, offer.dynamic_coupon_pool must be present

Do NOT ask blank generic questions like "what is the offer?". Use the research above to say what you found and ask the user to confirm, edit, or choose none.

DYNAMIC COUPON RULE:
If the user chooses a Klaviyo dynamic coupon, store the coupon pool/name in setup_data and instruct downstream generation to use Klaviyo dynamic coupon Liquid syntax with that coupon name. Never hardcode a dynamic coupon as plain text.

CONVERSATION RULES (CRITICAL):
- YOU are the email marketing expert. Never ask the user to make strategic decisions.
- ONE setup confirmation at a time until setup is complete.
- Be terse. No preamble, no recap of brand intelligence in prose, no "great question" filler.
- NEVER output a flow-synth block unless explicitly asked by an admin/debug instruction.
- NEVER show research dumps, full plans, numbered analyses, or multi-section summaries during setup.
- Each setup response should be one short sentence of visible prose plus one flow-question block.
- Question text must be short and actionable. Helper text is optional and must be one line max.
- Options must be 2–4 short labels. Descriptions must be short fragments, not paragraphs.
- NEVER ask whether they have an existing flow — assume net new.
- NEVER skip setup confirmation just because research found likely answers.

QUESTION FORMAT (use only when truly necessary):
\`\`\`flow-question
{ "question": "Short, specific question.", "helper": "Optional one-line context from research.", "options": [{"label":"Option 1","description":"Why this is likely","value":"Option 1"}], "allow_other": true }
\`\`\`

SETUP DATA FORMAT:
Whenever the user confirms or edits setup, include a hidden fenced setup block in the same response. The UI will not show it, but the backend will persist it.
\`\`\`flow-setup
{
  "offer": {
    "detected_candidates": [],
    "confirmed_mode": "none | static_code | dynamic_coupon",
    "description": "",
    "static_code": "",
    "dynamic_coupon_pool": ""
  },
  "products": {
    "detected_hero_products": [],
    "confirmed_primary_products": [],
    "scope": "hero | category | catalog"
  },
  "merchandising": { "selected_feed_preset": "", "notes": "" },
  "confirmations": { "offer_confirmed": false, "product_priority_confirmed": false }
}
\`\`\`

SKELETON GENERATION — STRICT BRACKET FORMAT (CRITICAL):
When you have enough info, output the skeleton inside a \`\`\`flow-skeleton fence. The skeleton MUST start with TRIGGER + FILTERS + EXIT meta blocks, then the nodes. Use ONLY this exact format:

\`\`\`flow-skeleton
[TRIGGER] — ${triggerLabel}

---

[FILTERS]
- One specific entry filter
- Another entry filter
- Suppression / smart-sending notes

---

[EXIT]
- Placed Order (primary exit)
- Unsubscribed

---

[EMAIL 1 — Short label like "Welcome + offer"]
Timing: Immediate (cumulative send timing from trigger)
Job: One sentence on what this email accomplishes (must match the flow audience).
Subject line: A real, sendable subject line.
Preview text: A real, sendable preview text / preheader.
Subject direction: Angle or hook direction that explains the SL/PT choice.
Sections:
- Hero block — what it shows (1 line)
- Proof element — what kind (1 line)
- CTA — destination (1 line)
Notes: ≤1 line if needed.

---

[DELAY] — 24h

---

[EMAIL 2 — Label]
...
\`\`\`

ABSOLUTE RULES FOR THE SKELETON:
- The first three blocks MUST be [TRIGGER], [FILTERS], [EXIT]. The FILTERS block MUST include at least one filter that prevents wrong-audience entry (e.g. for welcome: "Has not Placed Order since starting this flow").
- BRACKET headers only: \`[EMAIL N — Label]\`, \`[DELAY] — duration\`, \`[CONDITIONAL SPLIT — condition]\`, \`[SMS — Label]\`. NEVER \`## EMAIL\` or \`### Email\`.
- Separate every node with a line containing only \`---\`.
- Every email block MUST include: Timing, Job, Subject line, Preview text, Subject direction, Sections.
- Subject line and Preview text must be real send-ready copy, not placeholders and not strategy notes.
- Subject direction must be a short rationale/angle, distinct from the actual Subject line.
- Preview text must be the preheader that pairs with the subject line, not a note about preview strategy.
- DO NOT write any body copy, hero copy, headlines, CTA copy, or PS lines.
- Every email's Job + Sections MUST be appropriate for the flow audience defined above. A welcome flow CANNOT contain "your order arrived" or shipping content.
- SKIMMABILITY RULE: this skeleton is first shown as a process map. Every visible label must be short enough to scan instantly.
- Email header labels must be 2–5 words, e.g. "Welcome + offer", "Objection handling", "Last chance".
- Email Job must be one short sentence under 14 words.
- Timing must be the cumulative send timing from the trigger (e.g. "24h after signup", "3 days after signup", "5 days after signup").
- Each [DELAY] block must be the relative wait between messages only (e.g. "24h", "2 days", "4h").
- The Timing line and the [DELAY] blocks must reconcile exactly across the whole skeleton.
- Subject direction must be a short angle only, not the finished subject line.
- Delay labels must be compact values like "24h", "2 days", or "4h".
- Conditional split headers must be short questions like "Purchased?" or "VIP customer?".
- Avoid long bracket headers, compound clauses, and marketing copy in labels.
- Sections are 3–5 short BULLETS describing what each block IS, not what it SAYS.
- Every section bullet MUST begin with a 1–3 word display label, followed by an optional short explanation.
- Preferred section labels: Welcome Hero, Offer Reveal, Product Proof, Social Proof, Founder Note, Dynamic Discount, Categories Highlight, Objection Handle, Last Chance CTA.
- No long marketing-copy-style section names; the first words must work as compact UI chips.
- Total skeleton ≤90 lines.
- When updating an existing skeleton, return the FULL updated skeleton in the same bracket format (including TRIGGER/FILTERS/EXIT).

FILTERS-FIRST STRATEGY (CRITICAL — DO NOT VIOLATE):
- Universal "are they still eligible?" gates belong in [FILTERS] or [EXIT], NOT as repeated [CONDITIONAL SPLIT] nodes between every email.
- A [CONDITIONAL SPLIT] is ONLY justified when downstream content/structure ACTUALLY DIVERGES (e.g. "first-time vs returning buyer → different hero block + different offer"). If both branches would send roughly the same email, it is NOT a split — it's a filter.
- ABSOLUTELY FORBIDDEN: Inserting a "Has Placed Order?" split between every email step. The "stop on conversion" behavior MUST be expressed once in [EXIT] as "Placed Order (primary exit)". Do this once at the top, never again.
- Default skeleton shape for welcome / abandoned_checkout / browse_abandonment / winback / post_purchase: TRIGGER → FILTERS → EXIT → EMAIL → DELAY → EMAIL → DELAY → EMAIL (etc). Add a [CONDITIONAL SPLIT] only when there is a real, content-changing branching reason — and when you do, include explicit branch metadata in this format inside the split block:
    Branches:
    - YES: <what flows down this branch>
    - NO: <what flows down this branch>

CONDITIONAL SPLIT EXECUTION FORMAT (CRITICAL — DO NOT VIOLATE):
When you emit a [CONDITIONAL SPLIT], the parser/UI needs to know which downstream
messages live on which branch. Use this exact protocol:

1) Inside the split block include the Branches: section above.
2) Every node that lives on a branch MUST declare it with a \`Branch:\` field on
   its own line (case-insensitive, lowercase value). Example:

   [EMAIL 2A — Proof + first-time offer]
   Branch: yes
   Timing: 26h after trigger
   Job: ...
   Subject line: ...
   Preview text: ...
   Subject direction: ...
   Sections:
   - ...

   [EMAIL 2B — Proof only]
   Branch: no
   Timing: 26h after trigger
   ...

3) Branches MUST be fully populated. If a split has YES and NO, BOTH paths must
   contain at least one [EMAIL] (or an explicit [END BRANCH] terminator — see #5).
   Never leave a declared branch empty. Never let one branch swallow content that
   belongs to the other.
4) [DELAY] inside a branch must also carry \`Branch: yes\` (or \`no\`) so timing
   tracks per-path. Cumulative timing on a branch email = trunk cumulative at the
   split + all branch-local delays.
5) To explicitly end a branch (e.g. immediate Exit on YES), emit:
      [END BRANCH] — yes
   (or \`no\`). The renderer turns this into a real "Exit the flow" node on that
   path. Only use this when the strategy genuinely exits one side.
6) If any node AFTER a split has NO \`Branch:\` field, it is treated as a MERGE
   point: every open branch reconnects into it and the trunk resumes from there.
   Only emit a merge when the strategy truly converges (e.g. a final shared
   "Last chance" email after both branches).
7) NEVER mix branch and trunk content silently. If you intend Email 2A to be on
   YES and Email 2B to be on NO, you MUST tag both with Branch: explicitly.

EXAMPLE — browse abandonment with first-time-buyer split (this is the canonical
pattern; replicate this exact structure when discount eligibility differs):

\`\`\`
[EMAIL 1 — Product re-surface]
Timing: 2h after trigger
...

---

[DELAY] — 24h

---

[CONDITIONAL SPLIT — First-time buyer?]
Condition: Has Placed Order zero times (lifetime profile filter)
Branches:
- YES: Email 2A — proof + first-time discount
- NO: Email 2B — proof only, no discount

---

[EMAIL 2A — Proof + first-time offer]
Branch: yes
Timing: 26h after trigger
Job: Close hesitant first-time buyers with proof + discount.
Subject line: ...
Preview text: ...
Subject direction: ...
Sections:
- Compact Product Card — viewed product reminder
- Review Cards — 3 reviews
- Promo Code Highlight — Welcome25
- Single CTA — back to product

---

[EMAIL 2B — Proof only]
Branch: no
Timing: 26h after trigger
Job: Close returning browsers with proof + guarantee, no discount.
Subject line: ...
Preview text: ...
Subject direction: ...
Sections:
- Compact Product Card
- Review Cards
- Guarantee Seal
- Single CTA
\`\`\`

CURRENT SKELETON:
${current_skeleton || "(none yet — build from scratch when ready)"}`;

    // Build messages array
    const messages = [
      ...conversation.map((m) => ({ role: m.role, content: m.content })),
    ];
    if (bootingFreshFlow && conversation.length === 0) {
      messages.push({
        role: "user",
        content: `Begin setup for a ${flow_type.replace(/_/g, " ")} flow. Ask only the first required confirmation with one concise flow-question block. Do not output flow-synth. Do not generate a skeleton yet unless the hard setup gate is already satisfied. No greetings. No raw JSON outside fenced control blocks.`,
      });
    } else if (!isInit && !isRestart) {
      messages.push({ role: "user", content: `${message}\n\nUpdate flow-setup if this confirms or edits setup. If setup is now complete, generate the full skeleton immediately. Otherwise ask only the next setup confirmation with one concise flow-question block. Do not output flow-synth or a research summary.` });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        let closed = false;
        const safeClose = () => { if (!closed) { closed = true; try { controller.close(); } catch {} } };
        const send = (obj: unknown) => {
          if (closed) return;
          try { controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {}
        };

        try {
          if (bootingFreshFlow) {
            send({ type: "progress", stage: "reading", label: "Checking brand research" });
            await new Promise((r) => setTimeout(r, 150));
            send({ type: "progress", stage: "analyzing", label: "Thinking" });
            await new Promise((r) => setTimeout(r, 150));
            send({ type: "progress", stage: "strategizing", label: "Thinking" });
          }

          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-6",
              max_tokens: 4000,
              system: systemPrompt,
              messages,
              stream: true,
            }),
          });

          if (!res.ok || !res.body) {
            const errText = await res.text();
            console.error("[flow-agent] Anthropic error:", res.status, errText);
            send({ type: "error", error: `Anthropic ${res.status}: ${errText.slice(0, 300)}` });
            safeClose();
            return;
          }

          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          let fullText = "";
          // Track whether we're currently inside a ```flow-skeleton fence so we
          // can route those tokens to a separate SSE event (canvas-only, not chat).
          let inSkeletonFence = false;
          let pendingTail = ""; // small lookahead buffer for fence-marker detection
          const SKELETON_OPEN = "```flow-skeleton";
          const FENCE_CLOSE = "```";

          const flushChunk = (chunk: string) => {
            if (!chunk) return;
            // Combine with any pending tail from the previous chunk so we never
            // miss a fence marker that straddles two deltas.
            let working = pendingTail + chunk;
            pendingTail = "";

            while (working.length > 0) {
              if (!inSkeletonFence) {
                const openIdx = working.indexOf(SKELETON_OPEN);
                if (openIdx === -1) {
                  // Hold back the last few chars in case a fence marker is starting
                  const safeLen = Math.max(0, working.length - (SKELETON_OPEN.length - 1));
                  if (safeLen > 0) send({ type: "text", content: working.slice(0, safeLen) });
                  pendingTail = working.slice(safeLen);
                  return;
                }
                if (openIdx > 0) send({ type: "text", content: working.slice(0, openIdx) });
                inSkeletonFence = true;
                send({ type: "skeleton_start" });
                working = working.slice(openIdx + SKELETON_OPEN.length);
              } else {
                const closeIdx = working.indexOf(FENCE_CLOSE);
                if (closeIdx === -1) {
                  const safeLen = Math.max(0, working.length - (FENCE_CLOSE.length - 1));
                  if (safeLen > 0)
                    send({ type: "skeleton_chunk", content: working.slice(0, safeLen) });
                  pendingTail = working.slice(safeLen);
                  return;
                }
                if (closeIdx > 0)
                  send({ type: "skeleton_chunk", content: working.slice(0, closeIdx) });
                inSkeletonFence = false;
                send({ type: "skeleton_end" });
                working = working.slice(closeIdx + FENCE_CLOSE.length);
              }
            }
          };

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
                  flushChunk(chunk);
                }
              } catch {}
            }
          }
          // Flush any remaining tail text (only matters for non-fence content)
          if (pendingTail) {
            if (inSkeletonFence) send({ type: "skeleton_chunk", content: pendingTail });
            else send({ type: "text", content: pendingTail });
            pendingTail = "";
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
          const setupPatch = extractSetupDataFromResponse(fullText);
          const nextSetupData = setupPatch ? mergeSetupData(existingSetupData, setupPatch) : existingSetupData;
          const nextSetupConfirmed = setupLooksConfirmed(nextSetupData);
          const updates: Record<string, unknown> = {
            messages: newConversation,
            updated_at: new Date().toISOString(),
            setup_data: nextSetupData,
            setup_status: nextSetupConfirmed ? "ready_for_skeleton" : "needs_confirmation",
          };
          if (bootingFreshFlow && !skeletonMatch) {
            updates.skeleton_markdown = null;
            updates.status = "draft";
          }
          if (skeletonMatch) {
            updates.skeleton_markdown = skeletonMatch[1].trim();
            updates.status = "skeleton_ready";
            updates.setup_status = "skeleton_ready";
          }

          await sb.from("flows").update(updates).eq("id", flow_id);
          send({ type: "done", skeleton_updated: !!skeletonMatch });
          safeClose();
        } catch (err: any) {
          console.error("[flow-agent] Stream error:", err);
          send({ type: "error", error: err.message || "Unknown error" });
          safeClose();
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
