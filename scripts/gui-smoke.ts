/**
 * GUI-Smoke — fährt die Prüfpunkte S1–S25 aus docs/SMOKE.md gegen ein LAUFENDES Obsidian (CORE-TEST-02 b).
 * Kein Fake-Server nötig: Diachronic spricht mit keinem Dienst; alle Zustände entstehen aus dem Fixture-Vault.
 *
 * ## Zweitinstanz (der richtige Ort für diesen Lauf — eigenes Profil, eigener Port)
 *
 * Die Texte prüft der Treiber in beiden Sprachen (EN/DE), weil `bereiteInstanzVor(sprache: "en")` die Oberfläche erst nach einem Neuladen umstellt; `--lang=en-US` beim Start stellt Englisch sofort ein (gemessen 2026-10-21).
 * Der Port ist PFLICHT (`--port <n>`, dokumentierter Wert dieses Rezepts: 9371); der Treiber hat keinen Default.
 * Reihenfolge laut obsidian-plugins/AGENTS.md § Staging-Vaults (a)–(c):
 *
 *   echo "$STAGING_VAULTS_DIR"                                          # muss gesetzt sein (~/.zshenv)
 *   UD=/tmp/obs-test-diachronic; mkdir -p "$UD"
 *   lsof -nP -iTCP:9371 -sTCP:LISTEN && echo "Port belegt — anderen nehmen"
 *   pgrep -f "user-data-dir=$UD" && echo "Profil belegt — $UD-w25 nehmen"
 *   npm run build && npm run smoke:gui -- --setup                       # Vault aus fixtures/vault/
 *   # (a) aktuelle Version statt gebündelter:
 *   cp ~/Library/Application\ Support/obsidian/obsidian-<version>.asar "$UD"/
 *   # Vault registrieren (Obsidian liest obsidian.json nur beim Start):
 *   node -e 'const p=process.env.STAGING_VAULTS_DIR+"/diachronic";require("fs").writeFileSync(process.argv[1]+"/obsidian.json",JSON.stringify({vaults:{diachronic:{path:p,ts:Date.now(),open:true}},language:"en"}))' "$UD"
 *   /Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir="$UD" --remote-debugging-port=9371 --lang=en-US &
 *   # PID merken: beendet wird NUR sie, nie pkill/killall. Je Messlauf frischer Prozess.
 *   python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label diachronic --intent "GUI-Smoke Zweitinstanz :9371" --exclusive all --port 9371 --ttl 300
 *   npm run smoke:gui -- --port 9371     # (b) Restricted Mode und (c) Vertrauensdialog: `bereiteInstanzVor` (Brücke)
 *   python3 ~/.claude/hooks/obsidian-cdp-lock.py release
 *
 * Bilanz in vier Zuständen (CORE-TEST-19, `createBilanz`): Nenner ist `PUNKTE`; ein nie aufgezeichneter Punkt zählt als
 * „nichts gemessen“. Exit 1 bei Rot oder nichts gemessen, 2 bei Abbruch.
 *
 * Ein Treiber setzt jeden Zustand, den er anlegt, VOR dem Lauf zurück (Notizen, Stände, Einstellungen, Ansicht) und nach dem Lauf
 * noch einmal. Gemessen wird im eigenen Staging-Vault (`stagingVaultDir("diachronic")`), nie im Arbeits-Vault.
 * Hinweis: DOM-Prüfungen sind kein Layout-Beweis — wie die Seitenleiste aussieht, zeigen die Bilder in docs/images/.
 */
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { Cdp, attachTo, beimAbbruch, bereiteInstanzVor, clearNotices, closeExtraLeaves, istAbgebrochen, notices, requireVisible, schliesseDialog } from "../../tools/obsidian-cdp/cdp.js";
import { createBilanz, parseArgs, runDriver } from "../../tools/obsidian-cdp/bilanz.js";
import { buildVault, requireEigenerBuild, stagingVaultDir } from "../../tools/obsidian-cdp/vault.js";
import { resolveAll } from "../src/vendor/kit/critic-markup.js";
import { applyLetterEdits, LETTER_BODY } from "./fixture-lib.js";

import { EDITOR, EINGANG, EXAMPLE, FIXTURE_DIR, KARTEN, LETTER, LETTER_COPY, PLUGIN_ID, REPO_NAME, REPO_ROOT, TABLE, bestaetige, befehl, datei, docIdAus, editorText, fixtureText, kartenIds, klickeKnopf, klickeStand, kommentiere, oeffne, oeffneAnsicht, q, setzeEditorText, setzeZurueck, sleep, standDateien, warte } from "./smoke-lib.js";

/** Soll-Liste aller Prüfpunkte (der Nenner der Bilanz). */
const PUNKTE = [
  "S1 Befehle registriert",
  "S2 Eingang festhalten: Felder und Stand-Datei",
  "S3 Änderungen markieren: drei Marken, Block, Rundlauf",
  "S4 Prüfliste zeigt drei Karten",
  "S5 Annehmen schreibt und baut neu",
  "S6 Ablehnen ohne Doppel-Leerzeichen",
  "S7 Kommentar an Änderung und Antwort im Faden",
  "S8 Erledigt klappt ein, Text bleibt",
  "S9 Stände-Tab listet Stände nach Runde",
  "S10 Diff-Modal zeigt Löschung und Einfügung",
  "S11 Wiederherstellen legt vorher einen Stand an",
  "S12 Zurückschicken zählt die Runde hoch",
  "S13 Rücklauf bietet die Übernahme an und übernimmt",
  "S14 Freigeben verweigert bei offenen Änderungen",
  "S15 Freigeben schreibt v1 und entfernt Kommentare",
  "S16 Editor-Marken tragen die Kit-Klassen und die Form",
  "S17 Lesemodus schreibt über vault.process",
  "S18 Tabellenzelle markiert, Zeilenaufbau abgelehnt",
  "S19 Einstellungen: Hilfe-Zeile zuerst, Name gespeichert",
  "S20 Stand-Datei ist als Markdown harmlos",
  "S21 Fremde Zeile in einer Stand-Datei wird gemeldet",
  "S22 Stand festhalten legt einen benannten Anker an",
  "S23 Ausschluss wird einmal angeboten",
  "S24 Metadaten-Block ist im Live Preview gefaltet",
  "S25 Fremder Faden lässt sich erledigen und wieder öffnen",
] as const;
const { record, unmeasured, abschluss } = createBilanz({ punkte: PUNKTE });

