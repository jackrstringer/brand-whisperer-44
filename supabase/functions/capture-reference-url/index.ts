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
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize URL
    let finalUrl = url.trim();
    if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
      finalUrl = `https://${finalUrl}`;
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const id = crypto.randomUUID();

    // Extract domain for default title
    let domain = "Unknown";
    try {
      domain = new URL(finalUrl).hostname.replace("www.", "");
    } catch {}

    // Create the reference campaign immediately with the URL
    await supabase.from("reference_campaigns").insert({
      id,
      title: `Campaign from ${domain}`,
      thumbnail_url: finalUrl, // Temporary - will be replaced
      image_urls: [],
      is_published: false,
      sort_order: 0,
      ai_metadata: { source_url: finalUrl, status: "capturing" },
    });

    // Use AI to analyze the URL and extract metadata
    // Ask the AI to describe what it would expect from this campaign URL
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert email marketing analyst. Given a URL to an email campaign, analyze the URL structure and any available context to provide metadata. Return a JSON object with:
- brand_name: string - extracted from the URL domain/path
- title: string - a descriptive title for this campaign
- industry: string - one of: "Beauty & Skincare", "Fashion & Apparel", "Food & Beverage", "Health & Wellness", "Home & Living", "Technology", "Sports & Fitness", "Jewelry & Accessories", "Pet", "Baby & Kids", "Other"
- campaign_type: string - "campaign" or "flow"
- message_type: string - one of: "Welcome", "Product Launch", "Sale / Promotion", "Browse Abandonment", "Cart Abandonment", "Post-Purchase", "Winback", "Back in Stock", "Seasonal / Holiday", "Newsletter", "VIP / Loyalty", "Referral", "Educational", "Other"
- category: string - one of: "Product Launch", "Seasonal", "Minimal", "Bold", "Editorial", "Lifestyle", "Promotional", "Re-engagement", "Other"
- tags: string[] - 3-5 descriptive tags

Respond ONLY with the JSON object.`,
          },
          {
            role: "user",
            content: `Analyze this email campaign URL and extract metadata: ${finalUrl}`,
          },
        ],
      }),
    });

    let metadata: any = {};
    if (aiResponse.ok) {
      const aiResult = await aiResponse.json();
      const raw = aiResult.choices?.[0]?.message?.content || "";
      try {
        metadata = JSON.parse(raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());
      } catch {
        console.error("Failed to parse AI metadata from URL analysis");
      }
    }

    // Update the reference with metadata
    const updateData: Record<string, any> = {
      title: metadata.title || `Campaign from ${domain}`,
      brand_name: metadata.brand_name || domain,
      industry: metadata.industry || null,
      campaign_type: metadata.campaign_type || null,
      message_type: metadata.message_type || null,
      category: metadata.category || "Other",
      tags: metadata.tags || null,
      ai_metadata: {
        source_url: finalUrl,
        status: "captured",
        ...(metadata || {}),
      },
    };

    // Try to use the URL itself as thumbnail if it's an image
    const isImageUrl = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(finalUrl);
    if (isImageUrl) {
      updateData.thumbnail_url = finalUrl;
      updateData.image_urls = [finalUrl];
    } else {
      // For non-image URLs, keep the URL as reference and note it needs manual screenshot
      updateData.ai_metadata.needs_screenshot = true;
    }

    await supabase
      .from("reference_campaigns")
      .update(updateData)
      .eq("id", id);

    return new Response(JSON.stringify({ success: true, id, metadata: updateData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("capture-reference-url error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
