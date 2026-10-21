import { Notice } from "obsidian";
import type { HubPanel } from "../vendor/kit-obsidian/hub";
import { buildReviewList, type ReviewAction, type ReviewListStrings } from "../vendor/kit-obsidian/review-list";
import { t } from "../vendor/kit/i18n";
import { readDocMeta } from "../core/doc-meta";
import { decide, decideAll, addComment, readReview, reply, setResolved, type ReviewEdit, type ReviewModel } from "../core/review";
import { authorSlotOf, toReviewItems } from "../core/review-vm";
import { splitDoc } from "../core/meta-zone";
import { authorOrNotice, holdIncoming, readText, refusal, type CommandDeps } from "./commands";
import { writeDoc, type ActiveDoc } from "./editor-io";

const CONTEXT_RADIUS = 40;

export function reviewListStrings(): ReviewListStrings {
  return {
    accept: t("review.accept"), reject: t("review.reject"), comment: t("review.comment"), reply: t("review.reply"),
    resolve: t("review.resolve"), reopen: t("review.reopen"), acceptAll: t("review.acceptAll"), rejectAll: t("review.rejectAll"),
    openCount: (n) => t(n === 1 ? "review.openOne" : "review.openMany", n),
    empty: t("review.empty"), stale: t("review.stale"), orphan: t("review.orphan"),
    kind: { insertion: t("review.kind.insertion"), deletion: t("review.kind.deletion"), substitution: t("review.kind.substitution") },
  };
}

interface Place { raw: string; start: number; end: number; entry: boolean }

/** Tab „Prüfen“: eine Karte je Änderung und je Kommentarfaden der aktiven Notiz. */
export class ReviewPanel implements HubPanel<"review"> {
  readonly id = "review" as const;
  readonly icon = "check-check";
  get label(): string { return t("tab.review"); }

  private root: HTMLElement | null = null;
  private seq = 0;
  private places = new Map<string, Place>();
  private bodyStart = 0;
  private focusId: string | null = null;

  constructor(private readonly deps: CommandDeps) {}

  mount(container: HTMLElement): void {
    this.root = container.createDiv({ cls: "diachronic-review" });
  }

  onShow(): Promise<void> { return this.refresh(); }
  onFileOpen(): void { void this.refresh(); }
  destroy(): void { this.seq++; }

  /** Hebt die Karte hervor, etwa nach einem Klick auf eine Marke im Editor. */
  highlight(id: string): void {
    this.focusId = id;
    if (!this.root) return;
    const card = Array.from(this.root.querySelectorAll<HTMLElement>(".okit-review-card")).find((c) => c.getAttribute("data-id") === id);
    if (!card) return;
    this.root.querySelectorAll<HTMLElement>(".is-focused").forEach((c) => { c.removeClass("is-focused"); });
    card.addClass("is-focused");
    if (typeof card.scrollIntoView === "function") card.scrollIntoView({ block: "nearest" });
  }

  /** Die Karte, die zu einer Marke an dieser Stelle (Offset im ganzen Text) gehört. */
  idAt(offset: number): string | null {
    const at = offset - this.bodyStart;
    for (const [id, p] of this.places) if (at >= p.start && at < p.end) return id;
    return null;
  }

  private empty(text: string, action?: { label: string; run: () => void }): void {
    if (!this.root) return;
    this.root.empty();
    const box = this.root.createDiv({ cls: "diachronic-empty pane-empty" });
    box.createDiv({ text });
    if (action) box.createEl("button", { cls: "mod-cta", text: action.label, attr: { type: "button" } }).addEventListener("click", action.run);
  }

  async refresh(): Promise<void> {
    const token = ++this.seq;
    if (!this.root) return;
    const doc = this.deps.doc();
    if (!doc) { this.empty(t("review.noNote")); return; }
    const text = await readText(this.deps, doc);
    if (token !== this.seq || !this.root) return;
    const meta = readDocMeta(text);
    if (!meta) {
      this.empty(t("review.notTracked"), { label: t("cmd.holdIncoming"), run: () => { void holdIncoming(this.deps, doc).then(() => this.refresh()); } });
      return;
    }
    const model = readReview(text);
    if ("error" in model) { this.empty(refusal(model.error)); return; }
    this.index(model, text);
    const items = toReviewItems(model, text, {
      radius: CONTEXT_RADIUS, when: (iso) => this.deps.when(iso), colorByAuthor: this.deps.settings().colorByAuthor,
      slotOf: (a) => authorSlotOf(a, meta), unknownAuthor: t("review.unknownAuthor"),
    });
    this.root.empty();
    buildReviewList(this.root, {
      items, strings: reviewListStrings(), colorByAuthor: this.deps.settings().colorByAuthor,
      onAction: (action, id) => this.act(action, id, doc),
      onBulk: (action) => this.bulk(action === "accept-all" ? "accept" : "reject", doc),
      onError: (err) => { new Notice(String(err instanceof Error ? err.message : err)); },
    });
    if (this.focusId) this.highlight(this.focusId);
  }

