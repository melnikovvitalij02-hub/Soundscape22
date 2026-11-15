import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUBSCRIPTION_AMOUNT = 199;
const PREMIUM_DAYS = 30;

// Shop purchases are paid directly in rubles. The client embeds the exact
// price in the label as "shop_<type>_..._<userId>_r<price>"; the suffix is
// the only trusted price source (the rest of the label only identifies WHAT
// was bought, never for HOW MUCH).
function getShopPriceFromLabel(label: string): number | null {
  const lastUnderscore = label.lastIndexOf("_");
  if (lastUnderscore === -1) return null;
  const suffix = label.slice(lastUnderscore + 1);
  if (!suffix.startsWith("r")) return null;
  const price = parseFloat(suffix.slice(1));
  return Number.isFinite(price) && price > 0 ? price : null;
}

const COIN_PACKAGES: Record<string, { rub: number; coins: number }> = {
  "coins_100": { rub: 30, coins: 100 },
  "coins_300": { rub: 84, coins: 300 },
  "coins_1000": { rub: 139, coins: 1000 },
  "coins_2500": { rub: 299, coins: 2500 }
};

function getPackageFromLabel(label: string): { rub: number; coins: number } | null {
  for (const [prefix, pkg] of Object.entries(COIN_PACKAGES)) {
    if (label.startsWith(prefix + "_")) return pkg;
  }
  return null;
}

