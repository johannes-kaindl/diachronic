import { describe, expect, it } from "vitest";
import { holdIncoming, markChangesCommand, saveStandCommand } from "../../src/obsidian/commands";
import { splitDoc } from "../../src/core/meta-zone";
import { harness } from "./helpers";

const LETTER = "Sehr geehrte Frau Berger,\n\nwir möchten Ihnen mitteilen, dass es klappt.\n\nBitte antworten Sie dringend bis Freitag.\n";

async function started() {
  const h = harness(LETTER);
  const doc = h.deps.doc();
  if (!doc) throw new Error("setup");
  await holdIncoming(h.deps, doc);
  return { ...h, doc };
}

describe("markChangesCommand", () => {
  it("marks, stores a stand with the marks, and marks again in the same round", async () => {
    const h = await started();
    h.editor.setValue(h.editor.getValue().replace("möchten", "wollen"));
    await markChangesCommand(h.deps, h.doc);
    let parts = splitDoc(h.editor.getValue());
    expect(parts.ok && parts.parts.body).toContain("{~~möchten~>wollen~~}");
    expect((await h.stands.load(parts.ok ? parts.parts.head.match(/diachronic-id: (\S+)/)?.[1] ?? "" : "")).some((s) => s.meta.name === "Round 1 – marked")).toBe(true);

    // ein zweites Mal in derselben Runde: die Marke von eben ist Teil der Basis, nicht „neu getippt“
    h.editor.setValue(h.editor.getValue().replace(" dringend", ""));
    await markChangesCommand(h.deps, h.doc);
    parts = splitDoc(h.editor.getValue());
    expect(parts.ok && parts.parts.body).toContain("{~~möchten~>wollen~~}");
    expect(parts.ok && parts.parts.body).toMatch(/\{-- ?dringend ?--\}/);
    expect(parts.ok && parts.parts.entries.map((e) => e.kind)).toEqual(["substitution", "deletion"]);
  });

  it("says so when nothing changed and writes no stand", async () => {
    const h = await started();
    const before = (await h.stands.load(splitIdOf(h.editor.getValue()))).length;
    await markChangesCommand(h.deps, h.doc);
    expect((await h.stands.load(splitIdOf(h.editor.getValue()))).length).toBe(before);
  });
});

function splitIdOf(text: string): string {
  return /diachronic-id: (\S+)/.exec(text)?.[1] ?? "";
}

describe("restore and the base of the next marking", () => {
  it("after restoring the incoming stand, marking compares against that stand, not an older marked one", async () => {
    const { StandsPanel } = await import("../../src/obsidian/stands-panel");
    const { makeFakeEl } = await import("../vendor/kit/obsidian-mock");
    const h = await started();
    const id = /diachronic-id: (\S+)/.exec(h.editor.getValue())?.[1] ?? "";
    h.editor.setValue(h.editor.getValue().replace("möchten", "wollen"));
    await markChangesCommand(h.deps, h.doc);
    const panel = new StandsPanel(h.deps);
    const root = makeFakeEl();
    panel.mount(root);
    await panel.refresh();
    const row = root.querySelectorAll(".okit-vlist-row").find((r: { querySelector(s: string): { textContent: string } | null }) => /incoming/.test(r.querySelector(".okit-vlist-label")?.textContent ?? ""));
    row?.click();
    for (let i = 0; i < 12; i++) await new Promise<void>((r) => { setTimeout(r, 0); });
    root.querySelector(".diachronic-stands-bar")?.querySelectorAll("button")[2]?.click();
    for (let i = 0; i < 20; i++) await new Promise<void>((r) => { setTimeout(r, 0); });
    expect(h.editor.getValue()).not.toContain("{~~");
    h.editor.setValue(h.editor.getValue().replace("möchten", "sollen"));
    await markChangesCommand(h.deps, h.doc);
    const parts = splitDoc(h.editor.getValue());
    expect(parts.ok && parts.parts.body).toContain("{~~möchten~>sollen~~}");
    expect((await h.stands.load(id)).filter((s) => s.meta.name === "Round 1 – incoming").length).toBe(2);
  });
});

describe("saveStandCommand", () => {
  it("saves the current text under a name as an anchor, and touches neither the note nor the round", async () => {
    const h = await started();
    const before = h.editor.getValue();
    h.ui.askComment.mockResolvedValueOnce("Vor dem Umbau");
    await saveStandCommand(h.deps, h.doc);
    expect(h.editor.getValue()).toBe(before);
    const chain = await h.stands.load(splitIdOf(before));
    const saved = chain.find((s) => s.meta.name === "Vor dem Umbau");
    expect(saved).toMatchObject({ form: "full", meta: { anchor: true } });
    expect(saved?.meta.id).toMatch(/^r1-manual-/);
    expect(h.ui.askComment.mock.calls.at(-1)?.[0]).toMatchObject({ optional: true });
  });

  it("saves an unnamed stand when the name is left empty", async () => {
    const h = await started();
    h.ui.askComment.mockResolvedValueOnce("");
    await saveStandCommand(h.deps, h.doc);
    const chain = await h.stands.load(splitIdOf(h.editor.getValue()));
    const saved = chain.filter((s) => s.meta.id.startsWith("r1-manual-"));
    expect(saved).toHaveLength(1);
    expect(saved[0]?.meta).toMatchObject({ name: "manual", anchor: false });
  });

  it("saves nothing when the dialog is cancelled", async () => {
    const h = await started();
    const count = (await h.stands.load(splitIdOf(h.editor.getValue()))).length;
    h.ui.askComment.mockResolvedValueOnce(null);
    await saveStandCommand(h.deps, h.doc);
    expect((await h.stands.load(splitIdOf(h.editor.getValue()))).length).toBe(count);
  });

  it("refuses a note that is not tracked yet", async () => {
    const h = harness("ohne Kennung\n");
    const doc = h.deps.doc();
    if (!doc) throw new Error("setup");
    await saveStandCommand(h.deps, doc);
    expect(h.ui.askComment).not.toHaveBeenCalled();
    expect(h.files.size).toBe(0);
  });
});
