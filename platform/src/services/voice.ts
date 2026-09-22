// Voz del asistente = ElevenLabs (política de marca: voz de cara al usuario nunca es la del navegador).
// Proxy mínimo: nunca exponemos la clave al frontend. Sin clave -> el frontend cae a texto sin voz.
import { env } from "../config/env.js";

const API = "https://api.elevenlabs.io/v1";
// turbo v2.5 = baja latencia (empieza a hablar casi al instante) manteniendo buena expresividad.
// Marc pidió voz rápida y dinámica; v3 era muy expresivo pero lento de sintetizar. Revertible a eleven_v3.
const MODEL = "eleven_turbo_v2_5";

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

// Ajuste base: enérgica, con emoción, tono profesional (aire JARVIS). speaker_boost = presencia.
// speed 1.08 = ritmo vivo, no lento ni aburrido (ElevenLabs: 1.0 normal, >1 más rápido, rango ~0.7–1.2).
// Marc reportó voz demasiado rápida con stability 0.3 y demasiado LENTA a 1.0 -> subimos el ritmo por defecto.
// speed 1.2 = el MÁXIMO de ElevenLabs (rango 0.7–1.2); Marc reportó que a 1.08–1.14 aún sonaba lento.
// stability más baja = más emoción/énfasis (menos monótono); subimos el ritmo casi al tope por defecto.
const DEFAULT_SETTINGS = { stability: 0.40, similarity_boost: 0.85, use_speaker_boost: true, speed: 1.15 };
// Ritmo + carácter POR VOZ (Marc: cada tutor con su personalidad y su ritmo; ninguno lento). El "qué esperar"
// de cada personalidad se refuerza además en el prompt del tutor; aquí va el ritmo y el temperamento de la voz.
const VOICE_PROFILES: Record<string, { speed?: number; stability?: number }> = {
  "WsvUasyBVDfzPhE0B6jC": { speed: 1.2, stability: 0.35 },  // Diego (comercial): ágil, directo, con chispa
  "fjMC3Wxp5QfFT9wNGQOI": { speed: 1.2, stability: 0.37 },  // Álvaro (m): resolutivo, al grano
  "jQrhxsqzG6CPKo3ll0w9": { speed: 1.2, stability: 0.38 },  // Natalia (f): dinámica, motivadora
  "bkcxugbRtulPFV1CinBX": { speed: 1.16, stability: 0.40 }, // Marc (tú): cercano, natural pero con ritmo
  "oHMibLgDqXK3fjgFVtJ6": { speed: 1.15, stability: 0.44 }, // Inés (f): cálida y clara
  "iuYybvSfclFoJ9ab2Im6": { speed: 1.14, stability: 0.46 }, // Estela (f): serena pero sin arrastrar
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
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: settingsFor(voiceId) }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    return await r.arrayBuffer();
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
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: settingsFor(voiceId) }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    const d = await r.json() as any;
    const align = d.alignment || d.normalized_alignment;
    if (!d.audio_base64 || !align) return null;
    return {
      audioBase64: d.audio_base64,
      chars: align.characters || [],
      startsSec: align.character_start_times_seconds || [],
      endsSec: align.character_end_times_seconds || [],
    };
  } catch {
    return null;
  }
}
