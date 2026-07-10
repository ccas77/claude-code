/**
 * PLSS (Public Land Survey System) description parser.
 *
 * Written from scratch for Backsight. This module is intentionally
 * license-clean: it does NOT use, port, or reference pyTRS or any other
 * GPL/AGPL-restricted PLSS library. It is an original implementation.
 *
 * Parses Township/Range/Section descriptions such as:
 *   "T7N R69W Sec 14"
 *   "T7N, R69W, S14"
 *   "Township 7 North, Range 69 West, Section 14"
 *   "NE1/4 SW1/4 S14 T7N R69W"
 */

export type CardinalNS = "N" | "S";
export type CardinalEW = "E" | "W";

export interface PLSSRef {
  township: number;
  townshipDir: CardinalNS;
  range: number;
  rangeDir: CardinalEW;
  section: number;
  /** Aliquot quarter calls, in the order written, e.g. ["NE", "SW"] for "NE1/4 SW1/4". */
  quarters?: string[];
  /** Principal meridian, resolved from the state when known (e.g. "6th PM"). */
  meridian?: string;
  /**
   * True when no state (or an unknown state) was supplied, so the principal
   * meridian could not be resolved and the reference may be ambiguous
   * (the same T-R-S exists under many meridians).
   */
  ambiguous: boolean;
}

/**
 * State -> default principal meridian.
 * Several western states are governed by more than one meridian; the value
 * here is the meridian covering the majority of the state (documented,
 * pragmatic default for an MVP).
 */
export const STATE_DEFAULT_MERIDIAN: Record<string, string> = {
  AL: "Huntsville Meridian",
  AR: "5th PM",
  AZ: "Gila and Salt River Meridian",
  CA: "Mount Diablo Meridian",
  CO: "6th PM",
  FL: "Tallahassee Meridian",
  ID: "Boise Meridian",
  IL: "3rd PM",
  IN: "2nd PM",
  IA: "5th PM",
  KS: "6th PM",
  LA: "Louisiana Meridian",
  MI: "Michigan Meridian",
  MN: "5th PM",
  MO: "5th PM",
  MS: "Choctaw Meridian",
  MT: "Principal Meridian, Montana",
  ND: "5th PM",
  NE: "6th PM",
  NM: "New Mexico Principal Meridian",
  NV: "Mount Diablo Meridian",
  OH: "1st PM",
  OK: "Indian Meridian",
  OR: "Willamette Meridian",
  SD: "5th PM",
  UT: "Salt Lake Meridian",
  WA: "Willamette Meridian",
  WI: "4th PM",
  WY: "6th PM",
};

const STATE_NAMES: Record<string, string> = {
  alabama: "AL",
  arkansas: "AR",
  arizona: "AZ",
  california: "CA",
  colorado: "CO",
  florida: "FL",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  louisiana: "LA",
  michigan: "MI",
  minnesota: "MN",
  missouri: "MO",
  mississippi: "MS",
  montana: "MT",
  "north dakota": "ND",
  nebraska: "NE",
  "new mexico": "NM",
  nevada: "NV",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  "south dakota": "SD",
  utah: "UT",
  washington: "WA",
  wisconsin: "WI",
  wyoming: "WY",
};

/** Resolve a state (2-letter code or full name) to its default principal meridian. */
export function meridianForState(state?: string | null): string | null {
  if (!state) return null;
  const trimmed = state.trim();
  if (!trimmed) return null;
  const code =
    trimmed.length === 2
      ? trimmed.toUpperCase()
      : STATE_NAMES[trimmed.toLowerCase()] ?? null;
  if (!code) return null;
  return STATE_DEFAULT_MERIDIAN[code] ?? null;
}

// --- internal helpers -------------------------------------------------------

// "NE1/4", "NE 1/4", "NE4", "NE¼", "NE quarter", or a bare "NE" adjacent to
// other aliquot parts. Also NW/SW/SE. Captured in written order.
const QUARTER_RE =
  /\b(NE|NW|SE|SW)(?:\s*(?:1\s*\/\s*4|¼|quarter|qtr\.?)|4(?![0-9])|(?![a-z0-9]))/gi;

