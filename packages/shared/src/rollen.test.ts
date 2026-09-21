import { describe, expect, test } from "vitest";
import { hatRecht, istRolle, RECHTE, ROLLEN } from "./rollen.js";

describe("Rollen und Rechte", () => {
  test("Admin hat jedes Recht", () => {
    for (const recht of RECHTE) {
      expect(hatRecht("admin", recht)).toBe(true);
    }
  });

  test("Buero darf Stunden erfassen", () => {
    expect(hatRecht("buero", "stunden:schreiben")).toBe(true);
    expect(hatRecht("buero", "stammdaten:schreiben")).toBe(true);
  });

  test("Buero kommt nicht an Loehne, Kalkulation und Benutzer", () => {
    expect(hatRecht("buero", "loehne:lesen")).toBe(false);
    expect(hatRecht("buero", "loehne:schreiben")).toBe(false);
    expect(hatRecht("buero", "kalkulation:lesen")).toBe(false);
    expect(hatRecht("buero", "benutzer:verwalten")).toBe(false);
  });

  test("istRolle erkennt Unsinn aus einer Anfrage", () => {
    expect(istRolle("admin")).toBe(true);
    expect(istRolle("chef")).toBe(false);
    expect(istRolle(null)).toBe(false);
    expect(istRolle(undefined)).toBe(false);
    expect(istRolle(42)).toBe(false);
    expect(istRolle({ rolle: "admin" })).toBe(false);
  });

  test("jede Rolle ist in der Rechtetabelle hinterlegt", () => {
    // Faengt den Fall ab, dass jemand eine Rolle ergaenzt und die
    // Rechte dazu vergisst. Dann waere hatRecht() undefined-Zugriff.
    for (const rolle of ROLLEN) {
      expect(() => hatRecht(rolle, "stunden:lesen")).not.toThrow();
    }
  });
});
