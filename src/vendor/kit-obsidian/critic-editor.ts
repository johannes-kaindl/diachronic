// vendored from obsidian-kit@0.64.0, src/obsidian/critic-editor.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
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
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { parseCritic, type CriticMark } from "../kit/critic-markup";

export interface CriticEditorOptions {
  /** Wird bei einem Klick in eine Marke gerufen; das Plugin öffnet die zugehörige Karte. */
  onMarkClick?: (mark: CriticMark) => void;
  /** Autoren-Platz 0–5 einer Marke oder `undefined`; nur wirksam, wenn `colorByAuthor()` wahr ist. */
  authorSlot?: (mark: CriticMark) => number | undefined;
  colorByAuthor?: () => boolean;
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

.okit-critic-ins[data-author="0"], .okit-critic-del[data-author="0"] { color: var(--color-blue); }
.okit-critic-ins[data-author="1"], .okit-critic-del[data-author="1"] { color: var(--color-orange); }
.okit-critic-ins[data-author="2"], .okit-critic-del[data-author="2"] { color: var(--color-purple); }
.okit-critic-ins[data-author="3"], .okit-critic-del[data-author="3"] { color: var(--color-cyan); }
.okit-critic-ins[data-author="4"], .okit-critic-del[data-author="4"] { color: var(--color-yellow); }
.okit-critic-ins[data-author="5"], .okit-critic-del[data-author="5"] { color: var(--color-pink); }
`;
