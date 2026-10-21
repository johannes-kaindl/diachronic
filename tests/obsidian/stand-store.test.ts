import { describe, expect, it } from "vitest";
import type { App } from "obsidian";
import { createStandStore } from "../../src/obsidian/stand-store";
import { isSafeId } from "../../src/core/doc-meta";
import { STAND_EXT } from "../../src/core/types";
import type { StandNameStrings } from "../../src/core/stand-plan";
import { reconstruct } from "../../src/vendor/kit/version-chain";

const strings: StandNameStrings = {
  incoming: (n) => `Round ${n} – incoming`, outgoing: (n) => `Round ${n} – outgoing`, release: (v) => v,
  beforeBulk: "bulk", beforeKoda: "koda", manual: "manual",
};

/** Ein Vault-Adapter im Speicher: `list` liefert wie Obsidian volle Pfade. */
function memoryApp(): { app: App; files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const adapter = {
    exists: (p: string): Promise<boolean> => Promise.resolve(files.has(p) || dirs.has(p) || [...files.keys()].some((f) => f.startsWith(`${p}/`))),
    mkdir: (p: string): Promise<void> => { dirs.add(p); return Promise.resolve(); },
    write: (p: string, data: string): Promise<void> => { files.set(p, data); return Promise.resolve(); },
    read: (p: string): Promise<string> => Promise.resolve(files.get(p) ?? ""),
    list: (p: string): Promise<{ files: string[]; folders: string[] }> =>
      Promise.resolve({ files: [...files.keys()].filter((f) => f.startsWith(`${p}/`) && !f.slice(p.length + 1).includes("/")), folders: [] }),
  };
  return { app: { vault: { adapter } } as unknown as App, files, dirs };
}

function setup() {
  const m = memoryApp();
  let n = 0;
  let t = Date.UTC(2026, 9, 18, 10, 0, 0);
  const store = createStandStore(m.app, () => "Diachronic", strings, () => new Date((t += 60_000)), () => `x${++n}`);
  return { ...m, store };
}

describe("stand store", () => {
  it("adds a stand as <folder>/<docId>/<standId>.<ext>", async () => {
    const { store, files } = setup();
    const s = await store.add("d1", "Hallo Welt\n", { reason: "incoming", author: "Johannes", round: 1, version: null });
    expect(s.meta.id).toBe("r1-incoming-x1");
    expect([...files.keys()]).toEqual([`Diachronic/d1/r1-incoming-x1.${STAND_EXT}`]);
    expect(s.meta.name).toBe("Round 1 – incoming");
    expect(s.meta.anchor).toBe(true);
  });

  it("turns the previous head into a delta and reads both back", async () => {
    const { store, files } = setup();
    await store.add("d1", "eins zwei drei\n", { reason: "manual", author: "J", round: 1, version: null });
    await store.add("d1", "eins zwo drei\n", { reason: "manual", author: "J", round: 1, version: null });
    expect(files.size).toBe(2);
    const chain = await store.load("d1");
    expect(chain.map((c) => c.form).sort()).toEqual(["delta", "full"]);
    const first = chain.find((c) => c.meta.id === "r1-manual-x1");
    const second = chain.find((c) => c.meta.id === "r1-manual-x2");
    expect(first && reconstruct(chain, first.meta.id)).toEqual({ ok: true, text: "eins zwei drei\n" });
    expect(second && reconstruct(chain, second.meta.id)).toEqual({ ok: true, text: "eins zwo drei\n" });
  });

  it("keeps anchors full", async () => {
    const { store } = setup();
    await store.add("d1", "a\n", { reason: "incoming", author: "J", round: 1, version: null });
    await store.add("d1", "b\n", { reason: "manual", author: "J", round: 1, version: null });
    const chain = await store.load("d1");
    expect(chain.every((c) => c.form === "full")).toBe(true);
  });

  it("makes a manual stand with a name an anchor", async () => {
    const { store } = setup();
    const s = await store.add("d1", "a\n", { reason: "manual", author: "J", round: 1, version: null, custom: "Vor dem Umbau" });
    expect(s.meta.anchor).toBe(true);
    expect(s.meta.name).toBe("Vor dem Umbau");
  });

  it("skips a damaged file, reports it, and still loads the rest", async () => {
    const { store, files } = setup();
    await store.add("d1", "a\n", { reason: "incoming", author: "J", round: 1, version: null });
    files.set(`Diachronic/d1/kaputt.${STAND_EXT}`, "{nicht json");
    files.set("Diachronic/d1/notiz.md", "keine Stand-Datei");
    const chain = await store.load("d1");
    expect(chain).toHaveLength(1);
    expect(store.skipped).toBe(1);
    expect(store.skippedFiles).toEqual([`Diachronic/d1/kaputt.${STAND_EXT}`]);
  });

  it("skips a stand that belongs to another document", async () => {
    const { store, files } = setup();
    await store.add("d1", "a\n", { reason: "incoming", author: "J", round: 1, version: null });
    const [path, raw] = [...files.entries()][0] ?? ["", ""];
    files.set(path.replace("/d1/", "/d2/"), raw);
    files.delete(path);
    const chain = await store.load("d2");
    expect(chain).toHaveLength(0);
    expect(store.skipped).toBe(1);
  });

  it("separates documents by id, so a rename of the note changes nothing", async () => {
    const { store } = setup();
    await store.add("d1", "a\n", { reason: "incoming", author: "J", round: 1, version: null });
    await store.add("d2", "b\n", { reason: "incoming", author: "J", round: 1, version: null });
    expect((await store.load("d1")).map((s) => s.meta.docId)).toEqual(["d1"]);
    expect(await store.load("unbekannt")).toEqual([]);
  });

  it("writes exactly the stands it is given", async () => {
    const { store, files } = setup();
    const a = await store.add("d1", "a\n", { reason: "incoming", author: "J", round: 1, version: null });
    files.clear();
    await store.save("d1", [a]);
    expect(files.size).toBe(1);
  });

  it("refuses an unsafe document id instead of leaving the folder", async () => {
    const { store } = setup();
    await expect(store.load("../geheim")).rejects.toThrow(/unsafe document id/);
    await expect(store.add("a/b", "x", { reason: "manual", author: "J", round: 1, version: null })).rejects.toThrow(/unsafe/);
    expect(isSafeId("d1-ab_C")).toBe(true);
    expect(isSafeId("..")).toBe(false);
    expect(isSafeId("")).toBe(false);
  });
});
