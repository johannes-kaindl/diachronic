import { describe, expect, it } from "vitest";
import { addComment, decide, decideAll, readReview, reply, setResolved } from "../../src/core/review";
import { HEAD, TIME, doc, entryFor, partsOf, seq } from "./review-helpers";

const SUB = "{~~a~>b~~}";

describe("readReview", () => {
  it("pairs marks with entries by their quote and reports orphans", () => {
    const body = `x ${SUB} y {++neu++} z\n`;
    const e1 = entryFor(body, SUB, { id: "e1" });
    const gone = { ...entryFor(body, "{++neu++}", { id: "e9" }), quote: { exact: "{++weg++}" } };
    const m = readReview(doc(body, [e1, gone]));
    if ("error" in m) throw new Error(m.error);
    expect(m.marks.map((x) => x.entryId)).toEqual(["e1", "foreign:" + body.indexOf("{++neu++}")]);
    expect(m.marks[1]?.entry).toBeNull();
    expect(m.orphans.map((o) => o.id)).toEqual(["e9"]);
  });

  it("does not list decided entries as orphans", () => {
    const body = "nur text\n";
    const old = { ...entryFor("{++x++}", "{++x++}", { id: "e1" }), state: "accepted" as const };
    const m = readReview(doc(body, [old]));
    expect("error" in m ? [] : m.orphans).toEqual([]);
  });

  it("reports a broken or unreadable zone", () => {
    const broken = doc("a {++b++}\n", [entryFor("a {++b++}\n", "{++b++}", { id: "e1" })]).replace("diachronic:end %%", "");
    expect(readReview(broken)).toEqual({ error: "zone-broken" });
    expect(readReview(HEAD + "t\n\n%% diachronic:begin\nnope\ndiachronic:end %%\n")).toEqual({ error: "zone-unreadable" });
  });

  it("groups comments into threads with their anchor and the resolved state", () => {
    const body = "a {==Satz==}{>>Jo: warum<<}{>>Be: darum<<} b\n";
    const c1 = entryFor(body, "{>>Jo: warum<<}", { id: "c1", thread: "c1" });
    const c2 = entryFor(body, "{>>Be: darum<<}", { id: "c2", thread: "c1", author: "Berta" });
    const m = readReview(doc(body, [c1, c2]));
    if ("error" in m) throw new Error(m.error);
    expect(m.threads).toHaveLength(1);
    expect(m.threads[0]).toMatchObject({ id: "c1", resolved: false });
    expect(m.threads[0]?.anchor?.text).toBe("Satz");
    expect(m.threads[0]?.comments.map((c) => c.entry?.id)).toEqual(["c1", "c2"]);
  });

  it("pairs two identical marks with their entries in order", () => {
    const body = "{++und++} dann {++und++}\n";
    const a = entryFor(body, "{++und++}", { id: "a" }, 0);
    const b = entryFor(body, "{++und++}", { id: "b" }, 1);
    const m = readReview(doc(body, [a, b]));
    if ("error" in m) throw new Error(m.error);
    expect(m.marks.map((x) => x.entryId)).toEqual(["a", "b"]);
  });
});

describe("identical marks", () => {
  it("pairs entries in order when quote and context cannot tell two identical marks apart", () => {
    const pad = (c: string): string => c.repeat(40);
    const block = `${pad("p")}{++x++}${pad("s")}\n`;
    const body = block + block;
    const a = entryFor(body, "{++x++}", { id: "a" }, 0);
    const b = { ...entryFor(body, "{++x++}", { id: "b" }, 1), quote: a.quote };
    const m = readReview(doc(body, [a, b]));
    if ("error" in m) throw new Error(m.error);
    expect(m.marks.map((x) => x.entryId)).toEqual(["a", "b"]);
    expect(m.orphans).toEqual([]);
  });
});

