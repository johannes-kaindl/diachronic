// vendored from code-kit@0.32.0, src/ts/pure/critic-compare.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/** Compare a text against its base and write the differences into the base as CriticMarkup — `markChanges(base, current)`.
 *
 *  Origin: born here for Diachronic (a Markdown review plugin), no ancestor in any repo (measured 2026-10-18 and again 2026-10-21).
 *  The nearest neighbour with the same job in the Obsidian store, "Revision Session Marks", handles plain prose only; its round-trip
 *  check is the requirement here, its code was not read or taken. Builds on `word-diff.ts` (`diffTokens`) and `critic-markup.ts`
 *  (`parseCritic`, the builders, `resolveMarks`, `codeSpans`). What is fixed here, and why:
 *
 *  1. **Existing marks are one unit each.** They enter the diff as a single token, so an unchanged mark stays byte-identical. A change
 *     that touches a mark of the base or of the current text — including removing one, or a mark newly typed into the current text — is
 *     refused as `inside-existing-mark`: CriticMarkup cannot nest, and merging someone else's open suggestion silently is the loss this
 *     module exists to prevent.
 *  2. **Wikilinks and embeds (`[[…]]`, `![[…]]`), Markdown links and images (`[…](…)`) and inline code are one unit each** too. A change
 *     inside one becomes a change of the whole unit, so a mark never cuts a link in half.
 *  3. **A change that touches a fenced code block is refused** (`code-block`): a mark inside code breaks the code, and a change that adds
 *     or removes a whole block cannot be shown as a mark around it.
 *  4. **Tables.** A change on a row (a line that begins with `|`) is refused (`table-structure`) when it contains a `|` or a line break,
 *     or when it begins at the first character of the row (a mark there turns the row into running text). A change inside a cell is
 *     marked as usual. Outside tables a mark may hold line breaks.
 *  5. **Terminators.** Text that holds the terminator of its mark is refused (`terminator`), `at` naming it in the current text (in the
 *     base text for the deleted or replaced side).
 *  6. **The round trip is part of the function.** Before returning, accepting the added marks must give exactly `current` and rejecting
 *     them exactly `base`, and parsing the result must find every added mark at the offset it was written at. The last part is what
 *     catches a stray `{++` of the user that would pair with the closer of a mark added behind it. Otherwise: `roundtrip`, `at` the
 *     first added mark that did not survive (0 if there is none). The probe is exported as {@link verifyMarked}.
 *
 *  `base` and `current` are note bodies — no frontmatter, no plugin zone; both may hold CriticMarkup. A change is read in the order of
 *  the rules above, each rule over all changes before the next one. Pure: no I/O, no clock. */

import { diffTokens, tokenizeWords, type WordChange, type WordToken } from "./word-diff";
import {
  buildDeletion, buildInsertion, buildSubstitution, codeSpans, parseCritic, resolveMarks,
  type CriticMark,
} from "./critic-markup";

export interface MarkChangesOptions { mergeGapTokens?: number; maxCells?: number }
export type MarkChangesRefusal = "roundtrip" | "terminator" | "inside-existing-mark" | "code-block" | "table-structure";
export type MarkChangesResult =
  | { ok: true; text: string; added: CriticMark[]; exact: boolean }
  | { ok: false; reason: MarkChangesRefusal; at: number };

type Span = [number, number];

interface Prepared {
  tokens: WordToken[];
  marks: CriticMark[];
  fenced: Span[];
  rows: Span[];
}

const LINK_RE = /!?\[\[[^\]\n]*\]\]|!?\[[^\]\n]*\]\([^)\n]*\)/g;

function overlaps(a: Span, b: Span): boolean { return a[0] < b[1] && b[0] < a[1]; }

/** A change `[a, b)` touches a span when it overlaps it, or is an insertion strictly inside it. */
function touches(a: number, b: number, s: Span): boolean {
  return a === b ? s[0] < a && a < s[1] : a < s[1] && b > s[0];
}

function segmentTokens(text: string, from: number, to: number, out: WordToken[]): void {
  for (const t of tokenizeWords(text.slice(from, to))) out.push({ ...t, start: t.start + from, end: t.end + from });
}

function prepare(text: string): Prepared {
  const parsed = parseCritic(text, { skipFrontmatter: false });
  const { fenced, inline } = codeSpans(text);
  const cands: Span[] = [...parsed.marks.map((m): Span => [m.start, m.end]), ...inline];
  for (const m of text.matchAll(LINK_RE)) {
    const s: Span = [m.index, m.index + m[0].length];
    if (!fenced.some((f) => overlaps(f, s))) cands.push(s);
  }
  // earliest first, the longer one on a tie; a candidate that overlaps one already taken is dropped (a link inside a mark is part of it)
  cands.sort((x, y) => x[0] - y[0] || y[1] - x[1]);
  const tokens: WordToken[] = [];
  let pos = 0;
  for (const s of cands) {
    if (s[0] < pos) continue;
    segmentTokens(text, pos, s[0], tokens);
    tokens.push({ text: text.slice(s[0], s[1]), start: s[0], end: s[1], kind: "word" });
    pos = s[1];
  }
  segmentTokens(text, pos, text.length, tokens);

  const rows: Span[] = [];
  let ls = 0;
  while (ls <= text.length) {
    let le = text.indexOf("\n", ls);
    if (le < 0) le = text.length;
    if (text.charAt(ls) === "|") rows.push([ls, le]);
    ls = le + 1;
  }
  return { tokens, marks: parsed.marks, fenced, rows };
}

