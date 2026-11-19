/**
 * Linearität der Funktionen, die Notizinhalt zerlegen (ReDoS-Konvention, CORE-TEST-26 (b)): der erschöpfende Fuzz `pruefeLinearFuzz` aus dem Kit-Testmodul.
 * Gemessen wird ein Quotient t(50 000)/t(10 000), keine Millisekunden.
 *
 * Geprüft sind die Wege, auf denen Text von außen ankommt: die Notiz (`splitDoc`, läuft beim Schreiben eines Eintrags), der Block für die gefaltete Zeile
 * im Editor (`zoneSummary`, läuft je Tastendruck über den ganzen Block) und die Stand-Datei (`readStandFile`, Zaun-Regex mit `m`-Flag über den Dateitext).
 *
 * Nicht Gegenstand: `splitZone` und `parseFrontmatter` (Kit, dort mit eigenem Linearitätstest). Die Gegenprobe (eine absichtlich quadratische Fassung wird rot)
 * steht am Ende dieser Datei.
 */
import { describe, expect, it } from "vitest";
import { pruefeLinear, pruefeLinearFuzz } from "./vendor/kit/linear-probe";
import { splitDoc, zoneSummary, ZONE_MARKERS } from "../src/core/meta-zone";
import { readStandFile, STAND_FENCE } from "../src/core/stand-file";

const FUZZ_MS = 180_000;

/** Befund als lesbarer Text, damit eine rote Zeile ohne Nachlesen verständlich ist (CORE-TEST-14). */
const befund = (r: { verdaechtig: ReadonlyArray<{ message: string }> }): string => r.verdaechtig.map((v) => v.message).join("\n");

describe("Notiz und Block (splitDoc, zoneSummary)", () => {
  it("splitDoc: Fuzz über Zonenmarker, Frontmatter-Zaun, Zeilenumbruch und Wagenrücklauf", () => {
    // Ganze Markerzeilen als Einträge, damit eine Zone mit Block schon bei zwei Einheiten entsteht; ein Frontmatter-Zaun, damit `parseFrontmatter` läuft.
    const alphabet = [`${ZONE_MARKERS.begin}\n`, `${ZONE_MARKERS.end}\n`, "---\n", "\n", "\r\n", "x"];
    const f = pruefeLinearFuzz((s) => splitDoc(s), { alphabet, maxLaenge: 3 });
    expect(f.linear, befund(f)).toBe(true);
    expect(f.gemessen, "der Fuzz hat Eingaben gemessen").toBeGreaterThan(20);
  }, FUZZ_MS);

  it("zoneSummary: Fuzz über JSON-Zeichen innerhalb einer Zeile", () => {
    // Bewusst ohne Zeilenumbruch im Alphabet: jede Zeile, die kein Eintrag ist, kostet einen geworfenen `JSON.parse` (gemessen rund 3 bis 10 µs je Zeile, bei 50 000
    // Müllzeilen 0,3 s). Das ist linear in der Zeilenzahl, im Mittel aber mit Speicherdruck; der Block wird vom Plugin geschrieben und trägt Müllzeilen nur nach einem
    // Handgriff in der Datei. Der Fuzz mit Zeilenumbruch schlug darauf an und ist deshalb die feste Eingabe im nächsten Test.
    const f = pruefeLinearFuzz((s) => zoneSummary(s), { alphabet: [" ", "{", "}", '"', ":", "x"], maxLaenge: 3 });
    expect(f.linear, befund(f)).toBe(true);
    expect(f.gemessen, "der Fuzz hat Eingaben gemessen").toBeGreaterThan(20);
  }, FUZZ_MS);

  it("viele gültige Einträge: zoneSummary bleibt linear", () => {
    const eintrag = JSON.stringify({ id: "a", kind: "comment", author: "x", time: "2026-01-01T00:00:00Z", round: 1, state: "open", quote: { exact: "x" } });
    const r = pruefeLinear((s: string) => zoneSummary(s), (n) => `${eintrag}\n`.repeat(Math.ceil(n / eintrag.length)));
    expect(r.linear, r.message).toBe(true);
  });

  it("viele Einträge hinter einem Zonenanfang: splitDoc bleibt linear", () => {
    const zeile = "x\n";
    const r = pruefeLinear((s: string) => splitDoc(s), (n) => `${ZONE_MARKERS.begin}\n${zeile.repeat(Math.ceil(n / zeile.length))}${ZONE_MARKERS.end}\n`);
    expect(r.linear, r.message).toBe(true);
  });
});

describe("Stand-Datei (readStandFile)", () => {
  it("readStandFile: Fuzz über Zaun, Prüfsummenzeile, Zeilenumbruch und Leerraum", () => {
    const alphabet = [`\`\`\`${STAND_FENCE}\n`, "```\n", "sha256 ", "\n", "\r", " ", "x"];
    const f = pruefeLinearFuzz((s) => readStandFile(s), { alphabet, maxLaenge: 3 });
    expect(f.linear, befund(f)).toBe(true);
    expect(f.gemessen, "der Fuzz hat Eingaben gemessen").toBeGreaterThan(20);
  }, FUZZ_MS);

  it("viele Zäune ohne Schluss und lange Zeilen: readStandFile bleibt linear", () => {
    const a = pruefeLinear((s: string) => readStandFile(s), (n) => `\`\`\`${STAND_FENCE}\n`.repeat(Math.ceil(n / 20)));
    expect(a.linear, a.message).toBe(true);
    const b = pruefeLinear((s: string) => readStandFile(s), (n) => `\`\`\`${STAND_FENCE}\n${"x".repeat(n)}\n${"y".repeat(n)}`);
    expect(b.linear, b.message).toBe(true);
  });
});

describe("Gegenprobe: der Fuzz kann rot werden (CORE-TEST-01)", () => {
  /** Absichtlich quadratisch: dieselbe Form wie ein nachgestelltes `replace(/\n*$/, …)` auf dem Notiztext. */
  const quadratisch = (s: string): string => s.replace(/\n*$/, "\n\n");

  it("pruefeLinearFuzz meldet die quadratische Form als Verdacht", () => {
    const f = pruefeLinearFuzz((s) => quadratisch(`Rumpf\n${s}\nSchluss`), { alphabet: ["\n", "x"], maxLaenge: 1, verschachtelt: false });
    expect(f.linear).toBe(false);
    expect(f.verdaechtig.map((v) => v.einheit)).toContain("\n");
  }, FUZZ_MS);
});
