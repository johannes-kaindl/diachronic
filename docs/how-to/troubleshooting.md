# Troubleshooting

- **"Enter your name in the Diachronic settings first."** The name stands on every suggestion; set it under Settings → Diachronic.
- **"No incoming stand for round N."** Run *Hold as incoming* first. After *Send back* the round has counted up and the next incoming stand arrives with the returned file.
- **A change cannot be marked.** The notice names the reason: inside a code block, a table row's structure, a text that would end its mark early (`++}`, `--}`, `~~}`, `==}`, `<<}`, `~>`), or a change inside an existing suggestion. Decide on the existing suggestion first, or change the text outside the mark.
- **"The Diachronic block at the end of the note is damaged."** The hidden block lost its end line (`diachronic:end %%`) or one of its lines. Diachronic writes nothing until it is repaired. Restore a stand, or delete the block (from `%% diachronic:begin` to `diachronic:end %%`): the marks in the text stay usable, only author and time are lost.
- **The stands folder shows up in search or the quick switcher.** The default folder is hidden in the file explorer only. Obsidian offers *Excluded files* (Settings → Files and links) for search and graph.
- **Stands do not arrive on the iPhone.** Check Settings → Sync → *Sync all other types*. Whether stands sync without it is not yet measured.