function rowHit(rows: readonly Span[], a: number, b: number, changeText: string): boolean {
  return rows.some(([ls, le]) => a <= le && b >= ls && (a === ls || changeText.includes("|") || changeText.includes("\n")));
}

/** The round-trip probe of rule 6, on its own so a caller (and a test) can run it on a result it did not get from {@link markChanges}:
 *  `null` when accepting `added` in `text` gives `current`, rejecting them gives `base`, and parsing `text` finds every added mark at
 *  the offset it carries; otherwise an offset to point at (the first added mark that did not survive, or the first added mark). */
export function verifyMarked(base: string, current: string, text: string, added: readonly CriticMark[]): number | null {
  const firstAt = added[0]?.start ?? 0;
  if (resolveMarks(text, added, "accept") !== current || resolveMarks(text, added, "reject") !== base) return firstAt;
  const parsed = parseCritic(text, { skipFrontmatter: false }).marks;
  const lost = added.find((m) => !parsed.some((x) => x.kind === m.kind && x.start === m.start && x.end === m.end));
  return lost ? lost.start : null;
}

function refuse(reason: MarkChangesRefusal, at: number): MarkChangesResult { return { ok: false, reason, at }; }

export function markChanges(base: string, current: string, opts: MarkChangesOptions = {}): MarkChangesResult {
  const p = prepare(base);
  const q = prepare(current);
  const { changes, exact } = diffTokens(p.tokens, q.tokens, opts);
  if (changes.length === 0) return { ok: true, text: base, added: [], exact };

  const eachChange = (test: (c: WordChange) => number | null): number | null => {
    for (const c of changes) { const at = test(c); if (at !== null) return at; }
    return null;
  };

  // 1. existing marks
  const r1 = eachChange((c) => {
    const cur = q.marks.find((m) => touches(c.newStart, c.newEnd, [m.start, m.end]));
    if (cur) return cur.start;
    return p.marks.some((m) => touches(c.oldStart, c.oldEnd, [m.start, m.end])) ? c.newStart : null;
  });
  if (r1 !== null) return refuse("inside-existing-mark", r1);

  // 3. fenced code
  const r3 = eachChange((c) =>
    p.fenced.some((f) => touches(c.oldStart, c.oldEnd, f)) || q.fenced.some((f) => touches(c.newStart, c.newEnd, f)) ? c.newStart : null);
  if (r3 !== null) return refuse("code-block", r3);

  // 4. table rows
  const r4 = eachChange((c) =>
    rowHit(p.rows, c.oldStart, c.oldEnd, base.slice(c.oldStart, c.oldEnd)) || rowHit(q.rows, c.newStart, c.newEnd, current.slice(c.newStart, c.newEnd))
      ? c.newStart : null);
  if (r4 !== null) return refuse("table-structure", r4);

  // 5. build
  let out = "";
  let pos = 0;
  const added: CriticMark[] = [];
  for (const c of changes) {
    const oldPart = base.slice(c.oldStart, c.oldEnd);
    const newPart = current.slice(c.newStart, c.newEnd);
    out += base.slice(pos, c.oldStart);
    pos = c.oldEnd;
    const start = out.length;
    if (oldPart === "" || newPart === "") {
      const ins = oldPart === "";
      const b = ins ? buildInsertion(newPart) : buildDeletion(oldPart);
      if (!b.ok) return refuse("terminator", (ins ? c.newStart : c.oldStart) + b.at);
      out += b.text;
      added.push({ kind: ins ? "insertion" : "deletion", start, end: out.length, contentStart: start + 3, contentEnd: out.length - 3, text: ins ? newPart : oldPart });
    } else {
      const b = buildSubstitution(oldPart, newPart);
      if (!b.ok) {
        const o = buildSubstitution(oldPart, "");
        if (!o.ok) return refuse("terminator", c.oldStart + o.at);
        const n = buildSubstitution("", newPart);
        return refuse("terminator", c.newStart + (n.ok ? 0 : n.at));
      }
      out += b.text;
      added.push({ kind: "substitution", start, end: out.length, contentStart: start + 3, contentEnd: out.length - 3, text: oldPart, replacement: newPart });
    }
  }
  const text = out + base.slice(pos);

  // 6. round trip
  const fault = verifyMarked(base, current, text, added);
  if (fault !== null) return refuse("roundtrip", fault);

  return { ok: true, text, added, exact };
}
