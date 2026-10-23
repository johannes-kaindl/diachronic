/**
 * Bilder für README und Doku: nimmt `docs/images/*.png` gegen eine LAUFENDE Zweitinstanz auf (Rezept wie `gui-smoke.ts`; Bildaufnahmen
 * laufen unter `--exclusive focus`). Der Vault ist der Staging-Vault aus `fixtures/vault/` (`npm run smoke:gui -- --setup`).
 *
 *   OBS_EXTRA="--lang=en-US" … (Instanz mit englischer Oberfläche starten; `localStorage.language` allein wirkt erst nach einem Neuladen)
 *   npm run shots -- --port 9371
 *
 * `--only block-und-liste --out <Ordner>` nimmt statt der Doku-Bilder zwei Vergleichsbilder auf (der gefaltete Metadaten-Block im Live Preview
 * und die Stände-Liste in einer schmalen Seitenleiste, `fold.png`, `narrow-stands.png`) und schreibt sie in den Ordner, nicht nach `docs/images/`:
 * für das Vorher/Nachher bei einer Kit-Hebung (erst mit dem alten, dann mit dem neuen Build im Staging-Vault).
 *
 * Gemessen wird nicht, aufgenommen: Dateinamen und Inhalt stehen in `docs/images/README.md`. Die Bilder zeigen den Beispielbrief
 * mit Vorschlägen und Kommentar. Ein schmales Fenster ersetzt das iPhone (die Oberfläche ist dieselbe, die mobile Hülle von Obsidian fehlt).
 */
import { join, resolve } from "node:path";
import { Cdp, attachTo, bereiteInstanzVor, requireVisible } from "../../tools/obsidian-cdp/cdp.js";
import { parseArgs, runDriver } from "../../tools/obsidian-cdp/bilanz.js";
import { boxOf, capture, setWindowSize, writeShot, type Rect } from "../../tools/obsidian-cdp/shot.js";
import { EXAMPLE, PLUGIN_ID, REPO_NAME, REPO_ROOT, fixtureText, klickeKnopf, klickeStand, oeffne, oeffneAnsicht, setzeZurueck, sleep, warte, EINGANG } from "./smoke-lib.js";

const argv = parseArgs(process.argv.slice(2));
const ONLY = argv.value("only");
const OUT = argv.value("out") ? resolve(argv.value("out") as string) : join(REPO_ROOT, "docs/images");
const OPT = { outDir: OUT, captureWidth: 1200, thumbWidth: 380, thumb: !ONLY } as const;

async function aufnahme(cdp: Cdp, name: string, clip?: Rect | null): Promise<void> {
  const png = await capture(cdp, clip ?? undefined, 2);
  console.log(`  ${await writeShot(cdp, name, png, OPT)}`);
}

/** Ausschnitt von der Tab-Leiste der Ansicht bis zum Unterrand des letzten Inhalts (ein Bild der ganzen Seitenleiste wäre zu zwei Dritteln leer). */
async function inhaltsbox(cdp: Cdp, letzte: string): Promise<Rect | null> {
  return cdp.evaluate<Rect | null>(`
    const top = document.querySelector(".diachronic-view .okit-hub-tabs");
    const last = Array.from(document.querySelectorAll(${JSON.stringify(letzte)})).pop();
    if (!top || !last) return null;
    const a = top.getBoundingClientRect(), b = last.getBoundingClientRect();
    const left = Math.min(a.left, b.left) - 8, w = Math.max(a.right, b.right) - left + 8;
    return { x: left, y: a.top - 8, width: w, height: b.bottom - a.top + 16 };`);
}

