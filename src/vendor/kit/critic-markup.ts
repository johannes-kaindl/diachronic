// vendored from code-kit@0.32.0, src/ts/pure/critic-markup.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/** CriticMarkup — read, resolve and build the five marks of the open review format (`{++add++}`, `{--del--}`,
 *  `{~~old~>new~~}`, `{==highlight==}`, `{>>comment<<}`) in a Markdown text.
 *
 *  Origin: born here for Diachronic (a Markdown review plugin). Measured 2026-10-18 and again 2026-10-21: no repo and neither
 *  kit holds a CriticMarkup parser, renderer or builder. The format has no escapes and no nesting, which is why the builders
 *  refuse text instead of repairing it. What is fixed here, and why:
 *
 *  1. **No nesting.** The first matching closer ends a mark, whatever stands inside is content — measured in Track Changes and in
 *     the Lezer parser of Commentator/Inkling: `{++a {>>b<<} c++}` is one insertion for both.
 *  2. **An opener without a closer is reported, not swallowed.** It goes to `unclosed`, and the search goes on right behind the
 *     opener, so a later mark is still found (Track Changes does that, the Lezer parser lets the opener eat the rest of the
 *     text and loses the later marks). A `{~~…~~}` without `~>` is reported the same way: nobody can say what accepting it would
 *     keep. The closer search is memoised per kind — once a kind has no closer after some position it has none after any later one
 *     — so ten thousand lone openers cost one scan, not ten thousand.
 *  3. **Code and frontmatter are skipped by default** (`skipCode`, `skipFrontmatter`): fenced blocks (a line of three or more
 *     backticks or tildes, up to a line of the same character and at least that length, or to the end of the text), inline code
 *     (a backtick run closed by a run of the same length inside the same paragraph) and a `---` block at the very start of the text. A
 *     mark that merely *contains* a code span is still one mark — only openers inside code are ignored. Indented code blocks are not
 *     recognised.
 *  4. **A thread is a mark followed by comments that touch it** (`end === start`, no character between) — the one form that Track
 *     Changes, Commentator and Inkling read alike. A comment without such a predecessor has `anchor: null`. Marks that carry no
 *     comment are not threads.
 *  5. **Resolving** only touches insertion, deletion and substitution; highlights and comments are left to {@link stripComments}.
 *     A comment that hangs behind a resolved change stays where it is.
 *  6. **Builders refuse text that holds a terminator of their kind** and name its offset in the text they were given
 *     ({@link CRITIC_TERMINATORS}). A substitution checks both texts against both terminators — a `~>` in the new text would parse
 *     (the first `~>` splits) but another reader may split at the last one.
 *
 *  Offsets are UTF-16 code units. Pure: no I/O, no clock. */

export type CriticKind = "insertion" | "deletion" | "substitution" | "highlight" | "comment";
export interface CriticMark {
  kind: CriticKind;
  start: number; end: number;               // whole mark including delimiters
  contentStart: number; contentEnd: number; // between the delimiters (substitution: old + "~>" + new)
  text: string;                             // insertion/deletion/highlight/comment: content; substitution: old text
  replacement?: string;                     // substitution: new text
}
export interface CriticParseOptions { skipCode?: boolean /* default true */; skipFrontmatter?: boolean /* default true */ }
export interface CriticParse { marks: CriticMark[]; unclosed: Array<{ start: number; kind: CriticKind }> }

const OPEN: Readonly<Record<CriticKind, string>> = { insertion: "{++", deletion: "{--", substitution: "{~~", highlight: "{==", comment: "{>>" };
const CLOSE: Readonly<Record<CriticKind, string>> = { insertion: "++}", deletion: "--}", substitution: "~~}", highlight: "==}", comment: "<<}" };
const KIND_OF_OPEN: Readonly<Record<string, CriticKind>> = { "{++": "insertion", "{--": "deletion", "{~~": "substitution", "{==": "highlight", "{>>": "comment" };
const SEPARATOR = "~>";

type Span = [number, number];

/** Fenced code blocks and inline code in `text`, from offset `from` on (half-open spans, sorted, disjoint). A fenced block is a line of
 *  three or more backticks or tildes up to a line of the same character and at least that length, or to the end of the text; inline
 *  code is a backtick run closed by a run of the same length inside the same paragraph. Indented code blocks are not recognised.
 *  Exported because `critic-compare` must treat the same places the same way. */
