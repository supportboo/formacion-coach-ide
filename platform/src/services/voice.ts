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
function ttsBody(text: string, voiceId: string) {
  return voiceId === MARC_VOICE
    ? { text, model_id: MARC_MODEL }
    : { text, model_id: MODEL, voice_settings: settingsFor(voiceId) };
}

// Máster «podcast»: voz cercana, cálida y presente, sin efecto (nada de radio ni casco). Duración intacta, así el
// resaltado palabra a palabra sigue cuadrando.
//   highpass 80 Hz       fuera rumble
//   +2 dB @ 140 Hz       cuerpo y calidez
//   -2,5 dB @ 320 Hz     quita el «barro» de habitación
//   +2,5 dB @ 3 kHz      presencia: se entiende cada palabra
//   -2 dB @ 6,5 kHz      suaviza las eses
//   +2 dB shelf 11 kHz   aire
//   acompressor 3:1      volumen estable, como un locutor
//   alimiter             sin picos al llegar al altavoz
const PODCAST_EQ = [
  "highpass=f=80",
  "equalizer=f=140:t=q:w=0.9:g=2",
  "equalizer=f=320:t=q:w=1.1:g=-2.5",
  "equalizer=f=3000:t=q:w=1.2:g=2.5",
  "equalizer=f=6500:t=q:w=2:g=-2",
  "highshelf=f=11000:g=2",
  "acompressor=threshold=-20dB:ratio=3:attack=8:release=160:makeup=2.5",
  "alimiter=limit=0.93",
].join(",");

/** Pasa el MP3 por la cadena podcast. Si ffmpeg no está o falla, devuelve el original: mejor sin EQ que mudo. */
export function podcastMaster(mp3: Buffer): Promise<Buffer> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (b: Buffer) => { if (!done) { done = true; resolve(b); } };
    try {
      const ff = spawn(process.env.FFMPEG_PATH || "ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-f", "mp3", "-i", "pipe:0",
        "-af", PODCAST_EQ, "-f", "mp3", "-c:a", "libmp3lame", "-b:a", "96k", "-ar", "44100", "-ac", "1", "pipe:1",
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
  // Marc (tú) no va aquí: usa los ajustes de su panel de ElevenLabs (ver MARC_VOICE).
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
export async function synthesize(text: string, voiceId: string): Promise<ArrayBuffer | null> {
  if (!env.ELEVENLABS_API_KEY) return null;
  try {
    const r = await fetch(`${API}/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify(ttsBody(text, voiceId)),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    const eq = await podcastMaster(Buffer.from(await r.arrayBuffer()));
    return eq.buffer.slice(eq.byteOffset, eq.byteOffset + eq.byteLength) as ArrayBuffer;
  } catch {
    return null;
  }
}

export interface TimedAudio { audioBase64: string; chars: string[]; startsSec: number[]; endsSec: number[] }

/** Sintetiza con marcas de tiempo por carácter, para resaltar palabra a palabra en vivo (karaoke). */
export async function synthesizeWithTimestamps(text: string, voiceId: string): Promise<TimedAudio | null> {
  if (!env.ELEVENLABS_API_KEY) return null;
  try {
    const r = await fetch(`${API}/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`, {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(ttsBody(text, voiceId)),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    const d = await r.json() as any;
    const align = d.alignment || d.normalized_alignment;
    if (!d.audio_base64 || !align) return null;
    return {
      audioBase64: (await podcastMaster(Buffer.from(d.audio_base64, "base64"))).toString("base64"),
      chars: align.characters || [],
      startsSec: align.character_start_times_seconds || [],
      endsSec: align.character_end_times_seconds || [],
    };
  } catch {
    return null;
  }
}
