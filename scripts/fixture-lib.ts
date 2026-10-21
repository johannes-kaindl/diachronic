/** Texte des Beispielbriefs, gemeinsam für den Fixture-Erzeuger (`scripts/fixture.ts`) und den GUI-Smoke. */

export const LETTER_BODY = `Sehr geehrte Frau Berger,

wir möchten Ihnen mitteilen, dass die Sitzung des Kreisvorstands am 14. November stattfindet. Die Einladung mit der Tagesordnung geht Ihnen in den nächsten Tagen zu.

Bitte bestätigen Sie uns Ihre Teilnahme dringend bis zum 7. November.

Mit freundlichen Grüßen
Johannes Kaindl
`;

/** Die Überarbeitung: eine Ersetzung, eine Einfügung, eine Löschung — genau drei Marken (die Ersetzung ist ein einzelnes Wort: bei „möchten Ihnen mitteilen“ → „teilen Ihnen mit“ ergäbe der Wort-Diff zwei). */
export const LETTER_EDITS: ReadonlyArray<readonly [string, string]> = [
  ["möchten Ihnen mitteilen", "wollen Ihnen mitteilen"],
  ["am 14. November stattfindet", "am 14. November um 19 Uhr stattfindet"],
  ["Teilnahme dringend bis", "Teilnahme bis"],
];

export function applyLetterEdits(text: string): string {
  let out = text;
  for (const [from, to] of LETTER_EDITS) {
    if (!out.includes(from)) throw new Error(`Bearbeitung passt nicht: ${from}`);
    out = out.replace(from, to);
  }
  return out;
}

export const TABLE_BODY = `# Einladung zur Sitzung

Alle Angaben stehen auch im [[Brief an Frau Berger]].

| Punkt | Zeit | Wer |
| --- | --- | --- |
| Begrüßung | 19:00 | Johannes |
| Haushalt | 19:15 | Anna |
| Verschiedenes | 20:00 | alle |

Bitte bringt eure Unterlagen mit.
`;
