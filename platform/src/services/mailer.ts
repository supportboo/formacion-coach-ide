// Envío de correo mínimo, SIN dependencias nuevas: usa Resend (API HTTP) si hay RESEND_API_KEY.
// Si todavía no hay proveedor de email configurado, registra el contenido en el log del servicio
// como reserva, para no bloquear la recuperación de contraseña mientras se configura el correo.
// Cuando pongas RESEND_API_KEY (+ opcional MAIL_FROM) en .env.local, los correos salen solos.
export interface Mail { to: string; subject: string; text: string; html?: string }

export async function sendMail(m: Mail): Promise<{ ok: boolean; via: "resend" | "log" }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || "Brandooers SkillUp <no-reply@brandooers.com>";
  if (key) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: m.to, subject: m.subject, text: m.text, html: m.html }),
      });
      if (res.ok) return { ok: true, via: "resend" };
      console.error("[mailer] Resend respondió", res.status, (await res.text().catch(() => "")).slice(0, 200));
    } catch (e) {
      console.error("[mailer] error llamando a Resend:", e);
    }
  }
  // Reserva: sin proveedor de email todavía. Se registra para que un admin lo entregue a mano.
  console.log(`[mailer] (SIN proveedor de email) para=${m.to} asunto="${m.subject}"\n${m.text}`);
  return { ok: false, via: "log" };
}
