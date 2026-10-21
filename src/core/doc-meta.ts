import { parseFrontmatter } from "../vendor/kit/frontmatter";
import { isValidPluginId } from "../vendor/kit/plugin-id";
import { patchFrontmatter, type FrontmatterPatchResult } from "../vendor/kit/frontmatter-patch";
import { FM_KEYS, type DocMeta, type DocStatus } from "./types";

const STATUSES: readonly DocStatus[] = ["draft", "in-review", "released"];

function isStatus(v: unknown): v is DocStatus {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

/** Die Diachronic-Felder einer Notiz; `null`, wenn keine `diachronic-id` da ist (dann gehört die Notiz nicht zu Diachronic). */
export function readDocMeta(text: string): DocMeta | null {
  const data = parseFrontmatter(text).data;
  const id = data[FM_KEYS.id];
  if (typeof id !== "string" || !isValidPluginId(id.trim())) return null;
  const version = data[FM_KEYS.version];
  const round = Number(data[FM_KEYS.round]);
  const status = data[FM_KEYS.status];
  const who = data[FM_KEYS.participants];
  return {
    id: id.trim(),
    version: typeof version === "string" && version !== "" ? version : null,
    round: Number.isInteger(round) && round >= 1 ? round : 1,
    status: isStatus(status) ? status : "draft",
    participants: Array.isArray(who) ? who : typeof who === "string" && who !== "" ? [who] : [],
  };
}

/**
 * Schreibt die Felder chirurgisch: fremde Zeilen und Zeilenenden bleiben byte-gleich, neue Schlüssel kommen in der Reihenfolge von
 * `FM_KEYS` ans Ende. Ohne `version` (noch nie freigegeben) wird der Schlüssel nicht angelegt. Eine Notiz ohne Frontmatter bekommt
 * nur mit `create` einen Block.
 */
export function writeDocMeta(text: string, meta: DocMeta, opts: { create?: boolean } = {}): FrontmatterPatchResult {
  const set: Record<string, string | number | string[]> = { [FM_KEYS.id]: meta.id };
  if (meta.version !== null) set[FM_KEYS.version] = meta.version;
  set[FM_KEYS.round] = meta.round;
  set[FM_KEYS.status] = meta.status;
  set[FM_KEYS.participants] = meta.participants;
  return patchFrontmatter(text, { set, create: opts.create === true });
}
