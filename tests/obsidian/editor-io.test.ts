import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { MarkdownView, TFile, WorkspaceLeaf, makeFakeApp, makeFakeEditor } from "../vendor/kit/obsidian-mock";
import { activeDoc, writeDoc, type ActiveDoc } from "../../src/obsidian/editor-io";

type AnyDoc = { file: unknown; editor: unknown };
const asDoc = (d: AnyDoc): ActiveDoc => d as unknown as ActiveDoc;

/** Ein Editor, der `transaction` wie Obsidian anwendet (Änderungen als Zeile/Zeichen). */
function editorWith(text: string) {
  const ed = makeFakeEditor(text);
  ed.transaction = vi.fn((tx: { changes: Array<{ from: unknown; to: unknown; text: string }> }) => {
    for (const c of tx.changes) ed.replaceRange(c.text, c.from, c.to);
  });
  return ed;
}

function appWithProcess(initial: string) {
  const app = makeFakeApp() as App;
  const holder = { stored: initial };
  (app.vault as unknown as Record<string, unknown>).process = vi.fn(async (_f: unknown, fn: (d: string) => string) => { holder.stored = fn(holder.stored); return holder.stored; });
  return { app, holder };
}

describe("writeDoc", () => {
  it("uses one editor transaction in source mode, with the smallest span", async () => {
    const editor = editorWith("Zeile eins\nZeile zwei\n");
    const { app, holder } = appWithProcess("");
    const doc = asDoc({ file: new TFile("a.md"), editor });
    const r = await writeDoc(app, doc, (t) => ({ ok: true, text: t.replace("zwei", "drei") }));
    expect(r).toEqual({ ok: true });
    expect(editor.transaction).toHaveBeenCalledTimes(1);
    const tx = editor.transaction.mock.calls[0][0] as { changes: Array<{ text: string; from: unknown; to: unknown }> };
    expect(tx.changes).toHaveLength(1);
    expect(tx.changes[0]).toEqual({ from: { line: 1, ch: 6 }, to: { line: 1, ch: 8 }, text: "dr" });
    expect(editor.getValue()).toBe("Zeile eins\nZeile drei\n");
    expect(holder.stored).toBe("");
  });

  it("writes through vault.process when the view is not in source mode", async () => {
    const { app, holder } = appWithProcess("alt\n");
    const r = await writeDoc(app, asDoc({ file: new TFile("a.md"), editor: null }), (t) => ({ ok: true, text: t + "neu\n" }));
    expect(r).toEqual({ ok: true });
    expect(holder.stored).toBe("alt\nneu\n");
  });

  it("reports a transform refusal without writing (both paths)", async () => {
    const editor = editorWith("x\n");
    const { app, holder } = appWithProcess("y\n");
    const no = () => ({ ok: false as const, reason: "zone-broken" });
    expect(await writeDoc(app, asDoc({ file: new TFile("a.md"), editor }), no)).toEqual({ ok: false, reason: "zone-broken" });
    expect(editor.transaction).not.toHaveBeenCalled();
    expect(await writeDoc(app, asDoc({ file: new TFile("a.md"), editor: null }), no)).toEqual({ ok: false, reason: "zone-broken" });
    expect(holder.stored).toBe("y\n");
  });

  it("does not touch the editor when the text does not change", async () => {
    const editor = editorWith("x\n");
    const { app } = appWithProcess("");
    expect(await writeDoc(app, asDoc({ file: new TFile("a.md"), editor }), (t) => ({ ok: true, text: t }))).toEqual({ ok: true });
    expect(editor.transaction).not.toHaveBeenCalled();
  });
});

describe("activeDoc", () => {
  function appWithLeaf(mode: string | null) {
    const app = makeFakeApp() as App;
    if (mode === null) return app;
    const view = new MarkdownView();
    view.file = new TFile("brief.md");
    view.getMode = () => mode;
    const leaf = new WorkspaceLeaf();
    leaf.view = view;
    (app.workspace.getMostRecentLeaf as ReturnType<typeof vi.fn>).mockReturnValue(leaf);
    return app;
  }

  it("returns the editor only in source mode", () => {
    expect(activeDoc(appWithLeaf("source"))?.editor).not.toBeNull();
    expect(activeDoc(appWithLeaf("preview"))).toMatchObject({ editor: null });
    expect(activeDoc(appWithLeaf("preview"))?.file.path).toBe("brief.md");
  });

  it("returns null without a note", () => {
    expect(activeDoc(appWithLeaf(null))).toBeNull();
  });
});
