# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

### Fixed
- **A participant name with a line break is written to the note's properties.** The kit's property writer used to refuse such a value; it now writes it quoted with an escape and reads it back unchanged (obsidian-kit 0.96.0).
- The folded zone line in the editor no longer raises and swallows an error for every line that is not an entry (it checks for the opening brace first); the count and the latest time are the same.

### Changed
- Kit pins move to obsidian-kit 0.106.0 and code-kit 0.87.0; `styles.css` carries the kit's new review-list rules and the segmented control. The line-ending check uses the shared `detectEol`.

- **German "Stand festhalten…" has no space before the ellipsis (UI-STANDARD §11).** The command and the button in the Stands tab now match the English "Save stand…". The command id stays, so bound hotkeys keep working.

## [0.3.0] — 2026-11-15

### Changed
- The notes per saved stand now go by default to the folder `Stand notes` next to the folder for stands, no longer into a subfolder of it (setting *Folder for stand notes*, empty). Reason: a base does not list files under Settings → Files and links → Excluded files, so with the folder for stands excluded a base over the stand notes showed none of them (measured in Obsidian 1.15.1). A folder you set stays as it is, and notes already written are not moved: after the update new notes land in the new folder, the old ones stay where they are. The question about excluding the stands now says that the stand notes stay visible.

## [0.2.1] — 2026-11-15

### Fixed
- Writing the review fields (`diachronic-participants` and the others) into a note whose front matter has a block list with a blank line or a comment line inside no longer leaves the rest of that list behind as the value of the key before it (kit `frontmatter-patch` 0.94.0). Front matter is only written when Obsidian can read it; notes whose front matter Obsidian shows as “Invalid properties” stay untouched (before, the plugin wrote into them without the property becoming visible).

### Changed
- Shared building blocks updated to obsidian-kit 0.94.0 and code-kit 0.73.0. Review cards can show a decided state (not used yet).

## [0.2.0] — 2026-11-14

### Added
- A note per saved stand: message, author, time, reason, round, version and a link to the note it belongs to, as properties for a base. The notes go to a new setting *Folder for stand notes* (default: the subfolder `Stand notes` of the folder for stands, so the excluded-files entry and the hiding cover it). The stand files do not change. A note that cannot be written never loses the stand: Diachronic says so in a notice. Files in that folder are never taken for arrivals.

### Changed
- The author colours of the redline (setting *Colour by author*) keep a contrast of at least 4.5 : 1 in the default theme, Field Report and Kuro, light and dark (kit redline 0.88.0). The six places move closer together in colour, so the author's name beside each change stays the second way to tell authors apart.

## [0.1.3] — 2026-11-12

### Changed

- The comment and name dialogs now come from the shared kit: Enter starts a new line in a comment and Ctrl/Cmd+Enter sends it (before, Enter sent it, so a half-written paragraph could go out by accident); the buttons stay for the phone. An empty entry keeps the dialog open instead of closing it as a cancel, and Cancel, Escape or a tap outside still cancel.
- Insertions and deletions in the review cards and the version comparison are now drawn in a colour mixed with the text colour, so they keep a contrast of at least 4.5 : 1 against the background in the default theme, Field Report and Kuro, light and dark (the plain theme accents fell to about 2.9 : 1 in places). The shape still carries the meaning: deletions are struck through, insertions underlined.
- A note counts as living in the stand folder the way the file system reads the name: letter case, and dots or blanks at the end of the folder name, no longer let a stand file pass as an ordinary note when a file arrives.

## [0.1.2] — 2026-10-25

### Changed

- minAppVersion raised to 1.12.4, the lowest version the plugin was measured on (the GUI smoke ran on 1.12.4 and 1.14.5; the earlier 1.8.7 was backed only by the store lint).

## [0.1.1] — 2026-10-24

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
