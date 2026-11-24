import { serializeFrontmatter, wikilinkOf, type FmValue } from "../vendor/kit/frontmatter";
import type { StoredStand } from "../vendor/kit/version-chain";
import { standInfo } from "./stand-plan";

/**
 * Eine Commit-Notiz je gespeichertem Stand: eine eigene Markdown-Datei, deren Frontmatter Bases lesen kann (Nachricht, Autor, Zeit, Anlass,
 * Runde, Fassung und die Links auf die betroffenen Notizen). Die Stand-Datei (`stand-file.ts`) bleibt, wie sie ist; die Commit-Notiz
 * wiederholt nur, was sich aus dem Stand ergibt, und trägt keinen Text der Notiz.
 *
 * Die Schlüssel tragen `commit` im Namen und nie die der verfolgten Notiz (`FM_KEYS`): eine Commit-Notiz ist kein Dokument, das Diachronic führt.
 */
export const COMMIT_KEYS = {
  stand: "diachronic-commit",
  message: "diachronic-commit-message",
  author: "diachronic-commit-author",
  time: "diachronic-commit-time",
  reason: "diachronic-commit-reason",
  round: "diachronic-commit-round",
  version: "diachronic-commit-version",
  notes: "diachronic-commit-notes",
} as const;

/**
 * Name des Ordners neben dem Stände-Ordner, solange der Mensch keinen eigenen wählt (seit Welle 35; bis 0.2.0 der Unterordner `Stände-Ordner/Stand notes`).
 * Er liegt bewusst NICHT im Stände-Ordner: Wer den Stände-Ordner unter „Ausgeschlossene Dateien“ einträgt, nähme sonst die Commit-Notizen mit heraus, und eine
 * Base zeigt ausgeschlossene Dateien nicht (gemessen 2026-11-15, Obsidian 1.15.1: 0 von 2 Notizen). Mit Leerzeichen und ohne den Namen des Stände-Ordners als Anfang,
 * damit ein Eintrag „Diachronic“ in der Ausschlussliste ihn nicht zufällig mit trifft.
 */
export const COMMIT_SUBFOLDER = "Stand notes";

const HINT = "This note describes a saved stand, kept by the Diachronic plugin. Do not edit it.";

/** Der Ordner der Commit-Notizen: der gewählte, sonst `Stand notes` neben dem Stände-Ordner (im selben Elternordner, bei einem Stände-Ordner an der Wurzel an der Wurzel). */
export function commitFolderOf(standFolder: string, chosen: string): string {
  const own = chosen.trim();
  if (own !== "") return own;
  const slash = standFolder.lastIndexOf("/");
  return slash > 0 ? `${standFolder.slice(0, slash)}/${COMMIT_SUBFOLDER}` : COMMIT_SUBFOLDER;
}

export function commitNotePath(folder: string, standId: string): string {
  return `${folder}/${standId}.md`;
}

/** Ein Wert für eine Frontmatter-Zeile: Zeilenumbrüche und Mehrfach-Leerraum zu einem Leerzeichen (Anzeige in einer Zeile; `serializeFrontmatter` schreibt einen Umbruch seit Kit 0.96.0 als Escape, nicht mehr roh). */
function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Der Inhalt der Commit-Notiz. `notePath` ist die Notiz, zu der der Stand gehört (Vault-Pfad); `version` die Fassung, die sie beim Speichern trug.
 * Der Link steht als Wikilink in einer Liste: Obsidian führt ihn bei einer Umbenennung nach, Bases zeigt ihn als Link.
 */
export function renderCommitNote(stand: StoredStand, notePath: string, version: string | null): string {
  const info = standInfo(stand.meta.id);
  const data: Record<string, FmValue> = {
    [COMMIT_KEYS.stand]: stand.meta.id,
    [COMMIT_KEYS.message]: oneLine(stand.meta.name ?? "") || stand.meta.id,
    [COMMIT_KEYS.author]: oneLine(stand.meta.author),
    [COMMIT_KEYS.time]: stand.meta.time,
    [COMMIT_KEYS.notes]: [wikilinkOf(notePath) ?? notePath],
  };
  if (info) { data[COMMIT_KEYS.reason] = info.reason; data[COMMIT_KEYS.round] = info.round; }
  if (version !== null && version !== "") data[COMMIT_KEYS.version] = oneLine(version);
  const order = [COMMIT_KEYS.stand, COMMIT_KEYS.message, COMMIT_KEYS.author, COMMIT_KEYS.time, COMMIT_KEYS.reason, COMMIT_KEYS.round, COMMIT_KEYS.version, COMMIT_KEYS.notes];
  return `${serializeFrontmatter(data, order)}\n${HINT}\n`;
}
