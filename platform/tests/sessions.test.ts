import { describe, expect, it } from "vitest";
import { forModel, metrics, parseTranscript, speakers } from "../src/services/sessions.js";

const MEET = `Formación partners - Transcripción
00:00:00
Ana García: Buenos días. Hoy vais a salir sabiendo cualificar a un partner en diez minutos.
00:00:40
Ana García: Primero veremos el perfil ideal, después las preguntas. Por ejemplo, un integrador de Valencia con cinco consultores.
00:05:10
Carlos Ruiz: ¿Y si ya trabajan con otro ERP?
00:05:30
Ana García: Buena pregunta, Carlos. ¿Cómo lo abordaríais vosotros?
00:06:00
Lucía Pérez: Preguntaría qué les frena hoy.
00:06:30
Ana García: Exacto. ¿Se entiende? Para cerrar: resumen y tarea para el jueves.`;

describe("formaciones reales: lectura y métricas (1.22.0)", () => {
  it("lee la transcripción de Google Meet con marcas de tiempo y nombres", () => {
    const l = parseTranscript(MEET);
    expect(l.map((x) => x.speaker)).toEqual(["Ana García", "Carlos Ruiz", "Ana García", "Lucía Pérez", "Ana García"]);
    expect(l[0]!.start).toBe(0);
    expect(l[1]!.start).toBe(310);
    expect(speakers(l)[0]!.name).toBe("Ana García");
  });
  it("lee WebVTT con voces y el formato «Nombre (00:12): texto»", () => {
    const vtt = parseTranscript("WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\n<v Ana>Hola equipo</v>\n\n2\n00:00:05.000 --> 00:00:07.000\n<v Luis>Hola</v>");
    expect(vtt).toEqual([{ speaker: "Ana", text: "Hola equipo", start: 1 }, { speaker: "Luis", text: "Hola", start: 5 }]);
    const plain = parseTranscript("Ana (00:12): Empezamos\nLuis (01:02): Vale");
    expect(plain.map((x) => [x.speaker, x.start])).toEqual([["Ana", 12], ["Luis", 62]]);
  });
  it("métricas fijas: tiempo de palabra, preguntas, comprobaciones, ejemplos y tramo más largo", () => {
    const m = metrics(parseTranscript(MEET), "Ana García");
    expect(m.trainerShare).toBeGreaterThan(70);
    expect(m.trainerQuestions).toBe(2);
    expect(m.checks).toBe(1);
    expect(m.examples).toBe(1);
    expect(m.participants).toBe(2);
    expect(m.longestMonologueMin).toBe(5.2); // de 0:40 a 5:10 sin que nadie más hablara
  });
  it("al modelo solo le llega el nombre de quien forma como «FORMADOR»; el resto, anonimizado", () => {
    const t = forModel(parseTranscript(MEET), "Ana García");
    expect(t).toContain("FORMADOR:");
    expect(t).toContain("Participante 1:");
    expect(t).not.toMatch(/Carlos|Lucía|Ana García/);
  });
});

import { courseDigest, slidesScore } from "../src/services/sessions.js";
describe("presentación y conocimiento (1.24.0)", () => {
  it("nota de diapositivas con reglas fijas; las capturas sin contenido no cuentan", () => {
    expect(slidesScore([
      { titulo: "Perfil ideal", legible: "si", texto: "adecuado", unaIdea: true },
      { titulo: "Tabla de precios", legible: "parcial", texto: "excesivo", unaIdea: false },
      { titulo: "(sin contenido)", legible: "no", texto: "poco", unaIdea: false },
    ])).toBe(60); // (100 + 20) / 2
    expect(slidesScore([])).toBe(0);
  });
  it("el extracto de un curso lleva apartados y el arranque del texto, sin pasarse del tope", () => {
    const blocks = Array.from({ length: 20 }, (_, i) => ({ title: `Bloque ${i}`, headings: ["Uno", "Dos"], text: "x ".repeat(1000) }));
    const d = courseDigest(blocks, 700, 3000);
    expect(d).toContain("■ Bloque 0");
    expect(d).toContain("Apartados: Uno · Dos");
    expect(d.length).toBeLessThanOrEqual(3000);
  });
});
