import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, admin } from "better-auth/plugins";
import { db } from "../db/index.js";
import { schema } from "../db/schema.js";
import { env } from "../config/env.js";
import { sendMail } from "../services/mailer.js";

// Last reset link per email (in-process), so the superadmin console can hand it over by hand
// when mail is not delivered. ponytail: lost on restart, fine because links expire in 1h anyway.
export const lastResetLink = new Map<string, { link: string; delivered: boolean; at: number }>();

// Shared branded shell for transactional mail (inline styles, table layout for mail clients).
function emailShell(body: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2430">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#0f1720;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:.3px">SkillUp <span style="color:#3FD8E0;font-weight:normal">· Brandooers</span></td></tr>
<tr><td style="padding:28px">${body}</td></tr></table></td></tr></table></body></html>`;
}
const emailButton = (link: string, label: string) =>
  `<p style="margin:0 0 22px"><a href="${link}" style="display:inline-block;background:#1a9aa0;color:#ffffff;padding:13px 22px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px;letter-spacing:.4px">${label}</a></p>`;
const emailFallback = (link: string, note: string) =>
  `<p style="margin:0 0 8px;font-size:13px;color:#5b6270">${note} Si el botón no funciona, copia esto en el navegador:</p>
<p style="margin:0 0 22px;font-size:12px;word-break:break-all"><a href="${link}" style="color:#1a9aa0">${link}</a></p>`;

function resetEmailHtml(name: string, link: string): string {
  return emailShell(`<p style="margin:0 0 14px;font-size:16px">Hola${name ? " " + name : ""}:</p>
<p style="margin:0 0 22px;font-size:15px;line-height:1.55">Has pedido cambiar tu contraseña de SkillUp. Pulsa el botón para elegir una nueva.</p>
${emailButton(link, "CAMBIAR MI CONTRASEÑA")}
${emailFallback(link, "El enlace caduca en 1 hora y solo sirve una vez.")}
<p style="margin:0;font-size:13px;color:#5b6270">Si no lo has pedido tú, ignora este correo: tu contraseña actual sigue funcionando.</p>`);
}

function inviteEmailHtml(who: string, org: string, email: string, link: string): string {
  return emailShell(`<p style="margin:0 0 14px;font-size:16px">Hola:</p>
<p style="margin:0 0 22px;font-size:15px;line-height:1.55"><b>${who}</b> te invita a unirte a <b>${org}</b> en SkillUp, la formación de tu equipo.</p>
${emailButton(link, "ACEPTAR LA INVITACIÓN")}
${emailFallback(link, `Entra o crea tu cuenta con este mismo email (${email}).`)}
<p style="margin:0;font-size:13px;color:#5b6270">Si no esperabas esta invitación, ignora este correo.</p>`);
}

// Auth multi-tenant: better-auth + plugin organization (empresa = organización).
// El mismo modelo sirve de 1 usuario a multinacional.
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    // Recuperación de contraseña por enlace (válido 1 hora). El enlace apunta a nuestra propia
    // página /app/reset.html?token=..., donde el usuario pone su nueva contraseña. El correo lo
    // manda mailer (Resend si está configurado; si no, queda registrado para entrega manual).
    resetPasswordTokenExpiresIn: 3600,
    // A reset (e.g. after a lost/shared device) must kick every open session out.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, token }) => {
      const base = env.APP_URL || env.BETTER_AUTH_URL;
      const link = `${base}/app/reset.html?token=${encodeURIComponent(token)}`;
      const name = (user.name || "").split(" ")[0]?.replace(/[&<>"']/g, "") || "";
      const r = await sendMail({
        to: user.email,
        subject: "Tu enlace para cambiar la contraseña · SkillUp",
        text: `Hola${name ? " " + name : ""}:\n\nHas pedido cambiar tu contraseña de SkillUp. Abre este enlace para elegir una nueva (caduca en 1 hora y solo sirve una vez):\n${link}\n\nSi no lo has pedido tú, ignora este correo: tu contraseña actual sigue funcionando.\n\nBrandooers SkillUp`,
        html: resetEmailHtml(name, link),
      });
      lastResetLink.set(user.email.toLowerCase(), { link, delivered: r.ok, at: Date.now() });
    },
  },
  plugins: [
    organization({
      // Invitation mail (the company panel also shows the link to copy in case the mail does not arrive).
      sendInvitationEmail: async ({ id, email, organization: org, inviter }) => {
        const base = env.APP_URL || env.BETTER_AUTH_URL;
        const link = `${base}/app/aceptar-invitacion.html?invitation=${encodeURIComponent(id)}`;
        const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
        const who = inviter.user.name || inviter.user.email;
        await sendMail({
          to: email,
          subject: `${who} te invita a ${org.name} en SkillUp`,
          text: `Hola:\n\n${who} te invita a unirte a ${org.name} en SkillUp, la formación de tu equipo.\nEntra o crea tu cuenta con este email (${email}) y acepta aquí:\n${link}\n\nBrandooers SkillUp`,
          html: inviteEmailHtml(esc(who), esc(org.name), esc(email), link),
        });
      },
    }),
    // Impersonar los 6 usuarios de prueba (uno por rol) desde la Consola, para testear cada perfil
    // con una sesion real. Solo PLATFORM_ADMIN_EMAILS puede impersonar (adminUserIds).
    admin({
      adminUserIds: env.PLATFORM_ADMIN_USER_IDS,
      impersonationSessionDuration: 60 * 60 * 4, // 4h: de sobra para una sesion de pruebas
    }),
  ],
});
