// Voz del asistente = ElevenLabs (política de marca: voz de cara al usuario nunca es la del navegador).
// Proxy mínimo: nunca exponemos la clave al frontend. Sin clave -> el frontend cae a texto sin voz.
import { spawn } from "node:child_process";
import { env } from "../config/env.js";

const API = "https://api.elevenlabs.io/v1";
// turbo v2.5 = baja latencia (empieza a hablar casi al instante) manteniendo buena expresividad.
// Marc pidió voz rápida y dinámica; v3 era muy expresivo pero lento de sintetizar. Revertible a eleven_v3.
const MODEL = "eleven_turbo_v2_5";
// Voz de Marc = su clon PRO «Marc Herrero ES PRO». Referencia aprobada de oído (2026-09-23): multilingual_v2 y los
// ajustes GUARDADOS EN SU PANEL de ElevenLabs (no se mandan voice_settings: el panel es la única fuente de verdad,
// igual que BOO Manager y BOO SEO PRO). Si falla, no se sustituye por otra voz suya: queda en solo texto.
const MARC_VOICE = "bkcxugbRtulPFV1CinBX";
const MARC_MODEL = "eleven_multilingual_v2";
// Idiomas (1.5.0, docs ElevenLabs «Models», consultadas 2026-09-28): multilingual_v2 (29 idiomas) y flash/turbo v2.5
// (32) hablan inglés, portugués y francés además de español, así que el texto en el idioma de la persona se lee en ese
// idioma con el mismo modelo. El catalán NO está en v2 ni en v2.5: solo en eleven_v3 (70+ idiomas), que se usa para «ca»
// (más lento de sintetizar). La voz de Marc sigue sin voice_settings (su panel manda) también en catalán.
const CA_MODEL = "eleven_v3";
export function ttsBody(text: string, voiceId: string, lang = "es") {
  if (lang === "ca") return voiceId === MARC_VOICE ? { text, model_id: CA_MODEL } : { text, model_id: CA_MODEL, voice_settings: settingsFor(voiceId) };
  return voiceId === MARC_VOICE
    ? { text, model_id: MARC_MODEL }
    : { text, model_id: MODEL, voice_settings: settingsFor(voiceId) };
}

// Voz de Marc = el máster v5 del vídeo explicativo de Brandooers, aprobado de oído el 25-09 y elegido por Marc para los
// cursos el 28-09 («esa ecualización de voz es perfecta para cursos»). Reductor de respiraciones (expansor descendente:
// hunde lo que suena en los huecos, ~-30/-45 dB, y deja pasar el habla expresiva), de-esser, compresión suave y nivel
// uniforme a -14 LUFS. Los ajustes de la voz siguen siendo los de su panel de ElevenLabs (donde se sigue entrenando).
// Duración intacta: el resaltado palabra a palabra cuadra.
const MARC_EQ = [
  "highpass=f=85",
  "compand=attacks=0.003:decays=0.18:points=-80/-80|-45/-75|-30/-45|-26/-28|-6/-6|0/-2",
  "deesser=i=0.3",
  "acompressor=threshold=-18dB:ratio=2:makeup=1.5",
  "loudnorm=I=-14:TP=-1.2:LRA=7",
  "alimiter=limit=0.89",
];
const CLEAN_EQ = [
  "highpass=f=80",
  "equalizer=f=320:t=q:w=1.1:g=-1.5",    // un punto menos de «habitación»
];
const BROADCAST = [
  "acompressor=threshold=-20dB:ratio=3:attack=8:release=160:makeup=2.5", // volumen estable, como un locutor
  "alimiter=limit=0.93",                                                  // sin picos en el altavoz
];
function eqFor(voiceId: string) { return (voiceId === MARC_VOICE ? MARC_EQ : [...CLEAN_EQ, ...BROADCAST]).join(","); }

/** Pasa el MP3 por la cadena podcast. Si ffmpeg no está o falla, devuelve el original: mejor sin EQ que mudo. */
export function podcastMaster(mp3: Buffer, voiceId: string): Promise<Buffer> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (b: Buffer) => { if (!done) { done = true; resolve(b); } };
    try {
      const ff = spawn(process.env.FFMPEG_PATH || "ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-f", "mp3", "-i", "pipe:0",
        "-af", eqFor(voiceId), "-f", "mp3", "-c:a", "libmp3lame", "-b:a", "96k", "-ar", "44100", "-ac", "1", "pipe:1",
      ]);
      const out: Buffer[] = [];
      const timer = setTimeout(() => { ff.kill("SIGKILL"); finish(mp3); }, 10000);
      ff.stdout.on("data", (c: Buffer) => out.push(c));
      ff.on("error", () => { clearTimeout(timer); finish(mp3); });
      ff.on("close", (code) => { clearTimeout(timer); const b = Buffer.concat(out); finish(code === 0 && b.length ? b : mp3); });
      ff.stdin.on("error", () => {});
      ff.stdin.end(mp3);
    } catch { finish(mp3); }
  });
}

export interface VoiceOpt { id: string; name: string; accent?: string }

