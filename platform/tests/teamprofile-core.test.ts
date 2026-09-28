import { describe, expect, it } from "vitest";
import { BIG5_ITEMS, PEDA_ITEMS, coreBrief, coreComplete, pedagogyOf } from "../src/services/teamprofile.js";

const core = Object.fromEntries([...PEDA_ITEMS.map((p) => [p.id, 0]), ...BIG5_ITEMS.map((x) => [x.id, 4])]) as Record<string, number>;

describe("provisional Team DNA profile", () => {
  it("is ready once «Cómo aprendes» and the Big Five blocks are answered", () => {
    const { [BIG5_ITEMS[0]!.id]: _dropped, ...partial } = core;
    expect(coreComplete(partial)).toBe(false);
    expect(coreComplete(core)).toBe(true);
  });

  it("describes how to teach without inventing the enneagram part", () => {
    const brief = coreBrief(core);
    expect(brief).toContain("provisional");
    expect(brief).toContain("Cómo aprende:");
    expect(brief).not.toContain("Eneatipo");
  });

  it("reads the preferred format from answers already given", () => {
    const formato = PEDA_ITEMS.find((p) => p.dim === "formato")!;
    expect(pedagogyOf({ [formato.id]: 1 }).formato).toBe(formato.options[1]!.key);
    expect(pedagogyOf({}).formato).toBeUndefined();
  });
});