describe("decide", () => {
  it("accepts a substitution and records the decision", () => {
    const body = `a ${SUB} c\n`;
    const text = doc(body, [entryFor(body, SUB, { id: "e1" })]);
    const r = decide(text, "e1", SUB, "accept");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = partsOf(r.text);
    expect(p.body).toBe("a b c\n");
    expect(p.entries).toEqual([expect.objectContaining({ id: "e1", state: "accepted" })]);
    expect(p.head).toBe(HEAD);
  });

  it("rejects an insertion without leaving a double space", () => {
    const body = "a {++b ++}c\n";
    const r = decide(doc(body, [entryFor(body, "{++b ++}", { id: "e1" })]), "e1", "{++b ++}", "reject");
    expect(r.ok && partsOf(r.text).body).toBe("a c\n");
    expect(r.ok && partsOf(r.text).entries[0]?.state).toBe("rejected");
  });

  it("refuses a decision when the mark text changed", () => {
    const body = `a ${SUB} c\n`;
    const text = doc(body, [entryFor(body, SUB, { id: "e1" })]);
    const edited = text.replace("{~~a~>b~~}", "{~~a~>bc~~}");
    expect(decide(edited, "e1", SUB, "accept")).toEqual({ ok: false, reason: "stale" });
  });

  it("refuses when the expected text differs from the mark the entry finds", () => {
    const body = `a ${SUB} c\n`;
    const text = doc(body, [entryFor(body, SUB, { id: "e1" })]);
    expect(decide(text, "e1", "{~~a~>x~~}", "accept")).toEqual({ ok: false, reason: "stale" });
  });

  it("returns not-found for an unknown entry", () => {
    const body = `a ${SUB} c\n`;
    expect(decide(doc(body, []), "zzz", SUB, "accept")).toEqual({ ok: false, reason: "not-found" });
  });

  it("finds a mark after the frontmatter grew", () => {
    const body = `a ${SUB} c\n`;
    const text = doc(body, [entryFor(body, SUB, { id: "e1" })]);
    const grown = text.replace("diachronic-round: 1\n", "diachronic-round: 1\ntitle: Brief\ntags: [a, b]\nstatus: x\n");
    const r = decide(grown, "e1", SUB, "accept");
    expect(r.ok && partsOf(r.text).body).toBe("a b c\n");
    expect(r.ok && r.text.startsWith("---\ndiachronic-id: d1\ndiachronic-round: 1\ntitle: Brief")).toBe(true);
  });

  it("decides a foreign mark without an entry", () => {
    const body = "a {--weg--} c\n";
    const text = doc(body, []);
    const id = "foreign:" + body.indexOf("{--weg--}");
    const r = decide(text, id, "{--weg--}", "accept");
    expect(r.ok && partsOf(r.text).body).toBe("a  c\n");
    expect(decide(text, id, "{--ander--}", "accept")).toEqual({ ok: false, reason: "stale" });
  });

  it("keeps a comment attached to an accepted change", () => {
    const body = "a {~~a~>b~~}{>>Jo: weil<<} c\n";
    const text = doc(body, [entryFor(body, SUB, { id: "e1" }), entryFor(body, "{>>Jo: weil<<}", { id: "c1", thread: "c1" })]);
    const r = decide(text, "e1", SUB, "accept");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = partsOf(r.text);
    expect(p.body).toBe("a {==b==}{>>Jo: weil<<} c\n");
    // der Kommentar behält seinen Eintrag und ist weiter gefunden
    const m = readReview(r.text);
    expect("error" in m ? 0 : m.threads[0]?.comments[0]?.entry?.id).toBe("c1");
  });

  it("leaves the comment without an anchor when no text remains", () => {
    const body = "a {++x++}{>>Jo: nein<<} c\n";
    const text = doc(body, [entryFor(body, "{++x++}", { id: "e1" }), entryFor(body, "{>>Jo: nein<<}", { id: "c1", thread: "c1" })]);
    const r = decide(text, "e1", "{++x++}", "reject");
    expect(r.ok && partsOf(r.text).body).toBe("a {>>Jo: nein<<} c\n");
  });

  it("refreshes the quotes of the other marks after an edit", () => {
    const body = "{++und++} dann {++und++} schluss\n";
    const a = entryFor(body, "{++und++}", { id: "a" }, 0);
    const b = entryFor(body, "{++und++}", { id: "b" }, 1);
    const r = decide(doc(body, [a, b]), "a", "{++und++}", "reject");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const m = readReview(r.text);
    expect("error" in m ? [] : m.marks.map((x) => x.entryId)).toEqual(["b"]);
    // the entry's quote is recomputed from the new text, not left at the old context
    const b2 = partsOf(r.text).entries.find((e) => e.id === "b");
    expect(b2?.quote).toEqual({ exact: "{++und++}", prefix: " dann ", suffix: " schluss\n" });
  });
});

