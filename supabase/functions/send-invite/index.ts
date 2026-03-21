// @ts-nocheck — Deno Edge Function (types not available in local TS server)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GMAIL_USER = Deno.env.get("GMAIL_USER");
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Base64url encode (for Gmail API raw message)
function base64url(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Build a raw RFC 2822 email message and base64url-encode it
function buildRawMessage({ from, to, subject, html }: { from: string; to: string; subject: string; html: string }): string {
  const boundary = "----=_Part_boundary_001";
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    btoa(unescape(encodeURIComponent(`Vous avez été invité. Ouvrez cet email en HTML pour voir le contenu complet.`))),
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    btoa(unescape(encodeURIComponent(html))),
    ``,
    `--${boundary}--`,
  ].join("\r\n");

  return base64url(message);
}

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

    const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:48px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#000;padding:40px 48px;text-align:center;">
          <span style="color:#fff;font-size:22px;font-weight:900;">📈 ClubInvest</span>
        </td></tr>
        <tr><td style="padding:48px;">
          <p style="margin:0 0 8px;font-size:14px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Vous êtes invité</p>
          <h1 style="margin:0 0 24px;font-size:28px;font-weight:900;color:#0f172a;">Rejoignez <span style="color:#10b981;">${clubName}</span></h1>
          <p style="margin:0 0 32px;font-size:16px;color:#475569;line-height:1.6;">
            ${inviterName ? `<strong>${inviterName}</strong> vous invite à rejoindre le club d'investissement <strong>${clubName}</strong> sur ClubInvest.` : `Vous avez été invité à rejoindre le club d'investissement <strong>${clubName}</strong>.`}
          </p>
          <div style="background:#f1f5f9;border-radius:16px;padding:24px;text-align:center;margin-bottom:32px;">
            <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:2px;">Code d'invitation</p>
            <p style="margin:0;font-size:36px;font-weight:900;letter-spacing:8px;color:#0f172a;font-family:monospace;">${inviteCode}</p>
          </div>
          <div style="text-align:center;margin-bottom:32px;">
            <a href="${appUrl || "https://clubinvest.vercel.app"}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:16px 40px;border-radius:50px;font-size:16px;font-weight:700;">Accéder à l'application →</a>
          </div>
          <div style="border-top:1px solid #e2e8f0;padding-top:24px;">
            <p style="margin:0 0 16px;font-size:14px;color:#64748b;font-weight:600;">Comment rejoindre :</p>
            <ol style="margin:0;padding-left:20px;color:#475569;font-size:14px;line-height:2;">
              <li>Créez votre compte sur l'application</li>
              <li>Choisissez "Rejoindre un Club"</li>
              <li>Entrez le code <strong style="font-family:monospace;letter-spacing:2px;">${inviteCode}</strong></li>
            </ol>
          </div>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:24px 48px;text-align:center;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">ClubInvest · Si vous ne souhaitez pas rejoindre ce club, ignorez cet email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // Use Gmail API with App Password via SMTP through fetch to a relay,
    // OR use the simple approach: send via Gmail SMTP using nodemailer (npm)
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
      text: `Vous avez été invité à rejoindre ${clubName}. Code : ${inviteCode}. Lien : ${appUrl || "https://clubinvest.vercel.app"}`,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
