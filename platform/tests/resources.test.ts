import { describe, expect, it } from "vitest";
import { authorMatches, countFor, keep, orderFor, personalize, scoreBook, scoreVideo, type Resource } from "../src/services/resources.js";

const influence = { key: "/works/OL3902892W", title: "Influence", author_name: ["Robert B. Cialdini"], edition_count: 28, first_publish_year: 1983,
  ratings_average: 3.9, ratings_count: 70, want_to_read_count: 1405, already_read_count: 89, currently_reading_count: 132 };
// Real Open Library figures (28-09-2026) for a very popular pop-psychology title that showed up for «negociación».
const popular = { key: "/works/X", title: "Psicología oscura", author_name: ["Steven Turner"], edition_count: 3, ratings_average: 3.5, ratings_count: 37, want_to_read_count: 911 };

describe("resources quality agent scoring", () => {
  it("keeps a reference book that is relevant to the section", () => {
    const s = scoreBook(influence, { relevancia: 85, autoridad: 90, nivel: "intermedio", motivo: "" });
    expect(keep(s)).toBe(true);
    expect(s.total).toBeGreaterThanOrEqual(60);
  });

  it("drops a popular book when the agent judges it off-topic", () => {
    const s = scoreBook(popular, { relevancia: 30, autoridad: 20, nivel: "inicial", motivo: "" });
    expect(s.valor).toBeGreaterThan(50);
    expect(keep(s)).toBe(false);
  });

  it("does not invent a rating when the book has none", () => {
    const noRatings = { ...influence, ratings_count: 0, ratings_average: undefined };
    const s = scoreBook(noRatings, { relevancia: 80, autoridad: 80, nivel: "intermedio", motivo: "" });
    expect(s.calidad).toBeGreaterThan(0);
    expect(Number.isFinite(s.total)).toBe(true);
  });

  it("scores videos from measured likes and reach", () => {
    const v = { youtubeId: "a", title: "t", channel: "c", thumbnail: "", views: 250000, likes: 9000, comments: 600, subscribers: 180000, publishedAt: "2025-01-01", durationSeconds: 900 };
    const good = scoreVideo(v, { relevancia: 80, autoridad: 70, nivel: "intermedio", motivo: "" });
    const hidden = scoreVideo({ ...v, likes: 0, comments: 0 }, { relevancia: 80, autoridad: 70, nivel: "intermedio", motivo: "" });
    expect(good.calidad).toBeGreaterThan(hidden.calidad);
  });

  it("matches authors by surname and rejects a different author", () => {
    expect(authorMatches("Robert Cialdini", ["Robert B. Cialdini"])).toBe(true);
    expect(authorMatches("Daniel Pink", ["Robert B. Cialdini"])).toBe(false);
  });
});

describe("resources personalization", () => {
  const r = (kind: "book" | "video", n: number) => ({ kind, id: kind + n, scores: { total: 90 - n } }) as unknown as Resource;
  const items = [r("book", 1), r("video", 1), r("book", 2), r("video", 2), r("book", 3)];

  it("puts books first for readers and videos first for viewers", () => {
    expect(orderFor(items, "texto")[0]!.kind).toBe("book");
    expect(orderFor(items, "video")[0]!.kind).toBe("video");
    expect(orderFor(items, "conversacion").map((x) => x.kind).slice(0, 2)).toEqual(["book", "video"]);
  });

  it("sizes the list by weekly time", () => {
    expect(countFor("Menos de 1 hora")).toBe(2);
    expect(countFor("2-3 horas")).toBe(4);
    expect(countFor("5 horas o más")).toBe(8);
    expect(personalize(items, "texto", "Menos de 1 hora")).toHaveLength(2);
  });
});