// Voces peninsulares humanas curadas (verificadas en la cuenta). Ines primero (aprobada por Marc);
// sin voces de Marc. Marc puede reordenar/ampliar con env ELEVENLABS_EXTRA_VOICES="id:Nombre|id:Nombre".
const VOICES: VoiceOpt[] = [
  { id: "bkcxugbRtulPFV1CinBX", name: "Marc (tú)", accent: "peninsular" },
  { id: "oHMibLgDqXK3fjgFVtJ6", name: "Inés (f)", accent: "peninsular" },
  { id: "jQrhxsqzG6CPKo3ll0w9", name: "Natalia (f)", accent: "peninsular" },
  { id: "WsvUasyBVDfzPhE0B6jC", name: "Diego (m)", accent: "peninsular" },
  { id: "fjMC3Wxp5QfFT9wNGQOI", name: "Álvaro (m)", accent: "peninsular" },
  { id: "iuYybvSfclFoJ9ab2Im6", name: "Estela (f)", accent: "peninsular" },
];

// Ajuste base: ritmo natural y activo (como una persona hablando con energía), no acelerado.
// 2026-09-27: Marc reportó la voz «hiper rápida» a 1.15–1.2 (el máximo de ElevenLabs, rango 0.7–1.2) -> volvemos
// a un punto apenas por encima de 1.0. Si vuelve a sonar lenta, subir de 0.02 en 0.02, nunca por encima de 1.10.
const DEFAULT_SETTINGS = { stability: 0.45, similarity_boost: 0.85, use_speaker_boost: true, speed: 1.06 };
// Ritmo + carácter POR VOZ (cada tutor con su personalidad; ninguno lento ni atropellado).
const VOICE_PROFILES: Record<string, { speed?: number; stability?: number }> = {
  "WsvUasyBVDfzPhE0B6jC": { speed: 1.08, stability: 0.40 }, // Diego (comercial): ágil, directo, con chispa
  "fjMC3Wxp5QfFT9wNGQOI": { speed: 1.08, stability: 0.42 }, // Álvaro (m): resolutivo, al grano
  "jQrhxsqzG6CPKo3ll0w9": { speed: 1.08, stability: 0.42 }, // Natalia (f): dinámica, motivadora
  // Marc (tú) no va aquí: manda el panel de su voz PRO en ElevenLabs (regla de Marc, 2026-09-27/28).
  "oHMibLgDqXK3fjgFVtJ6": { speed: 1.05, stability: 0.47 }, // Inés (f): cálida y clara
  "iuYybvSfclFoJ9ab2Im6": { speed: 1.04, stability: 0.48 }, // Estela (f): serena pero sin arrastrar
};
function settingsFor(voiceId: string) { return { ...DEFAULT_SETTINGS, ...(VOICE_PROFILES[voiceId] || {}) }; }

function envVoices(): VoiceOpt[] | null {
  const raw = env.ELEVENLABS_EXTRA_VOICES?.trim();
  if (!raw) return null;
  const out = raw.split("|").map((s) => {
    const [id, ...rest] = s.split(":");
    return id?.trim() ? { id: id.trim(), name: rest.join(":").trim() || id.trim() } : null;
  }).filter((v): v is VoiceOpt => !!v);
  return out.length ? out : null;
}

/** Voces disponibles para el selector del asistente. */
export async function listVoices(): Promise<{ voices: VoiceOpt[]; provider: "elevenlabs" | "none" }> {
  if (!env.ELEVENLABS_API_KEY) return { voices: VOICES, provider: "none" };
  return { voices: envVoices() ?? VOICES, provider: "elevenlabs" };
}

/** Sintetiza texto -> MP3. Devuelve null si no hay clave o falla (el frontend degrada a solo texto). */
export async function synthesize(text: string, voiceId: string, lang = "es"): Promise<ArrayBuffer | null> {
  if (!env.ELEVENLABS_API_KEY) return null;
  try {
    const r = await fetch(`${API}/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify(ttsBody(text, voiceId, lang)),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    const eq = await podcastMaster(Buffer.from(await r.arrayBuffer()), voiceId);
    return eq.buffer.slice(eq.byteOffset, eq.byteOffset + eq.byteLength) as ArrayBuffer;
  } catch {
    return null;
  }
}

export interface TimedAudio { audioBase64: string; chars: string[]; startsSec: number[]; endsSec: number[] }

/** Sintetiza con marcas de tiempo por carácter, para resaltar palabra a palabra en vivo (karaoke). */
export async function synthesizeWithTimestamps(text: string, voiceId: string, lang = "es"): Promise<TimedAudio | null> {
  if (!env.ELEVENLABS_API_KEY) return null;
  try {
    const r = await fetch(`${API}/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`, {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(ttsBody(text, voiceId, lang)),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    const d = await r.json() as any;
    const align = d.alignment || d.normalized_alignment;
    if (!d.audio_base64 || !align) return null;
    return {
      audioBase64: (await podcastMaster(Buffer.from(d.audio_base64, "base64"), voiceId)).toString("base64"),
      chars: align.characters || [],
      startsSec: align.character_start_times_seconds || [],
      endsSec: align.character_end_times_seconds || [],
    };
  } catch {
    return null;
  }
}
