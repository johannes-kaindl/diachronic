import { Notice, type App, type TFile } from "obsidian";
import { readDocMeta } from "../core/doc-meta";
import { markRound, startDocument } from "../core/marking";
import { prepareRelease } from "../core/release";
import { addComment, decide, readReview } from "../core/review";
import { splitDoc } from "../core/meta-zone";
import { findStand } from "../core/stand-plan";
import type { DiachronicSettings } from "../core/settings";
import { reconstruct } from "../vendor/kit/version-chain";
import { t } from "../vendor/kit/i18n";
import { writeDoc, type ActiveDoc } from "./editor-io";
import type { ConfirmOptions } from "../vendor/kit-obsidian/confirm";
import type { RedlineSegment } from "../vendor/kit-obsidian/redline";
import type { StandStore } from "./stand-store";

/** `optional`: eine leere Eingabe ist eine gültige Antwort (leere Zeichenfolge), nur Abbruch liefert null. `rows`: Höhe des Feldes, Standard 5. */
export interface CommentPrompt { title: string; placeholder: string; send: string; cancel: string; optional?: boolean; rows?: number }
export interface DiffView { title: string; segments: RedlineSegment[]; labels: { del: string; ins: string }; note?: string }

/** Alles, was ein Befehl oder eine Ansicht braucht — einschließlich der Dialoge, damit Tests sie ersetzen können. */
export interface CommandDeps {
  app: App;
  settings: () => DiachronicSettings;
  stands: StandStore;
  now: () => Date;
  newId: () => string;
  openSettings: () => void;
  /** Anzeigetext einer Zeit (lokale Zeit). */
  when: (iso: string) => string;
  /** Die Notiz, an der gearbeitet wird. */
  doc: () => ActiveDoc | null;
  ui: {
    confirm: (opts: ConfirmOptions) => Promise<boolean>;
    askComment: (opts: CommentPrompt) => Promise<string | null>;
    showDiff: (opts: DiffView) => void;
    /** Eine Notiz aus der Liste wählen (`preferred` steht vorn); `null` bei Abbruch. */
    pickNote: (files: TFile[], preferredStem: string) => Promise<TFile | null>;
  };
}

export function refusal(reason: string): string {
  const key = `notice.refused.${reason}`;
  const text = t(key);
  return text === key ? reason : text;
}

/** Der Name der Person; ohne ihn schreibt das Plugin nichts (der Autor steht in jedem Vorschlag). */
export function authorOrNotice(deps: CommandDeps): string | null {
  const name = deps.settings().authorName;
  if (name === "") {
    new Notice(t("notice.needName"));
    deps.openSettings();
    return null;
  }
  return name;
}

/** Meldet nach einem `load`, was der Store nicht lesen konnte (übersprungen) oder nur verändert fand (geladen, aber zu prüfen). */
export function reportStandProblems(stands: StandStore): void {
  if (stands.skipped > 0) new Notice(t("notice.stands", stands.skipped));
  if (stands.altered > 0) new Notice(t("notice.standsAltered", stands.altered));
}

export async function readText(deps: CommandDeps, doc: ActiveDoc): Promise<string> {
  return doc.editor ? doc.editor.getValue() : deps.app.vault.read(doc.file);
}

/** „Als Eingang festhalten“: Kennung vergeben, Frontmatter schreiben, Stand „Runde 1 – Eingang“ speichern. */
export async function holdIncoming(deps: CommandDeps, doc: ActiveDoc): Promise<void> {
  const author = authorOrNotice(deps);
  if (author === null) return;
  const before = await readText(deps, doc);
  const existing = readDocMeta(before);
  if (existing) { new Notice(t("notice.alreadyHeld", existing.round)); return; }
  const id = deps.newId();
  let written = "";
  const out = await writeDoc(deps.app, doc, (text) => {
    const r = startDocument(text, { id, version: null, participants: [], author });
    if (!r.ok) return { ok: false, reason: r.reason };
    written = r.content;
    return { ok: true, text: r.content };
  });
  if (!out.ok) { new Notice(refusal(out.reason)); return; }
  await deps.stands.add(id, written, { reason: "incoming", author, round: 1, version: null });
  new Notice(t("notice.held", 1));
}

/** „Änderungen markieren“: Unterschied zum Eingang der laufenden Runde als Vorschläge in die Notiz schreiben. */
export async function markChangesCommand(deps: CommandDeps, doc: ActiveDoc): Promise<void> {
  const author = authorOrNotice(deps);
  if (author === null) return;
  const meta = readDocMeta(await readText(deps, doc));
  if (!meta) { new Notice(t("notice.noIncoming", 1)); return; }
  const chain = await deps.stands.load(meta.id);
  reportStandProblems(deps.stands);
  // Basis ist der Eingang der Runde, nach einem ersten Markieren der Stand mit den Marken: sonst wäre jede Marke von eben beim zweiten Mal eine „neu getippte“ und würde abgelehnt.
  const incoming = findStand(chain, "incoming", meta.round);
  const marked = findStand(chain, "marked", meta.round);
  const baseStand = incoming && marked ? (marked.meta.time >= incoming.meta.time ? marked : incoming) : incoming;
  const base = baseStand ? reconstruct(chain, baseStand.meta.id) : null;
  if (!base || !base.ok) { new Notice(t("notice.noIncoming", meta.round)); return; }
  const baseSplit = splitDoc(base.text);
  if (!baseSplit.ok) { new Notice(refusal(baseSplit.reason)); return; }
  let count = 0;
  let markedText = "";
  const out = await writeDoc(deps.app, doc, (text) => {
    const r = markRound({ text, baseBody: baseSplit.parts.body, author, time: deps.now().toISOString(), round: meta.round, newId: deps.newId });
    if (!r.ok) return { ok: false, reason: r.reason };
    count = r.added.length;
    markedText = r.text;
    return { ok: true, text: r.text };
  });
  if (!out.ok) { new Notice(refusal(out.reason)); return; }
  await deps.stands.add(meta.id, markedText, { reason: "marked", author, round: meta.round, version: meta.version });
  new Notice(t("notice.marked", count));
}

