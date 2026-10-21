import { describe, expect, it } from "vitest";
import { prepareRelease } from "../../src/core/release";
import { readDocMeta } from "../../src/core/doc-meta";
import { splitDoc } from "../../src/core/meta-zone";
import type { DocMeta } from "../../src/core/types";
import { doc, entryFor } from "./review-helpers";

const meta = (over: Partial<DocMeta> = {}): DocMeta => ({ id: "d1", version: null, round: 2, status: "in-review", participants: ["Johannes"], ...over });

describe("prepareRelease", () => {
  it("refuses while changes are open and says how many", () => {
    const body = "a {~~b~>c~~} d {++e++}\n";
    const text = doc(body, [entryFor(body, "{~~b~>c~~}", { id: "e1" }), entryFor(body, "{++e++}", { id: "e2" })]);
    expect(prepareRelease(text, meta())).toMatchObject({ ok: false, reason: "open-changes", open: 2 });
  });

  it("counts a foreign change without an entry as open", () => {
    expect(prepareRelease(doc("a {--b--}\n"), meta())).toMatchObject({ ok: false, open: 1 });
  });

  it("strips comments and highlights, bumps the version and sets the status", () => {
    const body = "Ein {==Satz==}{>>Jo: warum<<}{>>Be: darum<<} bleibt. Und {>>Jo: noch was<<}Ende.\n";
    const text = doc(body, [
      entryFor(body, "{>>Jo: warum<<}", { id: "c1", thread: "c1" }),
      entryFor(body, "{>>Be: darum<<}", { id: "c2", thread: "c1" }),
      entryFor(body, "{>>Jo: noch was<<}", { id: "c3", thread: "c3" }),
    ]);
    const r = prepareRelease(text, meta({ version: "v1" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.meta).toEqual(meta({ version: "v2", status: "released" }));
    const parts = splitDoc(r.text);
    expect(parts.ok && parts.parts.body).toBe("Ein Satz bleibt. Und Ende.\n");
    expect(parts.ok && parts.parts.entries).toEqual([]);
    expect(readDocMeta(r.text)).toMatchObject({ version: "v2", status: "released", round: 2 });
  });

  it("starts at v1 for a first release and for a version it cannot count", () => {
    const text = doc("Nur Text\n");
    expect(prepareRelease(text, meta({ version: null }))).toMatchObject({ ok: true, meta: { version: "v1" } });
    expect(prepareRelease(text, meta({ version: "final" }))).toMatchObject({ ok: true, meta: { version: "v1" } });
    expect(prepareRelease(text, meta({ version: "v9" }))).toMatchObject({ ok: true, meta: { version: "v10" } });
  });

  it("keeps the decided entries as history", () => {
    const body = "a b\n";
    const old = { ...entryFor("{++x++}", "{++x++}", { id: "h1" }), state: "accepted" as const };
    const r = prepareRelease(doc(body, [old]), meta());
    const parts = r.ok ? splitDoc(r.text) : null;
    expect(parts?.ok && parts.parts.entries.map((e) => e.id)).toEqual(["h1"]);
  });

  it("refuses a broken block", () => {
    const text = doc("a {++b++}\n", [entryFor("a {++b++}\n", "{++b++}", { id: "e1" })]).replace("diachronic:end %%", "");
    expect(prepareRelease(text, meta())).toMatchObject({ ok: false, reason: "zone-broken" });
  });
});