describe("decideAll", () => {
  const body = "x {~~a~>b~~} y {++c ++}z {--d--}{>>Jo: frage<<}\n";
  const entries = () => [
    entryFor(body, "{~~a~>b~~}", { id: "e1" }), entryFor(body, "{++c ++}", { id: "e2" }), entryFor(body, "{--d--}", { id: "e3" }),
    entryFor(body, "{>>Jo: frage<<}", { id: "c1", thread: "c1" }),
  ];

  it("accepts every open change but leaves comments", () => {
    const r = decideAll(doc(body, entries()), "accept");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(partsOf(r.text).body).toBe("x b y c z {>>Jo: frage<<}\n");
  });

  it("writes one entry state per mark", () => {
    const r = decideAll(doc(body, entries()), "reject");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = partsOf(r.text);
    expect(p.body).toBe("x a y z {==d==}{>>Jo: frage<<}\n");
    expect(Object.fromEntries(p.entries.map((e) => [e.id, e.state]))).toEqual({ e1: "rejected", e2: "rejected", e3: "rejected", c1: "open" });
  });

  it("is a no-op without open changes", () => {
    const text = doc("nur text\n");
    expect(decideAll(text, "accept")).toEqual({ ok: true, text });
  });

  it("refuses on a broken zone", () => {
    const text = doc(body, entries()).replace("diachronic:end %%", "");
    expect(decideAll(text, "accept")).toEqual({ ok: false, reason: "zone-broken" });
  });
});

