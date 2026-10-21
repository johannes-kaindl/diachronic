import { resolveAll, stripComments } from "../vendor/kit/critic-markup";
import { readDocMeta, writeDocMeta } from "./doc-meta";
import type { DocMeta } from "./types";

export type IncomingKind = "known" | "unknown-id" | "no-id";

/** Was eine neu angekommene Datei ist: eine Runde eines bekannten Dokuments, ein Dokument mit fremder Kennung, oder eine Datei ohne Kennung. */
export function classifyIncoming(incoming: DocMeta | null, isKnown: (docId: string) => boolean): IncomingKind {
  if (incoming === null) return "no-id";
  return isKnown(incoming.id) ? "known" : "unknown-id";
}

export type TakeOver =
  /** `text` gehört in die bestehende Notiz. */
  | { ok: true; text: string; round: number }
  | { ok: false; reason: "both-changed"; ours: string; theirs: string };

/**
 * Darf die zurückgekommene Datei die Notiz ersetzen? Nur, wenn nicht beide Seiten seit dem letzten Ausgang etwas geändert haben;
 * sonst wird nichts überschrieben (kein Drei-Wege-Zusammenführen in Stufe 1, Spec § 10.2). Ohne bekannten Ausgang gilt die eigene
 * Notiz als möglicherweise geändert. Die Runde kommt aus der Datei (die Zahl reist mit ihr), sonst die eigene plus eins.
 */
export function planTakeOver(current: string, lastOutgoing: string | null, incoming: string): TakeOver {
  const oursChanged = lastOutgoing === null ? current !== incoming : current !== lastOutgoing;
  const theirsChanged = lastOutgoing === null ? current !== incoming : incoming !== lastOutgoing;
  if (oursChanged && theirsChanged) return { ok: false, reason: "both-changed", ours: current, theirs: incoming };
  const round = readDocMeta(incoming)?.round ?? (readDocMeta(current)?.round ?? 1) + 1;
  return { ok: true, text: theirsChanged ? incoming : current, round };
}

/**
 * Enthält der ankommende Text Änderungen, die nicht als Vorschläge markiert sind? Verglichen wird der Text ohne Kommentare und
 * Hervorhebungen (ein Kommentar ändert keinen Text), und zwar mit allen Marken abgelehnt und mit allen angenommen: Gleichheit in
 * einer der beiden Lesarten heißt, dass sich nur Marken oder Entscheidungen über Marken unterscheiden. Eine freie Änderung neben
 * Marken verfehlt beide. (Gemessen im GUI-Smoke: ein Rücklauf, der nur einen Kommentar trug, löste sonst den Eingangsvergleich aus.)
 */
export function unmarkedChanges(incomingBody: string, lastOutgoingBody: string): boolean {
  const a = stripComments(incomingBody);
  const b = stripComments(lastOutgoingBody);
  return resolveAll(a, "reject") !== resolveAll(b, "reject") && resolveAll(a, "accept") !== resolveAll(b, "accept");
}

export type PrepareSend = { ok: true; text: string; meta: DocMeta } | { ok: false; reason: string };

/** Zurückschicken: Runde hochzählen, den Namen einmal zu den Beteiligten, Status „in Prüfung“, ins Frontmatter geschrieben. */
export function prepareSend(text: string, meta: DocMeta, author: string): PrepareSend {
  const next: DocMeta = {
    ...meta,
    round: meta.round + 1,
    status: "in-review",
    participants: meta.participants.includes(author) ? meta.participants : [...meta.participants, author],
  };
  const r = writeDocMeta(text, next);
  return r.ok ? { ok: true, text: r.content, meta: next } : { ok: false, reason: r.reason };
}
