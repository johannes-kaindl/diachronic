# Diachronic

> [🇬🇧 English](https://github.com/johannes-kaindl/diachronic/blob/main/README.md) · 🇩🇪 Deutsch

**Änderungen nachverfolgen für Markdown: Stände je Notiz, Vorschläge auf Wortebene zum Annehmen oder Ablehnen, Kommentare und eine Prüf-Seitenleiste.**

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](https://github.com/johannes-kaindl/diachronic/blob/main/LICENSE)
[![Docs: CC BY-SA 4.0](https://img.shields.io/badge/docs-CC%20BY--SA%204.0-lightgrey.svg)](https://github.com/johannes-kaindl/diachronic/blob/main/LICENSE-DOCS)
[![Release](https://img.shields.io/github/v/release/johannes-kaindl/diachronic?label=release)](https://github.com/johannes-kaindl/diachronic/releases)
![Platform](https://img.shields.io/badge/platform-Obsidian%201.12.4%2B%20·%20Desktop%20und%20Mobil-7c3aed)

<p align="center"><img src="https://raw.githubusercontent.com/johannes-kaindl/diachronic/main/docs/images/hero.png" width="820" alt="Ein Brief im Editor mit Vorschlägen auf Wortebene im Text; daneben die Prüf-Seitenleiste mit einer Karte je Änderung"></p>

Eine Kollegin schreibt einen Brief in Obsidian und schickt ihn dir als Markdown-Datei. Du überarbeitest ihn frei, Diachronic vergleicht deine Fassung mit dem, was du bekommen hast, und schreibt die Unterschiede als Vorschläge in die Datei. Sie sieht jede Änderung auf einer eigenen Karte, nimmt an oder lehnt ab, kommentiert und schreibt weiter. Die Vorschläge sind schlichtes [CriticMarkup](https://criticmarkup.com/) im Text, die Datei bleibt also ohne das Plugin lesbar.

## Features

- **Stände je Notiz.** Jede Runde beginnt mit einem gespeicherten Stand; du kannst die Stände einer Notiz auflisten, zwei beliebige Wort für Wort vergleichen und einen wiederherstellen. Ältere Stände liegen als kleine Änderungen vor, nicht als Kopien.
- **Vorschläge, die du einzeln entscheidest.** „Änderungen markieren“ macht aus dem Unterschied zum Eingang Einfügungen, Löschungen und Ersetzungen. Ohne Knopfdruck wird nichts geschrieben.
- **Prüf-Seitenleiste.** Eine Karte je Änderung mit Annehmen, Ablehnen und Kommentar, Kommentarfäden mit Antworten und „Erledigt“, in Textreihenfolge. Funktioniert auch auf dem Telefon.
- **Kommentare** an Änderungen und an beliebigen Textstellen.
- **Zurückschicken und übernehmen.** „Zurückschicken“ zählt die Runde hoch und öffnet das Teilen-Menü; eine zurückgekommene Datei mit derselben Dokument-Kennung wird als nächste Runde angeboten, und es wird nichts überschrieben, wenn beide Seiten geändert haben.
- **Freigeben.** Sind keine Änderungen mehr offen, speichert „Freigeben“ die Version v1, nimmt die Kommentare aus dem Text und setzt den Status im Frontmatter.
- **Ohne Plugin lesbar.** Einfügungen sind unterstrichen, Löschungen durchgestrichen, nie allein über Farbe. Andere CriticMarkup-Plugins können die Marken lesen.

## Voraussetzungen

- **Obsidian 1.12.4+**, Desktop und Mobil (iPhone und iPad).
- Kein weiteres Plugin und kein Netzzugriff. Diachronic schreibt nur die Notizen, an denen du arbeitest, und seinen eigenen Ordner der Stände.

## Installation

### Community-Plugins

**Einstellungen → Community-Plugins → Durchsuchen**, nach **Diachronic** suchen, installieren und aktivieren.

### Manuell

`main.js`, `manifest.json` und `styles.css` aus dem [aktuellen Release](https://github.com/johannes-kaindl/diachronic/releases) nach `<Vault>/.obsidian/plugins/diachronic/` legen (bei abweichendem Konfigurationsordner dort), dann **Diachronic** unter **Einstellungen → Community-Plugins** aktivieren.

### BRAT (Beta)

Das Plugin BRAT installieren, **Add beta plugin** wählen und das Repository `johannes-kaindl/diachronic` eintragen.

### Aus dem Quelltext

```bash
git clone https://github.com/johannes-kaindl/diachronic
cd diachronic
npm install
npm run build   # erzeugt main.js
```

## Quickstart

1. **Einstellungen → Diachronic** öffnen und deinen Namen eintragen. Er steht an jedem Vorschlag und Kommentar von dir.
2. Die erhaltene Notiz öffnen und **Als Eingang festhalten** ausführen (Befehlspalette). Die Notiz bekommt eine Dokument-Kennung in den Eigenschaften und einen ersten Stand.
3. Den Text frei überarbeiten, ohne besonderen Modus.
4. **Änderungen markieren** ausführen. Deine Änderungen erscheinen als Vorschläge im Text.
5. **Prüf-Seitenleiste öffnen**: die Vorschläge als Karten, annehmen, ablehnen oder kommentieren.
6. **Zurückschicken** zählt die Runde hoch und öffnet das Teilen-Menü für die Datei.

## Verwendung

<a href="https://raw.githubusercontent.com/johannes-kaindl/diachronic/main/docs/images/review.png"><img src="https://raw.githubusercontent.com/johannes-kaindl/diachronic/main/docs/images/thumbs/review.png" width="380" alt="Die Prüf-Seitenleiste: drei Änderungskarten mit Annehmen, Ablehnen und Kommentar und eine Kommentarkarte mit Antworten und Erledigt"></a><br><sub>Auf die Vorschau klicken für das Bild in voller Größe</sub>

- **Tab „Prüfen“:** eine Karte je Änderung (Autor, Zeit, Art, die Wörter drumherum) und je Kommentarfaden. Ein Klick auf eine Karte springt zur Stelle; ein Klick auf eine Marke im Text öffnet ihre Karte. „Alle annehmen“ und „Alle ablehnen“ speichern vorher einen Stand und fragen nach.
- **Tab „Stände“:** die Stände der Notiz nach Runden. Einen wählen, um ihn mit dem aktuellen Text oder einem anderen Stand zu vergleichen oder ihn wiederherzustellen. Beim Wiederherstellen wird der jetzige Text vorher gespeichert.

<img src="https://raw.githubusercontent.com/johannes-kaindl/diachronic/main/docs/images/diff.png" width="820" alt="Wortgenauer Vergleich in einer Spalte: das gelöschte Wort durchgestrichen, die eingefügten Wörter unterstrichen">

- **Befehle:** Als Eingang festhalten, Änderungen markieren, Prüf-Seitenleiste öffnen, Auswahl kommentieren, Nächste Änderung annehmen, Nächste Änderung ablehnen, Zurückschicken, Diese Datei als nächste Runde übernehmen, Freigeben. Hotkeys unter Einstellungen → Tastenkombinationen; es sind keine gesetzt.
- **Farbe je Autor:** eine Einstellung, standardmäßig aus. Die Art einer Änderung zeigt immer die Form.

## Konfiguration

**Einstellungen → Community-Plugins → Diachronic:** dein Name, der Ordner der Stände (Standard `Diachronic`), Ausblenden dieses Ordners im Datei-Explorer (an) und Farbe je Autor (aus). Einzelheiten in der [Referenz](https://github.com/johannes-kaindl/diachronic/blob/main/docs/reference/settings.md).

## Funktionsweise

Ein Vorschlag ist eine CriticMarkup-Marke im Text (`{++neu++}`, `{--alt--}`, `{~~alt~>neu~~}`). Wer sie wann geschrieben hat, steht in einem verborgenen Block am Ende der Notiz, damit die Marken sauber bleiben. Die Stände liegen in einem Ordner deiner Wahl und werden über die Dokument-Kennung in den Eigenschaften gefunden, folgen also einer umbenannten Notiz. Mehr in [Warum CriticMarkup](https://github.com/johannes-kaindl/diachronic/blob/main/docs/explanation/why-criticmarkup.md) und [Stände und Dateiformat](https://github.com/johannes-kaindl/diachronic/blob/main/docs/explanation/stands.md).

## Bekannte Grenzen

- Stände sind Markdown-Dateien, Obsidian führt sie deshalb in Suche, Graph und Schnellwechsler, bis du den Ordner unter „Ausgeschlossene Dateien“ einträgst (Diachronic fragt einmal und öffnet die Einstellung).
- Am Mac öffnet *Zurückschicken* die exportierte Datei mit der Standard-App statt mit einem Teilen-Menü.
- Die Leseansicht zeigt die Marken als schlichten Text; der Editor markiert sie.
- Eine zurückgekommene Datei mit neuen Marken der Absenderin neben nicht markierten Änderungen lässt sich nicht automatisch vergleichen.

## Dokumentation

[Dokumentations-Index](https://github.com/johannes-kaindl/diachronic/blob/main/docs/README.md): Erste Schritte, Anleitungen, Referenz und Hintergrund (auf Englisch).

## Lizenz

Code unter [AGPL-3.0-or-later](https://github.com/johannes-kaindl/diachronic/blob/main/LICENSE), Dokumentation unter [CC BY-SA 4.0](https://github.com/johannes-kaindl/diachronic/blob/main/LICENSE-DOCS). Eine kommerzielle Lizenz gibt es auf Anfrage, siehe [LICENSING.md](https://github.com/johannes-kaindl/diachronic/blob/main/LICENSING.md).
