import { FuzzySuggestModal, Notice, type App, type TFile } from "obsidian";
import { readDocMeta } from "../core/doc-meta";
import { classifyIncoming, planTakeOver, prepareSend, unmarkedChanges } from "../core/exchange";
import { markRound } from "../core/marking";
import { splitDoc } from "../core/meta-zone";
import { findStand } from "../core/stand-plan";
import { FM_KEYS } from "../core/types";
import { SHARE_EXPORT_STRINGS_DE, SHARE_EXPORT_STRINGS_EN, shareExport } from "../vendor/kit-obsidian/share-export";
import { getLang, t } from "../vendor/kit/i18n";
import { reconstruct, type StoredStand } from "../vendor/kit/version-chain";
import { authorOrNotice, markChangesCommand, readText, refusal, type CommandDeps } from "./commands";
import { writeDoc, type ActiveDoc } from "./editor-io";
import { diffSegments, readableText } from "./stands-panel";

/** Ein Hinweis mit Knöpfen; bleibt stehen, bis er geschlossen wird oder ein Knopf gedrückt ist. */
export function actionNotice(text: string, actions: Array<{ label: string; run: () => void | Promise<void> }>): Notice {
  const frag = createFragment();
  const box = frag.createDiv({ cls: "diachronic-notice" });
  box.createDiv({ text });
  const row = box.createDiv({ cls: "diachronic-notice-actions" });
  const notice = new Notice(frag, 0);
  for (const a of actions) {
    row.createEl("button", { text: a.label, attr: { type: "button" } }).addEventListener("click", () => {
      notice.hide();
      void a.run();
    });
  }
  return notice;
}

const inStandFolder = (deps: CommandDeps, path: string): boolean => {
  const folder = deps.settings().standFolder.replace(/\/+$/, "");
  return path === folder || path.startsWith(`${folder}/`);
};

/** Die Notiz mit dieser Kennung unter einem anderen Pfad (die Stände folgen der Kennung, nicht dem Pfad). */
function findNoteById(deps: CommandDeps, id: string, except: TFile): TFile | null {
  for (const f of deps.app.vault.getMarkdownFiles()) {
    if (f.path === except.path || inStandFolder(deps, f.path)) continue;
    const fm = deps.app.metadataCache.getFileCache(f)?.frontmatter;
    if (fm?.[FM_KEYS.id] === id) return f;
  }
  return null;
}

class NotePicker extends FuzzySuggestModal<TFile> {
  private chosen = false;
  constructor(app: App, private readonly files: TFile[], private readonly stem: string, private readonly done: (f: TFile | null) => void) {
    super(app);
  }
  getItems(): TFile[] {
    // „Brief (1)“ gehört vermutlich zu „Brief“: Notizen mit gleichem Namensstamm stehen vorn.
    const same = (f: TFile): number => (f.basename === this.stem ? 0 : 1);
    return [...this.files].sort((a, b) => same(a) - same(b));
  }
  getItemText(f: TFile): string { return f.path; }
  onChooseItem(f: TFile): void { this.chosen = true; this.done(f); }
  onClose(): void { super.onClose(); window.setTimeout(() => { if (!this.chosen) this.done(null); }, 0); }
}

export function pickNote(app: App, files: TFile[], preferredStem: string): Promise<TFile | null> {
  return new Promise((resolve) => { new NotePicker(app, files, preferredStem, resolve).open(); });
}

/** Eine neu angekommene Datei: bekannte Kennung → Übernehmen anbieten, fremde Kennung → in Notiz übernehmen oder als neues Dokument führen. Nie von selbst. */
export async function handleArrival(deps: CommandDeps, file: TFile, verbose = false): Promise<void> {
  if (file.extension !== "md" || inStandFolder(deps, file.path)) return;
  const text = await deps.app.vault.read(file);
  const meta = readDocMeta(text);
  const target = meta ? findNoteById(deps, meta.id, file) : null;
  const kind = classifyIncoming(meta, () => target !== null);
  if (kind === "no-id" || meta === null) { if (verbose) new Notice(t("arrive.noId")); return; }
  if (kind === "known" && target) {
    actionNotice(t("arrive.known", file.basename, target.basename, meta.round), [
      { label: t("arrive.takeOver", meta.round), run: () => takeOverFlow(deps, file, target, text) },
    ]);
    return;
  }
  actionNotice(t("arrive.unknown", file.basename), [
    { label: t("arrive.adopt"), run: () => adoptFlow(deps, file, text) },
    { label: t("arrive.asNew"), run: () => trackAsNew(deps, file, text) },
  ]);
}

