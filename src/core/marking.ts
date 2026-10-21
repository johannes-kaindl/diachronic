import { markChanges, type MarkChangesRefusal } from "../vendor/kit/critic-compare";
import type { CriticKind } from "../vendor/kit/critic-markup";
import type { FrontmatterPatchResult } from "../vendor/kit/frontmatter-patch";
import { quoteAt } from "../vendor/kit/text-anchor";
import { writeDocMeta } from "./doc-meta";
import { joinDoc, splitDoc } from "./meta-zone";
import type { DocMeta, EntryKind, ZoneEntry } from "./types";

export interface MarkInput {
  /** Die ganze Notiz, wie sie jetzt ist. */
  text: string;
  /** Der Text des Eingangs der Runde, ohne Frontmatter und ohne Metadaten-Block. */
  baseBody: string;
  author: string;
  /** ISO 8601 in UTC mit `Z`. */
  time: string;
  round: number;
  newId: () => string;
}

export type MarkResult =
  | { ok: true; text: string; added: ZoneEntry[]; exact: boolean }
  | { ok: false; reason: MarkChangesRefusal | "zone-broken" | "zone-unreadable" | "nothing-changed"; at: number };

const KIND_OF: Partial<Record<CriticKind, EntryKind>> = { insertion: "insertion", deletion: "deletion", substitution: "substitution" };

/**
 * Vergleicht den Text der Notiz Wort für Wort mit dem Eingang der Runde und schreibt die Unterschiede als Vorschläge in den Text,
 * dazu je Vorschlag einen Eintrag im Metadaten-Block. Frontmatter bleibt byte-gleich; ältere Einträge und Marken bleiben, wie sie sind.
 * Die Rundlauf-Probe (alle annehmen = jetziger Text, alle ablehnen = Eingang) läuft im Kit vor der Rückgabe; schlägt sie fehl,
 * kommt eine Ablehnung und nichts wird geschrieben.
 */
export function markRound(input: MarkInput): MarkResult {
  const split = splitDoc(input.text);
  if (!split.ok) return { ok: false, reason: split.reason, at: 0 };
  const { parts } = split;
  const r = markChanges(input.baseBody, parts.body);
  if (!r.ok) return r;
  if (r.added.length === 0) return { ok: false, reason: "nothing-changed", at: 0 };
  const added: ZoneEntry[] = [];
  for (const mark of r.added) {
    const kind = KIND_OF[mark.kind];
    if (kind === undefined) continue;
    added.push({
      id: input.newId(), kind, author: input.author, time: input.time, round: input.round, state: "open",
      quote: quoteAt(r.text, mark.start, mark.end),
    });
  }
  const text = joinDoc({ ...parts, body: r.text, entries: [...parts.entries, ...added] });
  return { ok: true, text, added, exact: r.exact };
}

/** „Als Eingang festhalten“: Kennung, Runde 1, Status in Prüfung; die Autorin steht einmal bei den Beteiligten. */
export function startDocument(text: string, meta: Omit<DocMeta, "round" | "status"> & { author: string }): FrontmatterPatchResult {
  const participants = meta.participants.includes(meta.author) ? meta.participants : [...meta.participants, meta.author];
  return writeDocMeta(text, { id: meta.id, version: meta.version, round: 1, status: "in-review", participants }, { create: true });
}
