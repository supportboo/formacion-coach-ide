// Google Calendar OAuth (por usuario). El client_id/secret se leen de un fichero del servidor
// (GOOGLE_OAUTH_FILE, por defecto /etc/brandooers/gcal.json) — nunca van a git. Cada usuario da permiso
// sobre SU propio calendario (2 clics); el refresh_token se guarda por usuario en la capa de datos.
import { readFileSync } from "node:fs";

let CFG: { clientId: string; clientSecret: string; redirect: string } | null | undefined;
function cfg() {
  if (CFG !== undefined) return CFG;
  try {
    const f = process.env.GOOGLE_OAUTH_FILE || "/etc/brandooers/gcal.json";
    const j = JSON.parse(readFileSync(f, "utf8")) as { web?: Record<string, unknown>; installed?: Record<string, unknown> };
    const w = (j.web || j.installed || {}) as { client_id?: string; client_secret?: string; redirect_uris?: string[] };
    if (!w.client_id || !w.client_secret) { CFG = null; return CFG; }
    CFG = { clientId: w.client_id, clientSecret: w.client_secret, redirect: (w.redirect_uris && w.redirect_uris[0]) || "" };
  } catch { CFG = null; }
  return CFG;
}
export function isConfigured(): boolean { return !!cfg(); }

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
export function authUrl(state: string): string {
  const c = cfg(); if (!c) return "";
  const p = new URLSearchParams({
    client_id: c.clientId, redirect_uri: c.redirect, response_type: "code",
    scope: SCOPE, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + p.toString();
}
export async function exchangeCode(code: string): Promise<{ refresh_token?: string; access_token?: string } | null> {
  const c = cfg(); if (!c) return null;
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: c.redirect, grant_type: "authorization_code" }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    return await r.json() as { refresh_token?: string; access_token?: string };
  } catch { return null; }
}
export async function accessFromRefresh(refresh: string): Promise<string | null> {
  const c = cfg(); if (!c) return null;
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ refresh_token: refresh, client_id: c.clientId, client_secret: c.clientSecret, grant_type: "refresh_token" }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    return (await r.json() as { access_token?: string }).access_token || null;
  } catch { return null; }
}
export async function insertEvent(accessToken: string, ev: { summary: string; description?: string; startISO: string; endISO: string }): Promise<boolean> {
  try {
    const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST", headers: { authorization: "Bearer " + accessToken, "content-type": "application/json" },
      body: JSON.stringify({ summary: ev.summary, description: ev.description || "", start: { dateTime: ev.startISO, timeZone: "Europe/Madrid" }, end: { dateTime: ev.endISO, timeZone: "Europe/Madrid" } }),
      signal: AbortSignal.timeout(10000),
    });
    return r.ok;
  } catch { return false; }
}
