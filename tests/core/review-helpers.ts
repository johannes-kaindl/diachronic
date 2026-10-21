import { joinDoc, splitDoc } from "../../src/core/meta-zone";
import type { ZoneEntry } from "../../src/core/types";
import { quoteAt } from "../../src/vendor/kit/text-anchor";

export const HEAD = "---\ndiachronic-id: d1\ndiachronic-round: 1\n---\n";
export const TIME = "2026-10-18T16:00:00Z";

/** Ein Eintrag, dessen Zitat die Marke `raw` im Körper `body` trifft (erstes Vorkommen, oder das n-te mit `nth`). */
export function entryFor(body: string, raw: string, over: Partial<ZoneEntry> & { id: string }, nth = 0): ZoneEntry {
  let at = -1;
  for (let i = 0; i <= nth; i++) at = body.indexOf(raw, at + 1);
  if (at < 0) throw new Error(`raw not in body: ${raw}`);
  const kind = raw.startsWith("{++") ? "insertion" : raw.startsWith("{--") ? "deletion" : raw.startsWith("{~~") ? "substitution" : "comment";
  return { kind, author: "Johannes", time: TIME, round: 1, state: "open", quote: quoteAt(body, at, at + raw.length), ...over };
}

export function doc(body: string, entries: ZoneEntry[] = [], head = HEAD): string {
  return joinDoc({ head, body, entries, tail: "\n" });
}

export function partsOf(text: string) {
  const r = splitDoc(text);
  if (!r.ok) throw new Error(`broken doc: ${r.reason}`);
  return r.parts;
}

export const seq = (prefix = "n"): (() => string) => { let n = 0; return () => `${prefix}${++n}`; };
