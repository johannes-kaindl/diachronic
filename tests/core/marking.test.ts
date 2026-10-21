import { describe, expect, it } from "vitest";
import { markRound, startDocument } from "../../src/core/marking";
import { joinDoc, splitDoc } from "../../src/core/meta-zone";
import { readDocMeta } from "../../src/core/doc-meta";
import { resolveAll } from "../../src/vendor/kit/critic-markup";

const seq = (): (() => string) => { let n = 0; return () => `e${++n}`; };
const HEAD = "---\ndiachronic-id: d1\ndiachronic-round: 1\n---\n";
const time = "2026-10-18T16:00:00Z";

describe("markRound", () => {
  it("refuses with nothing-changed when the body equals the base", () => {
    const body = "Wir möchten Ihnen gerne mitteilen.\n";
    const r = markRound({ text: HEAD + body, baseBody: body, author: "Johannes", time, round: 1, newId: seq() });
    expect(r).toEqual({ ok: false, reason: "nothing-changed", at: 0 });
  });

  it("marks a substitution, writes the zone and keeps the head byte-identical", () => {
    const r = markRound({ text: HEAD + "a x c\n", baseBody: "a b c\n", author: "Johannes", time, round: 1, newId: seq() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text.startsWith(HEAD + "a {~~b~>x~~} c\n")).toBe(true);
    expect(r.added).toHaveLength(1);
    expect(r.added[0]).toMatchObject({ id: "e1", kind: "substitution", author: "Johannes", time, round: 1, state: "open" });
    expect(r.added[0]?.quote.exact).toBe("{~~b~>x~~}");
    const back = splitDoc(r.text);
    expect(back.ok && back.parts.entries).toEqual(r.added);
  });

  it("adds one entry per new mark, in text order, with kinds", () => {
    const r = markRound({ text: HEAD + "eins zwo drei vier neu\n", baseBody: "eins zwei drei vier\n", author: "J", time, round: 2, newId: seq() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.added.map((e) => e.kind)).toEqual(["substitution", "insertion"]);
    expect(r.added.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(r.added.every((e) => e.round === 2)).toBe(true);
  });

  it("round trip: accepting gives the current body, rejecting the base body", () => {
    const base = "Wir möchten Ihnen gerne mitteilen, dass das Treffen stattfindet.\n";
    const current = "Wir möchten Sie informieren, dass das Treffen am Montag stattfindet.\n";
    const r = markRound({ text: HEAD + current, baseBody: base, author: "J", time, round: 1, newId: seq() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const parts = splitDoc(r.text);
    expect(parts.ok && resolveAll(parts.parts.body, "accept")).toBe(current);
    expect(parts.ok && resolveAll(parts.parts.body, "reject")).toBe(base);
  });

  it("keeps earlier entries and their marks untouched", () => {
    const first = markRound({ text: HEAD + "a x c\n", baseBody: "a b c\n", author: "Anna", time, round: 1, newId: seq() });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const base2 = splitDoc(first.text);
    if (!base2.ok) throw new Error("setup");
    const edited = first.text.replace("c\n{", "c da\n{").replace("a {~~b~>x~~} c\n", "a {~~b~>x~~} c da\n");
    const r = markRound({ text: edited, baseBody: base2.parts.body, author: "Berta", time, round: 2, newId: seq() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = splitDoc(r.text);
    expect(s.ok && s.parts.body).toContain("{~~b~>x~~}");
    expect(s.ok && s.parts.entries.map((e) => e.author)).toEqual(["Anna", "Berta"]);
  });

  it("writes nothing when the zone is broken", () => {
    const text = joinDoc({ head: HEAD, body: "a x c\n", entries: [{ id: "e0", kind: "insertion", author: "A", time, round: 1, state: "open", quote: { exact: "x" } }], tail: "\n" }).replace("diachronic:end %%", "");
    expect(markRound({ text, baseBody: "a b c\n", author: "J", time, round: 1, newId: seq() })).toEqual({ ok: false, reason: "zone-broken", at: 0 });
  });

  it("reports an unreadable zone", () => {
    const text = HEAD + "a x c\n\n%% diachronic:begin\nkein json\ndiachronic:end %%\n";
    expect(markRound({ text, baseBody: "a b c\n", author: "J", time, round: 1, newId: seq() })).toEqual({ ok: false, reason: "zone-unreadable", at: 0 });
  });

  it("passes a refusal through with its offset (code block)", () => {
    const base = "Text\n\n```js\nconst a = 1;\n```\n";
    const current = "Text\n\n```js\nconst a = 2;\n```\n";
    const r = markRound({ text: HEAD + current, baseBody: base, author: "J", time, round: 1, newId: seq() });
    expect(r).toMatchObject({ ok: false, reason: "code-block" });
    expect(r.ok === false && r.at).toBeGreaterThan(0);
  });

  it("refuses a change inside an existing mark instead of merging it", () => {
    const base = "a {++neu++} c\n";
    const r = markRound({ text: HEAD + "a {++neuer++} c\n", baseBody: base, author: "J", time, round: 1, newId: seq() });
    expect(r).toMatchObject({ ok: false, reason: "inside-existing-mark" });
  });

  it("does not touch the frontmatter even when the base text had a different one", () => {
    const r = markRound({ text: "---\ndiachronic-id: d1\nstatus: x\n---\na x c\n", baseBody: "a b c\n", author: "J", time, round: 1, newId: seq() });
    expect(r.ok && r.text.startsWith("---\ndiachronic-id: d1\nstatus: x\n---\n")).toBe(true);
  });
});

describe("startDocument", () => {
  it("writes round 1, status in-review and the author as participant", () => {
    const r = startDocument("---\ntitle: Brief\n---\nText\n", { id: "d1", version: null, participants: [], author: "Johannes" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(readDocMeta(r.content)).toEqual({ id: "d1", version: null, round: 1, status: "in-review", participants: ["Johannes"] });
    expect(r.content).toContain("title: Brief\n");
  });

  it("creates the block for a note without frontmatter and adds the author once", () => {
    const r = startDocument("Text\n", { id: "d1", version: null, participants: ["Johannes"], author: "Johannes" });
    expect(r.ok && readDocMeta(r.content)?.participants).toEqual(["Johannes"]);
    expect(r.ok && r.content.endsWith("---\nText\n")).toBe(true);
  });
});
