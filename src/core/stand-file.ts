import { sha256HexUtf8 } from "../vendor/kit/sha256";
import { parseStand, serializeStand, type StoredStand } from "../vendor/kit/version-chain";

/**
 * Eine Stand-Datei ist eine Markdown-Datei (`.md`): nur Markdown kommt ohne Zusatzschalter per Sync aufs Telefon.
 * Als Notiz sichtbar bleibt sie harmlos, weil der ganze Stand als EINE JSON-Zeile in einem eingezäunten Block steht:
 * Links, Tags, Aufgaben, Überschriften und `%%` darin zählt Obsidian nicht, und Zeilenumbrüche des Notiztextes sind in JSON
 * als `\n` geschrieben, so dass keine Zeile des Textes einen Zaun beenden kann. Kein Frontmatter.
 *
 * Aufbau (die Zeilen des Blocks sind fest):
 *
 *     Kurzer Hinweis für Menschen.
 *
 *     ```diachronic-stand
 *     sha256 <Prüfsumme der nächsten Zeile>
 *     {"meta":…,"form":"full","text":…}
 *     ```
 *
 * Schreibende Plugins (Linter beim Speichern, Templater beim Anlegen) sehen die Datei als Notiz. Die Prüfsumme deckt die
 * Nutzlast; zusätzlich muss die Datei ihrer eigenen kanonischen Darstellung gleichen (bis auf Zeilenende und Leerraum am Ende).
 * Eine Abweichung wird gemeldet, der Stand trotzdem geliefert: still verwerfen wäre der teurere Fehler (CORE-DATA-01), und die
 * Texte der Kette prüft `reconstruct` weiter gegen ihre eigenen Hashes.
 */
export const STAND_FENCE = "diachronic-stand";

const HINT = "This file is a saved stand of a note, kept by the Diachronic plugin. Do not edit it.";

export type StandFileProblem =
  /** Kein lesbarer Stand: Block fehlt, Nutzlast ist kein Stand. */
  | "unreadable"
  /** Die Prüfsumme fehlt oder passt nicht zur Nutzlast: der Inhalt wurde nach dem Schreiben verändert. */
  | "checksum"
  /** Nutzlast stimmt, aber die Datei trägt Fremdes (Frontmatter, Text davor oder danach) oder weicht sonst von der Darstellung ab. */
  | "foreign";

export interface StandFileRead {
  stand: StoredStand | null;
  problems: StandFileProblem[];
}

/** Der Inhalt der Datei für diesen Stand. */
export function renderStandFile(stand: StoredStand): string {
  const payload = serializeStand(stand);
  return `${HINT}\n\n\`\`\`${STAND_FENCE}\nsha256 ${sha256HexUtf8(payload)}\n${payload}\n\`\`\`\n`;
}

const BLOCK = new RegExp(`^\`\`\`${STAND_FENCE}\\n([^\\n]*)\\n([^\\n]*)\\n\`\`\`[ \\t]*$`, "m");

export function readStandFile(raw: string): StandFileRead {
  const text = raw.replace(/\r\n?/g, "\n");
  const m = BLOCK.exec(text);
  const stand = m && m[2] !== undefined ? parseStand(m[2]) : null;
  if (!m || !stand) return { stand: null, problems: ["unreadable"] };
  const problems: StandFileProblem[] = [];
  const declared = /^sha256 ([0-9a-f]{64})\s*$/.exec(m[1] ?? "");
  const intact = declared !== null && declared[1] === sha256HexUtf8(m[2] ?? "");
  if (!intact) problems.push("checksum");
  else if (text.trimEnd() !== renderStandFile(stand).trimEnd()) problems.push("foreign");
  return { stand, problems };
}
