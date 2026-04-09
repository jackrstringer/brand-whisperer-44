import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized");

    const { brandId, metricId } = await req.json();
    if (!brandId || !metricId) throw new Error("brandId and metricId are required");

    // Verify brand ownership
    const { data: brand } = await supabase.from("brands").select("id, user_id").eq("id", brandId).single();
    if (!brand || brand.user_id !== user.id) throw new Error("Brand not found or unauthorized");

    const { data: connection } = await supabase.from("klaviyo_connections").select("api_key").eq("brand_id", brandId).single();
    if (!connection) throw new Error("No Klaviyo connection found");

    const apiKey = connection.api_key;

    // Fetch recent events for this metric
    const eventsUrl = `${KLAVIYO_API_BASE}/events/?filter=equals(metric_id,"${metricId}")&fields[event]=event_properties,datetime&page[size]=10&sort=-datetime&include=profile`;
    console.log("[klaviyo-fetch-preview-events] Fetching:", eventsUrl);
    const eventsResp = await fetch(eventsUrl, {
      headers: {
        "Authorization": `Klaviyo-API-Key ${apiKey}`,
        "revision": "2024-10-15",
        "Accept": "application/json",
      },
    });

    if (!eventsResp.ok) {
      const errBody = await eventsResp.text();
      console.error(`[klaviyo-fetch-preview-events] Klaviyo error ${eventsResp.status}:`, errBody);
      throw new Error(`Failed to fetch events: ${eventsResp.status} - ${errBody}`);
    }
    const eventsData = await eventsResp.json();
    const events = eventsData.data || [];

    // Fetch profiles for each event
    const results = [];
    for (const event of events.slice(0, 10)) {
      const props = event.attributes?.event_properties || {};
      const profileId = event.relationships?.profile?.data?.id || event.attributes?.profile_id;
      
      let profileEmail = "";
      let profileName = "";
      
      if (profileId) {
        try {
          const profileResp = await fetch(
            `${KLAVIYO_API_BASE}/profiles/${profileId}/?fields[profile]=email,first_name,last_name`,
            {
              headers: {
                "Authorization": `Klaviyo-API-Key ${apiKey}`,
                "revision": "2024-02-15",
                "Accept": "application/json",
              },
            }
          );
          if (profileResp.ok) {
            const profileData = await profileResp.json();
            const attrs = profileData.data?.attributes;
            profileEmail = attrs?.email || "";
            profileName = [attrs?.first_name, attrs?.last_name].filter(Boolean).join(" ");
          }
        } catch {}
      }

      results.push({
        event_id: event.id,
        datetime: event.attributes?.datetime,
        profile_email: profileEmail,
        profile_name: profileName,
        order_value: props.$value || props.value || 0,
        event_properties: props,
      });
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("klaviyo-fetch-preview-events error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
