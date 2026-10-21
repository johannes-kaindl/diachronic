# Release a note

*Release* ends the rounds of a text. It refuses while a change is still open and names how many. When none is open:

1. The current text is saved as a stand ("Before release").
2. After your confirmation, all comments and highlights leave the text, `diachronic-version` counts up (`v1`, `v2`, …) and `diachronic-status` becomes `released`.
3. The released text is saved as the stand "v1" (or the next version).

The stands keep the comments; only the note loses them.