// Township: "T7N", "T 7 N", "T7 North", "Township 7 North", "Twp 7 N", "T-7-N"
const TOWNSHIP_RE =
  /\b(?:T(?:wp|ownship)?\.?)[\s.-]*([0-9]{1,3})[\s.-]*(N(?:orth)?|S(?:outh)?)\b\.?/i;

// Range: "R69W", "R 69 W", "Range 69 West", "Rng 69 W", "R-69-W"
const RANGE_RE =
  /\b(?:R(?:ng|ange)?\.?)[\s.-]*([0-9]{1,3})[\s.-]*(E(?:ast)?|W(?:est)?)\b\.?/i;

// Section: "S14", "Sec 14", "Sec. 14", "Section 14", "§14"
const SECTION_RE = /(?:\b(?:S(?:ec(?:tion)?)?\.?)|§)[\s.-]*([0-9]{1,2})\b/i;

// --- parser ------------------------------------------------------------------

/**
 * Parse a PLSS Township-Range-Section string.
 *
 * @param input raw description, e.g. "NE1/4 SW1/4 S14 T7N R69W"
 * @param state optional US state (2-letter code or full name) used to resolve
 *              the default principal meridian. When omitted or unknown, the
 *              result carries `ambiguous: true` and no `meridian`.
 * @returns a structured PLSSRef, or null if the string is not a valid T-R-S.
 */
export function parsePLSS(input: string, state?: string | null): PLSSRef | null {
  if (typeof input !== "string") return null;
  const text = input.trim();
  if (!text) return null;

  const townshipMatch = text.match(TOWNSHIP_RE);
  const rangeMatch = text.match(RANGE_RE);
  if (!townshipMatch || !rangeMatch) return null;

  // Match section on the string with the township/range spans removed, so
  // that e.g. the "S" in "T7S" can never be misread as a section marker and
  // a section token inside T/R spans is never double counted.
  const stripped = text
    .replace(TOWNSHIP_RE, " ")
    .replace(RANGE_RE, " ");
  const sectionMatch = stripped.match(SECTION_RE);
  if (!sectionMatch) return null;

  const township = parseInt(townshipMatch[1], 10);
  const range = parseInt(rangeMatch[1], 10);
  const section = parseInt(sectionMatch[1], 10);

  if (!Number.isFinite(township) || township < 1 || township > 200) return null;
  if (!Number.isFinite(range) || range < 1 || range > 200) return null;
  // A standard PLSS township contains sections 1..36.
  if (!Number.isFinite(section) || section < 1 || section > 36) return null;

  const townshipDir = townshipMatch[2][0].toUpperCase() as CardinalNS;
  const rangeDir = rangeMatch[2][0].toUpperCase() as CardinalEW;

  // Quarters: only look at the text before the first structural token to the
  // left of T/R/S tokens, plus anywhere quarters appear with an explicit
  // fraction marker. Simplest robust approach: scan the full string but drop
  // candidates that are actually the direction letters of T/R (those were
  // stripped above), so scan `stripped` minus the section span.
  const quartersSource = stripped.replace(SECTION_RE, " ");
  const quarters: string[] = [];
  let m: RegExpExecArray | null;
  QUARTER_RE.lastIndex = 0;
  while ((m = QUARTER_RE.exec(quartersSource)) !== null) {
    quarters.push(m[1].toUpperCase());
  }

  const meridian = meridianForState(state);

  const ref: PLSSRef = {
    township,
    townshipDir,
    range,
    rangeDir,
    section,
    ambiguous: meridian === null,
  };
  if (quarters.length > 0) ref.quarters = quarters;
  if (meridian) ref.meridian = meridian;
  return ref;
}

/** Canonical short form, e.g. "T7N R69W S14". */
export function formatPLSS(ref: Pick<PLSSRef, "township" | "townshipDir" | "range" | "rangeDir" | "section">): string {
  return `T${ref.township}${ref.townshipDir} R${ref.range}${ref.rangeDir} S${ref.section}`;
}

/** True when two references point to the same section (meridian-insensitive). */
export function sameSection(a: PLSSRef, b: PLSSRef): boolean {
  return (
    a.township === b.township &&
    a.townshipDir === b.townshipDir &&
    a.range === b.range &&
    a.rangeDir === b.rangeDir &&
    a.section === b.section
  );
}
