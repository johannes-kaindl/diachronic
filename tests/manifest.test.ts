import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lies = (datei: string): string => readFileSync(datei, "utf8");
const manifest = JSON.parse(lies("manifest.json")) as { minAppVersion: string };

// Die Untergrenze ist gemessen, nicht geschätzt: 1.12.4 ist die älteste Version, auf der der GUI-Smoke lief
// (gemessen 2026-10-25: 24 von 24 grün). Wer sie senkt, braucht eine Messung auf der niedrigeren Version und ändert diese Konstante mit.
const GEMESSENE_UNTERGRENZE = "1.12.4";

describe("minAppVersion", () => {
  it("steht auf der gemessenen Untergrenze", () => {
    expect(manifest.minAppVersion).toBe(GEMESSENE_UNTERGRENZE);
  });

  it.each(["README.md", "README.de.md"])("%s nennt dieselbe Version im Abzeichen und in den Voraussetzungen", (datei) => {
    const text = lies(datei);
    expect(text).toContain(`**Obsidian ${manifest.minAppVersion}+**`);
    expect(text).toContain(`platform-Obsidian%20${manifest.minAppVersion}%2B`);
  });
});
