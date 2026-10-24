# GUI smoke

`npm run smoke:gui -- --port <n>` runs S1 to S25 against a running second instance of Obsidian (recipe in the header of `scripts/gui-smoke.ts`). The fixture vault comes from `fixtures/vault/` (`--setup`); the driver resets notes, stands and settings before and after the run. The result is a four-state balance (green, red, skipped, nothing measured) against the fixed list of 24 points.

Texts are checked in English and German because `bereiteInstanzVor(sprache: "en")` only switches the surface after a reload; `--lang=en-US` at start sets English at once.

| Point | What it checks | What turns it red |
|---|---|---|
| S1 | all ten commands are registered | a command removed or renamed |
| S2 | *Hold as incoming* writes the fields and exactly one stand file `r1-incoming-*.md`, the text stays byte-identical below the frontmatter | the command writes more or fewer files, changes the text |
| S3 | *Mark changes* writes three marks (one replacement, one insertion, one deletion), three block entries, and the round trip holds: accept all = the reworked text, reject all = the incoming text | the round trip probe removed, an entry missing |
| S4 | the sidebar shows three change cards and "3 open changes" | the list not built or a card missing |
| S5 | *Accept* writes the new word, drops the card, sets the entry to `accepted` | the write goes to the wrong place or the list is not rebuilt |
| S6 | *Reject* of the insertion leaves one space, not two | the mark is removed without its space |
| S7 | a comment lands behind the deletion, not inside it; a reply hangs directly behind the first comment | the comment is nested into the mark or separated by a gap |
| S8 | *Resolve* collapses the card, leaves the text, sets the entry to `resolved` | the text changes or the state is not stored |
| S9 | the Stands tab lists the stands grouped by round | grouping or listing broken |
| S10 | *Compare with current text* opens a modal with `<del>` and `<ins>` | the comparison shows no change or the modal does not open |
| S11 | *Restore* saves the overwritten text first (and the restored incoming stand as the new base), then writes the incoming text | restore writes without saving, or the confirm is skipped |
| S12 | *Send back* counts the round to 2, saves "Round 2 – outgoing", writes the export file equal to the note (the share sheet is stubbed) | the round does not count, no stand, wrong bytes |
| S13 | a returned copy with the same id offers "Take over as round 3"; after confirming the note holds the sender's comment, the copy is in the trash, a round 3 incoming stand exists | no offer, overwrite without confirm, copy stays |
| S14 | *Release* with an open change names it, opens no dialog, writes nothing | the open-changes check removed (measured: S14 and the follow-up S15 go red) |
| S15 | *Release* of a clean note writes `v1`, status released, removes the comment, saves "Before release" and the release stand | version not counted, comments stay, a stand missing |
| S16 | the editor marks carry the kit classes and the form: insertion underlined, deletion struck through (computed style) | the editor extension not registered, colour-only marking |
| S17 | in the reading view *Accept* changes the file on disk | the write always goes through the editor (measured: S17 red) |
| S18 | a change inside a table cell is marked on one line; a new column is refused with a notice and nothing is written | the table rule dropped |
| S19 | the settings tab is registered, its first row is the help line, the name is stored | help line not first, name not saved |
| S20 | a stand file whose note text holds a link, a tag, a task and a comment is read by Obsidian's cache as a note without links, tags, tasks, headings or frontmatter; the control (the same text as an ordinary note) shows all of them | the stand text leaves the fence, or the probe cannot see (the control turns red) |
| S21 | a line appended to a stand file shows a warning above the Stands list and a notice, the stand stays listed; the unchanged file shows none | the checksum or the canonical comparison removed, or the stand dropped silently |
| S22 | *Save stand…* with a name writes one `manual` stand file that holds the name and `"anchor":true`; the note and its round stay as they were | the stand written as a plain stand, or the note touched |
| S23 | the first creation of the stands folder asks whether to exclude it (names the folder and the setting) and opens Files and links on yes; a second creation asks nothing | the question asked every time, never, or the settings not opened |
| S24 | in Live Preview the hidden block is one folded line ("▸ diachronic · 4 entries · last …") and no raw line is visible; in source mode it is open; back in Live Preview it is folded again and a click opens it | the fold option not passed, or the mode switch not noticed (the first run was red for that: the kit reads the mode only when it recomputes) |
| S25 | a thread whose comments are only in the text (no entry in the hidden block) can be marked done and reopened; the entries Diachronic adds carry the name before the colon ("unknown" without one), the round, the time of resolving and a fixed thread id | *Done* does nothing, or the thread cannot be reopened afterwards |

Measured against mutants of the plugin (build, `--setup`, fresh instance): writing always through the editor turns S17 red (`18 green · 1 red`); removing the open-changes check turns S14 and S15 red (`17 green · 2 red`). The other points are guarded at unit level (`npm test`, one mutation probe per rule); a GUI-level mutant for each is open.

Not covered by the smoke: how the sidebar looks (see `docs/images/`), the share sheet (stubbed), Obsidian Sync, and everything on the phone. The phone check is a hand-over step.
