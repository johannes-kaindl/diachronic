import { describe, expect, it } from "vitest";
import { readDocMeta, writeDocMeta } from "../../src/core/doc-meta";
import type { DocMeta } from "../../src/core/types";

const full = "---\ndiachronic-id: d1\ndiachronic-version: v1\ndiachronic-round: 3\ndiachronic-status: in-review\ndiachronic-participants: [Johannes, Berger]\n---\nText\n";

describe("readDocMeta", () => {
  it("reads all five fields, round as a number", () => {
    expect(readDocMeta(full)).toEqual({ id: "d1", version: "v1", round: 3, status: "in-review", participants: ["Johannes", "Berger"] });
  });

  it("defaults a missing list to [] and a missing version to null", () => {
    const m = readDocMeta("---\ndiachronic-id: d1\ndiachronic-round: 1\ndiachronic-status: draft\n---\nText\n");
    expect(m).toEqual({ id: "d1", version: null, round: 1, status: "draft", participants: [] });
  });

  it("returns null without diachronic-id", () => {
    expect(readDocMeta("---\nstatus: entwurf\n---\nText\n")).toBeNull();
    expect(readDocMeta("Text ohne Frontmatter\n")).toBeNull();
  });

  it("falls back for an unknown status and a broken round", () => {
    const m = readDocMeta("---\ndiachronic-id: d1\ndiachronic-round: viele\ndiachronic-status: fertig\n---\n");
    expect(m).toMatchObject({ round: 1, status: "draft" });
  });
});

describe("writeDocMeta", () => {
  const meta: DocMeta = { id: "d1", version: null, round: 1, status: "in-review", participants: ["Johannes"] };

  it("creates the keys in the order of FM_KEYS and leaves foreign fields byte-identical", () => {
    const text = "---\nstatus: entwurf\ntitle: Brief\n---\nText\n";
    const r = writeDocMeta(text, meta);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.content).toBe("---\nstatus: entwurf\ntitle: Brief\ndiachronic-id: d1\ndiachronic-round: 1\ndiachronic-status: in-review\ndiachronic-participants: [Johannes]\n---\nText\n");
  });

  it("replaces own keys in place and keeps the user's status next to diachronic-status", () => {
    const r = writeDocMeta(full, { id: "d1", version: "v2", round: 4, status: "released", participants: ["Johannes"] });
    expect(r.ok && r.content).toBe("---\ndiachronic-id: d1\ndiachronic-version: v2\ndiachronic-round: 4\ndiachronic-status: released\ndiachronic-participants: [Johannes]\n---\nText\n");
  });

  it("does not give a note without frontmatter a block unless asked", () => {
    const plain = "Text\n";
    expect(writeDocMeta(plain, meta)).toEqual({ ok: true, changed: false, content: plain });
    const r = writeDocMeta(plain, meta, { create: true });
    expect(r.ok && r.content.startsWith("---\ndiachronic-id: d1\n")).toBe(true);
    expect(r.ok && r.content.endsWith("---\nText\n")).toBe(true);
  });

  it("keeps CRLF line ends when appending", () => {
    const r = writeDocMeta("---\r\ntitle: A\r\n---\r\nText\r\n", meta);
    expect(r.ok && r.content.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(r.ok && r.content).toContain("diachronic-id: d1\r\n");
  });

  it("round-trips through readDocMeta", () => {
    const r = writeDocMeta("---\ntitle: A\n---\nText\n", { ...meta, version: "v1", round: 2 });
    expect(r.ok && readDocMeta(r.content)).toEqual({ ...meta, version: "v1", round: 2 });
  });
});
