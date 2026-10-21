import { buildComment, buildHighlight, codeSpans, parseCritic, type CriticMark } from "../vendor/kit/critic-markup";
import { locateQuote, quoteAt } from "../vendor/kit/text-anchor";
import { joinDoc, splitDoc, type DocParts } from "./meta-zone";
import type { EntryState, ZoneEntry } from "./types";

/** Eine Änderungsmarke im Text, mit ihrem Eintrag (`null` = fremde Marke ohne Metadaten). Offsets gelten im Körper der Notiz, nicht im ganzen Text. */
export interface ReviewMark { entryId: string | null; mark: CriticMark; entry: ZoneEntry | null }
export interface ReviewThread {
  id: string;
  anchor: CriticMark | null;
  comments: Array<{ entry: ZoneEntry | null; mark: CriticMark }>;
  resolved: boolean;
}
export interface ReviewModel {
  /** Wo der Körper im ganzen Text beginnt (Länge des Frontmatters): Offsets der Marken plus `bodyStart` sind Offsets im Editor. */
  bodyStart: number;
  marks: ReviewMark[];
  threads: ReviewThread[];
  /** Offene oder erledigte Einträge, zu denen es keine Marke mehr gibt (nie still gelöscht). */
  orphans: ZoneEntry[];
}
export type ReviewEdit =
  | { ok: true; text: string }
  | { ok: false; reason: "stale" | "not-found" | "terminator" | "in-code" | "zone-broken" | "zone-unreadable" };

/** Kennung einer fremden Marke ohne Eintrag: ihre Stelle im Körper. Die Stelle altert; deshalb prüft `decide` zusätzlich den erwarteten Rohtext. */
const FOREIGN = "foreign:";
const foreignId = (start: number): string => `${FOREIGN}${start}`;

const isChange = (m: CriticMark): boolean => m.kind === "insertion" || m.kind === "deletion" || m.kind === "substitution";
const rawOf = (body: string, m: CriticMark): string => body.slice(m.start, m.end);

interface Analysis {
  marks: CriticMark[];
  /** Mark-Index → Eintrag. */
  paired: Map<number, ZoneEntry>;
  orphans: ZoneEntry[];
}

function analyse(parts: DocParts): Analysis {
  const marks = parseCritic(parts.body, { skipFrontmatter: false }).marks;
  const paired = new Map<number, ZoneEntry>();
  const orphans: ZoneEntry[] = [];
  const pending: ZoneEntry[] = [];
  for (const e of parts.entries) {
    if (e.state !== "open" && e.state !== "resolved") continue;
    const r = locateQuote(parts.body, e.quote);
    if (r.kind === "found") {
      const i = marks.findIndex((m) => m.start === r.start && m.end === r.end);
      if (i >= 0 && !paired.has(i)) paired.set(i, e);
      else orphans.push(e);
    } else if (r.kind === "ambiguous") pending.push(e);
    else orphans.push(e);
  }
  // Zwei gleiche Marken mit gleichem Umfeld lassen sich nicht über das Zitat trennen: der Reihe nach zuordnen, nichts raten.
  for (const e of pending) {
    const i = marks.findIndex((m, k) => !paired.has(k) && rawOf(parts.body, m) === e.quote.exact);
    if (i >= 0) paired.set(i, e);
    else orphans.push(e);
  }
  return { marks, paired, orphans };
}

function split(text: string): { ok: true; parts: DocParts } | { ok: false; reason: "zone-broken" | "zone-unreadable" } {
  const s = splitDoc(text);
  return s.ok ? { ok: true, parts: s.parts } : s;
}

