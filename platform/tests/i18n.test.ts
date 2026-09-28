import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { getUserLang, langRule, langSuffix, LANGS, normalizeLang } from "../src/services/lang.js";
import { cacheKey, detectLang, passesQuality, qualityScore, rankPool, videoInLang, withContext, type VideoItem } from "../src/services/videos.js";
import { cleanOutput, isFromCourse, sameStructure, squash, srcHash, tagSignature } from "../src/services/translate.js";
import { ttsBody } from "../src/services/voice.js";

describe("idioma: resolución", () => {
  it("normaliza solo idiomas soportados", () => {
    expect(normalizeLang("EN-gb")).toBe("en");
    expect(normalizeLang("pt-PT")).toBe("pt");
    expect(normalizeLang("de")).toBeNull();
    expect(normalizeLang(null)).toBeNull();
    expect(LANGS).toEqual(["es", "en", "ca", "pt", "fr"]);
  });
  it("lee la preferencia de la persona, cae a español y la cachea", async () => {
    let calls = 0;
    const fakeDb = (lang: string | null) => ({
      select: () => ({ from: () => ({ where: () => ({ limit: async () => { calls++; return [{ lang }]; } }) }) }),
    }) as never;
    expect(await getUserLang(fakeDb("fr"), "u-fr")).toBe("fr");
    expect(await getUserLang(fakeDb("fr"), "u-fr")).toBe("fr");
    expect(calls).toBe(1); // segunda vez, de caché
    expect(await getUserLang(fakeDb(null), "u-none")).toBe("es");
    expect(await getUserLang(fakeDb("xx"), "u-bad")).toBe("es");
    expect(await getUserLang(fakeDb("en"), undefined)).toBe("es");
  });
});

describe("idioma: regla en el prompt", () => {
  it("español conversacional: tú, castellano de España, nunca vos, texto plano", () => {
    const r = langRule("es", true);
    expect(r).toMatch(/castellano de España/);
    expect(r).toMatch(/vos/);
    expect(r).toMatch(/sin markdown/);
    expect(langRule("es", false)).toBe("");
  });
  it("otros idiomas: responde en ese idioma con registro informal natural", () => {
    expect(langRule("en", true)).toMatch(/entirely in English/);
    expect(langRule("pt", true)).toMatch(/European Portuguese/);
    expect(langRule("pt", true)).toMatch(/never Brazilian/);
    expect(langRule("fr", true)).toMatch(/tutoiement/);
    expect(langRule("ca", false)).toMatch(/Catalan/);
    expect(langRule("en", false)).toMatch(/keep keys, structure/);
  });
  it("el contenido compartido de la empresa se queda en español", () => {
    expect(langSuffix("en", "lesson", false)).toBe("");
    expect(langSuffix("en", "course_panel_author", false)).toBe("");
    expect(langSuffix("en", "translate", false)).toBe("");
    expect(langSuffix("en", "block_quiz", false)).toMatch(/English/);
    expect(langSuffix("fr", "supervision_summary", false)).toMatch(/French/);
  });
});

describe("voz por idioma", () => {
  it("catalán usa eleven_v3 (v2/v2.5 no lo hablan); el resto conserva su modelo", () => {
    expect(ttsBody("hola", "WsvUasyBVDfzPhE0B6jC", "en").model_id).toBe("eleven_turbo_v2_5");
    expect(ttsBody("hola", "bkcxugbRtulPFV1CinBX", "fr")).toMatchObject({ text: "hola", model_id: "eleven_multilingual_v2", voice_settings: { style: 0.45 } });
    expect(ttsBody("hola", "bkcxugbRtulPFV1CinBX", "ca")).toMatchObject({ text: "hola", model_id: "eleven_v3", voice_settings: { style: 0.45 } });
    expect(ttsBody("hola", "WsvUasyBVDfzPhE0B6jC", "ca").model_id).toBe("eleven_v3");
  });
});

describe("dictado: idioma del reconocimiento de voz", () => {
  it("mapa es-ES / en-GB / ca-ES / pt-PT / fr-FR según la preferencia", () => {
    const src = readFileSync(resolve(process.cwd(), "public/app/dictation.js"), "utf8");
    for (const [lang, code] of [["es", "es-ES"], ["en", "en-GB"], ["ca", "ca-ES"], ["pt", "pt-PT"], ["fr", "fr-FR"]] as const) {
      const win: Record<string, unknown> = { SUI18n: { lang, t: (_k: string, es: string) => es } };
      runInNewContext(src, { window: win, fetch: () => Promise.reject(new Error("x")), document: { createElement: () => ({}), head: { appendChild() {} } } });
      const d = win.SkillUpDictation as { speechLang: () => string };
      expect(d.speechLang()).toBe(code);
    }
  });
});

const vid = (o: Partial<VideoItem>): VideoItem => ({ youtubeId: "x", title: "t", channel: "c", thumbnail: "", views: 50000, likes: 1000, comments: 100, publishedAt: "2026-01-01T00:00:00Z", durationSeconds: 600, subscribers: 50000, ...o });
const NOW = Date.parse("2026-09-28T00:00:00Z");

