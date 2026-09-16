// Onboarding: analiza la web de la empresa para preparar a los tutores.
// Escrapea (fetch simple) + resume con IA sin inventar. Coste LLM acotado (entrada ~6k chars, salida corta).
import { llm } from "../container.js";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Analiza la web de una empresa. Devuelve un resumen breve y honesto, o null si no se pudo leer. */
export async function analyzeCompany(url: string): Promise<{ summary: string; source: string } | null> {
  let u = (url || "").trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u.replace(/^\/+/, "");
  let text = "";
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(12000), headers: { "user-agent": "Mozilla/5.0 (compatible; SkillUpBot)" } });
    if (!r.ok) return null;
    text = stripHtml(await r.text()).slice(0, 6000);
  } catch {
    return null;
  }
  if (text.length < 60) return null;
  try {
    const summary = await llm.generate({
      system: "Eres analista de negocio. A partir del texto de la web de una empresa, extrae en español, breve y SIN INVENTAR (si algo no aparece, dilo con naturalidad): a quién vende, qué vende, por qué o su propuesta de valor, y su cultura o tono. Máximo 6 frases, texto plano, sin markdown ni símbolos.",
      messages: [{ role: "user", content: text }],
      kind: "onboarding",
    });
    return { summary: summary.trim(), source: u };
  } catch {
    return null;
  }
}
