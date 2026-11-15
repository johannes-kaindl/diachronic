import { describe, expect, it } from "vitest";
import { createStandStore } from "../../src/obsidian/stand-store";
import { memoryApp } from "./helpers";
import { STAND_EXT } from "../../src/core/types";
import type { StandNameStrings } from "../../src/core/stand-plan";
import { reconstruct } from "../../src/vendor/kit/version-chain";
import { COMMIT_KEYS } from "../../src/core/commit-note";
import { parseFrontmatter } from "../../src/vendor/kit/frontmatter";

const strings: StandNameStrings = {
  incoming: (n) => `Round ${n} – incoming`, outgoing: (n) => `Round ${n} – outgoing`, marked: (n) => `Round ${n} – marked`, release: (v) => v,
  beforeBulk: "bulk", beforeKoda: "koda", manual: "manual",
};

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
    const s = await store.add("d1", "Hallo Welt\n", { note: "Projekte/Bericht.md", reason: "incoming", author: "Johannes", round: 1, version: null });
    expect(s.meta.id).toBe("r1-incoming-x1");
    expect([...files.keys()]).toEqual([`Diachronic/d1/r1-incoming-x1.${STAND_EXT}`]);
    expect(s.meta.name).toBe("Round 1 – incoming");
    expect(s.meta.anchor).toBe(true);
  });

  it("turns the previous head into a delta and reads both back", async () => {
    const { store, files } = setup();
    await store.add("d1", "eins zwei drei\n", { note: "Projekte/Bericht.md", reason: "manual", author: "J", round: 1, version: null });
    await store.add("d1", "eins zwo drei\n", { note: "Projekte/Bericht.md", reason: "manual", author: "J", round: 1, version: null });
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
    await store.add("d1", "a\n", { note: "Projekte/Bericht.md", reason: "incoming", author: "J", round: 1, version: null });
    await store.add("d1", "b\n", { note: "Projekte/Bericht.md", reason: "manual", author: "J", round: 1, version: null });
    const chain = await store.load("d1");
    expect(chain.every((c) => c.form === "full")).toBe(true);
  });

  it("makes a manual stand with a name an anchor", async () => {
    const { store } = setup();
    const s = await store.add("d1", "a\n", { note: "Projekte/Bericht.md", reason: "manual", author: "J", round: 1, version: null, custom: "Vor dem Umbau" });
    expect(s.meta.anchor).toBe(true);
    expect(s.meta.name).toBe("Vor dem Umbau");
  });

  it("skips a damaged file, reports it, and still loads the rest", async () => {
    const { store, files } = setup();
    await store.add("d1", "a\n", { note: "Projekte/Bericht.md", reason: "incoming", author: "J", round: 1, version: null });
    files.set(`Diachronic/d1/kaputt.${STAND_EXT}`, "{nicht json");
    files.set("Diachronic/d1/notiz.txt", "keine Stand-Datei");
    const chain = await store.load("d1");
    expect(chain).toHaveLength(1);
    expect(store.skipped).toBe(1);
    expect(store.skippedFiles).toEqual([`Diachronic/d1/kaputt.${STAND_EXT}`]);
  });

  it("writes a stand as a Markdown file that cannot be mistaken for a task list or a note with links", async () => {
    const { store, files } = setup();
    await store.add("d1", "---\ntitle: x\n---\nSiehe [[Anna]] #tag\n- [ ] offen\n", { note: "Projekte/Bericht.md", reason: "incoming", author: "J", round: 1, version: null });
    const raw = [...files.values()][0] ?? "";
    expect(raw.startsWith("---")).toBe(false);
    expect(raw).not.toMatch(/^- \[ \]/m);
    expect(raw).not.toMatch(/^\[\[/m);
    expect(raw).toContain("```diachronic-stand");
  });

  it("loads a stand that something else changed, and reports it instead of dropping it", async () => {
    const { store, files } = setup();
    await store.add("d1", "a\n", { note: "Projekte/Bericht.md", reason: "incoming", author: "J", round: 1, version: null });
    const [path, raw] = [...files.entries()][0] ?? ["", ""];
    files.set(path, `---\ncreated: 2026-10-23\n---\n${raw}`);
    const chain = await store.load("d1");
    expect(chain).toHaveLength(1);
    expect(store.skipped).toBe(0);
    expect(store.alteredFiles).toEqual([path]);
    files.set(path, raw.replace('"author":"J"', '"author":"Mallory"'));
    const second = await store.load("d1");
    expect(second[0]?.meta.author).toBe("Mallory");
    expect(store.alteredFiles).toEqual([path]);
  });

  it("reports nothing for stands it wrote itself, and forgets the report on the next load", async () => {
    const { store, files } = setup();
    await store.add("d1", "a\n", { note: "Projekte/Bericht.md", reason: "incoming", author: "J", round: 1, version: null });
    await store.load("d1");
    expect(store.altered).toBe(0);
    const [path, raw] = [...files.entries()][0] ?? ["", ""];
    files.set(path, `${raw}\nvon Hand\n`);
    await store.load("d1");
    expect(store.altered).toBe(1);
    files.set(path, raw);
    await store.load("d1");
    expect(store.altered).toBe(0);
  });

  it("skips a stand that belongs to another document", async () => {
    const { store, files } = setup();
    await store.add("d1", "a\n", { note: "Projekte/Bericht.md", reason: "incoming", author: "J", round: 1, version: null });
    const [path, raw] = [...files.entries()][0] ?? ["", ""];
    files.set(path.replace("/d1/", "/d2/"), raw);
    files.delete(path);
    const chain = await store.load("d2");
    expect(chain).toHaveLength(0);
    expect(store.skipped).toBe(1);
  });

  it("separates documents by id, so a rename of the note changes nothing", async () => {
    const { store } = setup();
    await store.add("d1", "a\n", { note: "Projekte/Bericht.md", reason: "incoming", author: "J", round: 1, version: null });
    await store.add("d2", "b\n", { note: "Projekte/Bericht.md", reason: "incoming", author: "J", round: 1, version: null });
    expect((await store.load("d1")).map((s) => s.meta.docId)).toEqual(["d1"]);
    expect(await store.load("unbekannt")).toEqual([]);
  });

  it("writes exactly the stands it is given", async () => {
    const { store, files } = setup();
    const a = await store.add("d1", "a\n", { note: "Projekte/Bericht.md", reason: "incoming", author: "J", round: 1, version: null });
    files.clear();
    await store.save("d1", [a]);
    expect(files.size).toBe(1);
  });

  it("refuses an unsafe document id instead of leaving the folder", async () => {
    const { store } = setup();
    await expect(store.load("../geheim")).rejects.toThrow(/unsafe document id/);
    await expect(store.add("a/b", "x", { note: "Projekte/Bericht.md", reason: "manual", author: "J", round: 1, version: null })).rejects.toThrow(/unsafe/);
  });
});

