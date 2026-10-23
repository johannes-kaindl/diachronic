import { describe, expect, it, vi } from "vitest";
import "../../src/i18n/strings";
import { offerExclusion, type ExclusionHost } from "../../src/obsidian/exclusion";
import { createStandStore } from "../../src/obsidian/stand-store";
import { memoryApp, standStrings } from "./helpers";

const confirmCalls = (h: ReturnType<typeof host>): unknown[] => (h.confirm as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c[0]);

function host(over: Partial<ExclusionHost> = {}) {
  let offered = false;
  const h = {
    folder: () => "Diachronic",
    offered: () => offered,
    markOffered: vi.fn(() => { offered = true; return Promise.resolve(); }),
    confirm: vi.fn().mockResolvedValue(true),
    openFilesAndLinks: vi.fn(),
    ...over,
  };
  return h satisfies ExclusionHost;
}

describe("offerExclusion", () => {
  it("asks once, names the folder, and opens the settings on yes", async () => {
    const h = host();
    await offerExclusion(h);
    expect(confirmCalls(h)).toHaveLength(1);
    expect(JSON.stringify(confirmCalls(h)[0])).toContain("Diachronic");
    expect(h.openFilesAndLinks).toHaveBeenCalledTimes(1);
    expect(h.markOffered).toHaveBeenCalledTimes(1);
    await offerExclusion(h);
    expect(confirmCalls(h)).toHaveLength(1);
  });

  it("does not open the settings on no, but still does not ask again", async () => {
    const h = host({ confirm: vi.fn().mockResolvedValue(false) });
    await offerExclusion(h);
    expect(h.openFilesAndLinks).not.toHaveBeenCalled();
    await offerExclusion(h);
    expect(confirmCalls(h)).toHaveLength(1);
  });

  it("marks the offer before it asks, so a second stand written meanwhile does not ask twice", async () => {
    let resolve: (v: boolean) => void = () => {};
    const confirm = vi.fn(() => new Promise<boolean>((r) => { resolve = r; }));
    const h = host({ confirm });
    const first = offerExclusion(h);
    const second = offerExclusion(h);
    await new Promise<void>((r) => { setTimeout(r, 0); });
    resolve(false);
    await Promise.all([first, second]);
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});

describe("stand store: first creation of the folder", () => {
  it("calls back once, when the folder is created, not on later writes", async () => {
    const m = memoryApp();
    let n = 0;
    const created = vi.fn();
    const store = createStandStore(m.app, () => "Diachronic", standStrings, () => new Date(Date.UTC(2026, 9, 23, 10, ++n)), () => `x${n}`, created);
    await store.add("d1", "a\n", { reason: "incoming", author: "J", round: 1, version: null });
    await store.add("d1", "b\n", { reason: "manual", author: "J", round: 1, version: null });
    expect(created).toHaveBeenCalledTimes(1);
    await store.add("d2", "c\n", { reason: "incoming", author: "J", round: 1, version: null });
    expect(created).toHaveBeenCalledTimes(1);
  });
});
