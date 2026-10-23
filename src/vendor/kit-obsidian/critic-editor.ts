// vendored from obsidian-kit@0.66.2, src/obsidian/critic-editor.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/**
 * CriticMarkup im Editor dekorieren: die Marken `{++neu++}`, `{--alt--}`, `{~~alt~>neu~~}`, `{==Abschnitt==}` und `{>>Kommentar<<}` bekommen in
 * Live Preview Klassen (Einfügung unterstrichen, Löschung durchgestrichen, Kommentar gedämpft, Begrenzer blass). Das **erste CodeMirror-6-Modul
 * des Kits**; gebaut für Diachronic, brauchbar für jeden künftigen Nutzer von CriticMarkup (Prüf-Varianten B und C, Spec § 3).
 *
 * ## Nicht im Barrel — direkt importieren
 *
 * Dieses Modul steht **nicht** in `src/obsidian/index.ts`. Wer es nicht vendort, bekommt keinen Import von `@codemirror/*` (Vendoring geht je
 * Datei); ein Konsument ohne Editor-Bedarf sieht von diesem Modul nichts, sein Build bleibt byte-gleich. Wer es braucht, vendort
 * `critic-editor.ts` und importiert es direkt.
 *
 * ## Voraussetzung im Konsumenten: `@codemirror/*` extern
 *
 * Obsidian liefert `@codemirror/state` und `@codemirror/view` zur Laufzeit. Der Konsument führt sie in seiner esbuild-Konfiguration als
 * `external` (ghostline `esbuild.config.mjs:7`: `external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view", "node:*"]`).
 * Bündelte er sie mit, entstünden zur Laufzeit zwei Instanzen von `@codemirror/state`, und `instanceof`-Prüfungen schlügen ohne Typfehler fehl.
 * Dieses Repo pinnt beide Pakete **exakt** als devDependencies (Typprüfung und Tests); ein Konsument pinnt dieselben Versionen wie das
 * `obsidian`-Paket, gegen das er baut (`peerDependencies` von `obsidian`, ghostline: `package.json:36-37`).
 *
 * ## Verhalten
 *
 * - **Ein `StateField`** hält die Marken und ihre `DecorationSet`. Es wird bei **jeder Dokumentänderung aus `parseCritic` neu berechnet**, nicht
 *   mitgeschoben: Tippt jemand ein fehlendes `}` dazu, entsteht die Dekoration, löscht jemand es, verschwindet sie. Eine Verschiebung
 *   (Text davor) ändert nur die Stellen, nicht das Ergebnis. Die Rechnung ist linear im Text (`parseCritic`).
 * - **Klassen:** Einfügungsinhalt `okit-critic-ins`; Löschungsinhalt `okit-critic-del`; Ersetzung: alt `okit-critic-del`, neu `okit-critic-ins`;
 *   hervorgehobener Abschnitt `okit-critic-hl`; Kommentarinhalt `okit-critic-comment`; die Begrenzer (`{++`, `++}`, `~>` …) `okit-critic-delim`.
 * - **Keine Null-Längen-Marken** (CM6 weist sie ab; neurovim `diffHighlight.ts` überspringt leere Zeilen aus demselben Grund): ein leerer Inhalt
 *   (`{++++}`) hat keine Inhalts-, nur Begrenzer-Dekoration. **Ein ungeschlossener Öffner** (`parseCritic` meldet ihn in `unclosed`) wird nicht dekoriert.
 *   Code, Codeblöcke und Frontmatter überspringt `parseCritic`.
 * - **`colorByAuthor`** (Funktion, wird bei jeder Neuberechnung gelesen) und **`authorSlot`**: ist `colorByAuthor()` wahr und liefert `authorSlot(mark)`
 *   einen Platz 0–5, tragen Einfügung und Löschung der Marke `data-author="<Platz>"`. Ändert sich die Einstellung, ruft der Aufrufer
 *   `view.dispatch({ effects: criticRefresh.of(null) })`; ohne Dokumentänderung rechnet das Feld sonst nicht neu.
 * - **Klick:** nur mit `onMarkClick` registriert die Erweiterung einen Handler (`EditorView.domEventHandlers`, `posAtCoords`). Er meldet die Marke
 *   unter dem Klick (halboffen, `start ≤ Position < end`) und lässt das Ereignis weiterlaufen (Cursor setzen bleibt möglich).
 *
 * ## Falten (seit 0.65.0, Option `foldZones`)
 *
 * Ein Plugin, das einen verwalteten Block in die Notiz schreibt (Diachronic: `%% diachronic:begin … diachronic:end %%`, eine JSON-Zeile je Eintrag),
 * zeigt dem Leser im Live Preview lange graue Rohzeilen. `foldZones: [{ markers, summary, label? }]` ersetzt jeden solchen Block durch **eine**
 * gedämpfte Zeile (`okit-critic-fold`, Block-Ersatz per `Decoration.replace`); die Marken sind Parameter, das Modul kennt Diachronic nicht. Gefunden
 * wird der Block mit `splitZone` aus code-kit `marker-zone`.
 *
 * - **Gefaltet wird nur, was eindeutig ist:** Anfang und Ende da, kein zitierter Marker (`strayEnds`, `nestedBegins`), und der Block beginnt und endet
 *   auf einer eigenen Zeile. Sonst bleibt der Rohtext stehen, weil die Faltung Text des Nutzers von derselben Zeile mitrisse.
 * - **Berührt die Auswahl den Block, ist er offen** (Anfang, Ende oder innen) und faltet sich wieder, wenn sie geht. Die Zeile selbst öffnet per
 *   Klick, Enter oder Leertaste (Cursor an den Blockanfang). Pfeiltasten, die auf den Block laufen, öffnen ihn ebenso — er ist nicht „atomar“.
 * - **`foldActive(state)`** schaltet das Falten ab, **der Aufrufer reicht Live Preview durch** (`state.field(editorLivePreviewField)`): im Quelltext-Modus
 *   soll der Block sichtbar und editierbar sein. **Das Feld liest `foldActive` bei jeder Transaktion und rechnet neu, sobald sich das Ergebnis ändert** (seit
 *   0.66.2): ein Wechsel zwischen Live Preview und Quelltext braucht keinen `criticRefresh` und keinen eigenen Listener im Konsumenten. Wirft `foldActive`,
 *   gilt „aus“. `criticRefresh` bleibt für alles, was das Feld nicht selbst sieht (ein Wert außerhalb des Zustands, den `foldActive` oder `summary` liest).
 * - **Der Inhalt der Zeile ist `summary(block)`**, eine reine Funktion des Consumers (er kennt das Format); sie kommt per `textContent` ins DOM.
 *   `label` ist Name und Tooltip für „Aufklappen“, vom Consumer übersetzt.
 * - Die Faltung ist nur Anzeige; das Dokument ändert sie nie.
 *
 * ## Vorbilder (gelesen, nicht kopiert)
 *
 * ghostline `src/editor/ghost-field.ts` (StateField, Widget, Eigen-Annotation — hier nicht nötig, das Modul schreibt nie ins Dokument) und
 * neurovim-obsidian `src/diffHighlight.ts` (StateField mit `DecorationSet`, `RangeSetBuilder`, keine Null-Längen-Marken). Beide bauen eigene
 * Muster; dieses ist die dritte Fassung, deshalb im Kit: der Unterschied zu neurovim ist der Rechenweg (dort setzt ein Effekt die Zeilen, hier
 * leitet das Feld sie aus dem Text ab), der zu ghostline die Form (Marken statt Widget).
 *
 * ## Fallen beim Übernehmen
 *
 * 1. **Das Kit injiziert kein CSS.** `CRITIC_EDITOR_CSS` gehört in die `styles.css` des Consumers.
 * 2. **Die Dekoration ist nur Anzeige.** Sie ändert das Dokument nie; Annehmen und Ablehnen laufen über `code-kit` `resolveMarks`.
 * 3. **Nichts davon läuft in der Leseansicht**, nur im Editor; was die Leseansicht aus Marken macht, entscheidet der Konsument.
 */

