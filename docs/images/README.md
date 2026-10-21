# Capture contract — README images

This folder holds the images that `README.md` and `README.de.md` embed, recorded by `scripts/shots.ts` against a second Obsidian instance with the fixture vault (`npm run smoke:gui -- --setup`).

## Classes

| Class | Embedding | Limit |
|---|---|---|
| `hero` | `width="820"`, centered, right after the badges | landscape (H ≤ W) |
| `feature` | `width="820"` | H/W ≤ 1.6 |
| `detail` | preview `width="380"`, linked to the full image | no height limit |

## Images

| File | Class | Referenced by | Must show |
|---|---|---|---|
| `hero.png` | hero | README (top) | The example letter in the editor with the three suggestions and the comment marked in the text, the review sidebar with one card per change. The window ends above the hidden block. |
| `review.png` | detail | README (Usage) | The review sidebar: three change cards (replacement, insertion, deletion) with Accept, Reject, Comment, and one comment card with Reply and Resolve. |
| `diff.png` | feature | README (Usage) | The comparison of the incoming stand with the current text in one column, deletion struck through, insertion underlined. |
| `stands.png` | not embedded | docs | The Stands tab with a chosen stand and its actions. |
| `reading.png` | not embedded | docs | The reading view of the example letter: the block is invisible, the marks show as plain text. |
| `narrow.png` | not embedded | docs | The review sidebar at about 470 px, one column, all buttons visible. |

## Recipe

Record in a second instance (own profile, own port, English surface via `--lang=en-US` at start), never in the regular instance:

```bash
npm run build && npm run smoke:gui -- --setup
# start the instance as in the header of scripts/gui-smoke.ts, with --lang=en-US, lock with --exclusive focus, then:
npm run shots -- --port <port>
```

The narrow image is a narrow desktop window with the left sidebar collapsed; it is not a proof for the phone (Obsidian's mobile shell is missing).
