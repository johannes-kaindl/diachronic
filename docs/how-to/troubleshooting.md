# Troubleshooting

- **"Enter your name in the Diachronic settings first."** The name stands on every suggestion; set it under Settings → Diachronic.
- **"No incoming stand for round N."** Run *Hold as incoming* first. After *Send back* the round has counted up and the next incoming stand arrives with the returned file.
- **A change cannot be marked.** The notice names the reason: inside a code block, a table row's structure, a text that would end its mark early (`++}`, `--}`, `~~}`, `==}`, `<<}`, `~>`), or a change inside an existing suggestion. Decide on the existing suggestion first, or change the text outside the mark.
- **"The Diachronic block at the end of the note is damaged."** The hidden block lost its end line (`diachronic:end %%`) or one of its lines. Diachronic writes nothing until it is repaired. Restore a stand, or delete the block (from `%% diachronic:begin` to `diachronic:end %%`): the marks in the text stay usable, only author and time are lost.
- **The stands folder shows up in search, the graph or the quick switcher.** Stands are Markdown files, so Obsidian lists them like notes. The folder is hidden in the file explorer, and Diachronic asked once whether to keep it out of search too. Add the folder under Settings → Files and links → Excluded files; that setting is yours, a plugin cannot set it. If you use vault-rag, add the folder to its list "Exclude" too.
- **"N stand file(s) were changed by something other than Diachronic."** A plugin that writes to notes (a linter on save, a template) changed a stand file. The stand is still shown, with a warning above the list. Exclude the stands folder in that plugin, and check the stand before you restore from it.
- **Stands do not arrive on the iPhone.** Stands are Markdown files and sync like notes, without the sync switch *Sync all other types*. Check that the stands folder has no leading dot and is not excluded from Sync (Settings → Sync → Excluded folders).

## Getting help

Open an issue at <https://github.com/johannes-kaindl/diachronic/issues>. Say whether you use the Mac or the iPhone, what you did, and the exact text of any notice.
