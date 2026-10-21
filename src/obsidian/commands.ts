import { Notice, type App } from "obsidian";
import { readDocMeta } from "../core/doc-meta";
import { markRound, startDocument } from "../core/marking";
import { splitDoc } from "../core/meta-zone";
import { findStand } from "../core/stand-plan";
import type { DiachronicSettings } from "../core/settings";
import { reconstruct } from "../vendor/kit/version-chain";
import { t } from "../vendor/kit/i18n";
import { writeDoc, type ActiveDoc } from "./editor-io";
import type { StandStore } from "./stand-store";

export interface CommandDeps {
  app: App;
  settings: () => DiachronicSettings;
  stands: StandStore;
  now: () => Date;
  newId: () => string;
  openSettings: () => void;
}

function refusal(reason: string): string {
  const key = `notice.refused.${reason}`;
  const text = t(key);
  return text === key ? reason : text;
}

/** Der Name der Person; ohne ihn schreibt das Plugin nichts (der Autor steht in jedem Vorschlag). */
function authorOrNotice(deps: CommandDeps): string | null {
  const name = deps.settings().authorName;
  if (name === "") {
    new Notice(t("notice.needName"));
    deps.openSettings();
    return null;
  }
  return name;
}

async function readText(deps: CommandDeps, doc: ActiveDoc): Promise<string> {
  return doc.editor ? doc.editor.getValue() : deps.app.vault.read(doc.file);
}

/** „Als Eingang festhalten“: Kennung vergeben, Frontmatter schreiben, Stand „Runde 1 – Eingang“ speichern. */
export async function holdIncoming(deps: CommandDeps, doc: ActiveDoc): Promise<void> {
  const author = authorOrNotice(deps);
  if (author === null) return;
  const before = await readText(deps, doc);
  const existing = readDocMeta(before);
  if (existing) { new Notice(t("notice.alreadyHeld", existing.round)); return; }
  const id = deps.newId();
  let written = "";
  const out = await writeDoc(deps.app, doc, (text) => {
    const r = startDocument(text, { id, version: null, participants: [], author });
    if (!r.ok) return { ok: false, reason: r.reason };
    written = r.content;
    return { ok: true, text: r.content };
  });
  if (!out.ok) { new Notice(refusal(out.reason)); return; }
  await deps.stands.add(id, written, { reason: "incoming", author, round: 1, version: null });
  new Notice(t("notice.held", 1));
}

/** „Änderungen markieren“: Unterschied zum Eingang der laufenden Runde als Vorschläge in die Notiz schreiben. */
export async function markChangesCommand(deps: CommandDeps, doc: ActiveDoc): Promise<void> {
  const author = authorOrNotice(deps);
  if (author === null) return;
  const meta = readDocMeta(await readText(deps, doc));
  if (!meta) { new Notice(t("notice.noIncoming", 1)); return; }
  const chain = await deps.stands.load(meta.id);
  if (deps.stands.skipped > 0) new Notice(t("notice.stands", deps.stands.skipped));
  const incoming = findStand(chain, "incoming", meta.round);
  const base = incoming ? reconstruct(chain, incoming.meta.id) : null;
  if (!base || !base.ok) { new Notice(t("notice.noIncoming", meta.round)); return; }
  const baseSplit = splitDoc(base.text);
  if (!baseSplit.ok) { new Notice(refusal(baseSplit.reason)); return; }
  let count = 0;
  const out = await writeDoc(deps.app, doc, (text) => {
    const r = markRound({ text, baseBody: baseSplit.parts.body, author, time: deps.now().toISOString(), round: meta.round, newId: deps.newId });
    if (!r.ok) return { ok: false, reason: r.reason };
    count = r.added.length;
    return { ok: true, text: r.text };
  });
  new Notice(out.ok ? t("notice.marked", count) : refusal(out.reason));
}
