import { describe, expect, it } from "vitest";
import { makeFakeEl } from "../vendor/kit/obsidian-mock";
import { ReviewPanel } from "../../src/obsidian/review-panel";
import { doc, entryFor } from "../core/review-helpers";
import { harness, settle } from "./helpers";

const BODY = "Wir {~~möchten~>wollen~~} Ihnen {++gerne ++}mitteilen {--sehr--}{>>Jo: streichen?<<}, dass es klappt.\n";
const entries = () => [
  entryFor(BODY, "{~~möchten~>wollen~~}", { id: "e1" }),
  entryFor(BODY, "{++gerne ++}", { id: "e2" }),
  entryFor(BODY, "{--sehr--}", { id: "e3" }),
  entryFor(BODY, "{>>Jo: streichen?<<}", { id: "c1", thread: "c1", author: "Jo" }),
];

async function mounted(text: string, settings?: Parameters<typeof harness>[1]) {
  const h = harness(text, settings);
  const panel = new ReviewPanel(h.deps);
  const root = makeFakeEl();
  panel.mount(root);
  await panel.refresh();
  return { ...h, panel, root };
}

const cards = (root: ReturnType<typeof makeFakeEl>) => root.querySelectorAll(".okit-review-card");

describe("review panel", () => {
  it("renders cards for the active note", async () => {
    const { root } = await mounted(doc(BODY, entries()));
    expect(cards(root).map((c: { getAttribute(k: string): string | null }) => c.getAttribute("data-id"))).toEqual(["e1", "e2", "e3", "c1"]);
    expect(root.querySelector(".okit-review-count")?.textContent).toBe("3 open changes");
  });

  it("accept writes and rebuilds", async () => {
    const { root, editor } = await mounted(doc(BODY, entries()));
    root.querySelector(".okit-review-accept")?.click();
    await settle();
    expect(editor.getValue()).toContain("Wir wollen Ihnen");
    expect(editor.transaction).toHaveBeenCalledTimes(1);
    expect(cards(root).map((c: { getAttribute(k: string): string | null }) => c.getAttribute("data-id"))).toEqual(["e2", "e3", "c1"]);
  });

  it("reject keeps the old wording", async () => {
    const { root, editor } = await mounted(doc(BODY, entries()));
    root.querySelector(".okit-review-reject")?.click();
    await settle();
    expect(editor.getValue()).toContain("Wir möchten Ihnen");
  });

  it("shows a card as stale and refuses when the text changed under it", async () => {
    const { root, editor, panel } = await mounted(doc(BODY, entries()));
    // jemand schreibt weiter, während die Karte offen ist
    editor.setValue(editor.getValue().replace("{~~möchten~>wollen~~}", "{~~möchten~>wollten~~}"));
    root.querySelector(".okit-review-accept")?.click();
    await settle();
    expect(editor.getValue()).toContain("{~~möchten~>wollten~~}");
    await panel.refresh();
    expect(root.querySelectorAll(".okit-review-stale").length).toBe(1);
  });

  it("bulk accept stores a stand first and asks", async () => {
    const { root, ui, log, editor } = await mounted(doc(BODY, entries()));
    root.querySelector(".okit-review-accept-all")?.click();
    await settle();
    expect(ui.confirm).toHaveBeenCalledTimes(1);
    expect(log).toEqual(["stand:before-bulk", "write"]);
    expect(editor.getValue()).toContain("Wir wollen Ihnen gerne mitteilen {>>Jo: streichen?<<}, dass es klappt.");
  });

  it("bulk accept does nothing when the user says no", async () => {
    const { root, ui, log, editor } = await mounted(doc(BODY, entries()));
    ui.confirm.mockResolvedValue(false);
    const before = editor.getValue();
    root.querySelector(".okit-review-accept-all")?.click();
    await settle();
    expect(log).toEqual([]);
    expect(editor.getValue()).toBe(before);
  });

  it("comment asks for the text and writes a comment behind the change", async () => {
    const { root, editor, ui } = await mounted(doc(BODY, entries()));
    root.querySelector(".okit-review-comment")?.click();
    await settle();
    expect(ui.askComment).toHaveBeenCalledTimes(1);
    expect(editor.getValue()).toContain("{~~möchten~>wollen~~}{>>Johannes: Bitte prüfen<<}");
  });

  it("asks for the author's name before writing anything", async () => {
    const { root, editor, ui, deps } = await mounted(doc(BODY, entries()), { authorName: "" });
    const before = editor.getValue();
    root.querySelector(".okit-review-comment")?.click();
    await settle();
    expect(ui.askComment).not.toHaveBeenCalled();
    expect(deps.openSettings).toHaveBeenCalled();
    expect(editor.getValue()).toBe(before);
  });

  it("empty note shows the empty state", async () => {
    const { root } = await mounted(doc("Nur Text, nichts zu prüfen.\n"));
    expect(root.querySelector(".okit-review-empty")).not.toBeNull();
    expect(root.querySelectorAll(".okit-review-card")).toHaveLength(0);
  });

  it("a note without Diachronic fields offers to hold it as incoming", async () => {
    const { root } = await mounted("Brief ohne Kennung\n");
    expect(root.querySelector(".diachronic-empty")).not.toBeNull();
    expect(root.querySelector("button")?.textContent).toBe("Hold as incoming");
  });

  it("says why a note with a broken block cannot be reviewed", async () => {
    const { root } = await mounted(doc(BODY, entries()).replace("diachronic:end %%", ""));
    expect(root.querySelector(".diachronic-empty")?.textContent).toContain("damaged");
    expect(cards(root)).toHaveLength(0);
  });

  it("highlights the card that belongs to an offset in the note", async () => {
    const text = doc(BODY, entries());
    const { root, panel } = await mounted(text);
    const id = panel.idAt(text.indexOf("{++gerne ++}"));
    expect(id).toBe("e2");
    panel.highlight("e2");
    expect(root.querySelectorAll(".is-focused").map((c: { getAttribute(k: string): string | null }) => c.getAttribute("data-id"))).toEqual(["e2"]);
  });
});
