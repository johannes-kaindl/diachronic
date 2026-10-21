import { stripComments } from "../vendor/kit/critic-markup";
import { writeDocMeta } from "./doc-meta";
import { joinDoc, splitDoc } from "./meta-zone";
import { readReview } from "./review";
import type { DocMeta } from "./types";

export type PrepareRelease =
  | { ok: true; text: string; meta: DocMeta }
  | { ok: false; reason: "open-changes"; open: number }
  | { ok: false; reason: "zone-broken" | "zone-unreadable" | "frontmatter"; open: 0 };

/** Die nächste Version: `v1` beim ersten Mal, sonst eins hoch; eine Version, die nicht `v<Zahl>` heißt, beginnt neu bei `v1`. */
function nextVersion(version: string | null): string {
  const m = version === null ? null : /^v(\d+)$/.exec(version);
  return m ? `v${Number(m[1]) + 1}` : "v1";
}

/**
 * Freigeben (Spec § 10.5): verlangt, dass keine Änderung mehr offen ist; entfernt dann alle Kommentare und Hervorhebungen aus dem
 * Text und ihre Einträge aus dem Block, zählt die Version hoch und setzt den Status. Entschiedene Einträge bleiben (Ablehnungs-
 * Gedächtnis). Die Stände schreibt der Aufrufer: vorher der jetzige Text, danach die freigegebene Fassung als Stand „vN“.
 */
export function prepareRelease(text: string, meta: DocMeta): PrepareRelease {
  const model = readReview(text);
  if ("error" in model) return { ok: false, reason: model.error, open: 0 };
  if (model.marks.length > 0) return { ok: false, reason: "open-changes", open: model.marks.length };
  const split = splitDoc(text);
  if (!split.ok) return { ok: false, reason: split.reason, open: 0 };
  const { parts } = split;
  const joined = joinDoc({ ...parts, body: stripComments(parts.body), entries: parts.entries.filter((e) => e.kind !== "comment") });
  const next: DocMeta = { ...meta, version: nextVersion(meta.version), status: "released" };
  const r = writeDocMeta(joined, next);
  return r.ok ? { ok: true, text: r.content, meta: next } : { ok: false, reason: "frontmatter", open: 0 };
}
