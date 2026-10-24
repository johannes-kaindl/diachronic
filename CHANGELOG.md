# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

### Fixed

- A thread whose comments are only in the text (typed by hand, for example by the sender, with no entry in the hidden block) can now be marked as done, and so can a thread where only some comments have an entry. Before, the Done button did nothing for the first and left the second open for good. Diachronic adds the missing entries when you mark the thread done: the author is the name before the colon, "unknown" without one, and the time is the moment you marked it done, so the card then shows that date. Reopening works as for any thread.

## [0.1.0] — 2026-10-23

### Added

- First release (Stage 1): **stands per note**, **suggestions as CriticMarkup** written from the difference to the incoming text (word level, with a round-trip check before anything is written), the **review sidebar** (one card per change, accept, reject, comment, reply, resolve, accept or reject all), the **stands browser** with word-level comparison and restore, **send back** and **take over** a returned file (nothing is overwritten when both sides changed), **release**, editor marks with form (underline, strike-through) and an optional colour by author, and the settings tab.
- Works on desktop and mobile (no Node modules, no network access).
- **Save stand…** (command and a button in the Stands tab): save the text as it is now, with a name if you like. A named stand is kept in full.
- **Stands are Markdown files** (`.md`), so they sync to the phone without the sync switch "Sync all other types". Each is one JSON line in a fenced block without frontmatter, so Obsidian reads no links, tags or tasks from it, and carries a checksum: a stand file that another plugin changed (a linter on save, a template) is shown with a warning and never repaired silently.
- **The hidden block is folded in Live Preview** to one muted line ("▸ diachronic · 4 entries · last 10/19/26", readable contrast) instead of long grey raw lines. It opens on a click, Enter or Space, and while the cursor is inside it; in source mode it stays visible and editable (kit `critic-editor` option `foldZones`, obsidian-kit 0.65.0 to 0.66.2).
- Diachronic asks once, when it first creates the stands folder, whether to keep the folder out of search and graph, and opens Settings → Files and links for you (a plugin cannot set that entry).

### Changed

- **The Stands list in a narrow sidebar** keeps its label: the author and time column is capped at 45% of the row and shortened with an ellipsis (full text in the tooltip), instead of squeezing the label to a few characters (kit `version-list`, obsidian-kit 0.65.0).

### Known limits

- Stands appear in search, the graph and the quick switcher until the folder is added under Excluded files; if you use vault-rag, add the folder to its own list "Exclude" as well.
- On the Mac, *Send back* opens the exported file with the default app instead of a share menu.
- The reading view shows the marks as plain text.
