import { describe, expect, it } from "vitest";
import { COMMIT_KEYS, COMMIT_SUBFOLDER, commitFolderOf, commitNotePath, renderCommitNote } from "../../src/core/commit-note";
import { parseFrontmatter } from "../../src/vendor/kit/frontmatter";
import { addStand, type StoredStand } from "../../src/vendor/kit/version-chain";

function standOf(over: { id?: string; name?: string; author?: string } = {}): StoredStand {
  const { write } = addStand([], "Text\n", {
    id: over.id ?? "r2-incoming-a1", docId: "d1", time: "2026-11-14T10:00:00.000Z", author: over.author ?? "Johannes", name: over.name ?? "Runde 2 – Eingang", anchor: true,
  });
  const s = write[0];
  if (!s) throw new Error("no stand");
  return s;
}

describe("commit note", () => {
  it("carries message, author, time and a link to the note as frontmatter that Bases can read", () => {
    const raw = renderCommitNote(standOf(), "Projekte/Bericht.md", "1.0");
    const fm = parseFrontmatter(raw).data;
    expect(fm[COMMIT_KEYS.stand]).toBe("r2-incoming-a1");
    expect(fm[COMMIT_KEYS.message]).toBe("Runde 2 – Eingang");
    expect(fm[COMMIT_KEYS.author]).toBe("Johannes");
    expect(fm[COMMIT_KEYS.time]).toBe("2026-11-14T10:00:00.000Z");
    expect(fm[COMMIT_KEYS.reason]).toBe("incoming");
    // Der Parser liest jede Zahl als Zeichenfolge (Typ-Asymmetrie des Kits); geschrieben wird sie ungequotet, damit Bases sie als Zahl führt.
    expect(fm[COMMIT_KEYS.round]).toBe("2");
    expect(raw).toContain(`${COMMIT_KEYS.round}: 2\n`);
    expect(fm[COMMIT_KEYS.version]).toBe("1.0");
    expect(fm[COMMIT_KEYS.notes]).toEqual(["[[Projekte/Bericht]]"]);
  });

  it("leaves out the version when the note has none, and the reason when the id says nothing about it", () => {
    const fm = parseFrontmatter(renderCommitNote(standOf(), "Bericht.md", null)).data;
    expect(COMMIT_KEYS.version in fm).toBe(false);
    const odd = parseFrontmatter(renderCommitNote(standOf({ id: "kaputt" }), "Bericht.md", null)).data;
    expect(COMMIT_KEYS.reason in odd).toBe(false);
    expect(COMMIT_KEYS.round in odd).toBe(false);
  });

  it("never writes the keys of a tracked document (a commit note is not a tracked note)", () => {
    const raw = renderCommitNote(standOf(), "Bericht.md", "1.0");
    for (const key of ["diachronic-id", "diachronic-version", "diachronic-round", "diachronic-status", "diachronic-participants"]) {
      expect(raw).not.toContain(`${key}:`);
    }
  });

  it("keeps a message with a colon, quotes or a line break on one frontmatter line", () => {
    const raw = renderCommitNote(standOf({ name: "Vor dem \"Umbau\": Teil 1\nund 2", author: "Anna: Lektorat" }), "Bericht.md", null);
    const fm = parseFrontmatter(raw).data;
    expect(fm[COMMIT_KEYS.message]).toBe("Vor dem \"Umbau\": Teil 1 und 2");
    expect(fm[COMMIT_KEYS.author]).toBe("Anna: Lektorat");
  });

  it("falls back to the stand id when the stand has no name", () => {
    const { write } = addStand([], "x\n", { id: "r1-marked-b2", docId: "d1", time: "2026-11-14T10:00:00.000Z", author: "J", anchor: false });
    const s = write[0];
    if (!s) throw new Error("no stand");
    expect(parseFrontmatter(renderCommitNote(s, "N.md", null)).data[COMMIT_KEYS.message]).toBe("r1-marked-b2");
  });

  it("writes a plain path instead of a link that would point somewhere else", () => {
    const fm = parseFrontmatter(renderCommitNote(standOf(), "Notizen/Plan [alt].md", null)).data;
    expect(fm[COMMIT_KEYS.notes]).toEqual(["Notizen/Plan [alt].md"]);
  });

  it("has a short human hint after the frontmatter and nothing that Obsidian would parse as a link, tag or task", () => {
    const raw = renderCommitNote(standOf(), "Bericht.md", null);
    const body = raw.slice(raw.indexOf("\n---\n", 3) + 5);
    expect(body).toMatch(/Diachronic/);
    expect(body).not.toMatch(/\[\[|#|- \[ \]|%%/);
  });
});

describe("commit folder and path", () => {
  it("defaults to a subfolder of the stand folder whose name no document id can have", () => {
    expect(commitFolderOf("Diachronic", "")).toBe(COMMIT_SUBFOLDER);
    expect(commitFolderOf("Diachronic", "   ")).toBe(COMMIT_SUBFOLDER);
    expect(commitFolderOf("Archiv/Diachronic", "")).toBe(`Archiv/${COMMIT_SUBFOLDER}`);
    // Nie im Stände-Ordner: ein Ausschluss des Stände-Ordners nähme die Notizen sonst aus Bases heraus (gemessen, Obsidian 1.15.1).
    for (const s of ["Diachronic", "Archiv/Diachronic", "A/B/C", ""]) expect(`${commitFolderOf(s, "")}/`.startsWith(`${s}/`) && s !== "").toBe(false);
    expect(COMMIT_SUBFOLDER).toMatch(/\s/);
  });
  it("takes a chosen folder as it is, trimmed", () => {
    expect(commitFolderOf("Diachronic", " Protokoll ")).toBe("Protokoll");
  });
  it("names the note after the stand id", () => {
    expect(commitNotePath("Diachronic/Stand notes", "r2-incoming-a1")).toBe("Diachronic/Stand notes/r2-incoming-a1.md");
  });
});