import { Facet, StateEffect, StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { parseCritic, type CriticMark } from "../kit/critic-markup";
import { splitZone, type ZoneMarkers } from "../kit/marker-zone";

/** Ein Block, den ein Plugin verwaltet (zwischen zwei Marken, `splitZone` aus code-kit `marker-zone`), und der im Editor auf eine Zeile gefaltet wird. */
export interface FoldZone {
  /** Die Marken des Blocks, genau wie `splitZone` sie liest (z. B. `%% diachronic:begin` / `diachronic:end %%`). */
  markers: ZoneMarkers;
  /** Die gedämpfte Zeile, die den Block ersetzt. Bekommt den Inhalt ohne Marken; kommt per `textContent` ins DOM, nie als HTML. */
  summary: (block: string) => string;
  /** Name und Tooltip der Zeile („Metadaten-Block aufklappen“). Das Kit schreibt keine Sprache fest (UI-STANDARD §10); ohne Angabe die Zeile selbst. */
  label?: string;
}

export interface CriticEditorOptions {
  /** Wird bei einem Klick in eine Marke gerufen; das Plugin öffnet die zugehörige Karte. */
  onMarkClick?: (mark: CriticMark) => void;
  /** Autoren-Platz 0–5 einer Marke oder `undefined`; nur wirksam, wenn `colorByAuthor()` wahr ist. */
  authorSlot?: (mark: CriticMark) => number | undefined;
  colorByAuthor?: () => boolean;
  /** Blöcke, die im Editor auf eine gedämpfte Zeile gefaltet werden (s. Dateikopf, „Falten“). Ohne Angabe faltet nichts. */
  foldZones?: readonly FoldZone[];
  /** Ob gefaltet wird; wird bei jeder Transaktion gelesen, ein geändertes Ergebnis rechnet das Falten neu. Default immer. **Der Aufrufer reicht hier
   *  Live Preview durch** (`(state) => state.field(editorLivePreviewField)`): im Quelltext-Modus will man den Block sehen und ändern. Ein
   *  Moduswechsel braucht seit 0.66.2 keinen `criticRefresh` mehr. Wirft die Funktion, gilt „aus“. */
  foldActive?: (state: EditorState) => boolean;
}

/** Zwingt das Feld zur Neuberechnung ohne Dokumentänderung (etwa nach dem Umschalten von „Farbe je Autor“). */
export const criticRefresh = StateEffect.define<null>();

const AUTHOR_SLOTS = 6;

const optionsFacet = Facet.define<CriticEditorOptions, CriticEditorOptions>({ combine: (all) => all[0] ?? {} });

interface CriticState { marks: CriticMark[]; deco: DecorationSet }

function build(state: EditorState): CriticState {
  const text = state.doc.toString();
  const { marks } = parseCritic(text);
  const opts = state.facet(optionsFacet);
  const byAuthor = opts.colorByAuthor?.() === true;
  const ranges: Array<Range<Decoration>> = [];
  const add = (from: number, to: number, cls: string, mark?: CriticMark): void => {
    if (to <= from) return;
    const slot = byAuthor && mark !== undefined && (cls === "okit-critic-ins" || cls === "okit-critic-del") ? opts.authorSlot?.(mark) : undefined;
    const spec = slot !== undefined && Number.isInteger(slot) && slot >= 0 && slot < AUTHOR_SLOTS
      ? { class: cls, attributes: { "data-author": String(slot) } }
      : { class: cls };
    ranges.push(Decoration.mark(spec).range(from, to));
  };
  for (const mark of marks) {
    add(mark.start, mark.contentStart, "okit-critic-delim");
    switch (mark.kind) {
      case "insertion": add(mark.contentStart, mark.contentEnd, "okit-critic-ins", mark); break;
      case "deletion": add(mark.contentStart, mark.contentEnd, "okit-critic-del", mark); break;
      case "highlight": add(mark.contentStart, mark.contentEnd, "okit-critic-hl"); break;
      case "comment": add(mark.contentStart, mark.contentEnd, "okit-critic-comment"); break;
      case "substitution": {
        // Der Inhalt ist alt + "~>" + neu; `mark.text` ist der alte Text, der Trenner steht gleich dahinter.
        const sep = mark.contentStart + mark.text.length;
        add(mark.contentStart, sep, "okit-critic-del", mark);
        add(sep, sep + 2, "okit-critic-delim");
        add(sep + 2, mark.contentEnd, "okit-critic-ins", mark);
        break;
      }
    }
    add(mark.contentEnd, mark.end, "okit-critic-delim");
  }
  return { marks, deco: Decoration.set(ranges, true) };
}

/** Die Zeile, die einen gefalteten Block ersetzt. Ein Klick oder Enter/Leertaste setzt den Cursor an den Anfang des Blocks — der berührt ihn
 *  damit, und die Faltung hebt sich auf (Live-Preview-Muster: Syntax, an der der Cursor steht, ist sichtbar). */
class FoldWidget extends WidgetType {
  constructor(private readonly text: string, private readonly label: string, private readonly pos: number) { super(); }
  override eq(other: FoldWidget): boolean { return other.text === this.text && other.label === this.label && other.pos === this.pos; }
  override toDOM(view: EditorView): HTMLElement {
    // Obsidians globales `createDiv` (nicht `document.createElement`, Regel `prefer-create-el`). Das lose Element übernimmt CodeMirror beim
    // Einhängen in das Dokument der Ansicht, auch in einem Popout-Fenster.
    const el = createDiv({
      cls: "okit-critic-fold", text: this.text,
      attr: { role: "button", tabindex: "0", "aria-label": this.label, title: this.label },
    });
    const open = (): void => { view.dispatch({ selection: { anchor: this.pos } }); view.focus(); };
    el.addEventListener("click", (e: Event) => { e.preventDefault(); open(); });
    el.addEventListener("keydown", (e: Event) => {
      const key = (e as KeyboardEvent).key;
      if (key !== "Enter" && key !== " ") return;
      e.preventDefault();
      open();
    });
    return el;
  }
  // Klicks und Tasten gehören dem Widget, nicht dem Editor darunter.
  override ignoreEvent(): boolean { return true; }
}

/** Das Widget für einen gefalteten Block, getrennt herausgereicht, damit ein Test es ohne Editor-DOM mit einer Ansicht-Attrappe baut. */
export function criticFoldWidget(text: string, label: string, pos: number): WidgetType {
  return new FoldWidget(text, label, pos);
}

interface FoldRange { from: number; to: number; text: string; label: string }

/** Ob gefaltet wird: `foldActive(state)`, ohne Angabe immer. **Wirft `foldActive` (etwa weil das Feld, das es liest, im Zustand fehlt), gilt „aus“:**
 *  ein Fehler in einem Feld-Update risse den ganzen Editor, ein ungefalteter Block ist der sichere Ausfall. */
function foldIsActive(state: EditorState): boolean {
  const f = state.facet(optionsFacet).foldActive;
  if (f === undefined) return true;
  try { return f(state); } catch { return false; }
}

/** Die Blöcke, die JETZT gefaltet sind. Gefaltet wird nur, was eindeutig ist: ein Block mit Anfang und Ende, ohne zitierten Marker, der auf einer
 *  eigenen Zeile beginnt und endet (sonst risse die Faltung Text des Nutzers von derselben Zeile mit). Berührt die Auswahl den Block, bleibt er offen. */
function foldRanges(state: EditorState): FoldRange[] {
  const opts = state.facet(optionsFacet);
  const zones = opts.foldZones;
  if (zones === undefined || zones.length === 0 || !foldIsActive(state)) return [];
  const text = state.doc.toString();
  const out: FoldRange[] = [];
  for (const zone of zones) {
    const z = splitZone(text, zone.markers);
    if (z.kind !== "zone" || z.strayEnds > 0 || z.nestedBegins > 0) continue;
    const from = z.before.length;
    const to = text.length - z.after.length;
    if (from > 0 && text[from - 1] !== "\n") continue;
    if (to < text.length && text[to] !== "\n" && text[to] !== "\r") continue;
    if (state.selection.ranges.some((r) => r.from <= to && r.to >= from)) continue;
    const summary = zone.summary(z.block);
    out.push({ from, to, text: summary, label: zone.label ?? summary });
  }
  return out.sort((a, b) => a.from - b.from);
}

interface FoldState { ranges: FoldRange[]; deco: DecorationSet; active: boolean }

const foldField = StateField.define<FoldState>({
  create: (state) => buildFold(state),
  update(value, tr) {
    // `foldIsActive` wird bei JEDER Transaktion gelesen: ein Wechsel zwischen Live Preview und Quelltext ändert weder Dokument noch Auswahl, und ein
    // Feld, das nur darauf antwortet, bliebe im falschen Modus stehen (gemessen von diac-w25). Die Prüfung ist ein Feldzugriff, kein Neubau.
    if (tr.docChanged || tr.selection !== undefined || tr.effects.some((e) => e.is(criticRefresh)) || foldIsActive(tr.state) !== value.active) return buildFold(tr.state);
    return value;
  },
  // Ein Block-Ersatz kommt aus dem Feld, nie aus einem Plugin (CM6 verlangt es so).
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
});

function buildFold(state: EditorState): FoldState {
  const ranges = foldRanges(state);
  const deco = Decoration.set(ranges.map((r) => Decoration.replace({ widget: new FoldWidget(r.text, r.label, r.from), block: true }).range(r.from, r.to)), true);
  return { ranges, deco, active: foldIsActive(state) };
}

/** Welche Blöcke gerade gefaltet sind (Bereich und angezeigte Zeile). Für Tests und für Aufrufer, die die Bereiche brauchen. */
export function criticFoldRanges(state: EditorState): Array<{ from: number; to: number; text: string }> {
  return (state.field(foldField, false)?.ranges ?? []).map(({ from, to, text }) => ({ from, to, text }));
}

const criticField = StateField.define<CriticState>({
  create: (state) => build(state),
  update(value, tr) {
    if (tr.docChanged || tr.effects.some((e) => e.is(criticRefresh))) return build(tr.state);
    return value;
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
});

/** Die Marke, in der die Position liegt (halboffen: `start ≤ pos < end`), sonst `null`. */
export function criticMarkAt(state: EditorState, pos: number): CriticMark | null {
  return state.field(criticField).marks.find((m) => pos >= m.start && pos < m.end) ?? null;
}

/** Der Klick-Handler der Erweiterung, getrennt herausgereicht, damit ein Test ihn ohne DOM mit einer Ansicht-Attrappe ruft. Gibt immer `false` zurück. */
export function criticClickHandler(onMarkClick: (mark: CriticMark) => void): (event: MouseEvent, view: EditorView) => boolean {
  return (event, view) => {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;
    const mark = criticMarkAt(view.state, pos);
    if (mark) onMarkClick(mark);
    return false;
  };
}

/** Die Erweiterung für den Editor eines Plugins (`registerEditorExtension`). Ohne `onMarkClick` registriert sie keinen Klick-Handler. */
export function criticEditorExtension(opts: CriticEditorOptions = {}): Extension {
  const parts: Extension[] = [optionsFacet.of(opts), criticField];
  if (opts.foldZones !== undefined && opts.foldZones.length > 0) parts.push(foldField);
  if (opts.onMarkClick) parts.push(EditorView.domEventHandlers({ click: criticClickHandler(opts.onMarkClick) }));
  return parts;
}

/** Was das Feld dekoriert: Bereiche mit Klasse (und Autoren-Platz, falls gesetzt) in Textreihenfolge. Für Tests und für Aufrufer, die die Bereiche brauchen. */
export function criticDecorationRanges(state: EditorState): Array<{ from: number; to: number; cls: string; author?: number }> {
  const out: Array<{ from: number; to: number; cls: string; author?: number }> = [];
  state.field(criticField).deco.between(0, state.doc.length, (from, to, value) => {
    const spec = value.spec as { class: string; attributes?: Record<string, string> };
    const slot = spec.attributes?.["data-author"];
    out.push(slot === undefined ? { from, to, cls: spec.class } : { from, to, cls: spec.class, author: Number(slot) });
  });
  return out;
}

/** Gehört in die `styles.css` des Consumers — das Kit injiziert kein CSS. Nur Theme-Variablen; die Art trägt die Form, nicht die Farbe. */
export const CRITIC_EDITOR_CSS = `
.okit-critic-ins {
  text-decoration: underline;
  color: var(--color-blue);
}

.okit-critic-del {
  text-decoration: line-through;
  color: var(--color-orange);
}

.okit-critic-hl {
  background-color: var(--text-highlight-bg);
}

.okit-critic-comment {
  color: var(--text-muted);
  font-style: italic;
}

.okit-critic-delim {
  color: var(--text-faint);
}

/* Der gefaltete Block: eine gedämpfte Zeile statt langer Rohzeilen. Der Pfeil in der Zeile ist der zweite Kanal neben der Farbe. Die Zeile ist ein
   Klickziel und trägt --text-muted: --text-faint hatte im hellen Theme 2,27:1 (gemessen 2026-10-23), gefordert sind 4,5:1 (WCAG AA). */
.okit-critic-fold {
  display: block; padding: var(--size-2-1) 0;
  color: var(--text-muted); font-size: var(--font-smaller);
  border-radius: var(--radius-s); cursor: var(--cursor);
}
.okit-critic-fold:hover { background: var(--background-modifier-hover); color: var(--text-normal); }
.okit-critic-fold:focus-visible { outline: 2px solid var(--interactive-accent); outline-offset: -2px; }

.okit-critic-ins[data-author="0"], .okit-critic-del[data-author="0"] { color: var(--color-blue); }
.okit-critic-ins[data-author="1"], .okit-critic-del[data-author="1"] { color: var(--color-orange); }
.okit-critic-ins[data-author="2"], .okit-critic-del[data-author="2"] { color: var(--color-purple); }
.okit-critic-ins[data-author="3"], .okit-critic-del[data-author="3"] { color: var(--color-cyan); }
.okit-critic-ins[data-author="4"], .okit-critic-del[data-author="4"] { color: var(--color-yellow); }
.okit-critic-ins[data-author="5"], .okit-critic-del[data-author="5"] { color: var(--color-pink); }
`;
