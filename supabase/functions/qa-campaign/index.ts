import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized");

    const { html, subjectLine, previewText, brandId } = await req.json();
    if (!html) throw new Error("html is required");

    // Get brand info for domain checking
    let brandDomain = "";
    if (brandId) {
      const { data: brand } = await supabase.from("brands").select("website_url").eq("id", brandId).single();
      if (brand?.website_url) {
        try { brandDomain = new URL(brand.website_url).hostname; } catch {}
      }
    }

    // 1. Extract and check links
    const linkRegex = /href=["'](https?:\/\/[^"']+)["']/gi;
    const links: { url: string; status: string; inDomain: boolean }[] = [];
    const seenUrls = new Set<string>();
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      let status = "unknown";
      let inDomain = false;
      try {
        const urlHost = new URL(url).hostname;
        inDomain = brandDomain ? urlHost.includes(brandDomain) || brandDomain.includes(urlHost) : false;
        if (url.includes("#unsubscribe") || url.includes("{{")) {
          status = "placeholder";
        } else {
          const res = await fetch(url, { method: "HEAD", redirect: "follow" });
          status = res.ok ? "valid" : `error-${res.status}`;
        }
      } catch {
        status = "broken";
      }
      links.push({ url, status, inDomain });
    }

    // 2. Check images for alt tags
    const imgRegex = /<img\b([^>]*)>/gi;
    const imageIssues: { src: string; issue: string }[] = [];
    let imgMatch;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      const attrs = imgMatch[1];
      const srcMatch = attrs.match(/src=["']([^"']+)["']/);
      const altMatch = attrs.match(/alt=["']([^"']*)["']/);
      const src = srcMatch?.[1] || "unknown";
      if (!altMatch) {
        imageIssues.push({ src, issue: "Missing alt attribute" });
      } else if (altMatch[1].trim() === "") {
        // Empty alt is acceptable for decorative images, skip
      }
    }

    // 3. Use AI for spelling/grammar check
    let spellingIssues: any[] = [];
    let slPtIssues: any[] = [];

    if (lovableApiKey) {
      // Strip HTML tags for text-only analysis
      const textContent = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();

      const prompt = `You are a copy editor. Check this email content for spelling and grammar errors. Also check the subject line and preview text if provided.

EMAIL BODY TEXT:
${textContent.substring(0, 3000)}

${subjectLine ? `SUBJECT LINE: ${subjectLine}` : ""}
${previewText ? `PREVIEW TEXT: ${previewText}` : ""}

Return ONLY a JSON object with this structure:
{
  "body_issues": [{"text": "the error", "suggestion": "the fix", "context": "surrounding text"}],
  "subject_line_issues": [{"text": "the error", "suggestion": "the fix"}],
  "preview_text_issues": [{"text": "the error", "suggestion": "the fix"}]
}
If no issues found, return empty arrays.`;

      try {
        const aiRes = await fetch("https://api.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const parsed = JSON.parse(aiData.choices[0].message.content);
          spellingIssues = parsed.body_issues || [];
          slPtIssues = [
            ...(parsed.subject_line_issues || []).map((i: any) => ({ ...i, field: "subject_line" })),
            ...(parsed.preview_text_issues || []).map((i: any) => ({ ...i, field: "preview_text" })),
          ];
        }
      } catch (e) {
        console.error("AI spelling check failed:", e);
      }
    }

    // 4. Character length checks
    const lengthWarnings: { field: string; length: number; recommended: number; status: string }[] = [];
    if (subjectLine) {
      lengthWarnings.push({
        field: "subject_line",
        length: subjectLine.length,
        recommended: 60,
        status: subjectLine.length <= 60 ? "good" : "warning",
      });
    }
    if (previewText) {
      lengthWarnings.push({
        field: "preview_text",
        length: previewText.length,
        recommended: 90,
        status: previewText.length <= 90 ? "good" : "warning",
      });
    }

    // 5. Compile results
    const result = {
      links: {
        items: links,
        passed: links.every(l => l.status === "valid" || l.status === "placeholder"),
        totalCount: links.length,
        brokenCount: links.filter(l => l.status === "broken" || l.status.startsWith("error")).length,
      },
      spelling: {
        bodyIssues: spellingIssues,
        passed: spellingIssues.length === 0,
      },
      subjectPreview: {
        issues: slPtIssues,
        lengthWarnings,
        passed: slPtIssues.length === 0 && lengthWarnings.every(w => w.status === "good"),
      },
      images: {
        issues: imageIssues,
        passed: imageIssues.length === 0,
      },
      overallPassed: false,
    };

    result.overallPassed = result.links.passed && result.spelling.passed && result.subjectPreview.passed && result.images.passed;

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("QA error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
