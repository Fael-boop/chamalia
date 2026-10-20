import { describe, expect, it } from "vitest";
import { slugify } from "./panel.js";

describe("slugify", () => {
  it("removes accents and symbols", () => {
    expect(slugify("Salão da Ana & Cia!")).toBe("salao-da-ana-cia");
    expect(slugify("  Espaço  Beleza  ")).toBe("espaco-beleza");
  });

  it("never returns an empty slug", () => {
    expect(slugify("!!!")).toBe("cliente");
  });
});
