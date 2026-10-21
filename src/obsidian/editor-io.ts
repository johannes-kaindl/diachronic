import { MarkdownView, type App, type Editor, type TFile } from "obsidian";
import { diffReplaceSpan } from "../vendor/kit/replace-span";

/** Die Notiz, an der gearbeitet wird; `editor` nur im Bearbeitungsmodus (Quelle oder Live-Vorschau). */
export interface ActiveDoc { file: TFile; editor: Editor | null }

/**
 * Die zuletzt benutzte Notiz im Hauptbereich. Nicht `getActiveViewOfType`: Steht der Fokus in unserer Seitenleiste, ist dort
 * keine Markdown-Ansicht aktiv, die Notiz daneben ist es trotzdem, die gemeint ist.
 */
export function activeDoc(app: App): ActiveDoc | null {
  const leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
  const view = leaf?.view;
  if (!(view instanceof MarkdownView) || !view.file) return null;
  return { file: view.file, editor: view.getMode() === "source" ? view.editor : null };
}

export type WriteOutcome = { ok: true } | { ok: false; reason: string };
export type Transform = (text: string) => { ok: true; text: string } | { ok: false; reason: string };

/**
 * Schreibt das Ergebnis von `transform` in die Notiz. Ist sie im Bearbeitungsmodus offen, geschieht das als eine
 * Editor-Transaktion mit dem kleinsten Bereich (ein Undo-Schritt, Cursor und Scrollposition bleiben, solange sie außerhalb liegen);
 * sonst über `vault.process`, das den Inhalt atomar liest und schreibt. Im Lesemodus nie über den Editor: `replaceRange` verpufft dort.
 * Lehnt `transform` ab, wird nichts geschrieben.
 */
export async function writeDoc(app: App, doc: ActiveDoc, transform: Transform): Promise<WriteOutcome> {
  if (doc.editor) {
    const editor = doc.editor;
    const old = editor.getValue();
    const r = transform(old);
    if (!r.ok) return r;
    if (r.text === old) return { ok: true };
    const span = diffReplaceSpan(old, r.text);
    editor.transaction({ changes: [{ from: editor.offsetToPos(span.from), to: editor.offsetToPos(span.to), text: span.insert }] });
    return { ok: true };
  }
  let refusal: string | null = null;
  await app.vault.process(doc.file, (data) => {
    const r = transform(data);
    if (r.ok) return r.text;
    refusal = r.reason;
    return data;
  });
  return refusal === null ? { ok: true } : { ok: false, reason: refusal };
}