/** Ein Dokument mit fremder Kennung als neues Dokument führen: nur der Eingangsstand entsteht, die Datei bleibt, wo sie ist. */
async function trackAsNew(deps: CommandDeps, file: TFile, text: string): Promise<void> {
  const author = authorOrNotice(deps);
  const meta = readDocMeta(text);
  if (author === null || meta === null) return;
  await deps.stands.add(meta.id, text, { reason: "incoming", author, round: meta.round, version: meta.version });
  new Notice(t("arrive.tracked", file.basename, meta.round));
}

async function adoptFlow(deps: CommandDeps, file: TFile, text: string): Promise<void> {
  const candidates = deps.app.vault.getMarkdownFiles().filter((f) => f.path !== file.path && !inStandFolder(deps, f.path));
  const target = await deps.ui.pickNote(candidates, file.basename.replace(/ \(\d+\)$/, ""));
  if (target) await takeOverFlow(deps, file, target, text, true);
}

function latest(chain: readonly StoredStand[]): StoredStand | null {
  let best: StoredStand | null = null;
  for (const s of chain) if (best === null || s.meta.time >= best.meta.time) best = s;
  return best;
}

/**
 * Die zurückgekommene Datei als nächste Runde übernehmen (Spec § 10.2): Stand der bisherigen Notiz, Inhalt in die Notiz,
 * Stand „Runde N – Eingang“, Kopie in den Papierkorb — alles nach einer Bestätigung, und nichts, wenn beide Seiten geändert haben.
 * `adopt`: Die Notiz wurde vom Nutzer gewählt und trägt keine Vorgeschichte; ihr jetziger Text ist die Basis, der Stand davor bleibt.
 */
export async function takeOverFlow(deps: CommandDeps, incomingFile: TFile, target: TFile, incomingText: string, adopt = false): Promise<void> {
  const author = authorOrNotice(deps);
  const meta = readDocMeta(incomingText);
  if (author === null || meta === null) return;
  // Ist die Notiz im Editor offen, gilt der Text im Editor: der Speicherstand auf der Platte hinkt dem Tippen bis zu zwei Sekunden hinterher.
  const active = deps.doc();
  const open = active && active.file.path === target.path ? active : null;
  const targetText = open ? await readText(deps, open) : await deps.app.vault.read(target);
  const chain = await deps.stands.load(meta.id);
  const out = findStand(chain, "outgoing");
  const baseStand = out ?? latest(chain);
  const baseRaw = baseStand ? reconstruct(chain, baseStand.meta.id) : null;
  const baseText = adopt ? targetText : baseRaw && baseRaw.ok ? baseRaw.text : null;
  if (!adopt && !out && baseText !== null) new Notice(t("takeover.noOutgoing"));

  const plan = planTakeOver(targetText, baseText, incomingText);
  if (!plan.ok) {
    const d = diffSegments(readableText(plan.ours), readableText(plan.theirs));
    deps.ui.showDiff({ title: t("takeover.bothChanged"), segments: d.segments, labels: { del: t("review.kind.deletion"), ins: t("review.kind.insertion") }, note: t("takeover.bothNote") });
    return;
  }
  const ok = await deps.ui.confirm({
    title: t("takeover.title", plan.round),
    message: [t(adopt ? "takeover.messageAdopt" : "takeover.message", target.basename, incomingFile.basename), t("takeover.hint")],
    confirmLabel: t("takeover.confirm", plan.round), cancelLabel: t("comment.cancel"), warning: false,
  });
  if (!ok) return;

  const before = readDocMeta(targetText);
  await deps.stands.add(meta.id, targetText, { reason: "manual", author, round: before?.round ?? Math.max(1, plan.round - 1), version: before?.version ?? null, custom: t("stand.beforeTakeover", plan.round) });
  const doc: ActiveDoc = open ?? { file: target, editor: null };
  const written = await writeDoc(deps.app, doc, () => ({ ok: true, text: plan.text }));
  if (!written.ok) { new Notice(refusal(written.reason)); return; }
  await deps.stands.add(meta.id, plan.text, { reason: "incoming", author, round: plan.round, version: meta.version });
  if (incomingFile.path !== target.path) await deps.app.fileManager.trashFile(incomingFile);
  new Notice(t("takeover.done", plan.round));

  // Eingangsvergleich: freie Änderungen der Gegenseite als Vorschläge mit ihrem Namen setzen.
  const baseSplit = baseText !== null ? splitDoc(baseText) : null;
  const newSplit = splitDoc(plan.text);
  if (baseSplit?.ok && newSplit.ok && unmarkedChanges(newSplit.parts.body, baseSplit.parts.body)) {
    await offerCompare(deps, doc, baseSplit.parts.body, meta.participants.filter((p) => p !== author)[0], plan.round);
  }
}