// ───────────────────────── Prüfpunkte ─────────────────────────

/** Gemeinsamer Zustand der Punkte S2–S12 (ein Brief, der durch die Runde geht). */
const lauf = { docId: "", original: "", bearbeitet: "" };

async function s1(cdp: Cdp): Promise<void> {
  const ids = await cdp.evaluate<string[]>(`return Object.keys(app.commands.commands).filter((k) => k.startsWith("diachronic:"));`);
  const soll = ["open-view", "hold-incoming", "save-stand", "mark-changes", "comment", "send", "take-over", "release", "accept-next", "reject-next"].map((x) => `diachronic:${x}`);
  const fehlt = soll.filter((id) => !ids.includes(id));
  record("S1 Befehle registriert", fehlt.length === 0, `registriert: ${ids.length}${fehlt.length ? `, fehlt: ${fehlt.join(", ")}` : ""}`);
}

async function s2(cdp: Cdp): Promise<void> {
  await oeffne(cdp, LETTER, LETTER_BODY);
  await befehl(cdp, "diachronic:hold-incoming");
  const ok = await warte(cdp, `(${EDITOR}).getValue().includes("diachronic-id:")`);
  const text = await editorText(cdp);
  lauf.docId = docIdAus(text);
  lauf.original = text;
  const dateien = lauf.docId ? await standDateien(cdp, lauf.docId) : [];
  const felder = /diachronic-round: 1\n/.test(text) && /diachronic-status: in-review\n/.test(text) && /diachronic-participants: \[Johannes\]\n/.test(text);
  record("S2 Eingang festhalten: Felder und Stand-Datei", ok && felder && dateien.length === 1 && /^r1-incoming-[0-9a-f]+\.md$/.test(dateien[0] ?? ""),
    `Kennung ${lauf.docId || "—"}, Felder ${String(felder)}, Stand-Dateien ${JSON.stringify(dateien)}, Text unverändert ab Frontmatter ${String(text.endsWith(LETTER_BODY))}`);
}

