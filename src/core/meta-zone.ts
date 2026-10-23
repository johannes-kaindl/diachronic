import { parseFrontmatter } from "../vendor/kit/frontmatter";
import { splitZone, wrapZone, type ZoneMarkers } from "../vendor/kit/marker-zone";
import type { EntryKind, EntryState, ZoneEntry } from "./types";

/** Der ganze Block ist ein Obsidian-Kommentar: Er beginnt mit `%%` und endet mit `%%`, innen steht kein `%`. */
export const ZONE_MARKERS = { begin: "%% diachronic:begin", end: "diachronic:end %%" } as const satisfies ZoneMarkers;

export interface DocParts {
  /** Frontmatter samt Zäunen; leer ohne Frontmatter. */
  head: string;
  /** Text zwischen Frontmatter und Block, ohne den Zeilenumbruch, der den Block abtrennt. */
  body: string;
  entries: ZoneEntry[];
  /** Text nach dem Block. */
  tail: string;
}

export type SplitDoc =
  | { ok: true; parts: DocParts }
  | { ok: false; reason: "zone-broken" | "zone-unreadable" };

const KINDS: readonly string[] = ["insertion", "deletion", "substitution", "comment"] satisfies EntryKind[];
const STATES: readonly string[] = ["open", "accepted", "rejected", "resolved"] satisfies EntryState[];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseEntry(line: string): ZoneEntry | null {
  let raw: unknown;
  try { raw = JSON.parse(line); } catch { return null; }
  if (!isRecord(raw) || !isRecord(raw.quote)) return null;
  const { id, kind, author, time, round, state, quote, thread } = raw;
  const q = quote;
  if (typeof id !== "string" || typeof author !== "string" || typeof time !== "string") return null;
  if (typeof kind !== "string" || !KINDS.includes(kind) || typeof state !== "string" || !STATES.includes(state)) return null;
  if (typeof round !== "number" || !Number.isFinite(round) || typeof q.exact !== "string") return null;
  if (q.prefix !== undefined && typeof q.prefix !== "string") return null;
  if (q.suffix !== undefined && typeof q.suffix !== "string") return null;
  if (thread !== undefined && typeof thread !== "string") return null;
  const entry: ZoneEntry = {
    id, kind: kind as EntryKind, author, time, round, state: state as EntryState,
    quote: { exact: q.exact, ...(q.prefix !== undefined ? { prefix: q.prefix } : {}), ...(q.suffix !== undefined ? { suffix: q.suffix } : {}) },
  };
  if (thread !== undefined) entry.thread = thread;
  return entry;
}

/** Eine JSON-Zeile je Eintrag. `%` wird als `%` geschrieben: Der Block enthält dadurch nie `%%`, also auch keinen vorzeitigen Schluss. */
function serializeEntry(e: ZoneEntry): string {
  return JSON.stringify(e).replace(/%/g, "\\u0025");
}

function eolOf(...parts: string[]): "\n" | "\r\n" {
  return parts.some((p) => p.includes("\r\n")) ? "\r\n" : "\n";
}

/**
 * Zerlegt eine Notiz in Frontmatter, Text, Einträge und Rest nach dem Block. Ein Block, der nicht schließt, oder ein zitierter
 * Marker (zweiter Anfang, zweites Ende) ist `zone-broken`, eine Zeile, die kein Eintrag ist, `zone-unreadable`; in beiden Fällen
 * schreibt der Aufrufer nichts (Spec § 4, Anti-Ziel 1).
 */
export function splitDoc(text: string): SplitDoc {
  const head = text.slice(0, text.length - parseFrontmatter(text).body.length);
  const rest = text.slice(head.length);
  const z = splitZone(rest, ZONE_MARKERS);
  if (z.kind === "none") return { ok: true, parts: { head, body: rest, entries: [], tail: "" } };
  if (z.kind === "broken" || z.strayEnds > 0 || z.nestedBegins > 0) return { ok: false, reason: "zone-broken" };
  const entries: ZoneEntry[] = [];
  for (const line of z.block.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const e = parseEntry(line);
    if (!e) return { ok: false, reason: "zone-unreadable" };
    entries.push(e);
  }
  // Der Block steht durch genau einen Zeilenumbruch vom Text getrennt; er gehört nicht zum Text.
  const body = z.before.replace(/\r?\n$/, "");
  return { ok: true, parts: { head, body, entries, tail: z.after } };
}

export interface ZoneSummary {
  count: number;
  /** Die jüngste Zeit unter den Einträgen (ISO 8601, UTC mit `Z`, daher als Zeichenfolge vergleichbar); `null` ohne Eintrag. */
  latest: string | null;
}

/** Die Kurzfassung des Blocks für die gefaltete Zeile im Editor: wie viele Einträge, wann der jüngste entstand. Eine Zeile, die kein Eintrag ist, zählt nicht und bricht nichts (das Falten ist nur Anzeige). */
export function zoneSummary(block: string): ZoneSummary {
  let count = 0;
  let latest: string | null = null;
  for (const line of block.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const e = parseEntry(line);
    if (!e) continue;
    count++;
    if (latest === null || e.time > latest) latest = e.time;
  }
  return { count, latest };
}

/** Setzt die Notiz zusammen; der Block entsteht nur bei mindestens einem Eintrag. Ein leerer Rest nach dem Block wird ein Zeilenumbruch. */
export function joinDoc(parts: DocParts): string {
  if (parts.entries.length === 0) return parts.head + parts.body;
  const eol = eolOf(parts.head, parts.body, parts.tail);
  const zone = wrapZone(parts.entries.map(serializeEntry).join("\n"), ZONE_MARKERS, eol);
  return parts.head + parts.body + eol + zone + (parts.tail === "" ? eol : parts.tail);
}
