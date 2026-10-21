# AGENTS — diachronic

## Project character

Diachronic ist ein Obsidian-Plugin (ID `diachronic`, `isDesktopOnly: false`, läuft auf Mac und iPhone): Änderungen nachverfolgen für Markdown, ähnlich „Änderungen nachverfolgen“ in Word. Stände je Notiz, Änderungen als CriticMarkup-Vorschläge, Prüf-Seitenleiste mit Annehmen, Ablehnen und Kommentaren, Versionsbrowser mit Wort-Diff und Wiederherstellen, Zurückschicken und Freigeben. Spec, Pläne und Anhänge liegen im Cockpit `25_Coding/diachronic-proofreader/_SDD/` (nicht im Repo, CORE-META-14). Dach-Regeln (Kit-first, Bibliothek ab Eins, UI-STANDARD): `../AGENTS.md`.

Zuständigkeit: Diachronic besitzt Stände, Markieren und Prüfen von Textänderungen. Es hängt von keinem fremden Plugin ab; Marken sind CriticMarkup und bleiben ohne Plugin lesbar. Stufe 2 (Koda-Werkzeuge) und Stufe 3 (Redline-PDF) kommen als spätere Minor-Versionen.

## Architecture principles

- `src/core/` ist rein: weder `obsidian` noch `@codemirror/*` (bewacht von `npm run check:pure`). Dort liegen Frontmatter-Felder, Metadaten-Block, Markieren, Prüfen, Austausch, Freigabe, ViewModel.
- `src/obsidian/` liest und schreibt Notizen (eine Editor-Transaktion mit dem kleinsten Bereich, sonst `vault.process`), hält die Stände im eingestellten Ordner und zeigt genau eine Ansicht (Hub-Tabs „Prüfen“ und „Stände“).
- Kit-Code liegt vendored unter `src/vendor/` und `tests/vendor/` (Konfiguration `tools/kit-sync.json`, Aufruf `sh tools/sync-kit.sh`, Prüfung mit `--check`); nie von Hand editiert, Pins nur in der Konfiguration. Aktuell obsidian-kit 0.64.0 und code-kit 0.32.0.
- Frontmatter-Schlüssel wörtlich: `diachronic-id`, `diachronic-version`, `diachronic-round`, `diachronic-status`, `diachronic-participants`. Geschrieben nur mit `patchFrontmatter` und nur bei bewussten Schritten, nie bei jedem Klick.
- **Dateiendung der Stände: `STAND_EXT` in `src/core/types.ts`, vorläufig `json`.** Gewählt nach der Entscheidungsregel von Plan 3 auf Grund der Mac-Messung (`.json` ist in Explorer, Suche, Graph, Schnellwechsler, `getMarkdownFiles` und vault-rag unsichtbar). Ob Obsidian Sync solche Dateien ohne Zusatzschalter aufs iPhone überträgt, ist **bis zum iPhone-Test von Johannes ungemessen**; die Endung kann deshalb noch wechseln. Der Wechsel ist eine Ein-Zeilen-Änderung samt Test.
- Metadaten-Block am Ende der Notiz zwischen `%% diachronic:begin` und `diachronic:end %%`, verwaltet mit `marker-zone`; je Eintrag eine JSON-Zeile, `%` wird dort als `%` geschrieben, damit kein `%%` im Block steht.

## Commands

