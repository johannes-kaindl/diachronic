# Stands and the file format

A **stand** is a saved version of one note. Diachronic saves one only at a deliberate step, never when you merely save the file:

- *Hold as incoming* and taking over a returned file: "Round N – incoming".
- *Mark changes*: "Round N – marked" (so a second marking in the same round compares against the first).
- *Send back*: "Round N – outgoing", the base for the collision check of the next round.
- *Save stand…* (command, and a button above the list in the Stands tab): the text as it is now, with a name if you give one. A named stand is an anchor. It belongs to the current round and changes neither round nor status.
- Before anything that touches more than one card (accept all, reject all, restore, take over, release) and on *Release* itself ("v1").

## Why Markdown files in a folder

A stand has to survive three things: Obsidian Sync, renaming the note, and indexing by search and by other plugins. A folder without a leading dot is synced (Obsidian Sync skips folders that begin with a dot). Of all file types only Markdown reaches the phone without the sync switch "Sync all other types" (off by default, set per device), so a stand is a `.md` file. The price: Obsidian sees every stand as a note. Diachronic therefore writes a stand as one JSON line inside a fenced block, without frontmatter. Links, tags, tasks, headings and comments inside a fence are not read by Obsidian, so a stand never adds a link to the graph or a task to your task list (checked in the smoke test against an ordinary note with the same text).

Stands still show up in search, the graph and the quick switcher. Diachronic asks once, when it first creates the folder, whether to keep them out, and opens the setting for you: add the folder under Settings → Files and links → Excluded files. Obsidian offers no way for a plugin to set that entry, so the choice stays with you. If you use vault-rag, add the folder to its own list "Exclude" as well: vault-rag does not read Obsidian's Excluded files.

## Edited from outside

Other plugins that write to notes (a linter on save, a template on creation) see a stand file as a note and may change it. Every stand file carries a SHA-256 of its payload and must equal its own canonical form. When it does not, Diachronic still shows the stand, marks the file in a warning above the list and in a notice, and never repairs it by itself: check it before you restore from it. A file that holds no readable stand at all is skipped and counted in a notice.

## How they are stored

The newest stand is stored in full, older ones as changes towards the next newer one, so a long history is a few small files. Anchors (incoming, outgoing, release, named stands) stay in full as safety points: a damaged change file costs at most the stretch up to the next anchor. Every stand carries a SHA-256; Diachronic never shows a text it could not verify.

## What Diachronic does not do

It does not write into your note without a step of yours, it does not merge two changed versions (it shows the difference and stops), and it has no network access.
