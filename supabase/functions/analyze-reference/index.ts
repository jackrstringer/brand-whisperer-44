import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GENERIC_TITLE_PATTERNS = [
  /^(image)(\s*\d*)?$/i,
  /^(untitled campaign|untitled)(\s*\d*)?$/i,
  /^(pasted image)(\s*\d*)?$/i,
  /^screenshot(\s*\d*)?$/i,
];

const isGenericTitle = (title?: string | null) => {
  const normalized = (title || "").trim();
  if (!normalized) return true;
  return GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
};

const deriveReferenceTitle = (metadata: any) => {
  const brand = (metadata?.brand_name || "").trim();
  const messageType = (metadata?.message_type || "").trim();
  const industry = (metadata?.industry || "").trim();
  const campaignType = (metadata?.campaign_type || "").trim();

  const secondary =
    messageType && messageType !== "Other"
      ? messageType
      : industry
      ? campaignType === "flow"
        ? `${industry} Flow`
        : `${industry} Campaign`
      : campaignType === "flow"
      ? "Flow"
      : "Campaign";

  if (brand && secondary) return `${brand} — ${secondary}`;
  if (brand) return brand;
  if (secondary) return secondary;
  return "Reference Campaign";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { referenceId, imageUrls } = await req.json();
    if (!referenceId || !imageUrls?.length) {
      return new Response(JSON.stringify({ error: "referenceId and imageUrls required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build image content blocks (up to 8 images to stay within limits)
    const imageParts = imageUrls.slice(0, 8).map((url: string) => ({
      type: "image_url" as const,
      image_url: { url },
    }));

    const systemPrompt = `You are an expert email marketing analyst specializing in DTC/ecommerce brands. You will be shown screenshots of an email campaign. Your job is to extract PRECISE, USEFUL metadata that helps people find relevant references.

CRITICAL RULES:
- Look at the ACTUAL content of the email. Read every word visible.
- Identify the REAL brand name from logos, headers, or footer text — not generic guesses.
- For industry: be SPECIFIC. "Beauty & Skincare" is different from "Fashion & Apparel". Look at what's being sold.
- For message_type: look for behavioral triggers. Abandonment emails mention "still interested?" or "left something behind". Post-purchase emails say "your order" or "thank you for your purchase". Welcome emails say "welcome" or "nice to meet you". Billing reminders mention subscriptions or upcoming charges. Don't default to "Promotional" — most emails promote something, so dig deeper into the PURPOSE.
- campaign_type: "flow" means it's triggered by user behavior (browse/cart abandonment, post-purchase, welcome series, winback, subscription renewal). "campaign" means it's a one-off blast (sale announcement, new collection, seasonal, newsletter).

Return a JSON object with these exact fields:
- brand_name: string - the ACTUAL brand name visible in the email
- industry: string - one of: "Beauty & Skincare", "Fashion & Apparel", "Food & Beverage", "Health & Wellness", "Home & Living", "Technology", "Sports & Fitness", "Jewelry & Accessories", "Pet", "Baby & Kids", "Supplements", "CBD & Cannabis", "Automotive", "Travel & Hospitality", "Financial Services", "Subscription Box", "Other"
- campaign_type: string - "campaign" or "flow" (see rules above)
- message_type: string - be specific! One of: "Welcome", "New Arrival / Product Launch", "Sale / Discount", "Browse Abandonment", "Cart Abandonment", "Post-Purchase / Thank You", "Shipping / Delivery Update", "Winback / Re-engagement", "Back in Stock", "Seasonal / Holiday", "Newsletter / Editorial", "VIP / Loyalty", "Referral", "Educational / How-To", "Subscription Reminder / Billing", "Review Request", "Birthday / Anniversary", "Replenishment Reminder", "Other"
- category: string - overall vibe: "Minimal", "Bold", "Editorial", "Lifestyle", "Seasonal / Holiday", "Dark Mode", "Luxury", "Playful", "Corporate", "Other"
- tags: string[] - 3-6 tags about DESIGN TECHNIQUES visible in the email (e.g. "full-bleed hero", "product grid", "countdown timer", "animated GIF", "single CTA", "user-generated content", "social proof", "before-after", "ingredient spotlight")
- extracted_copy: string - ALL visible text from the email, preserving hierarchy. Headlines first, body text, then CTA button labels. Separate sections with newlines.
- subject_line_guess: string | null - only if visible or strongly implied
- cta_labels: string[] - exact text of every CTA button
- color_palette: string[] - 3-5 dominant hex colors
- layout_notes: string - brief structural description
- tone: string - writing tone (e.g. "Conversational & warm", "Urgent & scarcity-driven", "Premium & aspirational")

Respond ONLY with the JSON object, no markdown or explanation.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this email campaign and extract the metadata:" },
              ...imageParts,
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway returned ${response.status}`);
    }

    const aiResult = await response.json();
    const rawContent = aiResult.choices?.[0]?.message?.content || "";

    // Parse the JSON from AI response (strip markdown fences if present)
    let metadata: any;
    try {
      const cleaned = rawContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      metadata = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", rawContent);
      return new Response(JSON.stringify({ error: "Failed to parse AI analysis", raw: rawContent }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update the reference campaign with extracted metadata
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const updateData: Record<string, any> = {
      industry: metadata.industry || null,
      campaign_type: metadata.campaign_type || null,
      message_type: metadata.message_type || null,
      extracted_copy: metadata.extracted_copy || null,
      ai_metadata: {
        subject_line_guess: metadata.subject_line_guess,
        cta_labels: metadata.cta_labels,
        color_palette: metadata.color_palette,
        layout_notes: metadata.layout_notes,
        tone: metadata.tone,
      },
    };

    // Also update brand_name, category, tags if they were empty
    if (metadata.brand_name) updateData.brand_name = metadata.brand_name;
    if (metadata.category) updateData.category = metadata.category;
    if (metadata.tags?.length) updateData.tags = metadata.tags;

    const { data: existingRef, error: existingFetchError } = await supabase
      .from("reference_campaigns")
      .select("title")
      .eq("id", referenceId)
      .single();

    if (existingFetchError) {
      console.error("Failed to fetch existing reference title:", existingFetchError);
    }

    if (isGenericTitle(existingRef?.title)) {
      updateData.title = deriveReferenceTitle(metadata);
    }

    const { error: updateError } = await supabase
      .from("reference_campaigns")
      .update(updateData)
      .eq("id", referenceId);

    if (updateError) {
      console.error("DB update error:", updateError);
      throw new Error(updateError.message);
    }

    return new Response(JSON.stringify({ success: true, metadata }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-reference error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
