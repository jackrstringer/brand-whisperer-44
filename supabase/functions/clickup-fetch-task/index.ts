import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractTaskId(url: string): string | null {
  // Patterns: /t/abc123, /t/86abc123, task id at end of URL
  const match = url.match(/\/t\/([a-zA-Z0-9]+)/);
  if (match) return match[1];
  // Fallback: last path segment
  const segments = url.replace(/[?#].*$/, "").split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  if (last && /^[a-zA-Z0-9]+$/.test(last)) return last;
  return null;
}

function suggestGoal(name: string, tags: string[]): string {
  const text = [name, ...tags].join(" ").toLowerCase();
  const map: Record<string, string> = {
    launch: "product_launch",
    "new arrival": "product_launch",
    welcome: "welcome",
    cart: "abandoned_cart",
    abandon: "abandoned_cart",
    "win back": "win_back",
    winback: "win_back",
    re_engage: "re-engagement",
    reengage: "re-engagement",
    newsletter: "newsletter",
    announce: "announcement",
    seasonal: "seasonal",
    holiday: "seasonal",
    education: "educational",
    "how to": "educational",
    social_proof: "social_proof",
    review: "social_proof",
    testimonial: "social_proof",
  };
  for (const [keyword, goal] of Object.entries(map)) {
    if (text.includes(keyword)) return goal;
  }
  return "promotional";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { brandId, taskUrl } = await req.json();
    if (!brandId || !taskUrl) {
      return new Response(JSON.stringify({ error: "brandId and taskUrl are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const taskId = extractTaskId(taskUrl);
    if (!taskId) {
      return new Response(JSON.stringify({ error: "Could not parse task ID from URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create authenticated Supabase client to verify user owns this brand
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .select("clickup_api_key")
      .eq("id", brandId)
      .single();

    if (brandError || !brand) {
      return new Response(JSON.stringify({ error: "Brand not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = brand.clickup_api_key;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ClickUp API key not configured for this brand. Add it in Brand Settings → ClickUp." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the task from ClickUp
    const taskResp = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
      headers: { Authorization: apiKey },
    });

    if (!taskResp.ok) {
      const errText = await taskResp.text();
      console.error("ClickUp API error:", taskResp.status, errText);
      return new Response(JSON.stringify({ error: `ClickUp API error: ${taskResp.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const task = await taskResp.json();

    const name = task.name || "Untitled";
    const description = task.description || task.text_content || "";
    const textContent = task.text_content || "";
    const tags = Array.isArray(task.tags) ? task.tags.map((t: any) => t.name || t) : [];

    // Build the brief from description
    const brief = description || textContent;

    // Try to fetch linked docs (ClickUp Docs attached to task)
    let docsCopy = "";
    try {
      // Check for linked docs via custom fields or task links
      if (task.linked_tasks && Array.isArray(task.linked_tasks)) {
        for (const link of task.linked_tasks.slice(0, 3)) {
          const linkedId = link.task_id;
          if (!linkedId) continue;
          const linkedResp = await fetch(`https://api.clickup.com/api/v2/task/${linkedId}`, {
            headers: { Authorization: apiKey },
          });
          if (linkedResp.ok) {
            const linkedTask = await linkedResp.json();
            if (linkedTask.text_content) {
              docsCopy += (docsCopy ? "\n\n---\n\n" : "") + linkedTask.text_content;
            }
          }
        }
      }
    } catch (e) {
      console.error("Error fetching linked docs:", e);
    }

    const suggestedGoal = suggestGoal(name, tags);

    return new Response(
      JSON.stringify({
        name,
        brief,
        copy: docsCopy || "",
        suggestedGoal,
        tags,
        status: task.status?.status || null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("clickup-fetch-task error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