export function codeSpans(text: string, from = 0): { fenced: Array<[number, number]>; inline: Array<[number, number]> } {
  const fenced: Span[] = [];
  let lineStart = from;
  while (lineStart < text.length) {
    let lineEnd = text.indexOf("\n", lineStart);
    if (lineEnd < 0) lineEnd = text.length;
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(text.slice(lineStart, lineEnd));
    const fence = open?.[1];
    if (fence) {
      const ch = fence.charAt(0);
      let close = text.length;
      let next = lineEnd + 1;
      while (next <= text.length) {
        let nextEnd = text.indexOf("\n", next);
        if (nextEnd < 0) nextEnd = text.length;
        const m = /^ {0,3}(`{3,}|~{3,})[ \t]*\r?$/.exec(text.slice(next, nextEnd));
        const run = m?.[1];
        if (run && run.charAt(0) === ch && run.length >= fence.length) { close = nextEnd; break; }
        if (nextEnd >= text.length) break;
        next = nextEnd + 1;
      }
      fenced.push([lineStart, close]);
      lineStart = close + 1;
    } else {
      lineStart = lineEnd + 1;
    }
  }
  const inline: Span[] = [];
  let at = from;
  for (const [bs, be] of [...fenced, [text.length, text.length] as Span]) {
    inline.push(...inlineCode(text, at, bs));
    at = be;
  }
  return { fenced, inline };
}

/** Half-open spans of the text where an opener does not count: frontmatter, fenced blocks, inline code. Sorted, disjoint. */
function skipSpans(text: string, frontmatter: boolean, code: boolean): Span[] {
  const spans: Span[] = [];
  let pos = 0;
  if (frontmatter && /^---[ \t]*\r?\n/.test(text)) {
    const re = /^(?:---|\.\.\.)[ \t]*$/gm;
    re.lastIndex = text.indexOf("\n") + 1;
    const m = re.exec(text);
    if (m) { spans.push([0, m.index + m[0].length]); pos = m.index + m[0].length; }
  }
  if (!code) return spans;
  const { fenced, inline } = codeSpans(text, pos);
  return [...spans, ...[...fenced, ...inline].sort((x, y) => x[0] - y[0])];
}

/** Inline code spans in `text[from, to)`: a backtick run closed by the next run of exactly the same length, with no blank line between. */
function inlineCode(text: string, from: number, to: number): Span[] {
  const runs: Array<{ s: number; e: number }> = [];
  const re = /`+/g;
  re.lastIndex = from;
  for (let m = re.exec(text); m && m.index < to; m = re.exec(text)) runs.push({ s: m.index, e: Math.min(m.index + m[0].length, to) });
  // next[i] = index of the next run after i with the same length, from the right so the whole pass is linear.
  const next: number[] = new Array<number>(runs.length).fill(-1);
  const lastOfLength = new Map<number, number>();
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i];
    if (!r) continue;
    const len = r.e - r.s;
    next[i] = lastOfLength.get(len) ?? -1;
    lastOfLength.set(len, i);
  }
  const out: Span[] = [];
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    const j = next[i] ?? -1;
    const c = j >= 0 ? runs[j] : undefined;
    if (!r || !c) continue;
    if (/\n[ \t]*\r?\n/.test(text.slice(r.e, c.s))) continue;
    out.push([r.s, c.e]);
    while (i + 1 < runs.length && (runs[i + 1]?.s ?? Infinity) < c.e) i++;
  }
  return out;
}

export function parseCritic(text: string, opts: CriticParseOptions = {}): CriticParse {
  const spans = skipSpans(text, opts.skipFrontmatter ?? true, opts.skipCode ?? true);
  const marks: CriticMark[] = [];
  const unclosed: CriticParse["unclosed"] = [];
  // indexOf with a memory: a hit stays valid while it lies at or after `from`, and once there is no hit after some position there is
  // none after any later one — so a text full of lone openers is scanned once per kind, not once per opener.
  const finder = (needle: string): ((from: number) => number) => {
    let last = 0;
    return (from) => {
      if (last === -1) return -1;
      if (last >= from) return last;
      last = text.indexOf(needle, from);
      return last;
    };
  };
  const closer = { insertion: finder(CLOSE.insertion), deletion: finder(CLOSE.deletion), substitution: finder(CLOSE.substitution), highlight: finder(CLOSE.highlight), comment: finder(CLOSE.comment) };
  const separator = finder(SEPARATOR);
  let si = 0;
  const re = /\{(?:\+\+|--|~~|==|>>)/g;
  let pos = 0;
  for (;;) {
    re.lastIndex = pos;
    const m = re.exec(text);
    if (!m) break;
    const start = m.index;
    while (si < spans.length && (spans[si]?.[1] ?? 0) <= start) si++;
    const span = spans[si];
    if (span && span[0] <= start) { pos = span[1]; continue; }

    const kind = KIND_OF_OPEN[m[0]];
    if (!kind) { pos = start + 1; continue; }
    const contentStart = start + OPEN[kind].length;
    const contentEnd = closer[kind](contentStart);
    if (contentEnd < 0) { unclosed.push({ start, kind }); pos = contentStart; continue; }
    const end = contentEnd + CLOSE[kind].length;
    if (kind === "substitution") {
      const cut = separator(contentStart);
      if (cut < 0 || cut + SEPARATOR.length > contentEnd) { unclosed.push({ start, kind }); pos = contentStart; continue; }
      marks.push({ kind, start, end, contentStart, contentEnd, text: text.slice(contentStart, cut), replacement: text.slice(cut + SEPARATOR.length, contentEnd) });
    } else {
      marks.push({ kind, start, end, contentStart, contentEnd, text: text.slice(contentStart, contentEnd) });
    }
    pos = end;
  }
  return { marks, unclosed };
}

export interface CriticThread { anchor: CriticMark | null; comments: CriticMark[] }

export function groupThreads(marks: readonly CriticMark[]): CriticThread[] {
  const threads: CriticThread[] = [];
  let cur: CriticThread | null = null;
  let listed = false;
  let prevEnd = -1;
  for (const m of marks) {
    if (m.kind === "comment") {
      if (!cur || m.start !== prevEnd) { cur = { anchor: null, comments: [] }; listed = false; }
      cur.comments.push(m);
      if (!listed) { threads.push(cur); listed = true; }
    } else {
      // Any other mark may anchor the comments that touch it; it becomes a thread with the first one.
      cur = { anchor: m, comments: [] };
      listed = false;
    }
    prevEnd = m.end;
  }
  return threads;
}

export type CriticDecision = "accept" | "reject";

function resolved(m: CriticMark, decision: CriticDecision): string | null {
  const accept = decision === "accept";
  switch (m.kind) {
    case "insertion": return accept ? m.text : "";
    case "deletion": return accept ? "" : m.text;
    case "substitution": return accept ? (m.replacement ?? "") : m.text;
    default: return null;
  }
}

/** Resolves the given insertions, deletions and substitutions (accept: the new text stays, reject: the old one); other marks in
 *  `marks` are ignored. `marks` need not be sorted; a mark that overlaps an earlier one is skipped. Offsets must belong to `text`. */
export function resolveMarks(text: string, marks: readonly CriticMark[], decision: CriticDecision): string {
  let out = "";
  let pos = 0;
  for (const m of [...marks].sort((a, b) => a.start - b.start)) {
    const r = resolved(m, decision);
    if (r === null || m.start < pos) continue;
    out += text.slice(pos, m.start) + r;
    pos = m.end;
  }
  return out + text.slice(pos);
}

/** Resolves every insertion, deletion and substitution outside code and frontmatter. */
export function resolveAll(text: string, decision: CriticDecision): string {
  return resolveMarks(text, parseCritic(text).marks, decision);
}

/** Removes comments and unwraps highlights; changes stay. */
export function stripComments(text: string): string {
  let out = "";
  let pos = 0;
  for (const m of parseCritic(text).marks) {
    if (m.kind !== "comment" && m.kind !== "highlight") continue;
    out += text.slice(pos, m.start) + (m.kind === "highlight" ? m.text : "");
    pos = m.end;
  }
  return out + text.slice(pos);
}

export const CRITIC_TERMINATORS: Readonly<Record<CriticKind, readonly string[]>> = {
  insertion: ["++}"],
  deletion: ["--}"],
  substitution: [SEPARATOR, "~~}"],
  highlight: ["==}"],
  comment: ["<<}"],
};

export type CriticBuild = { ok: true; text: string } | { ok: false; reason: "terminator"; at: number };

function firstTerminator(text: string, kind: CriticKind): number {
  let at = -1;
  for (const t of CRITIC_TERMINATORS[kind]) {
    const i = text.indexOf(t);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  return at;
}

function build(kind: CriticKind, parts: readonly string[]): CriticBuild {
  for (const p of parts) {
    const at = firstTerminator(p, kind);
    if (at >= 0) return { ok: false, reason: "terminator", at };
  }
  return { ok: true, text: OPEN[kind] + parts.join(SEPARATOR) + CLOSE[kind] };
}

export function buildInsertion(text: string): CriticBuild { return build("insertion", [text]); }
export function buildDeletion(text: string): CriticBuild { return build("deletion", [text]); }
export function buildSubstitution(oldText: string, newText: string): CriticBuild { return build("substitution", [oldText, newText]); }
export function buildHighlight(text: string): CriticBuild { return build("highlight", [text]); }
export function buildComment(text: string): CriticBuild { return build("comment", [text]); }
