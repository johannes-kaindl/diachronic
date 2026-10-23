import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readStandFile, renderStandFile, STAND_FENCE } from "../../src/core/stand-file";
import { sha256HexUtf8 } from "../../src/vendor/kit/sha256";
import { addStand, type StoredStand } from "../../src/vendor/kit/version-chain";

const NASTY = "Brief an [[Anna]] #wichtig\n- [ ] Aufgabe\n%% Kommentar %%\n```\nCode\n```\n---\nid: 1\n---\n";

function standOf(text: string, name = "Runde 1 – Eingang"): StoredStand {
  const { write } = addStand([], text, { id: "r1-incoming-a1", docId: "d1", time: "2026-10-23T10:00:00.000Z", author: "Johannes", name, anchor: true });
  const s = write[0];
  if (!s) throw new Error("no stand");
  return s;
}

describe("stand file", () => {
  it("round-trips a stand without any problem", () => {
    const stand = standOf(NASTY);
    const read = readStandFile(renderStandFile(stand));
    expect(read.problems).toEqual([]);
    expect(read.stand).toEqual(stand);
  });

  it("is harmless as Markdown: no frontmatter, and the note text sits on one line inside a fence", () => {
    const file = renderStandFile(standOf(NASTY));
    expect(file.startsWith("---")).toBe(false);
    const lines = file.split("\n");
    const open = lines.indexOf(`\`\`\`${STAND_FENCE}`);
    const close = lines.indexOf("```", open + 1);
    expect(open).toBeGreaterThanOrEqual(0);
    expect(close).toBe(open + 3);
    // Nothing of the note text may stand at the start of a line outside the fence: no task, no heading, no frontmatter delimiter.
    const outside = [...lines.slice(0, open), ...lines.slice(close + 1)].join("\n");
    expect(outside).not.toMatch(/\[\[|#wichtig|- \[ \]|%%/);
    // A closing fence inside the text cannot end the block: the text is escaped onto the single JSON line.
    expect(lines.filter((l) => l.startsWith("```"))).toHaveLength(2);
  });

  it("puts a checksum of the payload line in the file", () => {
    const file = renderStandFile(standOf("Hallo\n"));
    const [sum, json] = file.split("\n").slice(file.split("\n").indexOf(`\`\`\`${STAND_FENCE}`) + 1);
    expect(sum).toBe(`sha256 ${sha256HexUtf8(json ?? "")}`);
  });

  it("tolerates Windows line endings and trailing blanks written by another editor", () => {
    const file = renderStandFile(standOf("Hallo\n"));
    expect(readStandFile(file.replace(/\n/g, "\r\n")).problems).toEqual([]);
    expect(readStandFile(`${file}\n\n`).problems).toEqual([]);
  });

  it("reports a changed payload as a checksum problem and still hands the stand over", () => {
    const stand = standOf("Hallo Welt\n");
    const file = renderStandFile(stand).replace("Runde 1 – Eingang", "Runde 9 – Umbenannt");
    const read = readStandFile(file);
    expect(read.problems).toContain("checksum");
    expect(read.stand?.meta.name).toBe("Runde 9 – Umbenannt");
  });

  it("reports foreign text around an intact payload", () => {
    const file = renderStandFile(standOf("Hallo\n"));
    const withFrontmatter = `---\ncreated: 2026-10-23\n---\n${file}`;
    const read = readStandFile(withFrontmatter);
    expect(read.problems).toEqual(["foreign"]);
    expect(read.stand).not.toBeNull();
    expect(readStandFile(`${file}\nvon Hand ergänzt\n`).problems).toEqual(["foreign"]);
  });

  it("reports a missing or malformed checksum line", () => {
    const file = renderStandFile(standOf("Hallo\n"));
    const lines = file.split("\n");
    const at = lines.indexOf(`\`\`\`${STAND_FENCE}`) + 1;
    const noSum = [...lines.slice(0, at), "sha256 xyz", ...lines.slice(at + 1)].join("\n");
    expect(readStandFile(noSum).problems).toContain("checksum");
  });

  it("calls a file without the block, or with an unreadable payload, unreadable", () => {
    expect(readStandFile("")).toEqual({ stand: null, problems: ["unreadable"] });
    expect(readStandFile("Nur ein Text, kein Stand.\n")).toEqual({ stand: null, problems: ["unreadable"] });
    const file = renderStandFile(standOf("Hallo\n"));
    const broken = file.replace('"form":"full"', '"form":"kaputt"');
    expect(readStandFile(broken)).toEqual({ stand: null, problems: ["unreadable"] });
  });

  it("keeps a delta stand intact", () => {
    const a = addStand([], "eins zwei drei\n", { id: "r1-manual-a", docId: "d1", time: "2026-10-23T10:00:00.000Z", author: "J" });
    const b = addStand(a.chain, "eins zwo drei\n", { id: "r1-manual-b", docId: "d1", time: "2026-10-23T10:01:00.000Z", author: "J" });
    const delta = b.write[1];
    expect(delta?.form).toBe("delta");
    if (!delta) return;
    const read = readStandFile(renderStandFile(delta));
    expect(read.problems).toEqual([]);
    expect(read.stand).toEqual(delta);
  });
});

describe("tracked fixture", () => {
  it("holds stand files the reader accepts without a finding", () => {
    const dir = join(__dirname, "../../fixtures/vault/notes/Diachronic/beispiel");
    const names = readdirSync(dir);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) {
      expect(n.endsWith(".md")).toBe(true);
      expect(readStandFile(readFileSync(join(dir, n), "utf8"))).toMatchObject({ problems: [], stand: { meta: { docId: "beispiel" } } });
    }
  });
});