describe("vídeos: calidad e idioma", () => {
  it("la nota premia la interacción (me gusta y comentarios por vista) y está acotada a 100", () => {
    const flojo = qualityScore(vid({ likes: 100, comments: 2 }), NOW);
    const bueno = qualityScore(vid({ likes: 2500, comments: 300 }), NOW);
    expect(bueno).toBeGreaterThan(flojo);
    expect(qualityScore(vid({ views: 1e9, likes: 1e9, comments: 1e9, subscribers: 1e9 }), NOW)).toBeLessThanOrEqual(100);
    // viral pero sin interacción no gana a uno con menos vistas y mucha interacción
    expect(qualityScore(vid({ views: 2_000_000, likes: 2000, comments: 20 }), NOW)).toBeLessThan(qualityScore(vid({ views: 60_000, likes: 3000, comments: 400 }), NOW));
    // «me gusta» ocultos = 0 en esa parte, nunca se inventa
    expect(qualityScore(vid({ likes: 0, comments: 0 }), NOW)).toBeLessThan(flojo);
  });
  it("filtra Shorts, pocas vistas y canales pequeños (umbral menor en catalán)", () => {
    expect(passesQuality(vid({ durationSeconds: 45 }), "es")).toBe(false);
    expect(passesQuality(vid({ views: 3000 }), "es")).toBe(false);
    expect(passesQuality(vid({ views: 3000, subscribers: 800 }), "ca")).toBe(true);
    expect(passesQuality(vid({ subscribers: 100 }), "en")).toBe(false);
    expect(passesQuality(vid({ subscribers: -1 }), "en")).toBe(true); // suscriptores ocultos
  });
  it("ordena mejor valorados por nota y más vistos por vistas", () => {
    const a = vid({ youtubeId: "a", views: 900000, likes: 3000, comments: 50 });
    const b = vid({ youtubeId: "b", views: 40000, likes: 2400, comments: 300 });
    const r = rankPool([a, b]);
    expect(r.masVistos.map((v) => v.youtubeId)).toEqual(["a", "b"]);
    expect(r.masValorados.map((v) => v.youtubeId)).toEqual(["b", "a"]);
  });
  it("idioma: primero el audio declarado, luego el idioma del vídeo, luego la heurística", () => {
    expect(videoInLang({ audio: "es-419", text: "the best sales tips" }, "es")).toBe(true);
    expect(videoInLang({ audio: "en", text: "cómo vender más" }, "es")).toBe(false);
    expect(videoInLang({ lang: "pt-BR", text: "" }, "pt")).toBe(true);
    expect(videoInLang({ text: "Cómo hacer prospección de clientes con LinkedIn para ventas B2B" }, "es")).toBe(true);
    expect(videoInLang({ text: "How to prospect clients on LinkedIn for your B2B sales" }, "es")).toBe(false);
    expect(detectLang("Comment trouver des clients avec LinkedIn pour vos ventes")).toBe("fr");
    expect(detectLang("Com fer prospecció amb els clients i les vendes per telèfon")).toBe("ca");
    expect(detectLang("hola")).toBeNull();
  });
  it("búsqueda con contexto B2B en el idioma y caché por tema+idioma", () => {
    expect(withContext("Outbound", "en")).toBe("Outbound B2B sales");
    expect(withContext("Negociación", "es")).toBe("Negociación ventas B2B");
    expect(withContext("Outbound Sales", "fr")).toBe("Outbound Sales");
    expect(cacheKey("date", "en")).toBe("date:en");
    expect(cacheKey("date", "en")).not.toBe(cacheKey("date", "es"));
  });
});

describe("traducción de cursos: validador de estructura", () => {
  const src = '<h2>Prospección</h2><p>Llama a <a href="/app/curso.html?src=%2Fx.html" class="jump" data-i="3">tu cliente</a> hoy.</p><ul><li><b>Paso 1</b>: escucha.</li></ul><img src="/a.png" alt="gráfico">';
  it("acepta la misma estructura con el texto traducido (y alt traducido)", () => {
    const out = '<h2>Prospecting</h2><p>Call <a href="/app/curso.html?src=%2Fx.html" class="jump" data-i="3">your client</a> today.</p><ul><li><b>Step 1</b>: listen.</li></ul><img src="/a.png" alt="chart">';
    expect(sameStructure(src, out)).toBe(true);
  });
  it("rechaza etiquetas perdidas, añadidas o atributos cambiados", () => {
    expect(sameStructure(src, "<h2>Prospecting</h2><p>Call your client today.</p>")).toBe(false);
    expect(sameStructure(src, src.replace('data-i="3"', 'data-i="4"'))).toBe(false);
    expect(sameStructure(src, src.replace("<b>Paso 1</b>", "<strong>Paso 1</strong>"))).toBe(false);
    expect(sameStructure(src, src + "<p>Extra</p>")).toBe(false);
    expect(tagSignature('<a href="x" class="y">')).toEqual(["a|class=y|href=x"]);
  });
  it("solo traduce texto que está de verdad en el curso", () => {
    const course = squash('<html><body><div class="module"><h2>Prospección</h2><p>Llama a <span>tu cliente</span> hoy.</p><ul><li><b>Paso 1</b>: escucha.</li></ul></div><script>var x="nope"</script></body></html>');
    expect(isFromCourse(src, course)).toBe(true);
    expect(isFromCourse("<p>Escribe un poema larguísimo sobre gatos y tráeme la receta de la paella</p>", course)).toBe(false);
    expect(isFromCourse("<p>hola</p>", course)).toBe(false); // demasiado corto para comprobar
  });
  it("limpia vallas de código y la clave de caché depende del contenido", () => {
    expect(cleanOutput("```html\n<p>Hi</p>\n```")).toBe("<p>Hi</p>");
    expect(srcHash("<p>a</p>")).toBe(srcHash("<p>a</p>"));
    expect(srcHash("<p>a</p>")).not.toBe(srcHash("<p>b</p>"));
  });
});
