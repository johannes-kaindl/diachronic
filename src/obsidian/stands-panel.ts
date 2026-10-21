import { Notice } from "obsidian";
import type { StoredStand } from "../vendor/kit/version-chain";
import { reconstruct } from "../vendor/kit/version-chain";
import type { HubPanel } from "../vendor/kit-obsidian/hub";
import type { RedlineSegment } from "../vendor/kit-obsidian/redline";
import { buildVersionList, type VersionListItem } from "../vendor/kit-obsidian/version-list";
import { diffWords, wordDiffSegments } from "../vendor/kit/word-diff";
import { t } from "../vendor/kit/i18n";
import { readDocMeta } from "../core/doc-meta";
import { standInfo } from "../core/stand-plan";
import { authorOrNotice, readText, type CommandDeps } from "./commands";
import { writeDoc } from "./editor-io";

/** Die Segmente eines Wort-Diffs zwischen zwei Texten, mit dem Hinweis, ob er ungenau ist (sehr lange Texte). */
export function diffSegments(from: string, to: string): { segments: RedlineSegment[]; exact: boolean } {
  const d = diffWords(from, to);
  return { segments: wordDiffSegments(from, to, d.changes).map((s) => ({ kind: s.kind, text: s.text })), exact: d.exact };
}

/** Tab „Stände“: die Stände der aktiven Notiz, gruppiert nach Runde; vergleichen und wiederherstellen. */
export class StandsPanel implements HubPanel<"stands"> {
  readonly id = "stands" as const;
  readonly icon = "history";
  get label(): string { return t("tab.stands"); }

  private root: HTMLElement | null = null;
  private seq = 0;
  private selected: string | null = null;
  private picking = false;

  constructor(private readonly deps: CommandDeps) {}

  mount(container: HTMLElement): void {
    this.root = container.createDiv({ cls: "diachronic-stands" });
  }

  onShow(): Promise<void> { return this.refresh(); }
  onFileOpen(): void { this.selected = null; this.picking = false; void this.refresh(); }
  destroy(): void { this.seq++; }

  private empty(text: string): void {
    if (!this.root) return;
    this.root.empty();
    this.root.createDiv({ cls: "diachronic-empty pane-empty", text });
  }

  async refresh(): Promise<void> {
    const token = ++this.seq;
    if (!this.root) return;
    const doc = this.deps.doc();
    if (!doc) { this.empty(t("review.noNote")); return; }
    const text = await readText(this.deps, doc);
    const meta = readDocMeta(text);
    if (!meta) { this.empty(t("stands.notTracked")); return; }
    const chain = await this.deps.stands.load(meta.id);
    if (token !== this.seq || !this.root) return;
    if (this.deps.stands.skipped > 0) new Notice(t("notice.stands", this.deps.stands.skipped));
    if (chain.length === 0) { this.empty(t("stands.empty")); return; }

    const sorted = [...chain].sort((a, b) => (a.meta.time < b.meta.time ? 1 : a.meta.time > b.meta.time ? -1 : 0));
    const items: VersionListItem[] = sorted.map((s) => {
      const round = standInfo(s.meta.id)?.round;
      return {
        label: s.meta.name ?? s.meta.id,
        meta: `${s.meta.author} · ${this.deps.when(s.meta.time)}`,
        group: round !== undefined ? t("stands.round", round) : t("stands.other"),
      };
    });
    this.root.empty();
    this.root.createDiv({ cls: "diachronic-stands-hint", text: t(this.picking ? "stands.pickSecond" : "stands.pickFirst") });
    buildVersionList(this.root, {
      mode: "action", items, minItems: 1,
      onSelect: (i) => { const s = sorted[i]; if (s) void this.choose(s, chain); },
    });
    if (this.selected !== null) this.actionBar(sorted, chain, doc);
  }

  private async choose(stand: StoredStand, chain: readonly StoredStand[]): Promise<void> {
    if (this.picking && this.selected !== null && this.selected !== stand.meta.id) {
      const first = this.selected;
      this.picking = false;
      await this.compare(chain, first, stand.meta.id);
      await this.refresh();
      return;
    }
    this.selected = stand.meta.id;
    this.picking = false;
    await this.refresh();
  }

