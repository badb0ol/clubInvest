import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invitation ClubInvest</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:48px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#000000;padding:40px 48px;text-align:center;">
              <div style="display:inline-flex;align-items:center;gap:10px;">
                <div style="width:40px;height:40px;background:#ffffff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;">
                  <span style="font-size:20px;">📈</span>
                </div>
                <span style="color:#ffffff;font-size:22px;font-weight:900;letter-spacing:-0.5px;">ClubInvest</span>
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:48px;">
              <p style="margin:0 0 8px;font-size:14px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Vous êtes invité</p>
              <h1 style="margin:0 0 24px;font-size:28px;font-weight:900;color:#0f172a;line-height:1.2;">
                Rejoignez <span style="color:#10b981;">${clubName}</span>
              </h1>

              <p style="margin:0 0 32px;font-size:16px;color:#475569;line-height:1.6;">
                ${inviterName ? `<strong>${inviterName}</strong> vous invite à rejoindre le club d'investissement <strong>${clubName}</strong> sur ClubInvest.` : `Vous avez été invité à rejoindre le club d'investissement <strong>${clubName}</strong> sur ClubInvest.`}
              </p>

              <!-- Code block -->
              <div style="background:#f1f5f9;border-radius:16px;padding:24px;text-align:center;margin-bottom:32px;">
                <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:2px;">Code d'invitation</p>
                <p style="margin:0;font-size:36px;font-weight:900;letter-spacing:8px;color:#0f172a;font-family:monospace;">${inviteCode}</p>
              </div>

              <!-- CTA -->
              <div style="text-align:center;margin-bottom:32px;">
                <a href="${appUrl || "https://clubinvest.vercel.app"}" style="display:inline-block;background:#000000;color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:50px;font-size:16px;font-weight:700;letter-spacing:-0.3px;">
                  Accéder à l'application →
                </a>
              </div>

              <!-- Steps -->
              <div style="border-top:1px solid #e2e8f0;padding-top:24px;">
                <p style="margin:0 0 16px;font-size:14px;color:#64748b;font-weight:600;">Comment rejoindre :</p>
                <ol style="margin:0;padding-left:20px;color:#475569;font-size:14px;line-height:2;">
                  <li>Créez votre compte sur l'application avec <strong>cet email</strong></li>
                  <li>Choisissez "Rejoindre un Club"</li>
                  <li>Entrez le code <strong style="font-family:monospace;letter-spacing:2px;">${inviteCode}</strong></li>
                </ol>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:24px 48px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                ClubInvest · Le système d'exploitation des clubs d'investissement modernes.<br/>
                Si vous ne souhaitez pas rejoindre ce club, ignorez cet email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ClubInvest <onboarding@resend.dev>",
        to: [to],
        subject: `Invitation à rejoindre ${clubName} sur ClubInvest`,
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Resend API error");
    }

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
