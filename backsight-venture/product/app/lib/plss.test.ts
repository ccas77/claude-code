import { describe, expect, it } from "vitest";
import { formatPLSS, meridianForState, parsePLSS, sameSection } from "./plss";

describe("parsePLSS — accepted formats", () => {
  it('parses the compact form "T7N R69W Sec 14"', () => {
    expect(parsePLSS("T7N R69W Sec 14")).toMatchObject({
      township: 7,
      townshipDir: "N",
      range: 69,
      rangeDir: "W",
      section: 14,
      ambiguous: true,
    });
  });

  it('parses the comma form "T7N, R69W, S14"', () => {
    expect(parsePLSS("T7N, R69W, S14")).toMatchObject({
      township: 7,
      townshipDir: "N",
      range: 69,
      rangeDir: "W",
      section: 14,
    });
  });

  it('parses the long form "Township 7 North, Range 69 West, Section 14"', () => {
    expect(
      parsePLSS("Township 7 North, Range 69 West, Section 14"),
    ).toMatchObject({
      township: 7,
      townshipDir: "N",
      range: 69,
      rangeDir: "W",
      section: 14,
    });
  });

  it('parses quarters in "NE1/4 SW1/4 S14 T7N R69W"', () => {
    const ref = parsePLSS("NE1/4 SW1/4 S14 T7N R69W");
    expect(ref).not.toBeNull();
    expect(ref!.quarters).toEqual(["NE", "SW"]);
    expect(ref!.section).toBe(14);
    expect(ref!.township).toBe(7);
    expect(ref!.range).toBe(69);
  });

  it('parses abbreviated quarters like "NE4 SE4 Sec 22 T6N R68W"', () => {
    const ref = parsePLSS("NE4 SE4 Sec 22 T6N R68W");
    expect(ref).not.toBeNull();
    expect(ref!.quarters).toEqual(["NE", "SE"]);
    expect(ref!.section).toBe(22);
  });

  it("parses south townships and east ranges", () => {
    expect(parsePLSS("T3S R11E Sec 36")).toMatchObject({
      township: 3,
      townshipDir: "S",
      range: 11,
      rangeDir: "E",
      section: 36,
    });
  });

  it('parses "Twp 9 N, Rng 70 W, Sec. 1" abbreviations', () => {
    expect(parsePLSS("Twp 9 N, Rng 70 W, Sec. 1")).toMatchObject({
      township: 9,
      townshipDir: "N",
      range: 70,
      rangeDir: "W",
      section: 1,
    });
  });

  it("is case-insensitive and tolerant of extra whitespace", () => {
    expect(parsePLSS("  t7n   r69w   sec 14  ")).toMatchObject({
      township: 7,
      section: 14,
    });
  });
});

describe("parsePLSS — meridian resolution and ambiguity", () => {
  it("resolves the 6th PM for Colorado and clears the ambiguous flag", () => {
    const ref = parsePLSS("T7N R69W S14", "CO");
    expect(ref).toMatchObject({ meridian: "6th PM", ambiguous: false });
  });

  it("accepts full state names", () => {
    const ref = parsePLSS("T7N R69W S14", "Colorado");
    expect(ref).toMatchObject({ meridian: "6th PM", ambiguous: false });
  });

  it("flags ambiguous when the state is unknown", () => {
    const ref = parsePLSS("T7N R69W S14", "ZZ");
    expect(ref).not.toBeNull();
    expect(ref!.ambiguous).toBe(true);
    expect(ref!.meridian).toBeUndefined();
  });

  it("exposes the state → meridian table", () => {
    expect(meridianForState("CO")).toBe("6th PM");
    expect(meridianForState("WY")).toBe("6th PM");
    expect(meridianForState("OR")).toBe("Willamette Meridian");
    expect(meridianForState("TX")).toBeNull(); // Texas is not a PLSS state
  });
});

describe("parsePLSS — rejected inputs", () => {
  it("rejects an empty string", () => {
    expect(parsePLSS("")).toBeNull();
  });

  it("rejects a street address", () => {
    expect(parsePLSS("2214 Overlook Ct, Fort Collins, CO")).toBeNull();
  });

  it("rejects a township/range with no section", () => {
    expect(parsePLSS("T7N R69W")).toBeNull();
  });

  it("rejects a section with no township or range", () => {
    expect(parsePLSS("Section 14")).toBeNull();
  });

  it("rejects section numbers outside 1–36", () => {
    expect(parsePLSS("T7N R69W S37")).toBeNull();
    expect(parsePLSS("T7N R69W S0")).toBeNull();
  });

  it("does not misread the S in a south township as a section marker", () => {
    // "T3S R11E" alone has no section — must be null, not section 3.
    expect(parsePLSS("T3S R11E")).toBeNull();
  });

  it("does not misread state names containing quarter letters", () => {
    const ref = parsePLSS("T7N R69W S14 near Nebraska state line");
    expect(ref).not.toBeNull();
    expect(ref!.quarters).toBeUndefined();
  });
});

describe("helpers", () => {
  it("formats a canonical short form", () => {
    const ref = parsePLSS("Township 7 North, Range 69 West, Section 14")!;
    expect(formatPLSS(ref)).toBe("T7N R69W S14");
  });

  it("sameSection matches meridian-insensitively", () => {
    const a = parsePLSS("T7N R69W S14", "CO")!;
    const b = parsePLSS("NE1/4 S14 T7N R69W")!;
    const c = parsePLSS("T7N R69W S15")!;
    expect(sameSection(a, b)).toBe(true);
    expect(sameSection(a, c)).toBe(false);
  });
});