- `npm run gate` — lint, typecheck (src, test, scripts), test, check:pure, build; muss 0 Fehler und 0 Warnungen liefern. Vor jedem Commit, mit `&&` verkettet.
- `npm run fixture` — erzeugt die getrackten Beispiel-Notizen und Stände unter `fixtures/vault/notes/` aus dem Plugin-Kern (`scripts/fixture.ts`); nie von Hand ändern.
- `npm run smoke:gui -- --setup` baut den Staging-Vault, `npm run smoke:gui -- --port <n>` fährt S1–S19 gegen eine Zweitinstanz (Rezept im Kopfkommentar von `scripts/gui-smoke.ts`, Prüfpunkte und Gegenproben in `docs/SMOKE.md`). Je Messlauf ein frischer Obsidian-Prozess, Lock für den eigenen Port.
- `npm run shots -- --port <n>` — nimmt `docs/images/*.png` auf (Vertrag in `docs/images/README.md`); Instanz mit `--lang=en-US` starten, Lock `--exclusive focus`.
- `npm run deploy` — baut und kopiert nach `$OBSIDIAN_PLUGIN_DIR`.
- `npm run release` — delegiert an `../tools/release/`; fährt der Master nach Freigabe durch Johannes.

## Conventions

- Conventional Commits (deutsch erlaubt), Commit nur mit expliziten Pfaden, Gate vor jedem Commit.
- Texte nur in `src/i18n/strings.ts`, Schlüssel immer in `en` und `de`; Kit-Bausteine bekommen ihre Texte als Parameter.
- Styles nur mit Theme-Variablen (UI-STANDARD §3); Kit-CSS-Konstanten stehen wortgleich in `styles.css` (Wächter `tests/kit-css.test.ts`).
- Die Art einer Änderung trägt die Form (Einfügung unterstrichen, Löschung durchgestrichen), nie die Farbe allein (Rot-Grün-Schwäche des Maintainers). „Farbe je Autor“ ist ein Schalter, Default aus.
- Markdown: ein Absatz, eine Zeile.

## Gotchas

- **Stände:** Basis für „Änderungen markieren“ ist der jüngere von „Eingang der Runde“ und „markiert“ (Stand nach jedem Markieren); Wiederherstellen eines dieser Stände speichert ihn noch einmal als jüngsten seiner Art. Die Kennung eines Standes trägt Runde und Anlass (`r2-incoming-<zufall>`), die Sprache des Namens spielt keine Rolle.
- **Offener Editor gilt:** Wer eine Notiz liest, um zu entscheiden, ob sie überschrieben werden darf, liest den Editor-Text, nicht die Platte (die hinkt dem Tippen bis zu zwei Sekunden hinterher).
- **Sprache in Zweitinstanzen:** `localStorage.language` (auch über `bereiteInstanzVor(sprache: "en")`) wirkt erst nach einem Neuladen; `--lang=en-US` beim Start stellt Englisch sofort ein. Der Smoke prüft deshalb beide Sprachen.
- **Kit-Gate:** Der commit-msg-Hook der Bibliothek-Regel ist in diesem Repo installiert (`python3 ../tools/bibliothek/installieren.py diachronic`); er fehlt in einem frischen Klon.

- `@codemirror/state` und `@codemirror/view` sind in `esbuild.config.mjs` extern (Obsidian liefert CM6 zur Laufzeit); die `package.json` pinnt sie exakt (6.5.0, 6.38.6) und `obsidian` auf 1.13.1, weil `obsidian` den State als exakte Peer-Version verlangt. Mit `obsidian: latest` (1.14.4, Peer 6.7.6) bricht `npm install` mit `ERESOLVE`. Hebung nur zusammen mit dem Kit.
- Im Lesemodus schreibt das Plugin nie über den Editor (`replaceRange` verpufft dort), sondern über `vault.process`.
- `criticEditorExtension` liegt nicht im Barrel des Kits und wird direkt aus `kit-obsidian/critic-editor` importiert.

## Context index

- Spec und Pläne: Cockpit `25_Coding/diachronic-proofreader/_SDD/`.
- Reports der Welle 25: Cockpit `25_Coding/diachronic-proofreader/_Log/`.

## Memory

Befunde und Entscheidungen stehen im Cockpit `25_Coding/diachronic-proofreader/`; hier nur, was für jede Session im Repo gilt.

## Abweichungen von der Leitkonvention

keine

## UI-Abweichungen

keine
