import { describe, expect, it } from "vitest";
import { makeFakeEl } from "../vendor/kit/obsidian-mock";
import { StandsPanel } from "../../src/obsidian/stands-panel";
import { doc } from "../core/review-helpers";
import { harness, settle } from "./helpers";

async function mounted() {
  const h = harness(doc("Version zwei des Briefes.\n"));
  // zwei Runden: Eingang 1, danach Eingang 2 (der aktuelle Text ist weiter)
  await h.stands.add("d1", doc("Version eins des Briefes.\n"), { reason: "incoming", author: "Johannes", round: 1, version: null });
  await h.stands.add("d1", doc("Version zwei des Briefes.\n"), { reason: "incoming", author: "Anna", round: 2, version: null });
  h.log.length = 0;
  const panel = new StandsPanel(h.deps);
  const root = makeFakeEl();
  panel.mount(root);
  await panel.refresh();
  return { ...h, panel, root };
}

const bar = (root: ReturnType<typeof makeFakeEl>) => root.querySelector(".diachronic-stands-bar")?.querySelectorAll("button") ?? [];
const rows = (root: ReturnType<typeof makeFakeEl>) => root.querySelectorAll(".okit-vlist-row");

describe("stands panel", () => {
  it("lists stands grouped by round, newest first", async () => {
    const { root } = await mounted();
    expect(root.querySelectorAll(".okit-vlist-group").map((g: { textContent: string }) => g.textContent)).toEqual(["Round 2", "Round 1"]);
    expect(rows(root).map((r: { querySelector(s: string): { textContent: string } | null }) => r.querySelector(".okit-vlist-label")?.textContent)).toEqual(["Round 2 – incoming", "Round 1 – incoming"]);
  });

  it("shows author and time on each row", async () => {
    const { root } = await mounted();
    expect(rows(root)[0]?.querySelector(".okit-vlist-meta")?.textContent).toBe("Anna · @2026-10-18");
  });

  it("says so when a note has no stands or is not tracked", async () => {
    const h = harness(doc("Text\n"));
    const panel = new StandsPanel(h.deps);
    const root = makeFakeEl();
    panel.mount(root);
    await panel.refresh();
    expect(root.querySelector(".diachronic-empty")?.textContent).toBe("No stands yet.");
    const h2 = harness("ohne Kennung\n");
    const p2 = new StandsPanel(h2.deps);
    const r2 = makeFakeEl();
    p2.mount(r2);
    await p2.refresh();
    expect(r2.querySelector(".diachronic-empty")?.textContent).toBe("This note is not tracked yet.");
  });

  it("compares a stand with the current text in the diff modal", async () => {
    const { root, ui } = await mounted();
    rows(root)[1]?.click();
    await settle();
    bar(root)[0]?.click();
    await settle();
    expect(ui.showDiff).toHaveBeenCalledTimes(1);
    const view = ui.showDiff.mock.calls[0]?.[0] as { segments: Array<{ kind: string; text: string }>; title: string };
    expect(view.title).toBe("Round 1 – incoming → current text");
    expect(view.segments.some((s) => s.kind === "del" && s.text.includes("eins"))).toBe(true);
    expect(view.segments.some((s) => s.kind === "ins" && s.text.includes("zwei"))).toBe(true);
  });

  it("compares two stands in time order", async () => {
    const { root, ui } = await mounted();
    rows(root)[0]?.click();       // Round 2
    await settle();
    bar(root)[1]?.click();   // compare with another
    await settle();
    rows(root)[1]?.click();       // Round 1
    await settle();
    const view = ui.showDiff.mock.calls[0]?.[0] as { title: string; segments: Array<{ kind: string; text: string }> };
    expect(view.title).toBe("Round 1 – incoming → Round 2 – incoming");
    expect(view.segments.some((s) => s.kind === "ins" && s.text.includes("zwei"))).toBe(true);
  });

  it("restore stores the current text before writing", async () => {
    const { root, ui, log, editor } = await mounted();
    rows(root)[1]?.click();
    await settle();
    root.querySelector(".mod-warning")?.click();
    await settle();
    expect(ui.confirm).toHaveBeenCalledTimes(1);
    expect(log).toEqual(["stand:manual", "write", "stand:incoming"]);
    expect(editor.getValue()).toContain("Version eins des Briefes.");
  });

  it("restore leaves the note alone when the user says no", async () => {
    const { root, ui, log, editor } = await mounted();
    ui.confirm.mockResolvedValue(false);
    rows(root)[1]?.click();
    await settle();
    root.querySelector(".mod-warning")?.click();
    await settle();
    expect(log).toEqual([]);
    expect(editor.getValue()).toContain("Version zwei");
  });
});

describe("readable text for the diff", () => {
  it("leaves out frontmatter and block and reads suggestions as accepted", async () => {
    const { readableText } = await import("../../src/obsidian/stands-panel");
    const { entryFor } = await import("../core/review-helpers");
    const body = "wir {~~möchten~>wollen~~} Ihnen{>>Jo: ok<<} schreiben\n";
    const text = doc(body, [entryFor(body, "{~~möchten~>wollen~~}", { id: "e1" })]);
    expect(readableText(text)).toBe("wir wollen Ihnen schreiben\n");
    expect(readableText("kein Block, nur Text\n")).toBe("kein Block, nur Text\n");
  });
});