/** Fäden aus den Marken: ein Kommentar gehört zu der Marke, an der er lückenlos hängt, und zu den Kommentaren, die lückenlos folgen. */
function buildThreads(a: Analysis): ReviewThread[] {
  const out: ReviewThread[] = [];
  let cur: ReviewThread | null = null;
  let prevEnd = -1;
  a.marks.forEach((m, i) => {
    if (m.kind === "comment") {
      const entry = a.paired.get(i) ?? null;
      if (!cur || m.start !== prevEnd) cur = { id: "", anchor: null, comments: [], resolved: false };
      if (cur.comments.length === 0) out.push(cur);
      cur.comments.push({ entry, mark: m });
    } else {
      cur = { id: "", anchor: m, comments: [], resolved: false };
    }
    prevEnd = m.end;
  });
  const threads = out.filter((t) => t.comments.length > 0);
  for (const t of threads) {
    const first = t.comments[0];
    t.id = first?.entry ? (first.entry.thread ?? first.entry.id) : foreignId(first?.mark.start ?? 0);
    t.resolved = t.comments.every((c) => c.entry !== null && c.entry.state === "resolved");
  }
  return threads;
}

export function readReview(text: string): ReviewModel | { error: "zone-broken" | "zone-unreadable" } {
  const s = split(text);
  if (!s.ok) return { error: s.reason };
  const a = analyse(s.parts);
  const marks: ReviewMark[] = [];
  a.marks.forEach((m, i) => {
    if (!isChange(m)) return;
    const entry = a.paired.get(i) ?? null;
    marks.push({ entryId: entry ? entry.id : foreignId(m.start), mark: m, entry });
  });
  return { bodyStart: s.parts.head.length, marks, threads: buildThreads(a), orphans: a.orphans };
}

interface Edit { from: number; to: number; insert: string }

/**
 * Wendet eine Textänderung im Körper an und führt die Einträge nach: Zitate der übrigen Marken werden aus dem neuen Text neu
 * berechnet (Offsets altern), `updates` setzt Zustände, `fresh` liefert neue Einträge (mit Zitaten im neuen Text).
 */
function rewrite(parts: DocParts, a: Analysis, edit: Edit, updates: Map<string, EntryState>, fresh: (newBody: string) => ZoneEntry[] = () => []): string {
  const body = parts.body.slice(0, edit.from) + edit.insert + parts.body.slice(edit.to);
  const delta = edit.insert.length - (edit.to - edit.from);
  const refreshed = new Map<string, { start: number; end: number }>();
  a.paired.forEach((e, i) => {
    const m = a.marks[i];
    if (!m) return;
    if (m.end <= edit.from) refreshed.set(e.id, { start: m.start, end: m.end });
    else if (m.start >= edit.to) refreshed.set(e.id, { start: m.start + delta, end: m.end + delta });
  });
  const entries = parts.entries.map((e) => {
    const span = refreshed.get(e.id);
    const state = updates.get(e.id);
    let next = e;
    if (span && state === undefined) next = { ...e, quote: quoteAt(body, span.start, span.end) };
    if (state !== undefined) next = { ...next, state };
    return next;
  });
  return joinDoc({ ...parts, body, entries: [...entries, ...fresh(body)] });
}

/** Die Kommentare, die lückenlos hinter der Marke `i` hängen. */
function followers(a: Analysis, i: number): number[] {
  const out: number[] = [];
  let end = a.marks[i]?.end ?? -1;
  for (let k = i + 1; k < a.marks.length; k++) {
    const m = a.marks[k];
    if (!m || m.kind !== "comment" || m.start !== end) break;
    out.push(k);
    end = m.end;
  }
  return out;
}

function remainingText(m: CriticMark, decision: "accept" | "reject"): string {
  const accept = decision === "accept";
  if (m.kind === "insertion") return accept ? m.text : "";
  if (m.kind === "deletion") return accept ? "" : m.text;
  return accept ? (m.replacement ?? "") : m.text;
}

function decideAt(parts: DocParts, a: Analysis, i: number, decision: "accept" | "reject"): string {
  const m = a.marks[i];
  if (!m) return joinDoc(parts);
  const rest = remainingText(m, decision);
  let insert = rest;
  // Ein Kommentar hinter der Marke bleibt am verbleibenden Text verankert; ohne Text bleibt er ohne Anker stehen.
  if (rest !== "" && followers(a, i).length > 0) {
    const h = buildHighlight(rest);
    if (h.ok) insert = h.text;
  }
  const entry = a.paired.get(i);
  const updates = new Map<string, EntryState>();
  if (entry) updates.set(entry.id, decision === "accept" ? "accepted" : "rejected");
  return rewrite(parts, a, { from: m.start, to: m.end, insert }, updates);
}

