import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Rate: 1 Gem = 0.7 ₽ (must match claim_gem_withdrawal in the database).
const GEM_TO_RUB = 0.7;

/*
YooMoney P2P "money to card" endpoint. Uses the OAuth token of the wallet owner
(scope: payment-p2p). Docs: https://yoomoney.ru/docs/wallet/process-payments/request-payment
*/
const P2P_REQUEST_URL = "https://yoomoney.ru/api/request-payment";

type ClaimBody = {
  gems?: unknown;
  payment_details?: unknown;
};

type ClaimRow = {
  id: string;
  coins_amount: number;
  rub_amount: number;
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Only the authenticated user themselves can start an instant payout.
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    }
  );
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) {
    return json({ error: "Требуется вход в аккаунт" }, 401);
  }

  let body: ClaimBody = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Некорректный запрос" }, 400);
  }

  const gems = Math.floor(Number(body.gems));
  const details = typeof body.payment_details === "string" ? body.payment_details.trim() : "";
  if (!Number.isFinite(gems) || gems < 300) {
    return json({ error: "Минимальная сумма вывода — 300 Gem" }, 400);
  }
  if (details.length < 5 || details.length > 200) {
    return json({ error: "Укажите номер карты, счёт или телефон получателя" }, 400);
  }

  const YOOMONEY_TOKEN = Deno.env.get("YOOMONEY_PAYOUT_TOKEN");
  if (!YOOMONEY_TOKEN) {
    // No wallet credential configured. Nothing has been debited yet.
    return json({ error: "Вывод временно недоступен, попробуйте позже" }, 503);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // 1. Claim: validate + debit Gems + record the payout, atomically, server-side.
  //    The recipient details are validated here but stored only as 'masked' —
  //    they live in memory for the duration of this request and are never written down.
  const { data: claimData, error: claimErr } = await admin.rpc("claim_gem_withdrawal", {
    p_coins_amount: gems,
    p_payment_details: details,
  });
  if (claimErr || !claimData || (claimData as ClaimRow[]).length === 0) {
    return json({ error: claimErr?.message || "Не удалось оформить вывод" }, 400);
  }
  const claim = (claimData as ClaimRow[])[0];

  // 2. Pay out via YooMoney P2P.
  try {
    const amount = Number(claim.rub_amount ?? claim.coins_amount * GEM_TO_RUB);
    const form = new URLSearchParams();
    form.set("pattern", "999"); // YooMoney P2P "to a bank card" pattern
    form.set("to", details);
    form.set("amount", amount.toFixed(2));
    form.set("message", "Soundscape Pro — выплата Gem");
    // Idempotency key: unique per claim row.
    form.set("customerNumber", claim.id);

    const resp = await fetch(P2P_REQUEST_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${YOOMONEY_TOKEN}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const text = await resp.text();
    let parsed: Record<string, string> = {};
    try {
      parsed = Object.fromEntries(new URLSearchParams(text));
    } catch {
      parsed = {};
    }

    if (resp.ok && parsed.status === "success") {
      const now = new Date().toISOString();
      await admin
        .from("withdrawal_requests")
        .update({
          status: "completed",
          processed_at: now,
          paid_out_at: now,
          yoomoney_operation_id: parsed.operation_id || null,
          last_error: null,
        })
        .eq("id", claim.id);
      return json({ ok: true, rub: amount, operation_id: parsed.operation_id || null }, 200);
    }

    // YooMoney rejected the transfer: give the Gems back and tell the user why.
    const reason = parsed.description || parsed.error_description || parsed.error || `HTTP ${resp.status}`;
    await admin.rpc("refund_gem_withdrawal", { p_withdrawal_id: claim.id, p_reason: reason });
    return json({ error: `ЮMoney отклонила выплату: ${reason}` }, 402);
  } catch (_err) {
    await admin.rpc("refund_gem_withdrawal", { p_withdrawal_id: claim.id, p_reason: "network error" });
    return json({ error: "Не удалось связаться с ЮMoney. Gem возвращены на баланс." }, 502);
  }
});
