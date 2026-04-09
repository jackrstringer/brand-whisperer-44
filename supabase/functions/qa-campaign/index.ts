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

    const { html, subjectLine, previewText, brandId, flowConfig } = await req.json();
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
      }
    }

    // 3. Use AI for spelling/grammar check
    let spellingIssues: any[] = [];
    let slPtIssues: any[] = [];

    if (lovableApiKey) {
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

    // 5. Flow/Transactional Validation (when flowConfig is provided)
    let flowValidation: any = null;
    if (flowConfig) {
      flowValidation = runFlowValidation(html, flowConfig);
    }

    // 6. Compile results
    const result: any = {
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

    if (flowValidation) {
      result.flowValidation = flowValidation;
    }

    result.overallPassed = result.links.passed && result.spelling.passed && result.subjectPreview.passed && result.images.passed && (!flowValidation || flowValidation.passed);

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

/** Run flow-specific validation: variable checking, syntax, best practices */
function runFlowValidation(html: string, flowConfig: any) {
  const allowedVars: string[] = flowConfig.liquid_variables || [];
  const eventSchema = flowConfig.event_schema || {};
  const issues: { type: string; severity: "error" | "warning"; message: string; variable?: string }[] = [];

  // Build a set of allowed variable paths for quick lookup
  const allowedSet = new Set(allowedVars);
  // Also add person.* and organization.* as always-valid
  const alwaysValid = new Set(["person.first_name", "person.last_name", "person.email", "person.full_name", "organization.unsubscribe_link", "organization.url", "organization.name"]);

  // 1. Extract all {{ event.* }} and {{ person.* }} references from HTML
  const varRegex = /\{\{\s*([^}|]+?)(?:\s*\|[^}]*)?\s*\}\}/g;
  const usedVars = new Set<string>();
  let m;
  while ((m = varRegex.exec(html)) !== null) {
    usedVars.add(m[1].trim());
  }

  // 2. Extract {% for item in event.X %} array references
  const forRegex = /\{%\s*for\s+(\w+)\s+in\s+([^%]+?)\s*%\}/g;
  const loopVars = new Map<string, string>(); // itemVar -> arrayPath
  while ((m = forRegex.exec(html)) !== null) {
    loopVars.set(m[1].trim(), m[2].trim());
  }

  // 3. Validate each used variable
  for (const v of usedVars) {
    // Skip always-valid vars
    if (alwaysValid.has(v)) continue;

    // Check if it's a loop item variable (e.g., item.ProductName where item comes from {% for item in event.Items %})
    let isLoopVar = false;
    for (const [itemVar, arrayPath] of loopVars) {
      if (v.startsWith(itemVar + ".")) {
        isLoopVar = true;
        const prop = v.slice(itemVar.length + 1);
        const arrayRef = `${arrayPath}[].${prop}`;
        if (allowedSet.size > 0 && !allowedSet.has(arrayRef)) {
          issues.push({ type: "unknown_variable", severity: "error", message: `Unknown loop variable: {{ ${v} }} — "${prop}" not found in ${arrayPath}[] schema`, variable: v });
        }
        break;
      }
    }
    if (isLoopVar) continue;

    // Check event.* variables against the allowlist
    if (v.startsWith("event.")) {
      if (allowedSet.size > 0 && !allowedSet.has(v)) {
        issues.push({ type: "unknown_variable", severity: "error", message: `Unknown variable: {{ ${v} }} — not found in event schema`, variable: v });
      }
    }
  }

  // 4. Check for $extra usage (always invalid in Klaviyo Liquid)
  if (html.includes("$extra")) {
    issues.push({ type: "invalid_syntax", severity: "error", message: "Template uses $extra paths which Klaviyo cannot parse. Use top-level event properties instead." });
  }

  // 5. Check for unclosed control flow tags
  const forCount = (html.match(/\{%\s*for\s/g) || []).length;
  const endforCount = (html.match(/\{%\s*endfor\s*%\}/g) || []).length;
  if (forCount !== endforCount) {
    issues.push({ type: "syntax_error", severity: "error", message: `Mismatched for/endfor tags: ${forCount} {% for %} but ${endforCount} {% endfor %}` });
  }

  const ifCount = (html.match(/\{%\s*if\s/g) || []).length;
  const endifCount = (html.match(/\{%\s*endif\s*%\}/g) || []).length;
  if (ifCount !== endifCount) {
    issues.push({ type: "syntax_error", severity: "error", message: `Mismatched if/endif tags: ${ifCount} {% if %} but ${endifCount} {% endif %}` });
  }

  // 6. Check for missing | default: filters on event variables
  const noDefaultRegex = /\{\{\s*(event\.[^}|]+?)\s*\}\}/g;
  const varsWithoutDefault: string[] = [];
  while ((m = noDefaultRegex.exec(html)) !== null) {
    const varPath = m[1].trim();
    // Don't flag array paths used in for loops
    if (!loopVars.has(varPath)) {
      varsWithoutDefault.push(varPath);
    }
  }
  if (varsWithoutDefault.length > 0) {
    const unique = [...new Set(varsWithoutDefault)];
    issues.push({ type: "missing_default", severity: "warning", message: `${unique.length} event variable(s) without | default: filter: ${unique.slice(0, 5).map(v => `{{ ${v} }}`).join(", ")}${unique.length > 5 ? "..." : ""}` });
  }

  // 7. Check for unsubscribe link presence (best practice)
  if (!html.includes("unsubscribe")) {
    issues.push({ type: "best_practice", severity: "warning", message: "No unsubscribe link found — required for marketing emails, recommended for transactional" });
  }

  // 8. Check for person.first_name personalization
  if (!html.includes("person.first_name")) {
    issues.push({ type: "best_practice", severity: "warning", message: "No {{ person.first_name }} personalization found — consider adding a greeting" });
  }

  return {
    issues,
    passed: issues.filter(i => i.severity === "error").length === 0,
    errorCount: issues.filter(i => i.severity === "error").length,
    warningCount: issues.filter(i => i.severity === "warning").length,
  };
}