/** Annehmen oder Ablehnen einer Änderung. Angewandt wird nur, wenn die Stelle noch genau `expectedRaw` ist; sonst `stale`. */
export function decide(text: string, entryId: string, expectedRaw: string, decision: "accept" | "reject"): ReviewEdit {
  const s = split(text);
  if (!s.ok) return s;
  const { parts } = s;
  const a = analyse(parts);
  let idx = -1;
  if (entryId.startsWith(FOREIGN)) {
    const at = Number(entryId.slice(FOREIGN.length));
    const same = a.marks.map((m, k) => ({ m, k })).filter(({ m, k }) => isChange(m) && !a.paired.has(k) && rawOf(parts.body, m) === expectedRaw);
    idx = (same.find(({ m }) => m.start === at) ?? (same.length === 1 ? same[0] : undefined))?.k ?? -1;
    if (idx < 0) return { ok: false, reason: "stale" };
  } else {
    const entry = parts.entries.find((e) => e.id === entryId);
    if (!entry) return { ok: false, reason: "not-found" };
    idx = [...a.paired].find(([, e]) => e.id === entryId)?.[0] ?? -1;
    if (idx < 0) return { ok: false, reason: "stale" };
  }
  const m = a.marks[idx];
  if (!m || !isChange(m)) return { ok: false, reason: "not-found" };
  if (rawOf(parts.body, m) !== expectedRaw) return { ok: false, reason: "stale" };
  return { ok: true, text: decideAt(parts, a, idx, decision) };
}

/** Alle offenen Änderungen auf einmal, vom Ende her (die Stellen davor bleiben gültig); Kommentare bleiben. */
export function decideAll(text: string, decision: "accept" | "reject"): ReviewEdit {
  let cur = text;
  for (;;) {
    const s = split(cur);
    if (!s.ok) return s;
    const a = analyse(s.parts);
    let last = -1;
    a.marks.forEach((m, k) => { if (isChange(m)) last = k; });
    if (last < 0) return { ok: true, text: cur };
    cur = decideAt(s.parts, a, last, decision);
  }
}

export interface CommentInput { author: string; time: string; round: number; body: string; newId: () => string }

function commentEntry(input: CommentInput, id: string, thread: string, newBody: string, start: number, end: number): ZoneEntry {
  return { id, kind: "comment", author: input.author, time: input.time, round: input.round, state: "open", quote: quoteAt(newBody, start, end), thread };
}

/**
 * Setzt einen Kommentar: an eine Änderungskarte (`{ entryId }`, lückenlos hinter die Marke bzw. ihren Faden) oder an einen
 * Textabschnitt (Offsets im ganzen Text; `{==Abschnitt==}{>>Name: Text<<}`). Berührt der Abschnitt Marken, kommt der Kommentar
 * hinter die letzte berührte Marke, nie hinein (CriticMarkup kennt keine Verschachtelung).
 */