  private index(model: ReviewModel, text: string): void {
    this.bodyStart = model.bodyStart;
    this.places.clear();
    const s = splitDoc(text);
    const body = s.ok ? s.parts.body : "";
    for (const rm of model.marks) {
      if (rm.entryId) this.places.set(rm.entryId, { raw: body.slice(rm.mark.start, rm.mark.end), start: rm.mark.start, end: rm.mark.end, entry: rm.entry !== null });
    }
    for (const th of model.threads) {
      const first = th.anchor ?? th.comments[0]?.mark;
      const last = th.comments[th.comments.length - 1]?.mark ?? th.anchor;
      if (first && last) this.places.set(th.id, { raw: "", start: first.start, end: last.end, entry: true });
    }
  }

  private async apply(doc: ActiveDoc, edit: (text: string) => ReviewEdit): Promise<boolean> {
    const out = await writeDoc(this.deps.app, doc, (text) => {
      const r = edit(text);
      return r.ok ? r : { ok: false, reason: r.reason };
    });
    if (!out.ok) new Notice(refusal(out.reason));
    await this.refresh();
    return out.ok;
  }

  private async act(action: ReviewAction, id: string, doc: ActiveDoc): Promise<void> {
    const place = this.places.get(id);
    switch (action) {
      case "accept":
      case "reject": {
        if (!place) return;
        await this.apply(doc, (text) => decide(text, id, place.raw, action));
        return;
      }
      case "jump": {
        if (!place || !doc.editor) { if (!doc.editor) new Notice(t("notice.jumpNeedsEditing")); return; }
        const ed = doc.editor;
        const a = ed.offsetToPos(this.bodyStart + place.start);
        const b = ed.offsetToPos(this.bodyStart + place.end);
        ed.setSelection(a, b);
        ed.scrollIntoView({ from: a, to: b }, true);
        return;
      }
      case "comment":
      case "reply": {
        const author = authorOrNotice(this.deps);
        if (author === null) return;
        const body = await this.deps.ui.askComment({ title: t(action === "reply" ? "comment.replyTitle" : "comment.title"), placeholder: t("comment.placeholder"), send: t("comment.send"), cancel: t("comment.cancel") });
        if (body === null) return;
        const round = readDocMeta(await readText(this.deps, doc))?.round ?? 1;
        const input = { author, time: this.deps.now().toISOString(), round, body, newId: this.deps.newId };
        if (action === "reply") { await this.apply(doc, (text) => reply(text, id, input)); return; }
        const at = place && !place.entry ? { start: this.bodyStart + place.start, end: this.bodyStart + place.end } : { entryId: id };
        await this.apply(doc, (text) => addComment(text, at, input));
        return;
      }
      case "resolve":
      case "reopen": {
        await this.apply(doc, (text) => setResolved(text, id, action === "resolve"));
        return;
      }
    }
  }

  private async bulk(decision: "accept" | "reject", doc: ActiveDoc): Promise<void> {
    const author = authorOrNotice(this.deps);
    if (author === null) return;
    const ok = await this.deps.ui.confirm({
      title: t(decision === "accept" ? "bulk.acceptTitle" : "bulk.rejectTitle"),
      message: [t(decision === "accept" ? "bulk.acceptMessage" : "bulk.rejectMessage"), t("bulk.standHint")],
      confirmLabel: t(decision === "accept" ? "review.acceptAll" : "review.rejectAll"),
      cancelLabel: t("comment.cancel"),
      warning: true,
    });
    if (!ok) return;
    // Erst der Stand, dann die Entscheidung: bricht das Schreiben ab, bleibt der Text im Versionsbrowser.
    const current = await readText(this.deps, doc);
    const meta = readDocMeta(current);
    if (!meta) return;
    await this.deps.stands.add(meta.id, current, { reason: "before-bulk", author, round: meta.round, version: meta.version });
    await this.apply(doc, (text) => decideAll(text, decision));
  }
}
