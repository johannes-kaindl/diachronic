import { Modal, type App } from "obsidian";
import { renderRedline } from "../vendor/kit-obsidian/redline";
import type { DiffView } from "./commands";

/** Wortebenen-Diff in einer Spalte (trägt auch auf dem iPhone): Löschung durchgestrichen, Einfügung unterstrichen. */
class DiffModal extends Modal {
  constructor(app: App, private readonly view: DiffView) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("diachronic-diff");
    this.titleEl.setText(this.view.title);
    if (this.view.note) this.contentEl.createDiv({ cls: "diachronic-diff-note", text: this.view.note });
    renderRedline(this.contentEl, this.view.segments, { cls: "diachronic-diff-body", labels: this.view.labels });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export function showDiff(app: App, view: DiffView): void {
  new DiffModal(app, view).open();
}
