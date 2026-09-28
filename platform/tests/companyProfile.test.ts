import { describe, expect, it } from "vitest";
import { isExcluded, profileSchema, promptBlock } from "../src/services/companyProfile.js";

const p = profileSchema.parse({ oferta: "ERP modular", limites: "No prometer plazos de implantación", herramientasExcluidas: ["HubSpot", "lemlist.com"] });

describe("company profile", () => {
  it("only reaches the prompts once a manager has validated it", () => {
    expect(promptBlock(p, null)).toBeNull();
    const block = promptBlock(p, new Date());
    expect(block).toContain("ERP modular");
    expect(block).toContain("No prometer plazos");
  });

  it("excludes tools by name or domain as the manager wrote them", () => {
    expect(isExcluded(p, { title: "HubSpot CRM", by: "hubspot.com", url: "https://www.hubspot.com" })).toBe(true);
    expect(isExcluded(p, { title: "Lemlist", by: "lemlist.com", url: "https://lemlist.com" })).toBe(true);
    expect(isExcluded(p, { title: "Fireflies", by: "fireflies.ai", url: "https://fireflies.ai" })).toBe(false);
  });
});
