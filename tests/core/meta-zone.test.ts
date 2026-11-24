import { describe, expect, it, vi } from "vitest";
import { joinDoc, splitDoc, zoneSummary, ZONE_MARKERS, type DocParts } from "../../src/core/meta-zone";
import { splitZone } from "../../src/vendor/kit/marker-zone";
import type { ZoneEntry } from "../../src/core/types";

const entry = (id: string, exact: string, extra: Partial<ZoneEntry> = {}): ZoneEntry => ({
  id, kind: "substitution", author: "Johannes", time: "2026-10-18T16:00:00Z", round: 1, state: "open",
  quote: { exact, prefix: "vor ", suffix: " nach" }, ...extra,
});

const parts = (over: Partial<DocParts> = {}): DocParts => ({
  head: "---\ndiachronic-id: d1\n---\n", body: "a {~~b~>x~~} c\n", entries: [entry("e1", "{~~b~>x~~}")], tail: "\n", ...over,
});

describe("splitDoc / joinDoc", () => {
  it("round-trips parts, also with text after the block", () => {
    const p = parts({ tail: "\nNachtrag der Kollegin\n" });
    const r = splitDoc(joinDoc(p));
    expect(r).toEqual({ ok: true, parts: p });
  });

  it("round-trips with CRLF", () => {
    const p = parts({ head: "---\r\ndiachronic-id: d1\r\n---\r\n", body: "a b\r\n", tail: "\r\n" });
    const text = joinDoc(p);
    expect(text).toContain("%% diachronic:begin\r\n");
    expect(text).not.toMatch(/[^\r]\n/);
    expect(splitDoc(text)).toEqual({ ok: true, parts: p });
  });

  it("writes no block without entries and returns the note unchanged", () => {
    const text = "---\ndiachronic-id: d1\n---\nText ohne Marken\n";
    const r = splitDoc(text);
    expect(r).toEqual({ ok: true, parts: { head: "---\ndiachronic-id: d1\n---\n", body: "Text ohne Marken\n", entries: [], tail: "" } });
    expect(r.ok && joinDoc(r.parts)).toBe(text);
  });

  it("removes the block when the last entry goes", () => {
    const p = parts();
    const r = splitDoc(joinDoc(p));
    expect(r.ok && joinDoc({ ...r.parts, entries: [] })).toBe(p.head + p.body);
  });

  it("handles a note without frontmatter", () => {
    const p = parts({ head: "" });
    expect(splitDoc(joinDoc(p))).toEqual({ ok: true, parts: p });
  });

  it("reports a broken zone", () => {
    const text = joinDoc(parts()).replace("diachronic:end %%", "");
    expect(splitDoc(text)).toEqual({ ok: false, reason: "zone-broken" });
  });

  it("reports a quoted marker as broken instead of guessing", () => {
    const text = joinDoc(parts()) + "\nund noch ein diachronic:end %% im Text\n";
    expect(splitDoc(text)).toEqual({ ok: false, reason: "zone-broken" });
  });

  it("reports an unreadable line", () => {
    const text = joinDoc(parts()).replace('"id":"e1"', '"id":').replace("}\n", "}\n");
    expect(splitDoc(text)).toEqual({ ok: false, reason: "zone-unreadable" });
    const noKind = joinDoc(parts()).replace('"kind":"substitution"', '"kind":"magic"');
    expect(splitDoc(noKind)).toEqual({ ok: false, reason: "zone-unreadable" });
  });

  it("keeps a percent sign and even a marker in a quote out of the block", () => {
    const hostile = entry("e2", "{==100 %% sicher==}", { quote: { exact: "100 %% diachronic:end %% x", prefix: "%% diachronic:begin", suffix: "%" } });
    const text = joinDoc(parts({ entries: [hostile] }));
    const block = text.slice(text.indexOf(ZONE_MARKERS.begin) + ZONE_MARKERS.begin.length, text.indexOf(ZONE_MARKERS.end));
    expect(block).not.toContain("%");
    expect(splitDoc(text)).toEqual({ ok: true, parts: parts({ entries: [hostile] }) });
  });

  it("keeps a thread id and unicode in the entry", () => {
    const e = entry("e3", "{>>Jo: Größe<<}", { kind: "comment", thread: "t1", quote: { exact: "{>>Jo: Größe<<}" } });
    const r = splitDoc(joinDoc(parts({ entries: [e] })));
    expect(r.ok && r.parts.entries).toEqual([e]);
  });

  it("adds a line break after a block that ends the note", () => {
    const text = joinDoc(parts({ tail: "" }));
    expect(text.endsWith("diachronic:end %%\n")).toBe(true);
  });
});

