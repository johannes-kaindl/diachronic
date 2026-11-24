// vendored from code-kit@0.87.0, src/ts/pure/code-spans.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
// Origin: lifted out of `critic-markup.ts` (`inlineCode`, Welle 36) and `obsidian-kit` `text-swap-editor.ts` (`inlineCodeRanges`), which carried the same pairing twice with
// the same gap (Welle 36, kp5, review round 2, R3: a backtick behind a backslash is no delimiter). One pairer, so the two cannot drift apart again.
//
// Where the inline code of a Markdown text is, by CommonMark's rules (section 6.1, "Code spans"), as far as a plain text scan can say it:
//  - A code span opens with a run of backticks and closes with the NEXT run of exactly the same length. Runs of other lengths between them are content. A run without
//    a partner is text.
//  - A backslash in front of a backtick escapes it: `\`` is a literal backtick and opens nothing. In a run of several (`\``) the first backtick is the escaped one, the
//    rest is a run one shorter. An even number of backslashes escapes nothing (the last escapes the one before). Only an OPENING run is read this way: inside a code
//    span a backslash does not escape, so `a\` closes the span `a\` and the run behind the backslash is a closer by its full length.
//  - A blank line ends the paragraph; a span does not reach across it. (A line of spaces or tabs and an optional CR counts as blank.)
// Not here, named: the other things that decide whether a backtick starts code, namely fenced blocks, indented code, HTML, and a backtick inside a link target. The
// caller cuts those out first (`codeSpans` of `critic-markup` does so for fenced blocks) and passes the stretch of text that is left (`from`, `to`).
//
// Linear: one pass for the runs and the blank lines, one pass from the right for "the next run of length n" (a table length -> index, not a search per run), one pass
// for the pairing; the backslashes in front of a run are counted once per run, and every backslash belongs to one run at most.

/** One code span. `start` and `end` are positions in the text (half-open) and include both backtick runs; `run` is the length of each run, so the content is
 *  `text.slice(start + run, end - run)`. For an escaped opener `start` is the position of the first backtick that is NOT escaped. */
export interface InlineCodeSpan {
  readonly start: number;
  readonly end: number;
  readonly run: number;
}

/** The code spans in `text[from, to)`, in order and without overlap. A run that reaches `to` is cut there. `from` and `to` default to the whole text. */
export function findInlineCodeSpans(text: string, from = 0, to: number = text.length): InlineCodeSpan[] {
  const start0 = Math.max(0, from);
  const end0 = Math.min(text.length, to);
  if (start0 >= end0) return [];
  const starts: number[] = [];
  const ends: number[] = [];
  const re = /`+/g;
  re.lastIndex = start0;
  for (let m = re.exec(text); m !== null && m.index < end0; m = re.exec(text)) {
    starts.push(m.index);
    ends.push(Math.min(m.index + m[0].length, end0));
  }
  const n = starts.length;
  if (n < 2) return []; // a single run has no partner

  // the paragraph of every run: the number of blank lines before it, walked with one pointer
  const paragraph = new Array<number>(n).fill(0);
  const blank = /\n[ \t]*\r?\n/g;
  blank.lastIndex = start0;
  let blanks = 0;
  let pending = blank.exec(text);
  for (let i = 0; i < n; i++) {
    const at = starts[i] ?? 0;
    while (pending !== null && pending.index + pending[0].length <= at) {
      blanks += 1;
      pending = blank.exec(text);
    }
    paragraph[i] = blanks;
  }

  // closer[i]: the next run after i whose length is the length i opens with (its own, or one less when its first backtick is escaped), from the right
  const open = new Array<number>(n).fill(0); // the length run i opens with; 0 when it opens nothing
  const shift = new Array<number>(n).fill(0); // 1 when the first backtick of run i is escaped
  const closer = new Array<number>(n).fill(-1);
  const lastOfLength = new Map<number, number>();
  for (let i = n - 1; i >= 0; i--) {
    const len = (ends[i] ?? 0) - (starts[i] ?? 0);
    const cut = escapes(text, starts[i] ?? 0, start0) ? 1 : 0;
    shift[i] = cut;
    open[i] = len - cut;
    closer[i] = open[i] === 0 ? -1 : (lastOfLength.get(open[i] ?? 0) ?? -1);
    lastOfLength.set(len, i); // a closer counts by its full length: a backslash in front of it escapes nothing
  }

  const out: InlineCodeSpan[] = [];
  for (let i = 0; i < n; ) {
    const j = closer[i] ?? -1;
    if (j >= 0 && paragraph[j] === paragraph[i]) {
      out.push({ start: (starts[i] ?? 0) + (shift[i] ?? 0), end: ends[j] ?? 0, run: open[i] ?? 0 });
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return out;
}

/** Does an odd number of backslashes stand directly in front of `at` (not looking further left than `floor`)? */
function escapes(text: string, at: number, floor: number): boolean {
  let k = at;
  while (k > floor && text.charCodeAt(k - 1) === 92) k -= 1;
  return (at - k) % 2 === 1;
}
