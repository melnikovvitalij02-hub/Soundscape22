import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function getVapidKeys(admin: ReturnType<typeof createClient>) {
  const { data: existing, error: readError } = await admin
    .from("push_vapid_keys")
    .select("public_key, private_key")
    .eq("id", 1)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return existing;

  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const rawPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const keys = { public_key: toBase64Url(rawPublic), private_key: privateJwk.d! };

  const { error: insertError } = await admin
    .from("push_vapid_keys")
    .upsert({ id: 1, ...keys }, { onConflict: "id", ignoreDuplicates: true });
  if (insertError) throw insertError;

  const { data: stored, error: storedError } = await admin
    .from("push_vapid_keys")
    .select("public_key, private_key")
    .eq("id", 1)
    .single();
  if (storedError) throw storedError;
  return stored;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Not authenticated" }, 401);
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const keys = await getVapidKeys(admin);

    if (body.action === "public-key") {
      return json({ publicKey: keys.public_key });
    }

    if (body.action !== "notify-call" || typeof body.callId !== "string") {
      return json({ error: "Invalid request" }, 400);
    }

    const { data: call, error: callError } = await admin
      .from("calls")
      .select("id, caller_id, callee_id, kind, status, created_at")
      .eq("id", body.callId)
      .maybeSingle();
    if (callError) throw callError;
    if (!call || call.caller_id !== userId || call.status !== "ringing") {
      return json({ error: "Call is not ringing" }, 403);
    }
    const ageMs = Date.now() - new Date(call.created_at).getTime();
    if (ageMs > 60_000) return json({ error: "Call expired" }, 410);

    const { data: caller, error: callerError } = await admin
      .from("profiles")
      .select("username")
      .eq("id", call.caller_id)
      .maybeSingle();
    if (callerError) throw callerError;

    const { data: subscriptions, error: subError } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .eq("user_id", call.callee_id);
    if (subError) throw subError;

    webpush.setVapidDetails("mailto:support@soundscapepro.app", keys.public_key, keys.private_key);

    const payload = JSON.stringify({
      title: "Входящий звонок",
      body: `${caller?.username ?? "Собеседник"} звонит вам в Soundscape`,
      kind: call.kind,
      callId: call.id,
      url: "/",
    });

    let sent = 0;
    const expiredIds: string[] = [];
    await Promise.all(
      (subscriptions ?? []).map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
            payload,
            { TTL: 60, urgency: "high" },
          );
          sent += 1;
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) expiredIds.push(sub.id);
        }
      }),
    );

    if (expiredIds.length > 0) {
      const { error: cleanupError } = await admin.from("push_subscriptions").delete().in("id", expiredIds);
      if (cleanupError) throw cleanupError;
    }

    return json({ sent });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return json({ error: message }, 500);
  }
});
