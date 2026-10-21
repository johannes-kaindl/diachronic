# Stands and the file format

A **stand** is a saved version of one note. Diachronic saves one only at a deliberate step, never when you merely save the file:

- *Hold as incoming* and taking over a returned file: "Round N – incoming".
- *Mark changes*: "Round N – marked" (so a second marking in the same round compares against the first).
- *Send back*: "Round N – outgoing", the base for the collision check of the next round.
- Before anything that touches more than one card (accept all, reject all, restore, take over, release) and on *Release* itself ("v1").

## Why a folder of JSON files

A stand has to survive three things: Obsidian Sync, renaming the note, and indexing by search and by other plugins. A folder without a leading dot is synced (Obsidian Sync skips folders that begin with a dot). Files named `.json` do not appear as notes in search, graph, quick switcher or in plugins that index Markdown files; this was measured on the desktop. Whether Obsidian Sync carries `.json` files to the phone without extra settings is **not yet measured**; the file extension is therefore a single constant that can change.

## How they are stored

The newest stand is stored in full, older ones as changes towards the next newer one, so a long history is a few small files. Anchors (incoming, outgoing, release, named stands) stay in full as safety points: a damaged change file costs at most the stretch up to the next anchor. Every stand carries a SHA-256; Diachronic never shows a text it could not verify.

## What Diachronic does not do

It does not write into your note without a step of yours, it does not merge two changed versions (it shows the difference and stops), and it has no network access.
