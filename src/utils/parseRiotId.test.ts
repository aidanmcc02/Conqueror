import { describe, it, expect } from "vitest";
import { parseRiotId } from "./parseRiotId.js";

describe("parseRiotId", () => {
  it("parses gameName#tagLine format", () => {
    expect(parseRiotId("FM Stew#MEEPS")).toEqual({
      gameName: "FM Stew",
      tagLine: "MEEPS",
    });
  });

  it("trims whitespace", () => {
    expect(parseRiotId("  Player  #  Tag  ")).toEqual({
      gameName: "Player",
      tagLine: "Tag",
    });
  });

  it("returns null for empty string", () => {
    expect(parseRiotId("")).toBeNull();
  });

  it("returns null when missing #", () => {
    expect(parseRiotId("NoTagLine")).toBeNull();
  });

  it("handles multiple # in tagLine (first wins)", () => {
    const result = parseRiotId("Name#Tag#Extra");
    expect(result).toEqual({ gameName: "Name", tagLine: "Tag#Extra" });
  });
});
