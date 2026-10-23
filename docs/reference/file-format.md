# File format

## Properties

| Key | Value |
|---|---|
| `diachronic-id` | document id (lowercase letters and digits), the same through all rounds |
| `diachronic-version` | `v1`, `v2`, … after a release |
| `diachronic-round` | the round, counts up with every *Send back* |
| `diachronic-status` | `draft`, `in-review` or `released` |
| `diachronic-participants` | list of names |

Diachronic writes them only at deliberate steps (hold, mark, send, take over, release), never for a click in the sidebar.

## Marks in the text

`{++new++}` insertion, `{--old--}` deletion, `{~~old~>new~~}` replacement, `{==passage==}{>>Name: comment<<}` comment on a passage, a reply is a further comment directly behind (`{>>Name: reply<<}`). A comment on a change hangs behind the mark, never inside it. See [CriticMarkup](https://criticmarkup.com/).

## The hidden block

At the end of the note, between the lines `%% diachronic:begin` and `diachronic:end %%` (an Obsidian comment, invisible in the reading view). One JSON line per entry: `id`, `kind`, `author`, `time` (UTC), `round`, `state` (`open`, `accepted`, `rejected`, `resolved`), `quote` (the mark with 32 characters of context on each side) and for comments `thread`. A percent sign is written as `%`, so the block never holds `%%`. Entries are matched to marks by their quote, not by position; an entry without a mark is shown as stale, a mark without an entry stays usable without author and time. You can delete the block by hand without harming the text.

## Stands

One Markdown file per stand under `<folder>/<document id>/<stand id>.md` (the extension is `STAND_EXT` in `src/core/types.ts`). The stand id is `r<round>-<reason>-<random>`, with the reason `incoming`, `outgoing`, `marked`, `before-bulk`, `before-koda`, `manual` or `release`. The newest stand is stored in full, older ones as changes towards the newer one; incoming, outgoing and released stands (and stands you named) are always stored in full. Every stand carries a SHA-256 of its text; a text that does not match is never shown.

The file is a one-line hint for humans, then a fenced block with the language `diachronic-stand`: the first line inside is `sha256 <hash of the next line>`, the second is the stand as one JSON line (`meta`, `form`, and `text` or `base` and `ops`). There is no frontmatter. A file that was changed after Diachronic wrote it is shown with a warning, a file without a readable block is skipped and reported.
