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
 * Dateiendung der Stände: `md`, weil nur Markdown ohne den Sync-Schalter „Andere Dateitypen synchronisieren“ aufs Telefon kommt
 * (Entscheidung Johannes 2026-10-22, nach dem iPhone-Test). Der Preis: Obsidian sieht jeden Stand als Notiz. Aufbau der Datei und
 * was dagegen schützt: `stand-file.ts`. Die Endung steht an genau einer Stelle: Dateiname in `stand-store.ts` und Erkennung beim
 * Laden leiten sich von ihr ab.
 */
export const STAND_EXT = "md";