export function addComment(text: string, at: { start: number; end: number } | { entryId: string }, input: CommentInput): ReviewEdit {
  const s = split(text);
  if (!s.ok) return s;
  const { parts } = s;
  const a = analyse(parts);
  const c = buildComment(`${input.author}: ${input.body}`);
  if (!c.ok) return { ok: false, reason: "terminator" };
  const id = input.newId();

  const after = (i: number): { pos: number; threadId: string; sep: string } => {
    const chain = followers(a, i);
    const last = chain.length > 0 ? a.marks[chain[chain.length - 1] ?? i] : a.marks[i];
    const first = chain[0] !== undefined ? a.paired.get(chain[0]) : undefined;
    return { pos: last?.end ?? 0, threadId: first ? (first.thread ?? first.id) : id, sep: "" };
  };

  if ("entryId" in at) {
    const i = [...a.paired].find(([, e]) => e.id === at.entryId)?.[0] ?? -1;
    if (i < 0) return { ok: false, reason: "not-found" };
    const { pos, threadId } = after(i);
    const out = rewrite(parts, a, { from: pos, to: pos, insert: c.text }, new Map(), (nb) => [commentEntry(input, id, threadId, nb, pos, pos + c.text.length)]);
    return { ok: true, text: out };
  }

  const from = at.start - parts.head.length;
  const to = at.end - parts.head.length;
  if (from < 0 || to > parts.body.length || from > to) return { ok: false, reason: "not-found" };
  const inCode = (() => {
    const { fenced, inline } = codeSpans(parts.body);
    return [...fenced, ...inline].some(([x, y]) => (from === to ? x < from && from < y : x < to && y > from));
  })();
  if (inCode) return { ok: false, reason: "in-code" };

  const touched = a.marks.map((m, k) => ({ m, k })).filter(({ m }) => (from === to ? m.start < from && from < m.end : m.start < to && m.end > from));
  if (touched.length > 0) {
    const lastTouched = touched[touched.length - 1];
    const { pos, threadId } = after(lastTouched?.k ?? 0);
    const out = rewrite(parts, a, { from: pos, to: pos, insert: c.text }, new Map(), (nb) => [commentEntry(input, id, threadId, nb, pos, pos + c.text.length)]);
    return { ok: true, text: out };
  }
  if (from === to) {
    const out = rewrite(parts, a, { from, to, insert: c.text }, new Map(), (nb) => [commentEntry(input, id, id, nb, from, from + c.text.length)]);
    return { ok: true, text: out };
  }
  const h = buildHighlight(parts.body.slice(from, to));
  if (!h.ok) return { ok: false, reason: "terminator" };
  const out = rewrite(parts, a, { from, to, insert: h.text + c.text }, new Map(), (nb) => [commentEntry(input, id, id, nb, from + h.text.length, from + h.text.length + c.text.length)]);
  return { ok: true, text: out };
}

/** Antwort im Faden: lückenlos hinter den letzten Kommentar; ein erledigter Faden wird dadurch wieder offen. */
export function reply(text: string, threadId: string, input: CommentInput): ReviewEdit {
  const s = split(text);
  if (!s.ok) return s;
  const { parts } = s;
  const a = analyse(parts);
  const thread = buildThreads(a).find((t) => t.id === threadId);
  const last = thread?.comments[thread.comments.length - 1];
  if (!thread || !last) return { ok: false, reason: "not-found" };
  const c = buildComment(`${input.author}: ${input.body}`);
  if (!c.ok) return { ok: false, reason: "terminator" };
  const id = input.newId();
  const pos = last.mark.end;
  const updates = new Map<string, EntryState>();
  for (const k of thread.comments) if (k.entry && k.entry.state === "resolved") updates.set(k.entry.id, "open");
  const out = rewrite(parts, a, { from: pos, to: pos, insert: c.text }, updates, (nb) => [commentEntry(input, id, threadId, nb, pos, pos + c.text.length)]);
  return { ok: true, text: out };
}

/** „Erledigt“ und „Wieder öffnen“ ändern nur den Zustand der Kommentar-Einträge des Fadens; der Text bleibt, wie er ist. */
export function setResolved(text: string, threadId: string, resolved: boolean): ReviewEdit {
  const s = split(text);
  if (!s.ok) return s;
  const { parts } = s;
  const a = analyse(parts);
  const thread = buildThreads(a).find((t) => t.id === threadId);
  if (!thread) return { ok: false, reason: "not-found" };
  const want: EntryState = resolved ? "resolved" : "open";
  const ids = new Set(thread.comments.flatMap((c) => (c.entry ? [c.entry.id] : [])));
  if (ids.size === 0) return { ok: false, reason: "not-found" };
  const entries = parts.entries.map((e) => (ids.has(e.id) ? { ...e, state: want } : e));
  return { ok: true, text: joinDoc({ ...parts, entries }) };
}