/** „Stand festhalten …“ (Spec § 9.2): den jetzigen Text als Stand speichern, auf Wunsch mit Namen. Ein benannter Stand ist ein Anker. Runde, Status und Notiz bleiben, wie sie sind. */
export async function saveStandCommand(deps: CommandDeps, doc: ActiveDoc): Promise<void> {
  const author = authorOrNotice(deps);
  if (author === null) return;
  const meta = readDocMeta(await readText(deps, doc));
  if (!meta) { new Notice(t("review.notTracked")); return; }
  const name = await deps.ui.askComment({ title: t("saveStand.title"), placeholder: t("saveStand.placeholder"), send: t("saveStand.save"), cancel: t("comment.cancel"), optional: true, rows: 1 });
  if (name === null) return;
  // Nach der Frage noch einmal lesen: in der Zwischenzeit kann weitergeschrieben worden sein, und festgehalten wird, was jetzt dasteht.
  const text = await readText(deps, doc);
  const stand = await deps.stands.add(meta.id, text, { reason: "manual", author, round: meta.round, version: meta.version, custom: name });
  new Notice(t("notice.standSaved", stand.meta.name ?? stand.meta.id));
}

/** Die nächste offene Änderung ab dem Cursor (sonst die erste) annehmen oder ablehnen. */
export async function decideNext(deps: CommandDeps, doc: ActiveDoc, decision: "accept" | "reject"): Promise<void> {
  const cursor = doc.editor ? doc.editor.posToOffset(doc.editor.getCursor("to")) : 0;
  let found = false;
  const out = await writeDoc(deps.app, doc, (text) => {
    const model = readReview(text);
    if ("error" in model) return { ok: false, reason: model.error };
    const next = model.marks.find((m) => model.bodyStart + m.mark.end > cursor) ?? model.marks[0];
    if (!next || !next.entryId) return { ok: false, reason: "nothing-to-decide" };
    found = true;
    const body = text.slice(model.bodyStart);
    const r = decide(text, next.entryId, body.slice(next.mark.start, next.mark.end), decision);
    return r.ok ? r : { ok: false, reason: r.reason };
  });
  if (!out.ok) new Notice(out.reason === "nothing-to-decide" && !found ? t("notice.noChanges") : refusal(out.reason));
}

/** Kommentar an der Auswahl im Editor: Befehl und Kontextmenü. */
export async function commentSelection(deps: CommandDeps, doc: ActiveDoc): Promise<void> {
  const ed = doc.editor;
  if (!ed || !ed.somethingSelected()) { new Notice(t("notice.selectFirst")); return; }
  const author = authorOrNotice(deps);
  if (author === null) return;
  const start = ed.posToOffset(ed.getCursor("from"));
  const end = ed.posToOffset(ed.getCursor("to"));
  const meta = readDocMeta(ed.getValue());
  if (!meta) { new Notice(t("review.notTracked")); return; }
  const body = await deps.ui.askComment({ title: t("comment.title"), placeholder: t("comment.placeholder"), send: t("comment.send"), cancel: t("comment.cancel") });
  if (body === null) return;
  const out = await writeDoc(deps.app, doc, (text) => {
    const r = addComment(text, { start, end }, { author, time: deps.now().toISOString(), round: meta.round, body, newId: deps.newId });
    return r.ok ? r : { ok: false, reason: r.reason };
  });
  if (!out.ok) new Notice(refusal(out.reason));
}

/** Freigeben: erst der jetzige Text als Stand, dann Bestätigung, dann schreiben, dann die Fassung als Stand „vN“ (Spec § 10.5, § 9.2). */
export async function releaseCommand(deps: CommandDeps, doc: ActiveDoc): Promise<void> {
  const author = authorOrNotice(deps);
  if (author === null) return;
  const text = await readText(deps, doc);
  const meta = readDocMeta(text);
  if (!meta) { new Notice(t("review.notTracked")); return; }
  const check = prepareRelease(text, meta);
  if (!check.ok) {
    new Notice(check.reason === "open-changes" ? t(check.open === 1 ? "release.openOne" : "release.openMany", check.open) : refusal(check.reason));
    return;
  }
  const ok = await deps.ui.confirm({
    title: t("release.title", check.meta.version ?? ""),
    message: [t("release.message", check.meta.version ?? ""), t("release.hint")],
    confirmLabel: t("release.confirm", check.meta.version ?? ""), cancelLabel: t("comment.cancel"), warning: true,
  });
  if (!ok) return;
  await deps.stands.add(meta.id, text, { reason: "manual", author, round: meta.round, version: meta.version, custom: t("stand.beforeRelease") });
  let released = "";
  let version: string | null = null;
  const out = await writeDoc(deps.app, doc, (current) => {
    const m = readDocMeta(current);
    if (!m) return { ok: false, reason: "not-tracked" };
    const r = prepareRelease(current, m);
    if (!r.ok) return { ok: false, reason: r.reason };
    released = r.text;
    version = r.meta.version;
    return { ok: true, text: r.text };
  });
  if (!out.ok) { new Notice(refusal(out.reason)); return; }
  await deps.stands.add(meta.id, released, { reason: "release", author, round: meta.round, version });
  new Notice(t("release.done", version ?? ""));
}
