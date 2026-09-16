import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, admin } from "better-auth/plugins";
import { db } from "../db/index.js";
import { schema } from "../db/schema.js";
import { env } from "../config/env.js";
import { sendMail } from "../services/mailer.js";

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
    sendResetPassword: async ({ user, token }) => {
      const base = env.APP_URL || env.BETTER_AUTH_URL;
      const link = `${base}/app/reset.html?token=${encodeURIComponent(token)}`;
      await sendMail({
        to: user.email,
        subject: "Recupera tu contraseña · Brandooers SkillUp",
        text: `Hola,\n\nPara poner una contraseña nueva en SkillUp, abre este enlace (válido 1 hora):\n${link}\n\nSi no has sido tú, ignora este correo.`,
        html: `<p>Hola,</p><p>Para poner una contraseña nueva en <b>SkillUp</b>, pulsa aquí (válido 1 hora):</p><p><a href="${link}" style="display:inline-block;background:#1a9aa0;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-family:Arial,sans-serif">Restablecer mi contraseña</a></p><p style="color:#888;font-size:13px">Si no has sido tú, ignora este correo.</p>`,
      });
    },
  },
  plugins: [
    organization(),
    // Impersonar los 6 usuarios de prueba (uno por rol) desde la Consola, para testear cada perfil
    // con una sesion real. Solo PLATFORM_ADMIN_EMAILS puede impersonar (adminUserIds).
    admin({
      adminUserIds: env.PLATFORM_ADMIN_USER_IDS,
      impersonationSessionDuration: 60 * 60 * 4, // 4h: de sobra para una sesion de pruebas
    }),
  ],
});
