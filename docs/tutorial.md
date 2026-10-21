# Tutorial: your first round

You received a letter as a Markdown file and want to send it back with your changes as suggestions. About ten minutes.

1. **Set your name.** Settings → Diachronic → *Your name*. Without it Diachronic writes nothing: the name is part of every suggestion.
2. **Put the file into your vault** and open it.
3. **Hold it as incoming.** Command palette → *Hold as incoming*. The note gets four properties (`diachronic-id`, `diachronic-round`, `diachronic-status`, `diachronic-participants`) and a first stand, "Round 1 – incoming". Nothing else in the note changes.
4. **Rework the text freely.** No special mode; type, delete, replace.
5. **Mark the changes.** Command palette → *Mark changes*. Diachronic compares the text with the incoming stand word by word and writes the differences as marks, such as `{~~möchten~>wollen~~}`. A hidden block at the end of the note remembers who wrote which mark. If a change cannot be marked safely (inside a code block, in the structure of a table), a notice says why and nothing is written.
6. **Review them.** *Open review sidebar* shows one card per change. *Accept* keeps the new text and removes the mark, *Reject* restores the old text. *Comment* adds a comment behind the change. You can reply in a thread and resolve it.
7. **Send it back.** *Send back* checks for changes you did not mark yet, counts the round up and opens the share sheet (Finder or share menu on a computer, the system share sheet on a phone).

The file you send is the note itself. Whoever receives it sees the marks as readable text, and with Diachronic as cards. See [Send a note back and take over the answer](how-to/send-and-take-over.md) for the way back.
