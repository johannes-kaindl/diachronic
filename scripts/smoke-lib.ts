/** Gemeinsame Handgriffe des GUI-Smokes und der Aufnahme-Rezepte (`gui-smoke.ts`, `shots.ts`): Zustand zurücksetzen, Notizen öffnen, Ansicht bedienen. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { cwd } from "node:process";

import { Cdp, clearNotices, closeExtraLeaves, openNote, pollUntil, schliesseDialog } from "../../tools/obsidian-cdp/cdp.js";

export const REPO_NAME = "diachronic";
export const PLUGIN_ID = "diachronic";
export const REPO_ROOT = cwd();
export const FIXTURE_DIR = join(REPO_ROOT, "fixtures/vault");
export const NOTES_DIR = join(FIXTURE_DIR, "notes");
export const LETTER = "Brief an Frau Berger.md";
export const LETTER_COPY = "Brief an Frau Berger (1).md";
export const TABLE = "Einladung mit Tabelle.md";
export const EXAMPLE = "Diachronic-Beispiel/Beispielbrief.md";
/** Notizen, die dieser Lauf zusätzlich anlegt und vorher wie nachher entfernt. */
export const SCRATCH = [LETTER_COPY, "Freigabe offen.md", "Freigabe frei.md", "Lesemodus.md", "Stand harmlos.md", "Stand harmlos Kontrolle.md", "Ausschluss.md"] as const;


export const q = (s: string): string => JSON.stringify(s);
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
export const fixtureText = (rel: string): string => readFileSync(join(NOTES_DIR, rel), "utf8");
export const fixtureFiles = (dir: string): string[] => readdirSync(dir).flatMap((e) => (statSync(join(dir, e)).isDirectory() ? fixtureFiles(join(dir, e)) : [join(dir, e)]));


// ───────────────────────── Zustand ─────────────────────────

/** Alle Notizen und Stände auf den Fixture-Stand, Ansicht und Dialoge zu. Läuft vor und nach dem Lauf. */
export async function setzeZurueck(cdp: Cdp): Promise<void> {
  await schliesseDialog(cdp).catch(() => undefined);
  await cdp.evaluate(`app.workspace.detachLeavesOfType("diachronic-view"); return true;`);
  await closeExtraLeaves(cdp);
  const dateien = fixtureFiles(NOTES_DIR).map((f) => ({ pfad: relative(NOTES_DIR, f), text: readFileSync(f, "utf8") }));
  await cdp.evaluate(`
    const a = app.vault.adapter;
    for (const p of ${JSON.stringify(SCRATCH)}) { if (await a.exists(p)) await a.remove(p); }
    if (await a.exists("Diachronic")) await a.rmdir("Diachronic", true);
    if (await a.exists(".diachronic-export")) await a.rmdir(".diachronic-export", true);
    const ensureDir = async (path) => { const parts = path.split("/").slice(0, -1); let cur = ""; for (const p of parts) { cur = cur ? cur + "/" + p : p; if (!(await a.exists(cur))) await a.mkdir(cur); } };
    for (const f of ${JSON.stringify(dateien)}) { await ensureDir(f.pfad); await a.write(f.pfad, f.text); }
    const plugin = app.plugins.plugins[${q(PLUGIN_ID)}];
    plugin.settings.authorName = "Johannes"; plugin.settings.standFolder = "Diachronic"; plugin.settings.hideStandFolder = true; plugin.settings.colorByAuthor = false; plugin.settings.exclusionOffered = true;
    await plugin.saveSettings();
    return true;
  `);
  await clearNotices(cdp);
  await sleep(300);
}

export async function oeffne(cdp: Cdp, pfad: string, text: string, modus: "source" | "preview" = "source"): Promise<void> {
  await openNote(cdp, pfad, text, modus);
  await sleep(300);
}

