import type { StoredStand } from "../vendor/kit/version-chain";

/** Anlässe für einen Stand (Spec § 9.2). Nie beim bloßen Speichern der Datei. */
export type StandReason = "incoming" | "outgoing" | "marked" | "before-bulk" | "before-koda" | "manual" | "release";

/** Texte der Namen kommen als Parameter herein (UI-STANDARD § 10); das Modul kennt keine Sprache. */
export interface StandNameStrings {
  incoming(round: number): string;
  outgoing(round: number): string;
  marked(round: number): string;
  release(version: string): string;
  beforeBulk: string;
  beforeKoda: string;
  manual: string;
}

export function standName(reason: StandReason, round: number, version: string | null, s: StandNameStrings, custom?: string): string {
  switch (reason) {
    case "incoming": return s.incoming(round);
    case "outgoing": return s.outgoing(round);
    case "marked": return s.marked(round);
    case "release": return s.release(version ?? "");
    case "before-bulk": return s.beforeBulk;
    case "before-koda": return s.beforeKoda;
    case "manual": return custom !== undefined && custom.trim() !== "" ? custom.trim() : s.manual;
  }
}

/** Anker bleiben vollständig gespeichert: Eingang und Ausgang einer Runde und die Freigabe (Spec § 9.1). */
export function isAnchor(reason: StandReason): boolean {
  return reason === "incoming" || reason === "outgoing" || reason === "release";
}

const REASONS: readonly StandReason[] = ["incoming", "outgoing", "marked", "before-bulk", "before-koda", "manual", "release"];

/**
 * Die Kennung eines Standes trägt Runde und Anlass, unabhängig von der Sprache des Namens: `r2-incoming-<zufall>`.
 * Der Kit-Stand kennt weder Runde noch Anlass; so findet das Plugin „den Eingang der Runde 2“ ohne einen Namen zu parsen.
 */
export function standId(reason: StandReason, round: number, unique: string): string {
  return `r${round}-${reason}-${unique}`;
}

export function standInfo(id: string): { reason: StandReason; round: number } | null {
  const m = /^r(\d+)-([a-z-]+?)-[A-Za-z0-9]+$/.exec(id);
  if (!m) return null;
  const reason = REASONS.find((r) => r === m[2]);
  return reason ? { reason, round: Number(m[1]) } : null;
}

/** Der jüngste Stand mit diesem Anlass (und dieser Runde, falls angegeben); jünger heißt späterer `time`, bei Gleichstand der spätere in der Liste. */
export function findStand(stands: readonly StoredStand[], reason: StandReason, round?: number): StoredStand | null {
  let best: StoredStand | null = null;
  for (const s of stands) {
    const info = standInfo(s.meta.id);
    if (!info || info.reason !== reason || (round !== undefined && info.round !== round)) continue;
    if (best === null || s.meta.time >= best.meta.time) best = s;
  }
  return best;
}
