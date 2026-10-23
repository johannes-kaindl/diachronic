/**
 * Erzeugt die getrackten Beispiel-Notizen und Stände unter `fixtures/vault/notes/` aus dem Plugin-Kern (nie von Hand).
 * `npm run fixture` schreibt: `Brief an Frau Berger.md` (ohne Kennung, Ausgangslage des Smokes), `Einladung mit Tabelle.md`,
 * und einen Beispielordner `Diachronic-Beispiel/` (ein Brief mit Vorschlägen und einem Kommentar, im Zustand „abgeschickt“,
 * dazu die zurückgekommene Datei einer Kollegin) samt Ständen in `Diachronic/beispiel/`.
 *
 * Die Namen der Stände sind englisch (die Bilder und die englische README brauchen das). Für Pallas oder einen anderen deutschen
 * Vault: `npm run fixture -- --lang de --out <Ordner>` schreibt dieselben Dateien mit deutschen Standnamen in einen anderen Ordner;
 * der getrackte Stand unter `fixtures/` bleibt unberührt.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cwd } from "node:process";
import { readDocMeta } from "../src/core/doc-meta.js";
import { prepareSend } from "../src/core/exchange.js";
import { markRound, startDocument } from "../src/core/marking.js";
import { splitDoc } from "../src/core/meta-zone.js";
import { addComment, reply } from "../src/core/review.js";
import { renderStandFile } from "../src/core/stand-file.js";
import { standId } from "../src/core/stand-plan.js";
import { STAND_EXT } from "../src/core/types.js";
import { addStand, type StoredStand } from "../src/vendor/kit/version-chain.js";
import { writeDocMeta } from "../src/core/doc-meta.js";
import { LETTER_BODY, TABLE_BODY, applyLetterEdits } from "./fixture-lib.js";

const argv = process.argv.slice(2);
const option = (name: string): string | undefined => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const LANG = option("lang") ?? "en";
if (LANG !== "en" && LANG !== "de") throw new Error(`--lang: "en" oder "de", nicht ${JSON.stringify(LANG)}`);
const OUT = option("out");
const NOTES = OUT ? resolve(OUT) : join(cwd(), "fixtures/vault/notes");
const NAMES = {
  en: { incoming: "Round 1 – incoming", outgoing: "Round 2 – outgoing" },
  de: { incoming: "Runde 1 – Eingang", outgoing: "Runde 2 – Ausgang" },
}[LANG];
const ID = "beispiel";
const T1 = "2026-10-19T09:00:00Z";
const T2 = "2026-10-19T09:30:00Z";
const T3 = "2026-10-20T08:15:00Z";

function must<T>(r: { ok: true } & T | { ok: false; reason?: string }): T {
  if (!r.ok) throw new Error(`Fixture: ${(r as { reason?: string }).reason ?? "fehlgeschlagen"}`);
  return r;
}
const seq = (p: string): (() => string) => { let n = 0; return () => `${p}${++n}`; };

rmSync(join(NOTES, "Diachronic"), { recursive: true, force: true });
rmSync(join(NOTES, "Diachronic-Beispiel"), { recursive: true, force: true });
mkdirSync(join(NOTES, "Diachronic-Beispiel"), { recursive: true });
mkdirSync(join(NOTES, "Diachronic", ID), { recursive: true });

writeFileSync(join(NOTES, "Brief an Frau Berger.md"), LETTER_BODY);
writeFileSync(join(NOTES, "Einladung mit Tabelle.md"), TABLE_BODY);

// Beispielbrief: Eingang festhalten, überarbeiten, markieren, kommentieren, zurückschicken.
const started = must(startDocument(LETTER_BODY, { id: ID, version: null, participants: [], author: "Johannes" })).content;
const baseBody = splitDoc(started);
if (!baseBody.ok) throw new Error("Fixture: Eingang unlesbar");
const edited = started.replace(baseBody.parts.body, applyLetterEdits(baseBody.parts.body));
const marked = markRound({ text: edited, baseBody: baseBody.parts.body, author: "Johannes", time: T2, round: 1, newId: seq("v") });
if (!marked.ok) throw new Error(`Fixture: Markieren ${marked.reason}`);
const at = marked.text.indexOf("bis zum 7. November");
const commented = addComment(marked.text, { start: at, end: at + "bis zum 7. November".length }, { author: "Johannes", time: T2, round: 1, body: "Frist noch mit Frau Berger abstimmen?", newId: seq("k") });
if (!commented.ok) throw new Error(`Fixture: Kommentar ${commented.reason}`);
const meta1 = readDocMeta(commented.text);
if (!meta1) throw new Error("Fixture: Kennung fehlt");
const sent = prepareSend(commented.text, meta1, "Johannes");
if (!sent.ok) throw new Error(`Fixture: Zurückschicken ${sent.reason}`);
writeFileSync(join(NOTES, "Diachronic-Beispiel", "Beispielbrief.md"), sent.text);

// Die zurückgekommene Datei: Annas Antwort im Faden, Runde 3.
const threadId = (() => { const s = splitDoc(sent.text); if (!s.ok) throw new Error("Fixture"); return s.parts.entries.find((e) => e.kind === "comment")?.thread ?? ""; })();
const answered = reply(sent.text, threadId, { author: "Anna", time: T3, round: 3, body: "Bis zum 10. November geht auch.", newId: seq("a") });
if (!answered.ok) throw new Error(`Fixture: Antwort ${answered.reason}`);
const back = must(writeDocMeta(answered.text, { ...sent.meta, round: 3, participants: [...sent.meta.participants, "Anna"] })).content;
writeFileSync(join(NOTES, "Diachronic-Beispiel", "Beispielbrief (1).md"), back);

// Stände: Eingang der Runde 1, Ausgang der Runde 2 (beide Anker, vollständig).
let chain: StoredStand[] = [];
const stands: Array<{ reason: "incoming" | "outgoing"; round: number; time: string; text: string; name: string }> = [
  { reason: "incoming", round: 1, time: T1, text: started, name: NAMES.incoming },
  { reason: "outgoing", round: 2, time: T3.replace("08:15", "07:50"), text: sent.text, name: NAMES.outgoing },
];
for (const s of stands) {
  const r = addStand(chain, s.text, { id: standId(s.reason, s.round, `fix${s.round}`), docId: ID, time: s.time, author: "Johannes", name: s.name, anchor: true });
  chain = r.chain;
  for (const w of r.write) writeFileSync(join(NOTES, "Diachronic", ID, `${w.meta.id}.${STAND_EXT}`), renderStandFile(w));
}
console.log(`Fixture geschrieben: ${marked.added.length} Marken, Kommentar-Faden ${threadId}, ${chain.length} Stände.`);
