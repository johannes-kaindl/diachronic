import type { ReviewChange, ReviewComment, ReviewItem } from "../vendor/kit-obsidian/review-list";
import type { RedlineSegment } from "../vendor/kit-obsidian/redline";
import { clipContext } from "../vendor/kit/clip-context";
import { parseCritic, resolveMarks, stripComments, type CriticMark } from "../vendor/kit/critic-markup";
import { diffWords, wordDiffSegments } from "../vendor/kit/word-diff";
import { splitDoc } from "./meta-zone";
import type { ReviewModel } from "./review";
import type { DocMeta, ZoneEntry } from "./types";

export interface ReviewItemsOptions {
  /** Zeichen Umfeld links und rechts der Änderung auf der Karte. */
  radius: number;
  /** Anzeigetext der Zeit (lokale Zeit, relative Angabe); leer für fremde Marken ohne Eintrag. */
  when: (iso: string) => string;
  colorByAuthor: boolean;
  /** Autoren-Platz 0–5 je Name. */
  slotOf: (author: string) => number;
  /** Anzeigename für Marken ohne Eintrag und ohne „Name: “ im Kommentar. */
  unknownAuthor: string;
}

type ChangeKind = "insertion" | "deletion" | "substitution";

/** Der Umfeldtext einer Karte zeigt die Wirkung fremder Marken, nicht ihre Zeichen: angenommen gelesen, ohne Kommentare. */
function plain(text: string): string {
  const accepted = resolveMarks(text, parseCritic(text, { skipFrontmatter: false }).marks, "accept");
  return stripComments(accepted);
}

function coreSegments(mark: { kind: ChangeKind; text: string; replacement?: string }, slot: number | undefined): RedlineSegment[] {
  const withSlot = (s: RedlineSegment): RedlineSegment => (slot === undefined || s.kind === "same" ? s : { ...s, author: slot });
  if (mark.kind === "insertion") return [withSlot({ kind: "ins", text: mark.text })];
  if (mark.kind === "deletion") return [withSlot({ kind: "del", text: mark.text })];
  const next = mark.replacement ?? "";
  return wordDiffSegments(mark.text, next, diffWords(mark.text, next).changes).map((s) => withSlot({ kind: s.kind, text: s.text }));
}

function authorOf(entry: ZoneEntry | null, text: string, unknown: string): string {
  if (entry) return entry.author;
  return /^([^:\n]{1,40}): /.exec(text)?.[1] ?? unknown;
}

/** Der Kommentartext ohne den vorangestellten Namen (der steht in der Meta-Zeile). */
function bodyOf(entry: ZoneEntry | null, text: string): string {
  const name = entry ? entry.author : /^([^:\n]{1,40}): /.exec(text)?.[1];
  return name !== undefined && text.startsWith(`${name}: `) ? text.slice(name.length + 2) : text;
}

function anchorText(m: CriticMark | null): string | null {
  if (m === null) return null;
  return m.kind === "substitution" ? `${m.text} → ${m.replacement ?? ""}` : m.text;
}

function isChangeKind(k: string): k is ChangeKind { return k === "insertion" || k === "deletion" || k === "substitution"; }

/**
 * Das Modell der Notiz als Karten für die Prüfliste: in Textreihenfolge (eine Änderung vor ihrem Faden), Einträge ohne Marke am
 * Ende — Änderungen als veraltete Karte (Annehmen gesperrt), Kommentare ohne Anker. `text` ist dieselbe Notiz, aus der `model` stammt.
 */
export function toReviewItems(model: ReviewModel, text: string, opts: ReviewItemsOptions): ReviewItem[] {
  const s = splitDoc(text);
  if (!s.ok) return [];
  const body = s.parts.body;
  const keyed: Array<{ pos: number; order: number; item: ReviewItem }> = [];

  for (const rm of model.marks) {
    const m = rm.mark;
    if (!isChangeKind(m.kind)) continue;
    const lineStart = m.start === 0 ? 0 : body.lastIndexOf("\n", m.start - 1) + 1;
    const nl = body.indexOf("\n", m.end);
    const line = body.slice(lineStart, nl < 0 ? body.length : nl);
    // Erst lesen (fremde Marken als Wirkung, Kommentare weg), dann auf den Radius kürzen: sonst schneidet die Kürzung eine Marke mittendurch und die Rohsyntax steht auf der Karte.
    const lead = plain(line.slice(0, m.start - lineStart));
    const lag = plain(line.slice(m.end - lineStart));
    const ctx = clipContext(`${lead}${lag}`, lead.length, lead.length, opts.radius);
    const author = rm.entry ? rm.entry.author : opts.unknownAuthor;
    const slot = opts.colorByAuthor ? opts.slotOf(author) : undefined;
    const item: ReviewChange = {
      kind: "change",
      id: rm.entryId ?? "",
      author,
      when: rm.entry ? opts.when(rm.entry.time) : "",
      changeKind: m.kind,
      segments: [{ kind: "same", text: ctx.lead }, ...coreSegments({ kind: m.kind, text: m.text, ...(m.replacement !== undefined ? { replacement: m.replacement } : {}) }, slot), { kind: "same", text: ctx.lag }],
    };
    if (slot !== undefined) item.authorSlot = slot;
    keyed.push({ pos: m.start, order: 0, item });
  }

  for (const t of model.threads) {
    const item: ReviewComment = {
      kind: "comment",
      id: t.id,
      anchorText: anchorText(t.anchor),
      thread: t.comments.map((c) => ({
        author: authorOf(c.entry, c.mark.text, opts.unknownAuthor),
        when: c.entry ? opts.when(c.entry.time) : "",
        text: bodyOf(c.entry, c.mark.text),
      })),
      resolved: t.resolved,
    };
    keyed.push({ pos: t.anchor?.start ?? t.comments[0]?.mark.start ?? 0, order: 1, item });
  }
  keyed.sort((a, b) => a.pos - b.pos || a.order - b.order);
  const items = keyed.map((k) => k.item);

  for (const e of model.orphans) {
    if (e.kind === "comment") {
      const raw = parseCritic(e.quote.exact, { skipFrontmatter: false }).marks[0];
      const t = raw?.kind === "comment" ? raw.text : e.quote.exact;
      items.push({ kind: "comment", id: e.thread ?? e.id, anchorText: null, thread: [{ author: e.author, when: opts.when(e.time), text: bodyOf(e, t) }], resolved: e.state === "resolved" });
      continue;
    }
    const mark = parseCritic(e.quote.exact, { skipFrontmatter: false }).marks[0];
    const slot = opts.colorByAuthor ? opts.slotOf(e.author) : undefined;
    const segments = mark && isChangeKind(mark.kind)
      ? coreSegments({ kind: mark.kind, text: mark.text, ...(mark.replacement !== undefined ? { replacement: mark.replacement } : {}) }, slot)
      : [{ kind: "same" as const, text: e.quote.exact }];
    const item: ReviewChange = { kind: "change", id: e.id, author: e.author, when: opts.when(e.time), changeKind: e.kind, segments, stale: true };
    if (slot !== undefined) item.authorSlot = slot;
    items.push(item);
  }
  return items;
}

/** Der Platz 0–5 eines Autors für „Farbe je Autor“: seine Stelle bei den Beteiligten, sonst ein stabiler Wert aus dem Namen. */
export function authorSlotOf(author: string, meta: DocMeta | null): number {
  const i = meta ? meta.participants.indexOf(author) : -1;
  if (i >= 0) return i % 6;
  let h = 0;
  for (const ch of author) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h % 6;
}
