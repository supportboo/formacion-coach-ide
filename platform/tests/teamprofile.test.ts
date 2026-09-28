import { describe, expect, it } from "vitest";
import {
  ALL_IDS, BIG5_ITEMS, BLOCKS, ENNEA_ITEMS, HEXADS, HEXAD_ITEMS, PEDA_ITEMS,
  missingItems, profileBrief, profileView, sanitizeAnswers, scoreBigFive, scoreEnneagram, scoreHexad, scoreProfile,
  type Answers,
} from "../src/services/teamprofile.js";

/** Full answer sheet: every Likert item = `fill`, pedagogy = first option, then overrides. */
function sheet(fill: number, over: Answers = {}): Answers {
  const a: Answers = {};
  for (const id of ALL_IDS) a[id] = id.startsWith("p") ? 0 : fill;
  return { ...a, ...over };
}

describe("Team DNA v2 catalog", () => {
  it("has 91 unique items split in blocks of at most 12, with 5 items per enneagram type", () => {
    expect(new Set(ALL_IDS).size).toBe(ALL_IDS.length);
    expect(ALL_IDS.length).toBe(45 + 20 + 18 + PEDA_ITEMS.length);
    for (const b of BLOCKS) expect(b.items.length).toBeLessThanOrEqual(12);
    for (let t = 1; t <= 9; t++) expect(ENNEA_ITEMS.filter((x) => x.type === t)).toHaveLength(5);
    for (const h of HEXADS) expect(HEXAD_ITEMS.filter((x) => x.hex === h)).toHaveLength(3);
  });

  it("sanitizes unknown ids and out-of-range values", () => {
    expect(sanitizeAnswers({ e1: 5, e2: 0, e3: 6, b1: 2.5, p1: 2, p2: 2, zz: 3 })).toEqual({ e1: 5, p1: 2 });
    expect(missingItems(sheet(3))).toEqual([]);
    expect(missingItems({})).toHaveLength(ALL_IDS.length);
  });
});

describe("Enneagram scoring", () => {
  it("every type 1-9 is reachable", () => {
    for (let t = 1; t <= 9; t++) {
      const over: Answers = {};
      for (const x of ENNEA_ITEMS) over[x.id] = x.type === t ? 5 : 1;
      const r = scoreEnneagram(sheet(3, over));
      expect(r.type).toBe(t);
      expect(r.scores[t]).toBe(100);
    }
  });

  it("wing is the stronger neighbour, wrapping 9↔1", () => {
    const over: Answers = {};
    for (const x of ENNEA_ITEMS) over[x.id] = x.type === 9 ? 5 : x.type === 1 ? 4 : x.type === 8 ? 2 : 1;
    const r = scoreEnneagram(over);
    expect(r.type).toBe(9);
    expect(r.wing).toBe(1);
    expect(r.second).toBe(1);
  });

  it("ties are deterministic (lowest type number, left wing)", () => {
    const r = scoreEnneagram(sheet(3));
    expect(r.type).toBe(1);
    expect(r.wing).toBe(9);
  });
});

describe("Big Five scoring (reverse-keyed items)", () => {
  it("agreeing with positive items and disagreeing with reverse ones gives 100", () => {
    const a: Answers = {};
    for (const x of BIG5_ITEMS) a[x.id] = x.r ? 1 : 5;
    expect(scoreBigFive(a)).toEqual({ O: 100, C: 100, E: 100, A: 100, N: 100 });
  });

  it("answering 5 to everything cancels out to the midpoint", () => {
    const a: Answers = {};
    for (const x of BIG5_ITEMS) a[x.id] = 5;
    // O has 1 positive + 3 reverse items → (5+1+1+1)/4 = 2 → 25; others 2+2 → 3 → 50.
    expect(scoreBigFive(a)).toEqual({ O: 25, C: 50, E: 50, A: 50, N: 50 });
  });
});

describe("Hexad scoring", () => {
  it("each player type can be dominant and the runner-up is second", () => {
    HEXADS.forEach((h, i) => {
      const next = HEXADS[(i + 1) % HEXADS.length]!;
      const a: Answers = {};
      for (const x of HEXAD_ITEMS) a[x.id] = x.hex === h ? 5 : x.hex === next ? 4 : 1;
      const r = scoreHexad(a);
      expect(r.main).toBe(h);
      expect(r.second).toBe(next);
    });
  });
});

describe("profile view and brief", () => {
  it("produces a Spanish brief for tutors and a full card without undefined text", () => {
    const over: Answers = {};
    for (const x of ENNEA_ITEMS) over[x.id] = x.type === 5 ? 5 : 2;
    const r = scoreProfile(sheet(3, over));
    const brief = profileBrief(r);
    expect(brief).toContain("Eneatipo 5");
    expect(brief).toContain("El Investigador");
    expect(brief).not.toMatch(/undefined|NaN/);
    expect(brief.length).toBeLessThan(1800);
    const v = profileView(r);
    expect(v.titulo).toBe("El Investigador");
    expect(v.rasgos).toHaveLength(5);
    expect(v.comoAprendes).toHaveLength(PEDA_ITEMS.length);
    expect(JSON.stringify(v)).not.toMatch(/undefined|NaN/);
  });
});
