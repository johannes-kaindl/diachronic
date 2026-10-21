import { describe, expect, it } from "vitest";
import { classifyIncoming, planTakeOver, prepareSend, unmarkedChanges } from "../../src/core/exchange";
import { readDocMeta } from "../../src/core/doc-meta";
import type { DocMeta } from "../../src/core/types";

const note = (body: string, round: number, id = "d1"): string => `---\ndiachronic-id: ${id}\ndiachronic-round: ${round}\ndiachronic-status: in-review\n---\n${body}`;
const meta = (over: Partial<DocMeta> = {}): DocMeta => ({ id: "d1", version: null, round: 2, status: "in-review", participants: ["Johannes"], ...over });

describe("classifyIncoming", () => {
  it("tells known, unknown and missing ids apart", () => {
    const known = (id: string): boolean => id === "d1";
    expect(classifyIncoming(meta(), known)).toBe("known");
    expect(classifyIncoming(meta({ id: "x9" }), known)).toBe("unknown-id");
    expect(classifyIncoming(null, known)).toBe("no-id");
  });
});

describe("planTakeOver", () => {
  const sent = note("Wir {++gerne ++}schreiben.\n", 2);
  const back = note("Wir {++gerne ++}schreiben{>>Anna: wann?<<}.\n", 3);

  it("takes over when our note has not changed since the last outgoing", () => {
    const r = planTakeOver(sent, sent, back);
    expect(r).toEqual({ ok: true, text: back, round: 3 });
  });

  it("refuses to take over when both sides changed", () => {
    const ours = sent.replace("schreiben", "schreiben wir");
    const r = planTakeOver(ours, sent, back);
    expect(r).toEqual({ ok: false, reason: "both-changed", ours, theirs: back });
  });

  it("keeps our note when the returned file is just what we sent", () => {
    const ours = sent.replace("schreiben", "schreiben wir");
    expect(planTakeOver(ours, sent, sent)).toEqual({ ok: true, text: ours, round: 2 });
  });

  it("treats a missing outgoing as 'we may have changed it'", () => {
    expect(planTakeOver(sent, null, back)).toMatchObject({ ok: false, reason: "both-changed" });
    expect(planTakeOver(back, null, back)).toMatchObject({ ok: true });
  });

  it("takes the round from the file, or counts up when the file carries none", () => {
    expect(planTakeOver(sent, sent, back)).toMatchObject({ round: 3 });
    expect(planTakeOver(sent, sent, "Text ohne Felder\n")).toMatchObject({ ok: true, round: 3 });
  });
});

describe("unmarkedChanges", () => {
  it("is false when only marks differ", () => {
    expect(unmarkedChanges("Wir schreiben {++gerne ++}Ihnen.\n", "Wir schreiben Ihnen.\n")).toBe(false);
    expect(unmarkedChanges("Wir schreiben Ihnen.\n", "Wir schreiben Ihnen.\n")).toBe(false);
  });

  it("is true for a free change", () => {
    expect(unmarkedChanges("Wir mailen Ihnen.\n", "Wir schreiben Ihnen.\n")).toBe(true);
    expect(unmarkedChanges("Wir mailen {++gerne ++}Ihnen.\n", "Wir schreiben Ihnen.\n")).toBe(true);
  });

  it("does not count a comment or a highlight as a change of the text", () => {
    expect(unmarkedChanges("Wir schreiben{>>Anna: wann?<<} Ihnen.\n", "Wir schreiben Ihnen.\n")).toBe(false);
    expect(unmarkedChanges("Wir {==schreiben==}{>>Anna: wann?<<} Ihnen.\n", "Wir schreiben Ihnen.\n")).toBe(false);
    expect(unmarkedChanges("Wir schreiben{>>Anna: wann?<<} Ihnen sofort.\n", "Wir schreiben Ihnen.\n")).toBe(true);
  });

  it("does not count decisions on marks as free changes", () => {
    const sent = "Wir {~~schreiben~>mailen~~} Ihnen.\n";
    expect(unmarkedChanges("Wir mailen Ihnen.\n", sent)).toBe(false);
    expect(unmarkedChanges("Wir schreiben Ihnen.\n", sent)).toBe(false);
    expect(unmarkedChanges("Wir telefonieren Ihnen.\n", sent)).toBe(true);
  });
});

describe("prepareSend", () => {
  it("counts the round up, adds the name once and writes the frontmatter", () => {
    const text = note("Text\n", 2);
    const r = prepareSend(text, meta(), "Johannes");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.meta).toEqual(meta({ round: 3 }));
    expect(readDocMeta(r.text)?.round).toBe(3);
    const again = prepareSend(r.text, r.meta, "Anna");
    expect(again.ok && again.meta.participants).toEqual(["Johannes", "Anna"]);
    const third = again.ok ? prepareSend(again.text, again.meta, "Anna") : again;
    expect(third.ok && third.meta.participants).toEqual(["Johannes", "Anna"]);
  });

  it("reports a frontmatter that cannot take the fields instead of dropping them", () => {
    expect(prepareSend("---\ndiachronic-id: d1\nnie geschlossen\n", meta(), "J")).toMatchObject({ ok: false });
  });
});
