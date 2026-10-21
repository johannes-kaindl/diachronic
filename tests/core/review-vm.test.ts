import { describe, expect, it } from "vitest";
import { readReview } from "../../src/core/review";
import { toReviewItems, type ReviewItemsOptions } from "../../src/core/review-vm";
import type { ReviewChange, ReviewComment } from "../../src/vendor/kit-obsidian/review-list";
import { doc, entryFor } from "./review-helpers";

const opts = (over: Partial<ReviewItemsOptions> = {}): ReviewItemsOptions => ({
  radius: 8, when: (iso) => `@${iso.slice(0, 10)}`, colorByAuthor: false, slotOf: () => 2, unknownAuthor: "unknown", ...over,
});

function items(text: string, o: Partial<ReviewItemsOptions> = {}) {
  const m = readReview(text);
  if ("error" in m) throw new Error(m.error);
  return toReviewItems(m, text, opts(o));
}

describe("toReviewItems", () => {
  const body = "Erster Satz mit {~~alt~>neu~~} und mehr Text danach. Zweiter Satz {++noch ++}hier.\n";
  const entries = () => [entryFor(body, "{~~alt~>neu~~}", { id: "e1" }), entryFor(body, "{++noch ++}", { id: "e2", author: "Berta" })];

  it("orders cards by text position and fills the card meta", () => {
    const list = items(doc(body, entries()));
    expect(list.map((i) => i.id)).toEqual(["e1", "e2"]);
    const first = list[0] as ReviewChange;
    expect(first).toMatchObject({ kind: "change", author: "Johannes", when: "@2026-10-18", changeKind: "substitution" });
    expect(list[1]).toMatchObject({ author: "Berta", changeKind: "insertion" });
  });

  it("clips the context to the radius and shows neighbours as read text, not as marks", () => {
    const list = items(doc(body, entries()), { radius: 8 });
    const second = list[1] as ReviewChange;
    const texts = second.segments.map((s) => `${s.kind}:${s.text}`);
    expect(texts[0]).toMatch(/^same:…/);
    expect(second.segments.map((s) => s.text).join("")).not.toContain("{");
    expect(texts).toContain("ins:noch ");
    const wide = (items(doc(body, entries()), { radius: 200 })[1] as ReviewChange).segments[0]?.text ?? "";
    expect(wide).toContain("neu");   // the first mark, read as accepted
    expect(wide).not.toContain("alt");
  });

  it("shows a substitution as a word diff", () => {
    const first = items(doc(body, entries()))[0] as ReviewChange;
    const kinds = first.segments.filter((s) => s.kind !== "same").map((s) => `${s.kind}:${s.text}`);
    expect(kinds).toEqual(["del:alt", "ins:neu"]);
  });

  it("sets the author slot only with colorByAuthor", () => {
    expect((items(doc(body, entries()))[0] as ReviewChange).authorSlot).toBeUndefined();
    const coloured = items(doc(body, entries()), { colorByAuthor: true })[0] as ReviewChange;
    expect(coloured.authorSlot).toBe(2);
    expect(coloured.segments.some((s) => s.author === 2)).toBe(true);
  });

  it("marks a change whose mark is gone as a stale card, after the live ones", () => {
    const gone = { ...entryFor(body, "{++noch ++}", { id: "e9" }), quote: { exact: "{--weg--}" } };
    const list = items(doc(body, [...entries(), gone]));
    expect(list.map((i) => i.id)).toEqual(["e1", "e2", "e9"]);
    expect((list[2] as ReviewChange).stale).toBe(true);
    expect((list[0] as ReviewChange).stale).toBeUndefined();
  });

  it("builds comment cards with thread, anchor text and collapsed state", () => {
    const b = "Ein {==Abschnitt==}{>>Jo: warum<<}{>>Berta: darum<<} und {~~a~>b~~}{>>Jo: auch<<} hier\n";
    const es = [
      entryFor(b, "{>>Jo: warum<<}", { id: "c1", thread: "c1", author: "Jo", state: "resolved" }),
      entryFor(b, "{>>Berta: darum<<}", { id: "c2", thread: "c1", author: "Berta", state: "resolved" }),
      entryFor(b, "{~~a~>b~~}", { id: "e1" }),
      entryFor(b, "{>>Jo: auch<<}", { id: "c3", thread: "c3", author: "Jo" }),
    ];
    const list = items(doc(b, es));
    expect(list.map((i) => `${i.kind}:${i.id}`)).toEqual(["comment:c1", "change:e1", "comment:c3"]);
    const c1 = list[0] as ReviewComment;
    expect(c1).toMatchObject({ anchorText: "Abschnitt", resolved: true });
    expect(c1.thread.map((t) => [t.author, t.text])).toEqual([["Jo", "warum"], ["Berta", "darum"]]);
    expect((list[2] as ReviewComment)).toMatchObject({ anchorText: "a → b", resolved: false });
  });

  it("names foreign marks and comments without entry", () => {
    const b = "a {++x++} {>>Anna: Hinweis<<} {>>ohne Namen<<}\n";
    const list = items(doc(b, []));
    expect((list[0] as ReviewChange)).toMatchObject({ author: "unknown", when: "" });
    const comments = list.filter((i): i is ReviewComment => i.kind === "comment");
    expect(comments.flatMap((c) => c.thread.map((t) => [t.author, t.text]))).toEqual([["Anna", "Hinweis"], ["unknown", "ohne Namen"]]);
  });

  it("shows an orphaned comment without an anchor", () => {
    const b = "nur Text\n";
    const e = { ...entryFor("{>>Jo: weg<<}", "{>>Jo: weg<<}", { id: "c1", thread: "c1", author: "Jo" }) };
    const list = items(doc(b, [e]));
    expect(list).toEqual([{ kind: "comment", id: "c1", anchorText: null, thread: [{ author: "Jo", when: "@2026-10-18", text: "weg" }], resolved: false }]);
  });

  it("returns nothing for a broken note", () => {
    const m = readReview(doc(body, entries()));
    if ("error" in m) throw new Error("setup");
    expect(toReviewItems(m, doc(body, entries()).replace("diachronic:end %%", ""), opts())).toEqual([]);
  });
});
