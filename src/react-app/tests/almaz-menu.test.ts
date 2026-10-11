import { describe, expect, it } from "vitest";
import { ALMAZ_MENU, cairoDateKey, findAlmazMenuItem, isAlmazEditionActive, isAlmazOrder, searchAlmazMenu } from "../../shared/almaz-menu";

describe("Almaz special edition menu", () => {
  it("only activates on October 11 in Cairo", () => {
    expect(cairoDateKey(new Date("2026-10-11T09:00:00Z"))).toBe("2026-10-11");
    expect(isAlmazEditionActive(new Date("2026-10-11T09:00:00Z"))).toBe(true);
    expect(isAlmazEditionActive(new Date("2026-10-12T09:00:00Z"))).toBe(false);
  });

  it("recognizes Almaz orders case-insensitively", () => {
    expect(isAlmazOrder(" Almaz ")).toBe(true);
    expect(isAlmazOrder("ALMAZ")).toBe(true);
    expect(isAlmazOrder("Another vendor")).toBe(false);
  });

  it("searches names, categories, and box descriptions", () => {
    expect(searchAlmazMenu("hawawshi").map((item) => item.name)).toContain("Hawawshi with Cheese");
    expect(searchAlmazMenu("desserts").every((item) => item.category === "Desserts")).toBe(true);
    expect(searchAlmazMenu("choice of 10").map((item) => item.name)).toEqual(["Party Box"]);
  });

  it("keeps prices as reference menu data", () => {
    expect(ALMAZ_MENU.length).toBeGreaterThan(40);
    expect(findAlmazMenuItem(" kebda ")?.priceEgp).toBe(85);
  });
});
