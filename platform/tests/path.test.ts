import { describe, expect, it } from "vitest";
import { coursePct, stageOf } from "../src/services/path.js";

describe("specialist path", () => {
  it("starts at base until a specialty is chosen", () => {
    expect(stageOf({ specialty: null, pct: 100, certified: true, coach: true })).toBe("base");
  });
  it("stays in especialidad until the course is finished", () => {
    expect(stageOf({ specialty: "outbound-sales", pct: 60, certified: false, coach: true })).toBe("especialidad");
  });
  it("becomes especialista on finishing, and coach only with coach level or role", () => {
    expect(stageOf({ specialty: "outbound-sales", pct: 100, certified: false, coach: false })).toBe("especialista");
    expect(stageOf({ specialty: "outbound-sales", pct: 40, certified: true, coach: true })).toBe("coach");
  });
  it("measures progress by passed blocks, 100 with certificate", () => {
    expect(coursePct(3, 12, false)).toBe(25);
    expect(coursePct(0, 0, false)).toBe(0);
    expect(coursePct(1, 12, true)).toBe(100);
  });
});
