import type { TextQuote } from "../vendor/kit/text-anchor";

export type DocStatus = "draft" | "in-review" | "released";

export interface DocMeta {
  id: string;
  version: string | null;
  round: number;
  status: DocStatus;
  participants: string[];
}

/** Frontmatter-Schlüssel wörtlich (Spec § 8.3); die Reihenfolge ist die, in der sie angelegt werden. */
export const FM_KEYS = {
  id: "diachronic-id",
  version: "diachronic-version",
  round: "diachronic-round",
  status: "diachronic-status",
  participants: "diachronic-participants",
} as const;

export type EntryKind = "insertion" | "deletion" | "substitution" | "comment";
export type EntryState = "open" | "accepted" | "rejected" | "resolved";

export interface ZoneEntry {
  id: string;
  kind: EntryKind;
  author: string;
  /** ISO 8601 in UTC mit `Z`. */
  time: string;
  round: number;
  state: EntryState;
  quote: TextQuote;
  thread?: string;
}

/**
 * Dateiendung der Stände — VORLÄUFIG, bis der iPhone-Sync-Test von Johannes vorliegt (Plan 3 „Vor dem Bau“, Entscheidungsregel).
 * Die Endung steht hier an genau einer Stelle: Dateiname in `stand-store.ts`, Erkennung beim Laden und Ausschluss der
 * Create/Modify/Delete-Ereignisse leiten sich von ihr ab.
 */
export const STAND_EXT = "json";
