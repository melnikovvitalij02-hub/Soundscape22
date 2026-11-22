import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Rate: 1 Gem = 0.7 ₽ (must match request_withdrawal in the database).
const GEM_TO_RUB = 0.7;

/*
YooMoney "money-to-card" (p2p transfer) endpoint. Uses the classic
OAuth token of the wallet owner.
Docs: https://yoomoney.ru/docs/wallet/using-money/send
*/
const P2P_REQUEST_URL = "https://yoomoney.ru/api/request-payment";

type WithdrawalRow = {
  id: string;
  user_id: string;
  coins_amount: number;
  rub_amount: number;
  payment_details: string;
  attempts: number;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const YOOMONEY_TOKEN = Deno.env.get("YOOMONEY_PAYOUT_TOKEN");
  if (!YOOMONEY_TOKEN) {
    console.error("YOOMONEY_PAYOUT_TOKEN is not configured");
    // Not a hard failure for the scheduler: the job will just retry later.
    return new Response(
      JSON.stringify({ ok: false, reason: "payout token not configured" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Take the oldest pending requests and pay them out.
  const { data: candidates, error: selectErr } = await supabase
    .from("withdrawal_requests")
    .select("id, user_id, coins_amount, rub_amount, payment_details, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(3);

  if (selectErr) {
    console.error("Failed to select pending withdrawals:", selectErr.message);
    return new Response(JSON.stringify({ ok: false, error: selectErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!candidates || candidates.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: unknown[] = [];
  for (const row of candidates as (WithdrawalRow & { attempts: number })[]) {
    try {
      const amount = Number(row.rub_amount ?? (row.coins_amount * GEM_TO_RUB));
      if (!Number.isFinite(amount) || amount <= 0) {
        await supabase
          .from("withdrawal_requests")
          .update({ status: "failed", last_error: "Invalid rub_amount" })
          .eq("id", row.id);
        results.push({ id: row.id, status: "failed", reason: "invalid amount" });
        continue;
      }

      const form = new URLSearchParams();
      form.set("pattern", "999"); // "to a bank card" pattern of YooMoney p2p
      form.set("to", row.payment_details);
      form.set("amount", amount.toFixed(2));
      form.set("message", "Soundscape Pro — выплата Gem");
      // Idempotency key: unique per withdrawal request.
      form.set("customerNumber", row.id);

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
        await supabase
          .from("withdrawal_requests")
          .update({
            status: "completed",
            processed_at: new Date().toISOString(),
            yoomoney_operation_id: parsed.operation_id || null,
            last_error: null,
          })
          .eq("id", row.id);
        results.push({ id: row.id, status: "completed" });
      } else if (parsed.status === "in-progress") {
        // YooMoney accepted the transfer but has not finished it yet.
        await supabase
          .from("withdrawal_requests")
          .update({
            attempts: row.attempts + 1,
            last_error: "in-progress",
          })
          .eq("id", row.id);
        results.push({ id: row.id, status: "in-progress" });
      } else {
        const reason = parsed.description || parsed.error_description || parsed.error || `HTTP ${resp.status}`;
        const attempts = row.attempts + 1;
        // After 3 failed attempts mark as failed. The Gems stay debited; an
        // operator can review `last_error` and top the Gems back manually.
        await supabase
          .from("withdrawal_requests")
          .update({
            attempts,
            last_error: reason,
            status: attempts >= 3 ? "failed" : "pending",
          })
          .eq("id", row.id);
        results.push({ id: row.id, status: attempts >= 3 ? "failed" : "retry", reason });
      }
    } catch (err) {
      console.error("Payout error for", row.id, err);
      await supabase
        .from("withdrawal_requests")
        .update({ attempts: (row.attempts ?? 0) + 1, last_error: String(err) })
        .eq("id", row.id);
      results.push({ id: row.id, status: "error" });
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
