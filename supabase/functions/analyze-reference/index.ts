import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const systemPrompt = `You are an expert email marketing analyst. You will be shown screenshots/slices of an email campaign. Analyze the campaign and extract structured metadata.

Return a JSON object with these exact fields:
- brand_name: string - the brand name visible in the email (or best guess)
- industry: string - one of: "Beauty & Skincare", "Fashion & Apparel", "Food & Beverage", "Health & Wellness", "Home & Living", "Technology", "Sports & Fitness", "Jewelry & Accessories", "Pet", "Baby & Kids", "Other"
- campaign_type: string - either "campaign" (one-off blast) or "flow" (automated trigger-based)
- message_type: string - one of: "Welcome", "Product Launch", "Sale / Promotion", "Browse Abandonment", "Cart Abandonment", "Post-Purchase", "Winback", "Back in Stock", "Seasonal / Holiday", "Newsletter", "VIP / Loyalty", "Referral", "Educational", "Other"
- category: string - visual style category, one of: "Product Launch", "Seasonal", "Minimal", "Bold", "Editorial", "Lifestyle", "Promotional", "Re-engagement", "Other"
- tags: string[] - 3-8 descriptive tags about visual style, layout patterns, and design techniques (e.g. "full-bleed imagery", "dark mode", "bold typography", "product grid", "lifestyle photography", "animated GIF", "single CTA")
- extracted_copy: string - all visible text/copy from the email, preserving hierarchy (headlines first, then body, then CTAs). Use newlines to separate sections.
- subject_line_guess: string | null - if a subject line is visible or can be inferred
- cta_labels: string[] - all call-to-action button texts
- color_palette: string[] - 3-5 dominant hex colors used
- layout_notes: string - brief description of the layout structure (e.g. "Hero image with text overlay, 3-column product grid, single CTA footer")
- tone: string - the writing tone (e.g. "Playful & casual", "Premium & aspirational", "Urgent & promotional")

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