describe("commit notes", () => {
  function withCommits(folder = "Stand notes") {
    const m = memoryApp();
    const failed: Array<{ path: string; error: unknown }> = [];
    let n = 0;
    let t = Date.UTC(2026, 9, 18, 10, 0, 0);
    const store = createStandStore(m.app, () => "Diachronic", strings, () => new Date((t += 60_000)), () => `x${++n}`, undefined, { folder: () => folder, onFailed: (path, error) => { failed.push({ path, error }); } });
    return { ...m, store, failed };
  }
  const noteAt = (files: Map<string, string>, path: string) => parseFrontmatter(files.get(path) ?? "").data;

  it("writes one note per stand next to the stand folder, with a link to the note the stand belongs to", async () => {
    const { store, files } = withCommits();
    const s = await store.add("d1", "Hallo\n", { note: "Projekte/Bericht.md", reason: "incoming", author: "Johannes", round: 1, version: "1.0" });
    expect([...files.keys()].sort()).toEqual([`Stand notes/${s.meta.id}.md`, `Diachronic/d1/${s.meta.id}.${STAND_EXT}`].sort());
    const fm = noteAt(files, `Stand notes/${s.meta.id}.md`);
    expect(fm[COMMIT_KEYS.stand]).toBe(s.meta.id);
    expect(fm[COMMIT_KEYS.message]).toBe("Round 1 – incoming");
    expect(fm[COMMIT_KEYS.author]).toBe("Johannes");
    expect(fm[COMMIT_KEYS.time]).toBe(s.meta.time);
    expect(fm[COMMIT_KEYS.version]).toBe("1.0");
    expect(fm[COMMIT_KEYS.notes]).toEqual(["[[Projekte/Bericht]]"]);
  });

  it("leaves the stand file exactly as it is without commit notes", async () => {
    const plain = setup();
    const withNotes = withCommits();
    const input = { note: "Projekte/Bericht.md", reason: "incoming", author: "J", round: 1, version: null } as const;
    await plain.store.add("d1", "Hallo\n", input);
    await withNotes.store.add("d1", "Hallo\n", input);
    const standPath = `Diachronic/d1/r1-incoming-x1.${STAND_EXT}`;
    expect(withNotes.files.get(standPath)).toBe(plain.files.get(standPath));
  });

  it("writes a note for every stand, and the notes do not count as damaged stands", async () => {
    const { store, files } = withCommits();
    await store.add("d1", "eins\n", { note: "A.md", reason: "incoming", author: "J", round: 1, version: null });
    await store.add("d1", "zwei\n", { note: "A.md", reason: "marked", author: "J", round: 1, version: null });
    expect([...files.keys()].filter((p) => p.startsWith("Stand notes/"))).toHaveLength(2);
    const chain = await store.load("d1");
    expect(chain).toHaveLength(2);
    expect(store.skipped).toBe(0);
  });

  it("uses the folder it is given, so a chosen folder outside the stand folder works", async () => {
    const { store, files } = withCommits("Protokoll/Stände");
    const s = await store.add("d1", "x\n", { note: "A.md", reason: "manual", author: "J", round: 1, version: null });
    expect(files.has(`Protokoll/Stände/${s.meta.id}.md`)).toBe(true);
  });

  it("cannot clash with a document folder, because the default folder name is no valid document id", async () => {
    const { store } = withCommits();
    await expect(store.add("Stand notes", "x\n", { note: "A.md", reason: "manual", author: "J", round: 1, version: null })).rejects.toThrow(/unsafe document id/);
  });

  it("keeps the stand and reports the path when the note cannot be written", async () => {
    const m = withCommits();
    const adapter = m.app.vault.adapter;
    const write = adapter.write.bind(adapter);
    adapter.write = (p: string, data: string) => (p.includes("Stand notes") ? Promise.reject(new Error("Platte voll")) : write(p, data));
    const s = await m.store.add("d1", "x\n", { note: "A.md", reason: "manual", author: "J", round: 1, version: null });
    expect(m.files.has(`Diachronic/d1/${s.meta.id}.${STAND_EXT}`)).toBe(true);
    expect(m.failed).toHaveLength(1);
    expect(m.failed[0]?.path).toBe(`Stand notes/${s.meta.id}.md`);
  });

  it("refuses an unusable commit folder before it writes anything", async () => {
    const { store, files } = withCommits("../draussen");
    await expect(store.add("d1", "x\n", { note: "A.md", reason: "manual", author: "J", round: 1, version: null })).rejects.toThrow(/commit folder/);
    expect(files.size).toBe(0);
  });
});