/** Vergleichsbilder für eine Kit-Hebung: der Block im Live Preview und die Stände-Liste in einer schmalen Seitenleiste. */
async function blockUndListe(cdp: Cdp): Promise<void> {
  await setWindowSize(cdp, 1500, 940);
  await oeffne(cdp, EXAMPLE, fixtureText(EXAMPLE), "source");
  await cdp.evaluate(`const l = app.workspace.getMostRecentLeaf(app.workspace.rootSplit); await l.view.setState({ ...l.view.getState(), mode: "source", source: false }, { history: false }); return true;`);
  await sleep(800);
  // Cursor an den Anfang des Briefs (der Block darf nicht von der Auswahl berührt werden), die Grußformel in die Mitte des Fensters: davor der Brief, danach der Block.
  await cdp.evaluate(`const l = app.workspace.getMostRecentLeaf(app.workspace.rootSplit); const ed = l.view.editor; ed.setCursor({ line: 0, ch: 0 }); const k = ed.getValue().split("\\n").findIndex((z) => z.startsWith("Mit freundlichen")); ed.scrollIntoView({ from: { line: k, ch: 0 }, to: { line: k, ch: 0 } }, true); return true;`);
  await sleep(600);
  await aufnahme(cdp, "fold.png", await boxOf(cdp, ".mod-root .workspace-leaf.mod-active .view-content", 0));
  await oeffneAnsicht(cdp, "stands");
  await setWindowSize(cdp, 560, 900);
  await cdp.evaluate(`app.workspace.leftSplit.collapse(); const r = document.querySelector(".mod-right-split"); if (r) r.style.width = "260px"; await new Promise((x) => setTimeout(x, 500)); return true;`);
  await sleep(600);
  await aufnahme(cdp, "narrow-stands.png", await inhaltsbox(cdp, ".diachronic-stands .okit-vlist-row"));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const port = Number(args.value("port"));
  if (!Number.isInteger(port) || port < 1024) throw new Error("--port <Zahl> fehlt (Port der eigenen Zweitinstanz).");
  const cdp = await attachTo("workspace", port, REPO_NAME);
  if (!cdp) throw new Error(`Kein Obsidian-Fenster für Vault "${REPO_NAME}" auf Port ${port}.`);
  try {
    await requireVisible(cdp);
    await bereiteInstanzVor(cdp, { pluginIds: [PLUGIN_ID], nurVault: REPO_NAME, sprache: "en" });
    await setzeZurueck(cdp);
    await setWindowSize(cdp, 1500, 940);
    await oeffne(cdp, EXAMPLE, fixtureText(EXAMPLE), "source");
    await oeffneAnsicht(cdp, "review");
    await warte(cdp, `document.querySelectorAll(".diachronic-review .okit-review-card").length >= 3`);
    await sleep(500);
    console.log("Aufnahmen:");
    if (ONLY === "block-und-liste") { await blockUndListe(cdp); return; }
    if (ONLY) throw new Error(`--only: unbekannt (${ONLY}); erlaubt: block-und-liste`);
    // Das Hero endet über dem Metadaten-Block (er steht im Live Preview als eine gefaltete Zeile unter dem Brief; das Bild ist so bewusst nicht neu aufgenommen, siehe docs/images/README.md).
    await setWindowSize(cdp, 1500, 690);
    await sleep(500);
    await aufnahme(cdp, "hero.png");
    await setWindowSize(cdp, 1500, 940);
    await sleep(500);
    await aufnahme(cdp, "review.png", await inhaltsbox(cdp, ".diachronic-review .okit-review-card"));

    await oeffneAnsicht(cdp, "stands");
    await klickeStand(cdp, EINGANG);
    await sleep(500);
    await aufnahme(cdp, "stands.png", await inhaltsbox(cdp, ".diachronic-stands-bar button"));
    await klickeKnopf(cdp, ".diachronic-stands-bar button", 0);
    await warte(cdp, `document.querySelector(".diachronic-diff .diachronic-diff-body")`);
    await sleep(500);
    await aufnahme(cdp, "diff.png", await boxOf(cdp, ".modal.diachronic-diff", 12));
    await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });

    await oeffneAnsicht(cdp, "review");
    // Lesemodus: der Metadaten-Block ist ein Obsidian-Kommentar und soll hier unsichtbar sein.
    await oeffne(cdp, EXAMPLE, fixtureText(EXAMPLE), "preview");
    await sleep(700);
    const lese = await boxOf(cdp, ".mod-root .workspace-leaf.mod-active .view-content", 0);
    await aufnahme(cdp, "reading.png", lese ? { ...lese, height: Math.min(lese.height, 600) } : null);
    // Schmales Fenster: nur die Seitenleiste, links eingeklappt, rechts auf die Fensterbreite gezogen (ein Ersatz für den Vollbild-Schub auf dem iPhone, kein Beleg dafür).
    await oeffne(cdp, EXAMPLE, fixtureText(EXAMPLE), "source");
    await oeffneAnsicht(cdp, "review");
    await setWindowSize(cdp, 560, 900);
    await cdp.evaluate(`app.workspace.leftSplit.collapse(); const r = document.querySelector(".mod-right-split"); if (r) r.style.width = "470px"; await new Promise((x) => setTimeout(x, 500)); return true;`);
    await sleep(500);
    await aufnahme(cdp, "narrow.png", await inhaltsbox(cdp, ".diachronic-review .okit-review-card"));
  } finally {
    await setzeZurueck(cdp).catch(() => undefined);
    cdp.close();
  }
}

runDriver(main);