async function offerCompare(deps: CommandDeps, doc: ActiveDoc, baseBody: string, knownSender: string | undefined, round: number): Promise<void> {
  const sender = knownSender ?? await deps.ui.askComment({ title: t("compare.senderName"), placeholder: t("compare.senderPlaceholder"), send: t("comment.send"), cancel: t("comment.cancel") });
  if (sender === null) return;
  const ok = await deps.ui.confirm({ title: t("compare.title"), message: [t("compare.message", sender)], confirmLabel: t("compare.confirm"), cancelLabel: t("comment.cancel"), warning: false });
  if (!ok) return;
  const out = await writeDoc(deps.app, doc, (text) => {
    const r = markRound({ text, baseBody, author: sender, time: deps.now().toISOString(), round, newId: deps.newId });
    return r.ok ? r : { ok: false, reason: r.reason };
  });
  new Notice(out.ok ? t("compare.done", sender) : refusal(out.reason));
}

/** Zurückschicken (Spec § 10.7): unmarkierte Änderungen melden, Runde hochzählen, Stand „Runde N – Ausgang“, Teilen-Menü. */
export async function sendBack(deps: CommandDeps, doc: ActiveDoc): Promise<void> {
  const author = authorOrNotice(deps);
  if (author === null) return;
  const text = await readText(deps, doc);
  const meta = readDocMeta(text);
  if (meta === null) { new Notice(t("review.notTracked")); return; }
  const chain = await deps.stands.load(meta.id);
  const incoming = findStand(chain, "incoming", meta.round);
  const base = incoming ? reconstruct(chain, incoming.meta.id) : null;
  const cur = splitDoc(text);
  const baseSplit = base && base.ok ? splitDoc(base.text) : null;
  if (cur.ok && baseSplit?.ok && unmarkedChanges(cur.parts.body, baseSplit.parts.body)) {
    actionNotice(t("send.unmarked"), [
      { label: t("send.markFirst"), run: () => markChangesCommand(deps, doc) },
      { label: t("send.sendAnyway"), run: () => doSend(deps, doc, author) },
    ]);
    return;
  }
  await doSend(deps, doc, author);
}

async function doSend(deps: CommandDeps, doc: ActiveDoc, author: string): Promise<void> {
  let sent = "";
  let round = 0;
  let version: string | null = null;
  let id = "";
  const out = await writeDoc(deps.app, doc, (text) => {
    const meta = readDocMeta(text);
    if (meta === null) return { ok: false, reason: "not-tracked" };
    const p = prepareSend(text, meta, author);
    if (!p.ok) return p;
    sent = p.text; round = p.meta.round; version = p.meta.version; id = p.meta.id;
    return { ok: true, text: p.text };
  });
  if (!out.ok) { new Notice(out.reason === "not-tracked" ? t("review.notTracked") : refusal(out.reason)); return; }
  await deps.stands.add(id, sent, { reason: "outgoing", author, round, version });
  const strings = getLang() === "de" ? SHARE_EXPORT_STRINGS_DE : SHARE_EXPORT_STRINGS_EN;
  await shareExport(deps.app, new TextEncoder().encode(sent), { dir: ".diachronic-export", fileName: doc.file.name, mime: "text/markdown", strings });
}