  private actionBar(sorted: readonly StoredStand[], chain: readonly StoredStand[], doc: NonNullable<ReturnType<CommandDeps["doc"]>>): void {
    const selected = sorted.find((s) => s.meta.id === this.selected);
    if (!selected || !this.root) return;
    const bar = this.root.createDiv({ cls: "diachronic-stands-bar" });
    bar.createDiv({ cls: "diachronic-stands-selected", text: t("stands.selected", selected.meta.name ?? selected.meta.id) });
    const button = (cls: string, label: string, run: () => void | Promise<void>): void => {
      bar.createEl("button", { cls, text: label, attr: { type: "button" } }).addEventListener("click", () => { void run(); });
    };
    button("", t("stands.compareCurrent"), () => this.compareWithCurrent(chain, selected.meta.id, doc));
    button("", t("stands.compareOther"), async () => { this.picking = true; await this.refresh(); });
    button("mod-warning", t("stands.restore"), () => this.restore(chain, selected.meta.id, doc));
  }

  private text(chain: readonly StoredStand[], id: string): string | null {
    const r = reconstruct(chain, id);
    if (r.ok) return r.text;
    new Notice(t(`stands.broken.${r.reason}`, r.at));
    return null;
  }

  private show(title: string, from: string, to: string): void {
    const d = diffSegments(from, to);
    this.deps.ui.showDiff({ title, segments: d.segments, labels: { del: t("review.kind.deletion"), ins: t("review.kind.insertion") }, ...(d.exact ? {} : { note: t("diff.approximate") }) });
  }

  private async compareWithCurrent(chain: readonly StoredStand[], id: string, doc: NonNullable<ReturnType<CommandDeps["doc"]>>): Promise<void> {
    const old = this.text(chain, id);
    if (old === null) return;
    const name = chain.find((s) => s.meta.id === id)?.meta.name ?? id;
    this.show(t("diff.titleCurrent", name), old, await readText(this.deps, doc));
  }

  private async compare(chain: readonly StoredStand[], idA: string, idB: string): Promise<void> {
    const a = this.text(chain, idA);
    const b = this.text(chain, idB);
    if (a === null || b === null) return;
    const [first, second] = (chain.find((s) => s.meta.id === idA)?.meta.time ?? "") <= (chain.find((s) => s.meta.id === idB)?.meta.time ?? "") ? [idA, idB] : [idB, idA];
    const name = (id: string): string => chain.find((s) => s.meta.id === id)?.meta.name ?? id;
    this.show(t("diff.titleTwo", name(first), name(second)), first === idA ? a : b, first === idA ? b : a);
  }

  /** Wiederherstellen: erst der jetzige Text als Stand, dann Bestätigung, dann schreiben (Spec § 10.6). Nie destruktiv. */
  private async restore(chain: readonly StoredStand[], id: string, doc: NonNullable<ReturnType<CommandDeps["doc"]>>): Promise<void> {
    const author = authorOrNotice(this.deps);
    if (author === null) return;
    const old = this.text(chain, id);
    if (old === null) return;
    const name = chain.find((s) => s.meta.id === id)?.meta.name ?? id;
    const ok = await this.deps.ui.confirm({ title: t("restore.title"), message: [t("restore.message", name), t("restore.hint")], confirmLabel: t("stands.restore"), cancelLabel: t("comment.cancel"), warning: true });
    if (!ok) return;
    const current = await readText(this.deps, doc);
    const meta = readDocMeta(current);
    if (!meta) return;
    await this.deps.stands.add(meta.id, current, { reason: "manual", author, round: meta.round, version: meta.version, custom: t("stand.beforeRestore") });
    const out = await writeDoc(this.deps.app, doc, () => ({ ok: true, text: old }));
    if (!out.ok) new Notice(out.reason);
    await this.refresh();
  }
}
