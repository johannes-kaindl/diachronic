import { Modal, type App } from "obsidian";
import type { CommentPrompt } from "./commands";

class CommentModal extends Modal {
  private done: ((body: string | null) => void) | null;

  constructor(app: App, private readonly prompt: CommentPrompt, done: (body: string | null) => void) {
    super(app);
    this.done = done;
  }

  onOpen(): void {
    this.modalEl.addClass("diachronic-comment");
    this.titleEl.setText(this.prompt.title);
    const area = this.contentEl.createEl("textarea", { attr: { placeholder: this.prompt.placeholder, rows: String(this.prompt.rows ?? 5), "aria-label": this.prompt.title } });
    // Enter schickt, Umschalt+Enter macht eine neue Zeile; Escape bricht ab (Modal-Standard). Auf dem iPhone gibt es die Knöpfe.
    area.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.finish(area.value);
      }
    });
    const btns = this.contentEl.createDiv({ cls: "modal-button-container" });
    btns.createEl("button", { text: this.prompt.cancel, attr: { type: "button" } }).addEventListener("click", () => { this.finish(null); });
    btns.createEl("button", { cls: "mod-cta", text: this.prompt.send, attr: { type: "button" } }).addEventListener("click", () => { this.finish(area.value); });
    area.focus();
  }

  onClose(): void {
    this.finish(null);
    this.contentEl.empty();
  }

  private finish(body: string | null): void {
    if (!this.done) return;
    const cb = this.done;
    this.done = null;
    // Eine leere Eingabe gilt als Abbruch, außer das Feld ist freiwillig: dann ist „leer“ eine Antwort, und nur Abbrechen oder Escape liefern null.
    cb(body === null || (body.trim() === "" && this.prompt.optional !== true) ? null : body.trim());
    this.close();
  }
}

/** Fragt nach einem Text (Kommentar, Name eines Standes); `null` bei Abbruch, bei leerer Eingabe nur, wenn das Feld nicht freiwillig ist. */
export function askComment(app: App, prompt: CommentPrompt): Promise<string | null> {
  return new Promise((resolve) => { new CommentModal(app, prompt, resolve).open(); });
}
