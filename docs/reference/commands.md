# Commands

| Command | Id | Does |
|---|---|---|
| Hold as incoming | `diachronic:hold-incoming` | Gives the note a document id and the properties, saves "Round 1 – incoming". |
| Save stand… | `diachronic:save-stand` | Saves the current text as a stand, with a name if you give one (leave it empty for "Saved by hand"). A named stand is kept in full. Round and status stay. |
| Mark changes | `diachronic:mark-changes` | Writes the difference to the incoming text as suggestions and saves the marked stand. |
| Open review sidebar | `diachronic:open-view` | Opens the sidebar with the tabs Review and Stands. |
| Comment on selection | `diachronic:comment` | Comments on the selected text (also in the editor context menu). |
| Accept next change | `diachronic:accept-next` | Accepts the next open change from the cursor. |
| Reject next change | `diachronic:reject-next` | Rejects it. |
| Send back | `diachronic:send` | Counts the round up, saves "Round N – outgoing", opens the share sheet. |
| Take over this file as the next round | `diachronic:take-over` | Treats the open note as a returned file. |
| Release | `diachronic:release` | Saves a version, removes comments, sets status released. |

Every command that writes needs your name in the settings. Commands that need a note are only offered while a note is open.