async function verifyYooMoneyHash(params: Record<string, string>): Promise<boolean> {
  const secret = Deno.env.get("YOOMONEY_NOTIFICATION_SECRET");
  if (!secret) {
    console.error("YOOMONEY_NOTIFICATION_SECRET is not set");
    return false;
  }

  const notificationType = params.notification_type || "";
  const operationId = params.operation_id || "";
  const amount = params.amount || "";
  const currency = params.currency || "";
  const datetime = params.datetime || "";
  const sender = params.sender || "";
  const codepro = params.codepro || "";
  const label = params.label || "";

  const checkString = [
    notificationType, operationId, amount, currency, datetime,
    sender, codepro, secret, label
  ].join("&");

  const encoder = new TextEncoder();
  const data = encoder.encode(checkString);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const computedHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  return computedHash === params.sha1_hash;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get("Content-Type") || "";
    let body: Record<string, string>;

    if (contentType.includes("application/json")) {
      const parsed = await req.json();
      body = {};
      for (const [key, value] of Object.entries(parsed)) {
        body[key] = String(value);
      }
    } else {
      const formData = await req.formData();
      body = {};
      for (const [key, value] of formData.entries()) {
        body[key] = String(value);
      }
    }

    const notificationType = body.notification_type || "";
    const operationId = body.operation_id || "";
    const amount = parseFloat(body.amount || body.withdraw_amount || "0");
    const label = body.label || "";
    const status = body.status || "";
    const sha1Hash = body.sha1_hash || "";

    console.log("Webhook received:", { notificationType, operationId, amount, label, status, hasHash: !!sha1Hash });

    // Determine payment_type from the label prefix. This is the single source
    // of truth for what entitlement the payment should grant:
    //   - "coins_*"       -> payment_type = 'coins'   -> add donate_coins
    //   - "subscription_*" -> payment_type = 'premium' -> activate is_premium
    //   - "shop_*"         -> payment_type = 'shop'    -> fulfill the item via
    //                        fulfill_shop_purchase (sample pack, cosmetic,
    //                        boost, avatar, sticker chest, trending promo)
    // The payment_type column on the payments table is what the grant RPCs
    // branch on, so the webhook must persist it here. This is the fix for
    // Block 14: a 30₽ coin purchase must never activate Premium.
    const isCoinPurchase = label.startsWith("coins_");
    const isSubscription = label.startsWith("subscription_");
    const isShopPurchase = label.startsWith("shop_");
    const isPromoSubscription = label.startsWith("promosub_");
    const paymentType = isCoinPurchase ? "coins" : isSubscription || isPromoSubscription ? "premium" : isShopPurchase ? "shop" : null;

    if (!paymentType) {
      console.error("Unrecognized label format:", label);
      return new Response(
        JSON.stringify({ error: "Invalid label format", label }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!sha1Hash) {
      console.error("Missing sha1_hash in webhook");
      return new Response(
        JSON.stringify({ error: "Missing signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const hashValid = await verifyYooMoneyHash(body);
    if (!hashValid) {
      console.error("Invalid YooMoney signature for operation:", operationId);
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let userId = "";
    if (isSubscription) {
      userId = label.replace("subscription_", "");
    } else if (isCoinPurchase) {
      const parts = label.split("_");
      userId = parts.slice(2).join("_");
    } else if (isShopPurchase) {
      // "shop_<type>_..._<userId>_r<price>" — the userId is the second-to-last
      // underscore-separated segment; the last one is the price suffix.
      const parts = label.split("_");
      userId = parts.length >= 3 ? parts[parts.length - 2] : "";
    } else if (isPromoSubscription) {
      // "promosub_<userId>_r<price>" — same price-suffix layout as shop.
      const parts = label.split("_");
      userId = parts.length >= 3 ? parts[parts.length - 2] : "";
    }

    if (!userId || userId.length < 8) {
      console.error("Invalid user ID from label:", label);
      return new Response(
        JSON.stringify({ error: "Invalid label format", label }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isCardIncoming = notificationType === "card-incoming";
    const isSuccess = status === "success";

    let expectedAmount = SUBSCRIPTION_AMOUNT;
    if (isCoinPurchase) {
      const pkg = getPackageFromLabel(label);
      if (!pkg) {
        console.error("Unknown coin package in label:", label);
        return new Response(
          JSON.stringify({ error: "Unknown coin package", label }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      expectedAmount = pkg.rub;
    } else if (isShopPurchase) {
      const shopPrice = getShopPriceFromLabel(label);
      if (shopPrice === null) {
        console.error("Invalid shop label price:", label);
        return new Response(
          JSON.stringify({ error: "Invalid shop label", label }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      expectedAmount = shopPrice;
    } else if (isPromoSubscription) {
      // Promo price (e.g. 159.20) comes from the label — the same trusted
      // price-suffix source used for shop purchases.
      const promoPrice = getShopPriceFromLabel(label);
      if (promoPrice === null) {
        console.error("Invalid promo label price:", label);
        return new Response(
          JSON.stringify({ error: "Invalid promo label", label }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      expectedAmount = promoPrice;
    }

    if (!isCardIncoming && !isSuccess) {
      console.error("Payment not confirmed:", { status, notificationType, amount });
      return new Response(
        JSON.stringify({ error: "Payment not successful", status, notificationType, amount }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (amount < expectedAmount) {
      console.error("Amount too low:", amount, "expected:", expectedAmount);
      return new Response(
        JSON.stringify({ error: "Amount too low", amount, expected: expectedAmount }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Idempotency: if we have already seen this YooMoney operation, re-apply
    // the entitlement only if it is somehow missing (e.g. a previous request
    // crashed between recording the payment and granting the entitlement).
    if (operationId) {
      const { data: existing } = await supabase
        .from("payments")
        .select("id, payment_type")
        .eq("yoomoney_operation_id", operationId)
        .maybeSingle();

      if (existing) {
        if (existing.payment_type === "premium") {
          const { data: prof } = await supabase
            .from("profiles")
            .select("is_premium, premium_expires_at")
            .eq("id", userId)
            .maybeSingle();
          if (prof && !prof.is_premium) {
            const expiresAt = new Date(Date.now() + PREMIUM_DAYS * 24 * 60 * 60 * 1000).toISOString();
            await supabase.from("profiles").update({ is_premium: true, premium_expires_at: expiresAt }).eq("id", userId);
          }
          // Also confirm any promo reservation tied to this payment.
          await supabase.rpc("mark_promo_used", { p_payment_id: existing.id });
        }
        // For 'coins' duplicates there is nothing safe to re-do without
        // risking a double grant; the original request already credited the
        // coins. Just acknowledge idempotently.
        return new Response(
          JSON.stringify({ success: true, userId, duplicate: true, payment_type: existing.payment_type }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const normalizedLabel = label;
    const { data: pendingPayment } = await supabase
      .from("payments")
      .select("id")
      .eq("user_id", userId)
      .eq("label", normalizedLabel)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let paymentRow: { id: string } | null = null;
    if (pendingPayment) {
      const { data: updatedPayment, error: updatePaymentError } = await supabase
        .from("payments")
        .update({
          yoomoney_operation_id: operationId || null,
          amount,
          status: "succeeded",
          // Persist the payment type so the grant RPCs and success page can
          // branch on it. Update is safe: payment_type was set at insert time
          // by the client, but we re-assert it here in case of an older row.
          payment_type: paymentType,
        })
        .eq("id", pendingPayment.id)
        .select("id")
        .maybeSingle();

      if (updatePaymentError || !updatedPayment) {
        console.error("Payment update error:", updatePaymentError?.message);
        return new Response(
          JSON.stringify({ error: "Failed to confirm payment" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      paymentRow = updatedPayment;
    } else {
      const { data: insertedPayment, error: paymentError } = await supabase
        .from("payments")
        .insert({
          user_id: userId,
          yoomoney_operation_id: operationId || null,
          amount,
          status: "succeeded",
          label: normalizedLabel,
          payment_type: paymentType,
        })
        .select("id")
        .maybeSingle();

      if (paymentError || !insertedPayment) {
        console.error("Payment insert error:", paymentError?.message);
        return new Response(
          JSON.stringify({ error: "Failed to record payment" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      paymentRow = insertedPayment;
    }

    // ── Grant entitlement based on payment_type ──────────────────────────
    // This is the core Block 14 fix: branch on payment_type, NOT on label
    // prefix alone. 'coins' -> add donate_coins; 'premium' -> activate
    // is_premium. The two paths are mutually exclusive.
    if (paymentType === "premium") {
      const expiresAt = new Date(Date.now() + PREMIUM_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from("profiles").update({ is_premium: true, premium_expires_at: expiresAt }).eq("id", userId);
      await supabase.from("subscriptions").upsert({
        user_id: userId, status: "active", plan: "premium", tier: "premium",
        started_at: new Date().toISOString(), expires_at: expiresAt,
      }, { onConflict: "user_id" });
      // Promo-priced payments: confirm the reservation so the promo slot is
      // spent. A no-op for regular subscription payments.
      if (isPromoSubscription && paymentRow) {
        const { error: promoError } = await supabase.rpc("mark_promo_used", { p_payment_id: paymentRow.id });
        if (promoError) console.error("Promo mark_used error:", promoError.message);
      }
      console.log("Premium granted for user:", userId);
    } else if (paymentType === "shop") {
      const fulfillment = await supabase.rpc("fulfill_shop_purchase", {
        p_payment_id: paymentRow.id,
        p_operation_id: operationId || null,
      });
      if (fulfillment.error) {
        console.error("Shop fulfillment error:", fulfillment.error.message);
        return new Response(
          JSON.stringify({ error: "Failed to fulfill shop purchase" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log("Shop purchase fulfilled:", JSON.stringify(fulfillment.data));
    } else if (paymentType === "coins") {
      const pkg = getPackageFromLabel(label)!;
      const { data: prof } = await supabase
        .from("profiles")
        .select("coins, donate_coins, total_donate_purchased")
        .eq("id", userId)
        .maybeSingle();
      const currentCoins = prof?.coins ?? 0;
      const currentDonate = prof?.donate_coins ?? 0;
      const currentTotal = prof?.total_donate_purchased ?? 0;
      await supabase.from("profiles").update({
        coins: currentCoins + pkg.coins,
        donate_coins: currentDonate + pkg.coins,
        total_donate_purchased: currentTotal + pkg.coins,
      }).eq("id", userId);

      await supabase.from("coin_purchases").update({
        status: "completed", completed_at: new Date().toISOString(), yoomoney_operation_id: operationId || null,
      }).eq("user_id", userId).eq("label", normalizedLabel).eq("status", "pending");

      console.log(`Coins granted: ${pkg.coins} for user: ${userId}`);
    }

    return new Response(
      JSON.stringify({ success: true, userId, type: paymentType, paymentId: paymentRow?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
