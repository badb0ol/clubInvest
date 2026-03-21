// @ts-nocheck — Deno Edge Function (types not available in local TS server)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GMAIL_USER = Deno.env.get("GMAIL_USER");
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { to, inviterName, clubName, inviteCode, appUrl } = await req.json();

    if (!to || !clubName || !inviteCode) {
      return new Response(JSON.stringify({ error: "Champs manquants (to, clubName, inviteCode)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      return new Response(JSON.stringify({ error: "GMAIL_USER ou GMAIL_APP_PASSWORD manquant dans les secrets Supabase." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = appUrl || "https://clubinvest.vercel.app";

    const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:48px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <tr><td style="background:#0a0a0a;padding:36px 48px;text-align:center;">
          <span style="color:#fff;font-size:20px;font-weight:900;letter-spacing:-0.5px;">ClubInvest</span>
        </td></tr>
        <tr><td style="padding:48px;">
          <p style="margin:0 0 6px;font-size:12px;color:#a1a1aa;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">Invitation</p>
          <h1 style="margin:0 0 24px;font-size:26px;font-weight:900;color:#09090b;line-height:1.2;">Rejoignez <span style="color:#10b981;">${clubName}</span></h1>
          <p style="margin:0 0 32px;font-size:15px;color:#52525b;line-height:1.7;">
            ${inviterName ? `<strong style="color:#09090b;">${inviterName}</strong> vous invite à rejoindre le club d'investissement <strong style="color:#09090b;">${clubName}</strong> sur ClubInvest.` : `Vous avez été invité à rejoindre le club d'investissement <strong style="color:#09090b;">${clubName}</strong>.`}
          </p>
          <div style="background:#f4f4f5;border-radius:14px;padding:24px;text-align:center;margin-bottom:32px;">
            <p style="margin:0 0 10px;font-size:11px;color:#a1a1aa;font-weight:700;text-transform:uppercase;letter-spacing:2px;">Code d'invitation</p>
            <p style="margin:0;font-size:38px;font-weight:900;letter-spacing:10px;color:#09090b;font-family:monospace;">${inviteCode}</p>
          </div>
          <div style="text-align:center;margin-bottom:36px;">
            <a href="${baseUrl}" style="display:inline-block;background:#09090b;color:#fff;text-decoration:none;padding:15px 40px;border-radius:50px;font-size:15px;font-weight:700;">Accéder à l'application →</a>
          </div>
          <div style="border-top:1px solid #e4e4e7;padding-top:24px;">
            <p style="margin:0 0 12px;font-size:13px;color:#71717a;font-weight:600;">Comment rejoindre :</p>
            <ol style="margin:0;padding-left:20px;color:#52525b;font-size:13px;line-height:2.2;">
              <li>Créez votre compte sur l'application</li>
              <li>Choisissez <em>Rejoindre un Club</em></li>
              <li>Entrez le code <strong style="font-family:monospace;letter-spacing:3px;color:#09090b;">${inviteCode}</strong></li>
            </ol>
          </div>
        </td></tr>
        <tr><td style="background:#fafafa;padding:20px 48px;text-align:center;border-top:1px solid #e4e4e7;">
          <p style="margin:0;font-size:11px;color:#a1a1aa;">ClubInvest · Si vous ne souhaitez pas rejoindre ce club, ignorez cet email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const { createTransport } = await import("npm:nodemailer@6");

    const transporter = createTransport({
      service: "gmail",
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: `"ClubInvest" <${GMAIL_USER}>`,
      to,
      subject: `Invitation à rejoindre ${clubName} sur ClubInvest`,
      html,
      text: `Vous avez été invité à rejoindre ${clubName}. Code : ${inviteCode}. Lien : ${baseUrl}`,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("send-invite error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
