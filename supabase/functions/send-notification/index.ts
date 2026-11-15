import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { type, email, username, userId } = await req.json();

    if (!type || !email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: type, email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let subject = "";
    let htmlBody = "";
    let textBody = "";

    const baseUrl = "https://soundscape.su";

    if (type === "welcome") {
      subject = "Добро пожаловать в Soundscape!";
      textBody = `Здравствуйте, ${username || 'музыкант'}!\n\nДобро пожаловать в Soundscape — музыкальную социальную платформу.\n\nСоздавайте биты, записывайте треки, общайтесь с друзьями и участвуйте в музыкальных битвах.\n\nУдачи в творчестве!\nКоманда Soundscape`;
      htmlBody = `
<div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; background: #0B132B; padding: 40px 30px; border-radius: 20px; color: #ffffff;">
  <div style="text-align: center; margin-bottom: 30px;">
    <div style="display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 18px; background: linear-gradient(135deg, #3B82F6, #8B5CF6); margin-bottom: 16px;">
      <span style="font-size: 28px;">🎧</span>
    </div>
    <h1 style="font-size: 26px; font-weight: 800; margin: 0 0 8px;">Добро пожаловать в Soundscape!</h1>
    <p style="color: #94A3B8; font-size: 15px; margin: 0;">Здравствуйте, ${username || 'музыкант'}!</p>
  </div>
  <div style="background: #151F3C; border-radius: 16px; padding: 24px; margin-bottom: 20px;">
    <p style="color: #E2E8F0; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
      Вы успешно зарегистрировались в Soundscape — музыкальной социальной платформе, где можно:
    </p>
    <ul style="color: #94A3B8; font-size: 14px; line-height: 1.8; padding-left: 20px; margin: 0;">
      <li>Создавать биты и треки в секвенсоре</li>
      <li>Общаться с друзьями и находить единомышленников</li>
      <li>Участвовать в музыкальных битвах и рейтингах</li>
      <li>Играть в аркады и зарабатывать XP</li>
    </ul>
  </div>
  <p style="text-align: center; color: #475569; font-size: 13px; margin: 0;">
    Команда Soundscape
  </p>
</div>`;
    } else if (type === "subscription") {
      subject = "Premium подписка активирована — Soundscape";
      textBody = `Здравствуйте, ${username || 'музыкант'}!\n\nВаша Premium подписка успешно активирована!\n\nТеперь вам доступны все возможности Soundscape Pro:\n- Бит-секвенсор с эффектами\n- Без рекламы\n- 2x XP ускорение\n- Эксклюзивные аватары\n- AI генерация обложек\n- HD качество стриминга\n\nДействие подписки: 30 дней.\n\nКоманда Soundscape`;
      htmlBody = `
<div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; background: #0B132B; padding: 40px 30px; border-radius: 20px; color: #ffffff;">
  <div style="text-align: center; margin-bottom: 30px;">
    <div style="display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 18px; background: linear-gradient(135deg, #F59E0B, #3B82F6); margin-bottom: 16px;">
      <span style="font-size: 28px;">👑</span>
    </div>
    <h1 style="font-size: 26px; font-weight: 800; margin: 0 0 8px;">Premium активирована!</h1>
    <p style="color: #94A3B8; font-size: 15px; margin: 0;">Здравствуйте, ${username || 'музыкант'}!</p>
  </div>
  <div style="background: #151F3C; border-radius: 16px; padding: 24px; margin-bottom: 20px;">
    <p style="color: #E2E8F0; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
      Ваша Premium подписка успешно активирована на 30 дней. Теперь вам доступны:
    </p>
    <ul style="color: #94A3B8; font-size: 14px; line-height: 1.8; padding-left: 20px; margin: 0;">
      <li>Бит-секвенсор с эффектами и спецвозможностями</li>
      <li>Без рекламы</li>
      <li>2x XP ускорение</li>
      <li>Эксклюзивные аватары</li>
      <li>AI генерация обложек</li>
      <li>HD качество стриминга</li>
      <li>Приоритетная поддержка</li>
    </ul>
  </div>
  <p style="text-align: center; color: #475569; font-size: 13px; margin: 0;">
    Команда Soundscape
  </p>
</div>`;
    } else {
      return new Response(
        JSON.stringify({ error: "Unknown notification type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send email via Supabase auth admin API
    // We use the service role key to send a transactional email
    // Note: Supabase doesn't have a direct "send email" API, so we store
    // the notification in a notifications table and the user will see it
    // in-app. We also attempt to use the Resend API if a key is configured.

    // Store notification in database
    if (userId) {
      await supabase.from("notifications").insert({
        user_id: userId,
        type,
        subject,
        body: textBody,
        read: false,
      }).then(() => {}).catch(() => {});
    }

    // Try to send email via Resend if configured
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey) {
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Soundscape <noreply@soundscape.su>",
          to: [email],
          subject,
          html: htmlBody,
          text: textBody,
        }),
      });

      if (!emailResponse.ok) {
        console.error("Email send failed:", await emailResponse.text());
      }
    } else {
      console.log("No RESEND_API_KEY configured — notification stored in DB only");
    }

    return new Response(
      JSON.stringify({ success: true, type, email }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Notification error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