export const EDITOR = `(() => { const leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit); const v = leaf && leaf.view; return v && v.editor ? v.editor : null; })()`;
export async function editorText(cdp: Cdp): Promise<string> {
  return cdp.evaluate<string>(`const ed = ${EDITOR}; return ed ? ed.getValue() : "";`);
}
export async function setzeEditorText(cdp: Cdp, text: string): Promise<void> {
  await cdp.evaluate(`const ed = ${EDITOR}; ed.setValue(${q(text)}); return true;`);
  await sleep(200);
}
export async function datei(cdp: Cdp, pfad: string): Promise<string | null> {
  return cdp.evaluate<string | null>(`const a = app.vault.adapter; return (await a.exists(${q(pfad)})) ? await a.read(${q(pfad)}) : null;`);
}
export async function befehl(cdp: Cdp, id: string): Promise<boolean> {
  return cdp.evaluate<boolean>(`return app.commands.executeCommandById(${q(id)});`);
}
export async function standDateien(cdp: Cdp, docId: string): Promise<string[]> {
  return cdp.evaluate<string[]>(`const a = app.vault.adapter; const d = "Diachronic/" + ${q(docId)}; if (!(await a.exists(d))) return []; return (await a.list(d)).files.map((f) => f.slice(d.length + 1)).sort();`);
}
export const docIdAus = (text: string): string => /diachronic-id: (\S+)/.exec(text)?.[1] ?? "";

export async function warte(cdp: Cdp, ausdruck: string, ms = 8000): Promise<boolean> {
  return (await pollUntil<boolean>(cdp, `return Boolean(${ausdruck});`, ms, 150)) === true;
}
export const KARTEN = `Array.from(document.querySelectorAll(".diachronic-review .okit-review-card"))`;
export async function kartenIds(cdp: Cdp): Promise<string[]> {
  return cdp.evaluate<string[]>(`return ${KARTEN}.map((c) => c.getAttribute("data-id"));`);
}
export async function oeffneAnsicht(cdp: Cdp, tab: "review" | "stands" = "review"): Promise<void> {
  await befehl(cdp, "diachronic:open-view");
  if (!(await warte(cdp, `document.querySelector(".diachronic-view .okit-hub-tabs")`))) throw new Error("Ansicht öffnet nicht");
  await cdp.evaluate(`const b = document.querySelector('.diachronic-view .okit-hub-tab[data-tab=${q(tab)}]'); if (b) b.click(); return true;`);
  await sleep(300);
}
export async function klickeKnopf(cdp: Cdp, selektor: string, nth = 0): Promise<boolean> {
  return cdp.evaluate<boolean>(`const els = document.querySelectorAll(${q(selektor)}); const el = els[${nth}]; if (!el || el.disabled) return false; el.click(); return true;`);
}
/** Klickt die Zeile der Stände-Liste, deren Beschriftung zum Muster passt (die Reihenfolge ändert sich mit jedem Stand, ein Index wäre geraten). */
export async function klickeStand(cdp: Cdp, muster: RegExp): Promise<boolean> {
  return cdp.evaluate<boolean>(`const re = new RegExp(${q(muster.source)}); const row = Array.from(document.querySelectorAll(".diachronic-stands .okit-vlist-row")).find((r) => re.test((r.querySelector(".okit-vlist-label") || {}).textContent || "")); if (!row) return false; row.click(); return true;`);
}
export const EINGANG = /(Round 1 – incoming|Runde 1 – Eingang)/;

/** Füllt den Kommentar-Dialog und schickt ihn ab. */
export async function kommentiere(cdp: Cdp, text: string): Promise<boolean> {
  if (!(await warte(cdp, `document.querySelector(".diachronic-comment textarea")`))) return false;
  await cdp.evaluate(`const a = document.querySelector(".diachronic-comment textarea"); a.value = ${q(text)}; document.querySelector(".diachronic-comment .mod-cta").click(); return true;`);
  await sleep(500);
  return true;
}
export async function bestaetige(cdp: Cdp, selektor = ".modal-container .modal-button-container .mod-destructive, .modal-container .modal-button-container .mod-warning, .modal-container .modal-button-container .mod-cta"): Promise<boolean> {
  if (!(await warte(cdp, `document.querySelector(${q(selektor)})`))) return false;
  await cdp.evaluate(`document.querySelector(${q(selektor)}).click(); return true;`);
  await sleep(500);
  return true;
}

