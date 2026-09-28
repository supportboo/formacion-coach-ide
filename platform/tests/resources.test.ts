import { describe, expect, it } from "vitest";
import {
  amazonUrl, authorMatches, dedupeBy, excludedTool, videoTopics, countFor, forYou, keep, rank, scoreBook, scorePodcast, scoreVideo, tabOrder,
  type Kind, type Resource,
} from "../src/services/resources.js";

const j = (relevancia: number, autoridad: number) => ({ relevancia, autoridad, nivel: "intermedio", motivo: "" });
const influence = { key: "/works/OL3902892W", title: "Influence", author_name: ["Robert B. Cialdini"], edition_count: 28, first_publish_year: 1983,
  ratings_average: 3.9, ratings_count: 70, want_to_read_count: 1405, already_read_count: 89, currently_reading_count: 132 };
// Real Open Library figures (28-09-2026) for a popular pop-psychology title that showed up for «negociación».
const popular = { key: "/works/X", title: "Psicología oscura", author_name: ["Steven Turner"], edition_count: 3, ratings_average: 3.5, ratings_count: 37, want_to_read_count: 911 };

describe("quality agent scoring", () => {
  it("keeps a relevant reference book", () => {
    expect(keep(scoreBook(influence, j(85, 90)))).toBe(true);
  });

  it("drops a popular book judged off-topic", () => {
    const s = scoreBook(popular, j(30, 20));
    expect(s.valor).toBeGreaterThan(50);
    expect(keep(s)).toBe(false);
  });

  it("does not invent a rating when the book has none", () => {
    const s = scoreBook({ ...influence, ratings_count: 0, ratings_average: undefined }, j(80, 80));
    expect(Number.isFinite(s.total)).toBe(true);
  });

  it("scores videos from measured likes", () => {
    const v = { youtubeId: "a", title: "t", channel: "c", thumbnail: "", views: 250000, likes: 9000, comments: 600, subscribers: 180000, publishedAt: "2025-01-01", durationSeconds: 900 };
    expect(scoreVideo(v, j(80, 70)).calidad).toBeGreaterThan(scoreVideo({ ...v, likes: 0, comments: 0 }, j(80, 70)).calidad);
  });

  it("prefers an active podcast over one idle for a year", () => {
    const now = Date.parse("2026-09-28");
    const base = { collectionId: 1, collectionName: "Ventas B2B", artistName: "x", trackCount: 590, collectionViewUrl: "u" };
    const active = scorePodcast({ ...base, releaseDate: "2026-09-21" }, j(80, 60), now);
    const idle = scorePodcast({ ...base, releaseDate: "2025-08-01" }, j(80, 60), now);
    expect(active.calidad).toBeGreaterThan(idle.calidad);
  });

  it("matches authors by surname", () => {
    expect(authorMatches("Robert Cialdini", ["Robert B. Cialdini"])).toBe(true);
    expect(authorMatches("Daniel Pink", ["Robert B. Cialdini"])).toBe(false);
  });
});

describe("affiliation after the quality gate", () => {
  const res = (id: string, totalScore: number, affiliate: boolean) =>
    ({ kind: "book", id, scores: { calidad: 0, valor: 0, relevancia: 0, total: totalScore }, affiliate }) as unknown as Resource;

  it("lifts an affiliate item only when quality is close", () => {
    expect(rank([res("a", 75, false), res("b", 70, true)])[0]!.id).toBe("b");
    expect(rank([res("a", 90, false), res("b", 70, true)])[0]!.id).toBe("a");
  });

  it("builds Amazon links only when a tag is configured", () => {
    expect(amazonUrl("Influencia", "Cialdini", "9788496", undefined)).toBeNull();
    expect(amazonUrl("Influencia", "Cialdini", "9788496", "boomatik-21")).toContain("tag=boomatik-21");
  });
});

describe("personalization", () => {
  const r = (kind: Kind, n: number) => ({ kind, id: kind + n, scores: { total: 90 - n } }) as unknown as Resource;
  const groups = { video: [r("video", 1), r("video", 2)], podcast: [r("podcast", 1)], book: [r("book", 1), r("book", 2)], tool: [r("tool", 1)] };

  it("orders tabs by preferred format", () => {
    expect(tabOrder("texto")[0]).toBe("book");
    expect(tabOrder("audio")[0]).toBe("podcast");
    expect(tabOrder("video")[0]).toBe("video");
  });

  it("sizes «for you» by weekly time", () => {
    expect(countFor("Menos de 1 hora")).toBe(2);
    expect(countFor("5 horas o más")).toBe(8);
    expect(forYou(groups, "texto", "Menos de 1 hora").map((x) => x.kind)).toEqual(["book", "video"]);
    expect(forYou(groups, "video", "2-3 horas")).toHaveLength(4);
  });
});

describe("candidate gathering", () => {
  it("searches videos by course and its first modules", () => {
    const t = videoTopics("Prospección con IA", "Qué es prospectar · ICP · Perfil de LinkedIn · Mensajes", "es");
    expect(t[0]).toBe("Prospección con IA");
    expect(t).toHaveLength(4); // course + 3 modules; «ICP» is too short to search on its own
    expect(t.some((x) => x.startsWith("ICP"))).toBe(false);
  });
  it("drops podcasts repeated under the same name", () => {
    expect(dedupeBy([{ n: "Ventas B2B" }, { n: "ventas b2b " }, { n: "Otro" }], (x) => x.n.trim().toLowerCase())).toHaveLength(2);
  });
});

describe("client-competing tools", () => {
  it("never recommends tools that compete with the client's ERP", () => {
    expect(excludedTool("https://www.lemlist.com/")).toBe(true);
    expect(excludedTool("https://app.apollo.io/")).toBe(true);
    expect(excludedTool("https://www.linkedin.com/sales/")).toBe(false);
    expect(excludedTool("https://www.coursera.org/learn/x")).toBe(true); // training platforms are competitors
    expect(excludedTool("https://www.linkedin.com/learning/")).toBe(true);
  });
});