describe("zoneSummary", () => {
  const e = (id: string, time: string): ZoneEntry => ({ id, kind: "insertion", author: "J", time, round: 1, state: "open", quote: { exact: "{++x++}" } });
  const blockOf = (entries: ZoneEntry[]): string => {
    const text = joinDoc({ head: "", body: "Text {++x++}", entries, tail: "\n" });
    const z = splitZone(text, ZONE_MARKERS);
    if (z.kind !== "zone") throw new Error("no zone");
    return z.block;
  };

  it("counts the entries and names the latest time", () => {
    expect(zoneSummary(blockOf([e("a", "2026-10-19T09:00:00Z"), e("b", "2026-10-21T10:00:00Z"), e("c", "2026-10-20T08:00:00Z")]))).toEqual({ count: 3, latest: "2026-10-21T10:00:00Z" });
  });

  it("does not count lines it cannot read, and never throws", () => {
    expect(zoneSummary(`${blockOf([e("a", "2026-10-19T09:00:00Z")])}\nkein json\n`)).toEqual({ count: 1, latest: "2026-10-19T09:00:00Z" });
    expect(zoneSummary("")).toEqual({ count: 0, latest: null });
  });

  it("Differenz zur Fassung ohne Vorab-Pruefung: eine Zeile zaehlt genau dann, wenn JSON.parse ein Objekt (kein Array) liefert", () => {
    // Orakel ist JSON.parse selbst, nicht die neue Pruefung: Eintrag mit Rauschen davor und dahinter; nur ein JSON-Objekt kann ein Eintrag sein.
    const body = JSON.stringify(e("a", "2026-10-19T09:00:00Z"));
    const rauschen = ["", " ", "\t", " \t ", "\u00a0", "\ufeff", "x", "[", "]", "\"", "{", "}", ",", "0", "-", "null", "\\"];
    let gezaehlt = 0;
    for (const vor of rauschen) {
      for (const nach of rauschen) {
        const zeile = `${vor}${body}${nach}`;
        let erwartet = 0;
        try { const r: unknown = JSON.parse(zeile); erwartet = typeof r === "object" && r !== null && !Array.isArray(r) ? 1 : 0; } catch { erwartet = 0; }
        expect(zoneSummary(zeile).count, JSON.stringify(zeile)).toBe(erwartet);
        gezaehlt += erwartet;
      }
    }
    expect(gezaehlt).toBeGreaterThan(10);
    expect(gezaehlt).toBeLessThan(rauschen.length * rauschen.length);
  });

  it("ruft JSON.parse fuer eine Zeile ohne '{' gar nicht erst (50 000 Muellzeilen, kein geworfener Fehler je Zeile)", () => {
    const spy = vi.spyOn(JSON, "parse");
    try {
      const muell = "kein json\n  [1,2]\n\"text\"\n42\n".repeat(12_500);
      expect(zoneSummary(muell)).toEqual({ count: 0, latest: null });
      expect(spy).not.toHaveBeenCalled();
      // Gegenprobe: eine Zeile mit '{' geht weiter durch JSON.parse (der Spion misst also etwas)
      zoneSummary("  {kaputt");
      expect(spy).toHaveBeenCalledTimes(1);
    } finally { spy.mockRestore(); }
  });
});