describe("comments", () => {
  const input = (over: Record<string, unknown> = {}) => ({ author: "Johannes", time: TIME, round: 1, body: "Bitte prüfen", newId: seq("c"), ...over });

  it("adds a section comment: highlight plus comment plus entry", () => {
    const text = doc("Das ist ein Satz.\n");
    const start = text.indexOf("ein Satz");
    const r = addComment(text, { start, end: start + 8 }, input());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = partsOf(r.text);
    expect(p.body).toBe("Das ist {==ein Satz==}{>>Johannes: Bitte prüfen<<}.\n");
    expect(p.entries).toEqual([expect.objectContaining({ id: "c1", kind: "comment", thread: "c1", state: "open", author: "Johannes" })]);
  });

  it("adds a comment to a change card without writing into the mark", () => {
    const body = `a ${SUB} c\n`;
    const text = doc(body, [entryFor(body, SUB, { id: "e1" })]);
    const r = addComment(text, { entryId: "e1" }, input());
    expect(r.ok && partsOf(r.text).body).toBe(`a ${SUB}{>>Johannes: Bitte prüfen<<} c\n`);
  });

  it("answers in the same thread, lückenlos, and reopens a resolved one", () => {
    const body = "a {==X==}{>>Jo: warum<<} b\n";
    const c1 = { ...entryFor(body, "{>>Jo: warum<<}", { id: "c1", thread: "c1" }), state: "resolved" as const };
    const r = reply(doc(body, [c1]), "c1", input({ author: "Berta", body: "darum" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = partsOf(r.text);
    expect(p.body).toBe("a {==X==}{>>Jo: warum<<}{>>Berta: darum<<} b\n");
    expect(p.entries.map((e) => [e.thread, e.state])).toEqual([["c1", "open"], ["c1", "open"]]);
    expect(p.entries[1]).toMatchObject({ kind: "comment", author: "Berta" });
  });

  it("resolves and reopens a thread", () => {
    const body = "a {==X==}{>>Jo: warum<<}{>>Be: darum<<} b\n";
    const entries = [entryFor(body, "{>>Jo: warum<<}", { id: "c1", thread: "c1" }), entryFor(body, "{>>Be: darum<<}", { id: "c2", thread: "c1" })];
    const done = setResolved(doc(body, entries), "c1", true);
    expect(done.ok && partsOf(done.text).entries.map((e) => e.state)).toEqual(["resolved", "resolved"]);
    const again = done.ok ? setResolved(done.text, "c1", false) : done;
    expect(again.ok && partsOf(again.text).entries.map((e) => e.state)).toEqual(["open", "open"]);
    expect(done.ok && partsOf(done.text).body).toBe(body);
  });

  describe("resolves a thread whose comments have no entry (foreign comments)", () => {
    const resolveInput = (newId = seq("n")) => ({ time: "2026-10-25T01:00:00Z", round: 2, newId, unknownAuthor: "unbekannt" });
    const threadsOf = (text: string) => {
      const m = readReview(text);
      if ("error" in m) throw new Error(m.error);
      return m.threads;
    };

    it("creates an entry per bare comment: author from the prefix, time of resolving, thread id stable", () => {
      const body = "a {==X==}{>>Berta: warum<<} b\n";
      const text = doc(body);
      const [t0] = threadsOf(text);
      expect(t0?.resolved).toBe(false);
      const done = setResolved(text, t0?.id ?? "", true, resolveInput());
      expect(done.ok).toBe(true);
      if (!done.ok) return;
      const p = partsOf(done.text);
      expect(p.body).toBe(body);
      expect(p.entries).toHaveLength(1);
      expect(p.entries[0]).toMatchObject({ kind: "comment", author: "Berta", state: "resolved", time: "2026-10-25T01:00:00Z", round: 2 });
      expect(p.entries[0]?.quote.exact).toBe("{>>Berta: warum<<}");
      const [t1] = threadsOf(done.text);
      expect(t1?.resolved).toBe(true);
      // Die Kennung hängt nicht mehr an der Textstelle, sondern am Eintrag: Wieder-Öffnen findet denselben Faden.
      expect(t1?.id.startsWith("foreign:")).toBe(false);
      const again = setResolved(done.text, t1?.id ?? "", false, resolveInput());
      expect(again.ok && partsOf(again.text).entries.map((e) => e.state)).toEqual(["open"]);
      expect(again.ok && threadsOf(again.text)[0]?.id).toBe(t1?.id);
      expect(again.ok && threadsOf(again.text)[0]?.resolved).toBe(false);
    });

    it("a comment without a name prefix is by the unknown author", () => {
      const body = "a {==X==}{>>warum<<} b\n";
      const [t] = threadsOf(doc(body));
      const done = setResolved(doc(body), t?.id ?? "", true, resolveInput());
      expect(done.ok && partsOf(done.text).entries[0]?.author).toBe("unbekannt");
    });

    it("resolves a mixed thread completely: the existing entry changes, only the bare comment gets a new one", () => {
      const body = "a {==X==}{>>Jo: warum<<}{>>Berta: darum<<} b\n";
      const known = entryFor(body, "{>>Jo: warum<<}", { id: "c1", thread: "c1" });
      const text = doc(body, [known]);
      const [t] = threadsOf(text);
      expect(t?.resolved).toBe(false);
      const done = setResolved(text, t?.id ?? "", true, resolveInput());
      expect(done.ok).toBe(true);
      if (!done.ok) return;
      const p = partsOf(done.text);
      expect(p.entries.map((e) => [e.id, e.author, e.state, e.thread])).toEqual([["c1", "Johannes", "resolved", "c1"], ["n1", "Berta", "resolved", "c1"]]);
      expect(threadsOf(done.text)[0]).toMatchObject({ id: "c1", resolved: true });
      const again = setResolved(done.text, "c1", false, resolveInput());
      expect(again.ok && partsOf(again.text).entries.map((e) => e.state)).toEqual(["open", "open"]);
    });

    it("control: a missing thread stays not-found, and so does a bare thread without the input (old call)", () => {
      const body = "a {==X==}{>>Berta: warum<<} b\n";
      const [t] = threadsOf(doc(body));
      expect(setResolved(doc(body), "gibt-es-nicht", true, resolveInput())).toEqual({ ok: false, reason: "not-found" });
      expect(setResolved(doc(body), t?.id ?? "", true)).toEqual({ ok: false, reason: "not-found" });
      // Wieder-Öffnen eines nie erledigten, fremden Fadens legt nichts an.
      expect(setResolved(doc(body), t?.id ?? "", false, resolveInput())).toEqual({ ok: false, reason: "not-found" });
    });
  });

  it("places a comment next to marks it would otherwise nest", () => {
    const body = "Ein {++neues++} Wort hier\n";
    const text = doc(body, [entryFor(body, "{++neues++}", { id: "e1" })]);
    const start = text.indexOf("Ein ");
    const end = text.indexOf("Wort") + 4;
    const r = addComment(text, { start, end }, input());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = partsOf(r.text);
    expect(p.body).toBe("Ein {++neues++}{>>Johannes: Bitte prüfen<<} Wort hier\n");
    expect(p.body).not.toContain("{==");
  });

  it("refuses text that would end the mark early", () => {
    const text = doc("Das ist ein Satz.\n");
    const s = text.indexOf("Das ist");
    expect(addComment(text, { start: s, end: s + 3 }, input({ body: "oh <<} nein" }))).toEqual({ ok: false, reason: "terminator" });
    const t2 = doc("a ==} b\n");
    const s2 = t2.indexOf("a ==}");
    expect(addComment(t2, { start: s2, end: s2 + 5 }, input())).toEqual({ ok: false, reason: "terminator" });
  });

  it("refuses a selection outside the body or inside code", () => {
    const text = doc("Text `code` Ende\n");
    expect(addComment(text, { start: 0, end: 5 }, input())).toEqual({ ok: false, reason: "not-found" });
    const s = text.indexOf("code");
    expect(addComment(text, { start: s, end: s + 4 }, input())).toEqual({ ok: false, reason: "in-code" });
  });
});
