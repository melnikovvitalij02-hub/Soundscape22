import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

interface RateLimitRow {
  identifier: string;
  action: string;
  count: number;
  window_start: string;
}

const MAX_WINDOW_MS = 60_000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const identifier = String(body.identifier || "");
    const action = String(body.action || "");
    const maxRequests = Number(body.maxRequests) || 0;
    const windowMs = Math.min(Number(body.windowMs) || MAX_WINDOW_MS, MAX_WINDOW_MS);

    if (!identifier || !action || !maxRequests) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (identifier.length > 256 || action.length > 64) {
      return new Response(
        JSON.stringify({ error: "Invalid input" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = Date.now();
    const windowStart = new Date(now - (now % windowMs)).toISOString();

    const { data: existing } = await supabase
      .from("rate_limits")
      .select("*")
      .eq("identifier", identifier)
      .eq("action", action)
      .maybeSingle();

    let row = existing as RateLimitRow | null;

    if (!row || row.window_start !== windowStart) {
      await supabase
        .from("rate_limits")
        .upsert({
          identifier,
          action,
          count: 1,
          window_start: windowStart,
        }, { onConflict: "identifier,action" })
        .select()
        .single();

      return new Response(
        JSON.stringify({ allowed: true, remaining: maxRequests - 1 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (row.count >= maxRequests) {
      return new Response(
        JSON.stringify({ allowed: false, remaining: 0, error: "Rate limit exceeded" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newCount = row.count + 1;
    await supabase
      .from("rate_limits")
      .update({ count: newCount })
      .eq("identifier", identifier)
      .eq("action", action);

    return new Response(
      JSON.stringify({ allowed: true, remaining: maxRequests - newCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