async function s3(cdp: Cdp): Promise<void> {
  const text = lauf.original;
  const body = text.slice(text.length - LETTER_BODY.length);
  lauf.bearbeitet = text.replace(body, applyLetterEdits(body));
  await setzeEditorText(cdp, lauf.bearbeitet);
  await befehl(cdp, "diachronic:mark-changes");
  const ok = await warte(cdp, `(${EDITOR}).getValue().includes("%% diachronic:begin")`);
  const nach = await editorText(cdp);
  const zone = nach.slice(nach.indexOf("%% diachronic:begin"));
  const koerper = nach.slice(0, nach.indexOf("%% diachronic:begin")).replace(/\n$/, "");
  const marken = { sub: (koerper.match(/\{~~/g) ?? []).length, ins: (koerper.match(/\{\+\+/g) ?? []).length, del: (koerper.match(/\{--/g) ?? []).length };
  const eintraege = zone.split("\n").filter((l) => l.startsWith('{"id"')).length;
  const annehmen = resolveAll(koerper, "accept") === lauf.bearbeitet;
  const ablehnen = resolveAll(koerper, "reject") === lauf.original;
  record("S3 Änderungen markieren: drei Marken, Block, Rundlauf", ok && marken.sub === 1 && marken.ins === 1 && marken.del === 1 && eintraege === 3 && annehmen && ablehnen,
    `Marken ersetzen/einfügen/löschen ${marken.sub}/${marken.ins}/${marken.del}, Einträge ${eintraege}, alle annehmen = Text ${String(annehmen)}, alle ablehnen = Eingang ${String(ablehnen)}`);
}

async function s4(cdp: Cdp): Promise<void> {
  await oeffneAnsicht(cdp, "review");
  const ok = await warte(cdp, `${KARTEN}.filter((c) => c.classList.contains("is-change")).length === 3`);
  const info = await cdp.evaluate<{ n: number; kopf: string }>(`return { n: ${KARTEN}.filter((c) => c.classList.contains("is-change")).length, kopf: (document.querySelector(".diachronic-review .okit-review-count") || {}).textContent || "" };`);
  record("S4 Prüfliste zeigt drei Karten", ok && info.n === 3 && /^3 (open changes|offene Änderungen)$/.test(info.kopf), `Karten ${info.n}, Kopfzeile „${info.kopf}“`);
}

async function s5(cdp: Cdp): Promise<void> {
  const vorher = await kartenIds(cdp);
  await klickeKnopf(cdp, ".diachronic-review .okit-review-accept", 0);
  const ok = await warte(cdp, `${KARTEN}.length === ${vorher.length - 1}`);
  const text = await editorText(cdp);
  const rest = await kartenIds(cdp);
  const zustand = /"state":"accepted"/.test(text);
  const koerperS5 = text.slice(0, text.indexOf("%% diachronic:begin"));
  record("S5 Annehmen schreibt und baut neu", ok && koerperS5.includes("wir wollen Ihnen mitteilen") && !koerperS5.includes("{~~möchten") && zustand && rest.length === vorher.length - 1,
    `Karten ${vorher.length} → ${rest.length}, Text „wir wollen Ihnen“ ${String(text.includes("wir wollen Ihnen mitteilen"))}, Eintrag accepted ${String(zustand)}`);
}

async function s6(cdp: Cdp): Promise<void> {
  const vorher = (await kartenIds(cdp)).length;
  await klickeKnopf(cdp, ".diachronic-review .okit-review-reject", 0); // die Einfügung „um 19 Uhr “
  const ok = await warte(cdp, `${KARTEN}.length === ${vorher - 1}`);
  const text = await editorText(cdp);
  const koerper = text.slice(0, text.indexOf("%% diachronic:begin"));
  record("S6 Ablehnen ohne Doppel-Leerzeichen", ok && koerper.includes("am 14. November stattfindet.") && !/ {2}/.test(koerper) && !koerper.includes("{++"),
    `Satz „am 14. November stattfindet.“ ${String(koerper.includes("am 14. November stattfindet."))}, Doppel-Leerzeichen ${String(/ {2}/.test(koerper))}`);
}

async function s7(cdp: Cdp): Promise<void> {
  await klickeKnopf(cdp, ".diachronic-review .okit-review-comment", 0); // an der Löschung
  const dialog = await kommentiere(cdp, "Ist das nötig?");
  const ok = dialog && (await warte(cdp, `(${EDITOR}).getValue().includes("{>>Johannes: Ist das nötig?<<}")`));
  const ok2 = ok && (await warte(cdp, `document.querySelector(".diachronic-review .okit-review-card.is-comment")`));
  await klickeKnopf(cdp, ".diachronic-review .okit-review-reply", 0);
  const dialog2 = await kommentiere(cdp, "Nein, weg damit.");
  const text = await warte(cdp, `(${EDITOR}).getValue().includes("{>>Johannes: Ist das nötig?<<}{>>Johannes: Nein, weg damit.<<}")`) ? await editorText(cdp) : await editorText(cdp);
  const hinterLoeschung = /\{-- dringend--\}\{>>Johannes: Ist das nötig\?<<\}/.test(text);
  record("S7 Kommentar an Änderung und Antwort im Faden", ok2 && dialog2 && hinterLoeschung && text.includes("{>>Johannes: Ist das nötig?<<}{>>Johannes: Nein, weg damit.<<}"),
    `Kommentar hinter der Marke (nicht in ihr) ${String(hinterLoeschung)}, Antwort lückenlos ${String(text.includes("{>>Johannes: Ist das nötig?<<}{>>Johannes: Nein, weg damit.<<}"))}`);
}

async function s8(cdp: Cdp): Promise<void> {
  const vorher = await editorText(cdp);
  const koerper = (t: string): string => t.slice(0, t.indexOf("%% diachronic:begin"));
  await klickeKnopf(cdp, ".diachronic-review .okit-review-resolve", 0);
  const ok = await warte(cdp, `document.querySelector(".diachronic-review .okit-review-card.is-resolved")`);
  const nach = await editorText(cdp);
  record("S8 Erledigt klappt ein, Text bleibt", ok && koerper(nach) === koerper(vorher) && /"state":"resolved"/.test(nach), `eingeklappt ${String(ok)}, Körper unverändert ${String(koerper(nach) === koerper(vorher))}, Eintrag resolved ${String(/"state":"resolved"/.test(nach))}`);
}

async function s9(cdp: Cdp): Promise<void> {
  await oeffneAnsicht(cdp, "stands");
  const ok = await warte(cdp, `document.querySelectorAll(".diachronic-stands .okit-vlist-row").length >= 1`);
  const info = await cdp.evaluate<{ zeilen: string[]; gruppen: string[] }>(`return { zeilen: Array.from(document.querySelectorAll(".diachronic-stands .okit-vlist-label")).map((e) => e.textContent), gruppen: Array.from(document.querySelectorAll(".diachronic-stands .okit-vlist-group")).map((e) => e.textContent) };`);
  record("S9 Stände-Tab listet Stände nach Runde", ok && info.gruppen.some((g) => /^(Round|Runde) 1$/.test(g)) && info.zeilen.some((z) => /(Round 1 – incoming|Runde 1 – Eingang)/.test(z)), `Zeilen ${JSON.stringify(info.zeilen)}, Gruppen ${JSON.stringify(info.gruppen)}`);
}

async function s10(cdp: Cdp): Promise<void> {
  await klickeStand(cdp, EINGANG);
  await warte(cdp, `document.querySelector(".diachronic-stands-bar button")`);
  await klickeKnopf(cdp, ".diachronic-stands-bar button", 0); // mit aktuellem Text vergleichen
  const ok = await warte(cdp, `document.querySelector(".diachronic-diff .diachronic-diff-body")`);
  const info = await cdp.evaluate<{ del: number; ins: number; titel: string }>(`const m = document.querySelector(".diachronic-diff"); return { del: m ? m.querySelectorAll("del").length : 0, ins: m ? m.querySelectorAll("ins").length : 0, titel: m ? (m.querySelector(".modal-title") || {}).textContent || "" : "" };`);
  await schliesseDialog(cdp).catch(() => undefined);
  record("S10 Diff-Modal zeigt Löschung und Einfügung", ok && info.del >= 1 && info.ins >= 1, `<del> ${info.del}, <ins> ${info.ins}, Titel „${info.titel}“`);
}

async function s11(cdp: Cdp): Promise<void> {
  const vorher = (await standDateien(cdp, lauf.docId)).length;
  await klickeStand(cdp, EINGANG);
  await warte(cdp, `document.querySelector(".diachronic-stands-bar .mod-warning")`);
  await klickeKnopf(cdp, ".diachronic-stands-bar .mod-warning", 0);
  const bestaetigt = await bestaetige(cdp);
  const ok = bestaetigt && (await warte(cdp, `!(${EDITOR}).getValue().includes("%% diachronic:begin")`));
  const nach = await standDateien(cdp, lauf.docId);
  const text = await editorText(cdp);
  const gesichert = (await Promise.all(nach.map((f) => datei(cdp, `Diachronic/${lauf.docId}/${f}`)))).some((raw) => raw !== null && raw.includes("Ist das nötig?"));
  record("S11 Wiederherstellen legt vorher einen Stand an", ok && nach.length === vorher + 2 && text === lauf.original && gesichert,
    `Stände ${vorher} → ${nach.length} (der überschriebene Text und der zurückgeholte Eingang als neue Basis), Text = Eingang ${String(text === lauf.original)}, überschriebener Stand (mit Kommentar) gesichert ${String(gesichert)}`);
}

async function s12(cdp: Cdp): Promise<void> {
  // Der Brief steht wieder auf dem Eingang; neu überarbeiten, markieren, zurückschicken. Das Teilen-Blatt gibt es hier nicht: Ersatz stillgelegt.
  await setzeEditorText(cdp, lauf.bearbeitet);
  await befehl(cdp, "diachronic:mark-changes");
  await warte(cdp, `(${EDITOR}).getValue().includes("%% diachronic:begin")`);
  await cdp.evaluate(`window.__diachronicSaved = { open: app.openWithDefaultApp, canShare: navigator.canShare, share: navigator.share }; app.openWithDefaultApp = async () => {}; navigator.canShare = () => false; return true;`);
  try {
    await befehl(cdp, "diachronic:send");
    const ok = await warte(cdp, `(${EDITOR}).getValue().includes("diachronic-round: 2")`);
    await sleep(500);
    const text = await editorText(cdp);
    const dateien = await standDateien(cdp, lauf.docId);
    const export_ = await datei(cdp, `.diachronic-export/${LETTER}`);
    record("S12 Zurückschicken zählt die Runde hoch", ok && dateien.some((f) => f.startsWith("r2-outgoing-")) && export_ !== null && export_ === text,
      `Runde 2 im Frontmatter ${String(ok)}, Ausgangsstand ${String(dateien.some((f) => f.startsWith("r2-outgoing-")))}, Export-Datei = Notiz ${String(export_ === text)}`);
  } finally {
    await cdp.evaluate(`const s = window.__diachronicSaved; if (s) { app.openWithDefaultApp = s.open; navigator.canShare = s.canShare; } delete window.__diachronicSaved; return true;`);
  }
}

async function s13(cdp: Cdp): Promise<void> {
  const gesendet = await editorText(cdp);
  const zurueck = gesendet.replace("diachronic-round: 2", "diachronic-round: 3").replace("Sehr geehrte Frau Berger,", "Sehr geehrte Frau Berger,{>>Anna: bitte auch Herrn Müller einladen<<}");
  await clearNotices(cdp);
  await cdp.evaluate(`await app.vault.create(${q(LETTER_COPY)}, ${q(zurueck)}); return true;`);
  const angeboten = await warte(cdp, `document.querySelector(".notice .diachronic-notice button")`, 10000);
  const knopf = await cdp.evaluate<string>(`const b = document.querySelector(".notice .diachronic-notice button"); return b ? b.textContent : "";`);
  if (angeboten) await cdp.evaluate(`document.querySelector(".notice .diachronic-notice button").click(); return true;`);
  const bestaetigt = angeboten && (await bestaetige(cdp));
  const ok = bestaetigt && (await warte(cdp, `(${EDITOR}).getValue().includes("{>>Anna: bitte auch Herrn Müller einladen<<}")`));
  await sleep(600);
  const kopieWeg = await cdp.evaluate<boolean>(`return app.vault.getAbstractFileByPath(${q(LETTER_COPY)}) === null;`);
  const dateien = await standDateien(cdp, lauf.docId);
  record("S13 Rücklauf bietet die Übernahme an und übernimmt", ok && /^(Take over as round 3|Als Runde 3 übernehmen)$/.test(knopf) && kopieWeg && dateien.some((f) => f.startsWith("r3-incoming-")),
    `Angebot „${knopf}“, Notiz übernommen ${String(ok)}, Kopie im Papierkorb ${String(kopieWeg)}, Eingangsstand Runde 3 ${String(dateien.some((f) => f.startsWith("r3-incoming-")))}`);
}

async function s14(cdp: Cdp): Promise<void> {
  const text = "---\ndiachronic-id: freigabeoffen\ndiachronic-round: 1\ndiachronic-status: in-review\n---\nText {++neu++} hier\n";
  await oeffne(cdp, "Freigabe offen.md", text);
  await clearNotices(cdp);
  await befehl(cdp, "diachronic:release");
  await sleep(700);
  const meldung = await notices(cdp);
  const dialog = await cdp.evaluate<boolean>(`return document.querySelector(".modal-container .modal-button-container") !== null;`);
  const nach = await editorText(cdp);
  record("S14 Freigeben verweigert bei offenen Änderungen", /(still open|noch offen)/.test(meldung) && !dialog && nach === text && !nach.includes("diachronic-version"), `Meldung „${meldung}“, Dialog ${String(dialog)}, Notiz unverändert ${String(nach === text)}`);
}

async function s15(cdp: Cdp): Promise<void> {
  const text = "---\ndiachronic-id: freigabefrei\ndiachronic-round: 1\ndiachronic-status: in-review\n---\nEin {==Satz==}{>>Johannes: ok<<} bleibt.\n";
  await oeffne(cdp, "Freigabe frei.md", text);
  await befehl(cdp, "diachronic:release");
  const bestaetigt = await bestaetige(cdp);
  const ok = bestaetigt && (await warte(cdp, `(${EDITOR}).getValue().includes("diachronic-version: v1")`));
  await sleep(500);
  const nach = await editorText(cdp);
  const dateien = await standDateien(cdp, "freigabefrei");
  record("S15 Freigeben schreibt v1 und entfernt Kommentare", ok && nach.includes("diachronic-status: released") && nach.includes("Ein Satz bleibt.") && !nach.includes("{>>") && dateien.some((f) => f.includes("-release-")) && dateien.some((f) => f.includes("-manual-")),
    `v1 ${String(ok)}, Status released ${String(nach.includes("diachronic-status: released"))}, Kommentar entfernt ${String(!nach.includes("{>>"))}, Stände ${JSON.stringify(dateien)}`);
}

async function s16(cdp: Cdp): Promise<void> {
  await oeffne(cdp, EXAMPLE, fixtureText(EXAMPLE), "source");
  const ok = await warte(cdp, `document.querySelector(".workspace-leaf.mod-active .cm-content .okit-critic-ins")`);
  const info = await cdp.evaluate<{ ins: number; del: number; hl: number; com: number; insDeko: string; delDeko: string }>(`
    const c = document.querySelector(".workspace-leaf.mod-active .cm-content");
    const n = (s) => c ? c.querySelectorAll(s).length : 0;
    const deko = (s) => { const e = c && c.querySelector(s); return e ? getComputedStyle(e).textDecorationLine : ""; };
    return { ins: n(".okit-critic-ins"), del: n(".okit-critic-del"), hl: n(".okit-critic-hl"), com: n(".okit-critic-comment"), insDeko: deko(".okit-critic-ins"), delDeko: deko(".okit-critic-del") };`);
  record("S16 Editor-Marken tragen die Kit-Klassen und die Form", ok && info.ins >= 1 && info.del >= 1 && info.hl >= 1 && info.com >= 1 && info.insDeko.includes("underline") && info.delDeko.includes("line-through"),
    `Einfügungen ${info.ins}, Löschungen ${info.del}, Hervorhebungen ${info.hl}, Kommentare ${info.com}; Einfügung „${info.insDeko}“, Löschung „${info.delDeko}“`);
}

async function s17(cdp: Cdp): Promise<void> {
  const text = fixtureText(EXAMPLE);
  await oeffne(cdp, "Lesemodus.md", text, "preview");
  const modus = await cdp.evaluate<string>(`const l = app.workspace.getMostRecentLeaf(app.workspace.rootSplit); return l && l.view && l.view.getMode ? l.view.getMode() : "";`);
  await oeffneAnsicht(cdp, "review");
  const ok = await warte(cdp, `${KARTEN}.filter((c) => c.classList.contains("is-change")).length === 3`);
  await klickeKnopf(cdp, ".diachronic-review .okit-review-accept", 0);
  const geschrieben = await warte(cdp, `${KARTEN}.filter((c) => c.classList.contains("is-change")).length === 2`);
  await sleep(500);
  const platte = (await datei(cdp, "Lesemodus.md")) ?? "";
  const koerperS17 = platte.slice(0, platte.indexOf("%% diachronic:begin"));
  const geaendert = koerperS17.includes("wir wollen Ihnen") && !koerperS17.includes("{~~möchten");
  record("S17 Lesemodus schreibt über vault.process", modus === "preview" && ok && geschrieben && geaendert, `Modus ${modus}, Karten gelesen ${String(ok)}, Datei auf der Platte geändert ${String(geaendert)}`);
}

async function s18(cdp: Cdp): Promise<void> {
  const text = fixtureText(TABLE);
  await oeffne(cdp, TABLE, text, "source");
  await befehl(cdp, "diachronic:hold-incoming");
  await warte(cdp, `(${EDITOR}).getValue().includes("diachronic-id:")`);
  const start = await editorText(cdp);
  await setzeEditorText(cdp, start.replace("| Haushalt | 19:15 | Anna |", "| Haushalt | 19:15 | Berta |"));
  await befehl(cdp, "diachronic:mark-changes");
  const zelleOk = await warte(cdp, `(${EDITOR}).getValue().includes("{~~Anna~>Berta~~}")`);
  const markiert = await editorText(cdp);
  const zeileEinzeilig = markiert.split("\n").some((l) => l.startsWith("| Haushalt") && l.includes("{~~Anna~>Berta~~}") && l.endsWith("|"));
  // Zeilenaufbau: eine neue Spalte lässt sich nicht als Marke schreiben.
  await setzeEditorText(cdp, markiert.replace("| Begrüßung | 19:00 | Johannes |", "| Begrüßung | 19:00 | Johannes | neu |"));
  await clearNotices(cdp);
  await befehl(cdp, "diachronic:mark-changes");
  await sleep(700);
  const meldung = await notices(cdp);
  const nach = await editorText(cdp);
  record("S18 Tabellenzelle markiert, Zeilenaufbau abgelehnt", zelleOk && zeileEinzeilig && /(table row|Tabellenzeile)/.test(meldung) && (nach.match(/\{\+\+/g) ?? []).length === 0,
    `Zelle markiert ${String(zelleOk)}, Zeile einzeilig ${String(zeileEinzeilig)}, Meldung „${meldung}“, keine Einfügungsmarke geschrieben ${String((nach.match(/\{\+\+/g) ?? []).length === 0)}`);
}

async function s19(cdp: Cdp): Promise<void> {
  const info = await cdp.evaluate<{ tab: boolean; erste: string; name: string }>(`
    const plugin = app.plugins.plugins[${q(PLUGIN_ID)}];
    const tab = app.setting && app.setting.pluginTabs ? app.setting.pluginTabs.find((t) => t.id === ${q(PLUGIN_ID)}) : null;
    const defs = tab && typeof tab.getSettingDefinitions === "function" ? tab.getSettingDefinitions() : [];
    return { tab: Boolean(tab), erste: defs[0] ? defs[0].name : "", name: plugin.settings.authorName };`);
  record("S19 Einstellungen: Hilfe-Zeile zuerst, Name gespeichert", info.tab && /^(Help|Hilfe)$/.test(info.erste) && info.name === "Johannes", `Tab registriert ${String(info.tab)}, erste Zeile „${info.erste}“, Name „${info.name}“`);
}

/** Gemeinsamer Zustand der Punkte S20–S22: eine Notiz, deren Text alles enthält, was Obsidian als Link, Tag, Aufgabe oder Kommentar liest. */
const harmlos = { name: "Stand harmlos.md", docId: "", stand: "" };
const HARMLOS_TEXT = "Siehe [[Anna]] und #wichtig\n\n- [ ] Aufgabe\n\n%% intern %%\n\n```\nCode\n```\n";

/** Was Obsidians Metadaten-Cache aus der Datei liest; `null`, bis die Datei indiziert ist. */
const CACHE = (pfad: string): string => `(() => { const f = app.vault.getAbstractFileByPath(${q(pfad)}); const c = f ? app.metadataCache.getFileCache(f) : null; return c ? { links: (c.links || []).length, tags: (c.tags || []).length, aufgaben: (c.listItems || []).filter((i) => i.task !== undefined).length, ueberschriften: (c.headings || []).length, frontmatter: Boolean(c.frontmatter) } : null; })()`;

async function s20(cdp: Cdp): Promise<void> {
  await oeffne(cdp, harmlos.name, HARMLOS_TEXT);
  await befehl(cdp, "diachronic:hold-incoming");
  await warte(cdp, `(${EDITOR}).getValue().includes("diachronic-id:")`);
  harmlos.docId = docIdAus(await editorText(cdp));
  const dateien = harmlos.docId ? await standDateien(cdp, harmlos.docId) : [];
  harmlos.stand = dateien[0] ? `Diachronic/${harmlos.docId}/${dateien[0]}` : "";
  // Gegenprobe: derselbe Text als gewöhnliche Notiz wird gelesen. Ohne sie wäre „keine Links im Stand“ auch ein Zeichen, dass die Suche nichts findet.
  await cdp.evaluate(`await app.vault.adapter.write("Stand harmlos Kontrolle.md", ${q(HARMLOS_TEXT)}); return true;`);
  const kontrolleDa = await warte(cdp, `${CACHE("Stand harmlos Kontrolle.md")} && ${CACHE("Stand harmlos Kontrolle.md")}.links > 0`);
  const kontrolle = await cdp.evaluate<{ links: number; tags: number; aufgaben: number } | null>(`return ${CACHE("Stand harmlos Kontrolle.md")};`);
  const standDa = harmlos.stand !== "" && (await warte(cdp, `${CACHE(harmlos.stand)}`));
  const stand = standDa ? await cdp.evaluate<{ links: number; tags: number; aufgaben: number; ueberschriften: number; frontmatter: boolean } | null>(`return ${CACHE(harmlos.stand)};`) : null;
  const roh = harmlos.stand ? ((await datei(cdp, harmlos.stand)) ?? "") : "";
  record("S20 Stand-Datei ist als Markdown harmlos",
    kontrolleDa && standDa && stand !== null && stand.links === 0 && stand.tags === 0 && stand.aufgaben === 0 && stand.ueberschriften === 0 && !stand.frontmatter && !roh.startsWith("---"),
    `Kontrolle (gewöhnliche Notiz) Links ${kontrolle?.links ?? "—"}, Tags ${kontrolle?.tags ?? "—"}, Aufgaben ${kontrolle?.aufgaben ?? "—"}; Stand-Datei ${harmlos.stand || "—"}: ${stand ? `Links ${stand.links}, Tags ${stand.tags}, Aufgaben ${stand.aufgaben}, Überschriften ${stand.ueberschriften}, Frontmatter ${String(stand.frontmatter)}` : "nicht indiziert"}`);
}

async function s21(cdp: Cdp): Promise<void> {
  if (harmlos.stand === "") throw new Error("S20 hat keine Stand-Datei hinterlassen");
  const original = (await datei(cdp, harmlos.stand)) ?? "";
  // Ein schreibendes Plugin (Linter, Templater) hängt etwas an oder setzt Frontmatter davor: hier eine fremde Zeile.
  await cdp.evaluate(`await app.vault.adapter.write(${q(harmlos.stand)}, ${q(`${original}\nvon fremder Hand ergänzt\n`)}); return true;`);
  await clearNotices(cdp);
  await oeffneAnsicht(cdp, "stands");
  const ok = await warte(cdp, `document.querySelector(".diachronic-stands .diachronic-stands-hint.mod-warning")`);
  const hinweis = await cdp.evaluate<string>(`const e = document.querySelector(".diachronic-stands .diachronic-stands-hint.mod-warning"); return e ? e.textContent : "";`);
  const reihen = await cdp.evaluate<number>(`return document.querySelectorAll(".diachronic-stands .okit-vlist-row").length;`);
  const meldung = await notices(cdp);
  // Gegenprobe: die unveränderte Datei meldet nichts.
  await cdp.evaluate(`await app.vault.adapter.write(${q(harmlos.stand)}, ${q(original)}); return true;`);
  await oeffneAnsicht(cdp, "review");
  await oeffneAnsicht(cdp, "stands");
  await sleep(500);
  const still = await cdp.evaluate<boolean>(`return document.querySelector(".diachronic-stands .diachronic-stands-hint.mod-warning") === null;`);
  record("S21 Fremde Zeile in einer Stand-Datei wird gemeldet",
    ok && /(changed from outside|von außen verändert)/.test(hinweis) && reihen >= 1 && /(changed by something other|verändert)/.test(meldung) && still,
    `Hinweis „${hinweis}“, Stand bleibt in der Liste (${reihen} Zeile(n)), Meldung „${meldung}“, unveränderte Datei ohne Hinweis ${String(still)}`);
}

async function s22(cdp: Cdp): Promise<void> {
  const vorher = await editorText(cdp);
  await befehl(cdp, "diachronic:save-stand");
  const gefragt = await kommentiere(cdp, "Vor dem Umbau");
  await sleep(500);
  const dateien = await standDateien(cdp, harmlos.docId);
  const manuell = dateien.filter((f) => f.includes("-manual-"));
  const inhalt = manuell[0] ? ((await datei(cdp, `Diachronic/${harmlos.docId}/${manuell[0]}`)) ?? "") : "";
  const nach = await editorText(cdp);
  record("S22 Stand festhalten legt einen benannten Anker an",
    gefragt && manuell.length === 1 && inhalt.includes('"name":"Vor dem Umbau"') && inhalt.includes('"anchor":true') && nach === vorher && /diachronic-round: 1\n/.test(nach),
    `Name erfragt ${String(gefragt)}, manuelle Stände ${JSON.stringify(manuell)}, Name und Anker in der Datei ${String(inhalt.includes('"name":"Vor dem Umbau"') && inhalt.includes('"anchor":true'))}, Notiz und Runde unverändert ${String(nach === vorher)}`);
}

async function s23(cdp: Cdp): Promise<void> {
  // Der Stände-Ordner wird neu angelegt: nur dann fragt das Plugin, und nur, solange es noch nicht gefragt hat.
  await cdp.evaluate(`const a = app.vault.adapter; if (await a.exists("Diachronic")) await a.rmdir("Diachronic", true); const p = app.plugins.plugins[${q(PLUGIN_ID)}]; p.settings.exclusionOffered = false; await p.saveSettings(); return true;`);
  await oeffne(cdp, "Ausschluss.md", "Ein Text.\n");
  await befehl(cdp, "diachronic:hold-incoming");
  const da = await warte(cdp, `document.querySelector(".modal-container .modal-button-container")`);
  const text = await cdp.evaluate<string>(`const m = document.querySelector(".modal-container .modal"); return m ? m.textContent : "";`);
  const knoepfe = await cdp.evaluate<string[]>(`return Array.from(document.querySelectorAll(".modal-container .modal-button-container button")).map((b) => b.textContent);`);
  const bestaetigt = await bestaetige(cdp, ".modal-container .modal-button-container .mod-cta");
  const gemerkt = await cdp.evaluate<boolean>(`return app.plugins.plugins[${q(PLUGIN_ID)}].settings.exclusionOffered === true;`);
  // Die Einstellungen öffnen in der Zweitinstanz je nach Lage in einem eigenen Fenster: gefragt wird Obsidian, welcher Tab aktiv ist.
  const einstellungen = await cdp.evaluate<boolean>(`return Boolean(app.setting && app.setting.activeTab && app.setting.activeTab.id === "file");`);
  await schliesseDialog(cdp).catch(() => undefined);
  // Zweiter Stand in neuem Ordner: keine zweite Frage.
  await cdp.evaluate(`const a = app.vault.adapter; if (await a.exists("Diachronic")) await a.rmdir("Diachronic", true); return true;`);
  await oeffne(cdp, "Ausschluss.md", "Ein Text.\n");
  await befehl(cdp, "diachronic:hold-incoming").catch(() => undefined);
  await sleep(1000);
  const nochmal = await cdp.evaluate<boolean>(`return document.querySelector(".modal-container .modal-button-container") !== null;`);
  record("S23 Ausschluss wird einmal angeboten",
    da && /Diachronic/.test(text) && /(Excluded files|Ausgeschlossene Dateien)/.test(text) && bestaetigt && gemerkt && einstellungen && !nochmal,
    `Frage erschien ${String(da)}, nennt Ordner und Einstellung ${String(/Diachronic/.test(text) && /(Excluded files|Ausgeschlossene Dateien)/.test(text))}, Knöpfe ${JSON.stringify(knoepfe)}, gemerkt ${String(gemerkt)}, Einstellungen geöffnet ${String(einstellungen)}, zweite Frage ${String(nochmal)}`);
}

/** Wechselt die Ansicht der aktiven Notiz zwischen Live Preview (`source: false`) und Quelltext (`source: true`); beides ist der Bearbeitungsmodus. */
async function stelleModus(cdp: Cdp, quelltext: boolean): Promise<void> {
  await cdp.evaluate(`const l = app.workspace.getMostRecentLeaf(app.workspace.rootSplit); await l.view.setState({ ...l.view.getState(), mode: "source", source: ${String(quelltext)} }, { history: false }); return true;`);
  await sleep(500);
}

async function s24(cdp: Cdp): Promise<void> {
  const FALTE = `document.querySelector(".workspace-leaf.mod-active .cm-content .okit-critic-fold")`;
  const ZEILE = `Array.from(document.querySelectorAll(".workspace-leaf.mod-active .cm-content .cm-line")).some((l) => (l.textContent || "").includes("diachronic:begin"))`;
  await oeffne(cdp, EXAMPLE, fixtureText(EXAMPLE), "source");
  await stelleModus(cdp, false);
  const gefaltet = await warte(cdp, FALTE);
  const zeile = await cdp.evaluate<string>(`const e = ${FALTE}; return e ? e.textContent : "";`);
  const rohSichtbar = await cdp.evaluate<boolean>(`return ${ZEILE};`);
  // Quelltext-Modus: der Block ist sichtbar und editierbar, nichts gefaltet.
  await stelleModus(cdp, true);
  const ungefaltet = await warte(cdp, `!(${FALTE}) && ${ZEILE}`);
  // Zurück in Live Preview und per Klick öffnen: der Cursor kommt in den Block, die Faltung hebt sich auf.
  await stelleModus(cdp, false);
  const wieder = await warte(cdp, FALTE);
  await cdp.evaluate(`${FALTE}.click(); return true;`);
  const geoeffnet = await warte(cdp, `!(${FALTE}) && ${ZEILE}`);
  record("S24 Metadaten-Block ist im Live Preview gefaltet",
    gefaltet && /diachronic/.test(zeile) && /(entries|Einträge)/.test(zeile) && !rohSichtbar && ungefaltet && wieder && geoeffnet,
    `Live Preview: gefaltet ${String(gefaltet)}, Zeile „${zeile}“, Rohzeile sichtbar ${String(rohSichtbar)}; Quelltext: offen und ungefaltet ${String(ungefaltet)}; zurück in Live Preview gefaltet ${String(wieder)}; Klick öffnet ${String(geoeffnet)}`);
}

async function s25(cdp: Cdp): Promise<void> {
  // Ein Faden, dessen Kommentare nur im Text stehen (von Hand gesetzt, ohne Eintrag im Metadaten-Block): einer mit Namen, einer ohne.
  const text = "---\ndiachronic-id: fremderfaden\ndiachronic-round: 3\ndiachronic-status: in-review\n---\nEin {==Satz==}{>>Berta: warum<<}{>>ohne Namen<<} bleibt.\n";
  await oeffne(cdp, "Fremder Faden.md", text);
  await oeffneAnsicht(cdp, "review");
  const karte = await warte(cdp, `${KARTEN}.filter((c) => c.classList.contains("is-comment") && !c.classList.contains("is-resolved")).length === 1`);
  const vorher = await editorText(cdp);
  const klick = await klickeKnopf(cdp, ".diachronic-review .okit-review-resolve", 0);
  const erledigt = await warte(cdp, `document.querySelector(".diachronic-review .okit-review-card.is-resolved")`);
  const nach = await editorText(cdp);
  const zeilen = nach.split("\n").filter((l) => l.startsWith('{"id"')).map((l) => JSON.parse(l) as { author: string; state: string; time: string; round: number; thread?: string });
  const koerper = (t: string): string => t.slice(0, t.indexOf("%% diachronic:begin") === -1 ? t.length : t.indexOf("%% diachronic:begin")).replace(/\n+$/, ""); // der Block hängt hinter einer Leerzeile an
  const eintraege = zeilen.length === 2 && zeilen.every((z) => z.state === "resolved" && z.round === 3 && /^20\d\d-\d\d-\d\dT/.test(z.time) && z.thread === zeilen[0]?.thread && z.thread !== undefined && !z.thread.startsWith("foreign:"));
  const autoren = zeilen.map((z) => z.author).join("|");
  // Wieder öffnen geht über den bestehenden Weg und findet den Faden an seiner neuen, festen Kennung.
  const auf = await klickeKnopf(cdp, ".diachronic-review .okit-review-reopen", 0);
  const offen = await warte(cdp, `${KARTEN}.filter((c) => c.classList.contains("is-comment") && !c.classList.contains("is-resolved")).length === 1`);
  const wieder = await editorText(cdp);
  record("S25 Fremder Faden lässt sich erledigen und wieder öffnen",
    karte && klick && erledigt && eintraege && /^Berta\|(unknown|unbekannt)$/.test(autoren) && koerper(nach) === koerper(vorher) && auf && offen && /"state":"open"/.test(wieder) && !/"state":"resolved"/.test(wieder),
    `Karte offen ${String(karte)}, erledigt ${String(erledigt)}, Einträge ${zeilen.length} (Autoren ${autoren}, alle resolved/Runde 3/Zeit gesetzt/feste Fadenkennung ${String(eintraege)}), Körper unverändert ${String(koerper(nach) === koerper(vorher))}; wieder geöffnet ${String(offen)}`);
}

// ───────────────────────── main ─────────────────────────

function setupVault(): void {
  const vaultDir = stagingVaultDir(REPO_NAME);
  const log = buildVault({ repoRoot: REPO_ROOT, vaultDir, fixtureDir: FIXTURE_DIR, pluginId: PLUGIN_ID });
  console.log(`Staging-Vault gebaut: ${vaultDir}`);
  for (const l of log) console.log(`  · ${l}`);
  const quelle = join(FIXTURE_DIR, "plugin-data.json");
  if (existsSync(quelle)) {
    copyFileSync(quelle, join(vaultDir, ".obsidian", "plugins", PLUGIN_ID, "data.json"));
    console.log("  · Plugin-Einstellungen aus fixtures/vault/plugin-data.json gesetzt");
  }
  console.log("\nDen Vault in der Zweitinstanz registrieren (Rezept im Dateikopf) und dann:\n  npm run smoke:gui -- --port 9371");
}

/** Eine Gruppe von Prüfpunkten: wirft sie, werden ihre noch fehlenden Punkte als „nichts gemessen“ geführt, und der Lauf geht weiter. */
async function gruppe(namen: ReadonlyArray<(typeof PUNKTE)[number]>, fn: () => Promise<void>): Promise<void> {
  try { await fn(); } catch (e) {
    const msg = (e as Error).message;
    console.log(`  ! Gruppe ${namen.map((n) => n.split(" ")[0]).join("/")} abgebrochen: ${msg}`);
    for (const n of namen) unmeasured(n, `Gruppe abgebrochen: ${msg}`);
  }
}

function portAus(args: ReturnType<typeof parseArgs>): number {
  const raw = args.value("port");
  const n = Number(raw);
  if (raw === undefined || !Number.isInteger(n) || n < 1024 || n > 65535) throw new Error(`--port <Zahl> fehlt oder ist ungültig (${JSON.stringify(raw)}). Den Port der eigenen Zweitinstanz angeben (Rezept im Dateikopf).`);
  return n;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("setup")) { setupVault(); return; }
  const port = portAus(args);
  const vaultFilter = args.value("vault") ?? REPO_NAME;
  const fehler: string[] = [];
  const warnungen: string[] = [];
  let cdp: Cdp | null = null;
  let zustand: ReturnType<typeof beimAbbruch> | null = null;
  try {
    cdp = await attachTo("workspace", port, vaultFilter);
    if (!cdp) throw new Error(`Kein Obsidian-Fenster für Vault "${vaultFilter}" auf Port ${port}.`);
    const c = cdp;
    await c.mitschnitt((z) => { if (/EXCEPTION/.test(z)) warnungen.push(`Renderer: ${z}`); });
    await requireVisible(c);
    const v = await c.evaluate<{ name: string; basePath: string; configDir: string }>(`return { name: app.vault.getName(), basePath: app.vault.adapter.basePath, configDir: app.vault.configDir };`);
    console.log(`Vault: ${v.name} (${v.basePath})`);
    const herkunft = requireEigenerBuild(join(v.basePath, v.configDir, "plugins", PLUGIN_ID, "main.js"), join(REPO_ROOT, "main.js"), (m) => warnungen.push(m));
    if (herkunft.art === "ungeklaert") throw new Error("Herkunft des Builds im Vault ungeklärt — ein Lauf gegen unbelegten Stand misst möglicherweise fremden Code.");
    const instanz = await bereiteInstanzVor(c, { pluginIds: [PLUGIN_ID], nurVault: REPO_NAME, sprache: "en" });
    const geladen = (await c.evaluate<{ g: boolean }>(`return { g: Boolean(app.plugins.plugins[${q(PLUGIN_ID)}]) };`)).g;
    if (!geladen) throw new Error(`Plugin ${PLUGIN_ID} lädt nicht (Vault ${v.name}) — ${instanz.hinweis}. Ohne es ist jeder Punkt gegenstandslos.`);
    console.log(`Plugin geladen — ${instanz.hinweis}`);
    zustand = beimAbbruch(() => setzeZurueck(c), "Fixture-Notizen, Stände und Einstellungen zurück");
    await setzeZurueck(c);

    await gruppe(["S1 Befehle registriert"], () => s1(c));
    await gruppe(["S2 Eingang festhalten: Felder und Stand-Datei", "S3 Änderungen markieren: drei Marken, Block, Rundlauf"], async () => { await s2(c); await s3(c); });
    await gruppe(["S4 Prüfliste zeigt drei Karten", "S5 Annehmen schreibt und baut neu", "S6 Ablehnen ohne Doppel-Leerzeichen", "S7 Kommentar an Änderung und Antwort im Faden", "S8 Erledigt klappt ein, Text bleibt"], async () => {
      await s4(c); await s5(c); await s6(c); await s7(c); await s8(c);
    });
    await gruppe(["S9 Stände-Tab listet Stände nach Runde", "S10 Diff-Modal zeigt Löschung und Einfügung", "S11 Wiederherstellen legt vorher einen Stand an", "S12 Zurückschicken zählt die Runde hoch", "S13 Rücklauf bietet die Übernahme an und übernimmt"], async () => {
      await s9(c); await s10(c); await s11(c); await s12(c); await s13(c);
    });
    await gruppe(["S14 Freigeben verweigert bei offenen Änderungen"], () => s14(c));
    await gruppe(["S15 Freigeben schreibt v1 und entfernt Kommentare"], () => s15(c));
    await gruppe(["S16 Editor-Marken tragen die Kit-Klassen und die Form"], () => s16(c));
    await gruppe(["S17 Lesemodus schreibt über vault.process"], () => s17(c));
    await gruppe(["S18 Tabellenzelle markiert, Zeilenaufbau abgelehnt"], () => s18(c));
    await gruppe(["S19 Einstellungen: Hilfe-Zeile zuerst, Name gespeichert"], () => s19(c));
    await gruppe(["S20 Stand-Datei ist als Markdown harmlos", "S21 Fremde Zeile in einer Stand-Datei wird gemeldet", "S22 Stand festhalten legt einen benannten Anker an"], async () => { await s20(c); await s21(c); await s22(c); });
    await gruppe(["S23 Ausschluss wird einmal angeboten"], () => s23(c));
    await gruppe(["S24 Metadaten-Block ist im Live Preview gefaltet"], () => s24(c));
    await gruppe(["S25 Fremder Faden lässt sich erledigen und wieder öffnen"], () => s25(c));
  } catch (e) {
    fehler.push((e as Error).message);
    console.error(`\nABBRUCH: ${(e as Error).message}`);
  } finally {
    await zustand?.schliesse();
    if (istAbgebrochen()) return; // nach Ctrl-C druckt und beendet das Abbruch-Modul
    if (cdp) {
      const n = await closeExtraLeaves(cdp).catch(() => 0);
      console.log(`\nAufgeräumt: ${n} Leaves offen. Notices: ${await notices(cdp).catch(() => "?")}`);
      cdp.close();
    }
    abschluss();
    for (const w of warnungen) console.log(`WARNUNG: ${w}`);
    if (fehler.length) process.exitCode = 2;
  }
}

runDriver(main);
