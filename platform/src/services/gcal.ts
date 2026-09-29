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
/** 1.23.0: el mismo cliente OAuth sirve para «Entrar con Google» (solo correo y perfil). */
export function googleClient(): { clientId: string; clientSecret: string } | null { const c = cfg(); return c ? { clientId: c.clientId, clientSecret: c.clientSecret } : null; }

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
// 1.22.0: leer las transcripciones de sus reuniones de Meet (alcance «sensible», sin Drive).
export const MEET_SCOPE = "https://www.googleapis.com/auth/meetings.space.readonly";
export function authUrl(state: string, scopes: string[] = [SCOPE]): string {
  const c = cfg(); if (!c) return "";
  const p = new URLSearchParams({
    client_id: c.clientId, redirect_uri: c.redirect, response_type: "code",
    scope: scopes.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + p.toString();
}
export async function exchangeCode(code: string): Promise<{ refresh_token?: string; access_token?: string; scope?: string } | null> {
  const c = cfg(); if (!c) return null;
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: c.redirect, grant_type: "authorization_code" }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    return await r.json() as { refresh_token?: string; access_token?: string; scope?: string };
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
export async function insertEvent(accessToken: string, ev: { summary: string; description?: string; startISO: string; endISO: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST", headers: { authorization: "Bearer " + accessToken, "content-type": "application/json" },
      body: JSON.stringify({ summary: ev.summary, description: ev.description || "", start: { dateTime: ev.startISO, timeZone: "Europe/Madrid" }, end: { dateTime: ev.endISO, timeZone: "Europe/Madrid" } }),
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) return { ok: true };
    const t = await r.text().catch(() => "");
    return { ok: false, error: r.status + " " + t.slice(0, 240) };
  } catch (e) { return { ok: false, error: String((e as Error).message || e).slice(0, 160) }; }
}

/* ---------------------------------------------------------------- Google Meet REST API v2 (1.22.0) */
const MEET = "https://meet.googleapis.com/v2";
async function meetGet<T>(access: string, path: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const r = await fetch(MEET + path, { headers: { authorization: "Bearer " + access }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { ok: false, error: r.status + " " + (await r.text().catch(() => "")).slice(0, 240) };
    return { ok: true, data: await r.json() as T };
  } catch (e) { return { ok: false, error: String((e as Error).message || e).slice(0, 160) } ; }
}

export interface MeetRecord { name: string; startTime: string; endTime?: string; space?: string }
/** Reuniones desde `from` (como mucho 30 días: la API de Meet borra las transcripciones a los 30 días). */
export async function recentConferences(access: string, from?: Date, days = 30) {
  const floor = Date.now() - days * 86_400_000;
  const since = new Date(Math.max(floor, from ? from.getTime() : floor)).toISOString();
  const q = new URLSearchParams({ pageSize: "50", filter: `start_time>="${since}"` });
  return meetGet<{ conferenceRecords?: MeetRecord[] }>(access, "/conferenceRecords?" + q.toString());
}
export async function conferenceStart(access: string, record: string): Promise<Date | null> {
  const r = await meetGet<MeetRecord>(access, `/${record}`);
  return r.ok && r.data.startTime ? new Date(r.data.startTime) : null;
}
export async function transcriptsOf(access: string, record: string) {
  return meetGet<{ transcripts?: { name: string; state?: string }[] }>(access, `/${record}/transcripts`);
}
/** Frases de una transcripción con el nombre visible de quien habla. */
export async function transcriptLines(access: string, record: string, transcript: string, maxPages = 40): Promise<{ ok: true; lines: { speaker: string; text: string; start: string | null }[] } | { ok: false; error: string }> {
  const names = new Map<string, string>();
  let tok = "";
  for (let i = 0; i < 10; i++) {
    const p = await meetGet<{ participants?: { name: string; signedinUser?: { displayName?: string }; anonymousUser?: { displayName?: string }; phoneUser?: { displayName?: string } }[]; nextPageToken?: string }>(access, `/${record}/participants?pageSize=100${tok ? "&pageToken=" + encodeURIComponent(tok) : ""}`);
    if (!p.ok) return p;
    for (const x of p.data.participants ?? []) names.set(x.name, x.signedinUser?.displayName || x.anonymousUser?.displayName || x.phoneUser?.displayName || "Participante");
    if (!(tok = p.data.nextPageToken || "")) break;
  }
  const lines: { speaker: string; text: string; start: string | null }[] = [];
  tok = "";
  for (let i = 0; i < maxPages; i++) {
    const e = await meetGet<{ transcriptEntries?: { participant?: string; text?: string; startTime?: string }[]; nextPageToken?: string }>(access, `/${transcript}/entries?pageSize=100${tok ? "&pageToken=" + encodeURIComponent(tok) : ""}`);
    if (!e.ok) return e;
    for (const x of e.data.transcriptEntries ?? []) if (x.text) lines.push({ speaker: names.get(x.participant || "") || "Participante", text: x.text, start: x.startTime || null });
    if (!(tok = e.data.nextPageToken || "")) break;
  }
  return { ok: true, lines };
}
