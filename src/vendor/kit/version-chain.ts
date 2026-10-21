// vendored from code-kit@0.32.0, src/ts/pure/version-chain.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/** The versions of one note as a chain: the newest stand in full, older ones as backward deltas, anchors kept in full, every stand
 *  carrying a SHA-256 of its text. Storing, files and the clock belong to the caller.
 *
 *  Origin: born here for Diachronic (a Markdown review plugin). Measured 2026-10-18 and again 2026-10-21: no repo keeps a history of
 *  single notes. The snapshot modules (obsidian-transmute `core/vault/snapshot.ts`, settings-assistant `core/snapshot.ts`, vault-crews
 *  `obsidian/snapshot-store.ts`) save whole files per run and restore a run under a hash guard — another contract; `rotation.ts`
 *  decides what to keep, not what a history looks like. What is called: `sha256HexUtf8` for the checksum, `diffWords` for the deltas.
 *  What is not: `rotation.ts` (`selectGfsRetention`) and `rounds.ts` stay the caller's business.
 *
 *  What is fixed here, and why:
 *
 *  1. **The head is full, the rest is backward.** `addStand` writes the new stand in full and rewrites the previous head as a delta
 *     *against the new one* (the ops turn the newer text into the older one — RCS/SVN). An anchor (a named stand, the arrival of a
 *     round) stays full, so a damaged delta costs at most the stretch up to the next anchor. `write` lists exactly the stands whose
 *     stored form changed, the new one first: a caller that writes in that order and is interrupted holds two full stands, never none.
 *  2. **The head is the stand of the document that no other stand points to** — not "the last in the array", so a caller may load the
 *     stands in any order. Several such stands (branches, later) are told apart by `time`, then by position.
 *  3. **Every step is checked.** `reconstruct` follows `base` links to a full stand, applies the deltas backwards and compares the hash of
 *     every stand on the way, newest first, so `at` names the stand that does not match. A missing link is `broken-chain` with the id it
 *     looked for (a cycle too: it stops instead of looping), an unknown id is `missing`. It never returns a text it could not verify.
 *  4. **`applyDelta` is lenient, the hash is strict.** Ops that do not fit the text (a tampered file) are clamped instead of thrown;
 *     the hash is what turns them into `hash-mismatch`. `parseStand` is strict: it returns `null` for anything that is not exactly a stand.
 *  5. **Removing a stand from the middle breaks the chain** for every older delta that leads through it. Retention belongs at the old
 *     end, or after the stand in front of the gap has been turned into a full one. This module does not decide retention.
 *
 *  The checksum is over the text as given: no line-ending normalisation (`sha256HexUtf8`). The current file is not a link of the chain.
 *  Offsets in ops are UTF-16 code units. Pure: no I/O, no clock — `time` is what the caller passes (ISO 8601 UTC with `Z`; it is not
 *  validated here, but compared as a string, which orders ISO UTC correctly). */

import { sha256HexUtf8 } from "./sha256";
import { diffWords } from "./word-diff";

export interface StandMeta {
  id: string; docId: string; time: string;   // ISO 8601 UTC with Z, supplied by the caller
  author: string; parent: string | null; name?: string; anchor: boolean; hash: string; // sha256 of the full text
}
export type DeltaOp = [0, number] | [1, string] | [-1, number];   // keep n · insert s · remove n

/** Ops that turn `from` into `to`; the last keep is written out, so the ops cover the whole of `from`. */
export function makeDelta(from: string, to: string): DeltaOp[] {
  const ops: DeltaOp[] = [];
  let pos = 0;
  for (const c of diffWords(from, to).changes) {
    if (c.oldStart > pos) ops.push([0, c.oldStart - pos]);
    if (c.oldEnd > c.oldStart) ops.push([-1, c.oldEnd - c.oldStart]);
    if (c.newEnd > c.newStart) ops.push([1, to.slice(c.newStart, c.newEnd)]);
    pos = c.oldEnd;
  }
  if (from.length > pos) ops.push([0, from.length - pos]);
  return ops;
}

export function applyDelta(from: string, ops: readonly DeltaOp[]): string {
  let out = "";
  let pos = 0;
  for (const op of ops) {
    if (op[0] === 0) { out += from.slice(pos, pos + op[1]); pos += op[1]; }
    else if (op[0] === -1) pos += op[1];
    else out += op[1];
  }
  return out;
}

export type StoredStand =
  | { meta: StandMeta; form: "full"; text: string }
  | { meta: StandMeta; form: "delta"; base: string; ops: DeltaOp[] };   // base = id of the newer stand the ops apply to

export interface NewStand { id: string; docId: string; time: string; author: string; name?: string; anchor?: boolean }

function headOf(chain: readonly StoredStand[], docId: string): StoredStand | null {
  const own = chain.filter((s) => s.meta.docId === docId);
  const pointed = new Set(own.map((s) => s.meta.parent));
  let head: StoredStand | null = null;
  for (const s of own) {
    if (pointed.has(s.meta.id)) continue;
    if (!head || s.meta.time >= head.meta.time) head = s;
  }
  return head;
}

/** Adds `text` as the new head of `input.docId`. Throws if `input.id` is already in the chain (a caller bug; overwriting a stand would
 *  silently change what an older delta leads to). The chain passed in is not changed. */
export function addStand(chain: readonly StoredStand[], text: string, input: NewStand): { chain: StoredStand[]; write: StoredStand[] } {
  if (chain.some((s) => s.meta.id === input.id)) throw new Error(`version-chain: stand id already in the chain: ${input.id}`);
  const head = headOf(chain, input.docId);
  const meta: StandMeta = {
    id: input.id, docId: input.docId, time: input.time, author: input.author,
    parent: head ? head.meta.id : null, anchor: input.anchor === true, hash: sha256HexUtf8(text),
  };
  if (input.name !== undefined) meta.name = input.name;
  const fresh: StoredStand = { meta, form: "full", text };
  const write: StoredStand[] = [fresh];
  let next = [...chain];
  if (head && head.form === "full" && !head.meta.anchor) {
    const rewritten: StoredStand = { meta: head.meta, form: "delta", base: input.id, ops: makeDelta(text, head.text) };
    next = next.map((s) => (s === head ? rewritten : s));
    write.push(rewritten);
  }
  next.push(fresh);
  return { chain: next, write };
}

export type Reconstruct = { ok: true; text: string } | { ok: false; reason: "missing" | "hash-mismatch" | "broken-chain"; at: string };

export function reconstruct(chain: readonly StoredStand[], id: string): Reconstruct {
  const find = (key: string): StoredStand | undefined => chain.find((s) => s.meta.id === key);
  const target = find(id);
  if (!target) return { ok: false, reason: "missing", at: id };
  // from the target to the full stand it leads to
  const path: StoredStand[] = [target];
  const seen = new Set<string>([id]);
  for (let cur: StoredStand = target; cur.form === "delta";) {
    const next = find(cur.base);
    if (!next || seen.has(cur.base)) return { ok: false, reason: "broken-chain", at: cur.base };
    seen.add(cur.base);
    path.push(next);
    cur = next;
  }
  // from the full stand back to the target, every stand checked against its own hash
  let text = "";
  for (let i = path.length - 1; i >= 0; i--) {
    const s = path[i];
    if (!s) continue;
    text = s.form === "full" ? s.text : applyDelta(text, s.ops);
    if (sha256HexUtf8(text) !== s.meta.hash) return { ok: false, reason: "hash-mismatch", at: s.meta.id };
  }
  return { ok: true, text };
}

/** One JSON object on one line (JSON escapes line breaks inside strings). */
export function serializeStand(stand: StoredStand): string {
  const m = stand.meta;
  const meta: Record<string, unknown> = { id: m.id, docId: m.docId, time: m.time, author: m.author, parent: m.parent };
  if (m.name !== undefined) meta.name = m.name;
  meta.anchor = m.anchor;
  meta.hash = m.hash;
  return JSON.stringify(stand.form === "full" ? { meta, form: "full", text: stand.text } : { meta, form: "delta", base: stand.base, ops: stand.ops });
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

function parseOps(v: unknown): DeltaOp[] | null {
  if (!Array.isArray(v)) return null;
  const ops: DeltaOp[] = [];
  for (const op of v as unknown[]) {
    if (!Array.isArray(op) || op.length !== 2) return null;
    const [code, arg] = op as [unknown, unknown];
    if (code === 0 && isCount(arg)) ops.push([0, arg]);
    else if (code === -1 && isCount(arg)) ops.push([-1, arg]);
    else if (code === 1 && typeof arg === "string") ops.push([1, arg]);
    else return null;
  }
  return ops;
}

/** The stand `raw` holds, or `null` for anything that is not exactly one: bad JSON, a missing or mistyped field, an unknown op. Unknown extra fields are dropped. */
export function parseStand(raw: string): StoredStand | null {
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (!isObject(v) || !isObject(v.meta)) return null;
  const m = v.meta;
  const { id, docId, time, author, parent, name, anchor, hash } = m;
  if (typeof id !== "string" || typeof docId !== "string" || typeof time !== "string" || typeof author !== "string") return null;
  if (parent !== null && typeof parent !== "string") return null;
  if (name !== undefined && typeof name !== "string") return null;
  if (typeof anchor !== "boolean" || typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) return null;
  const meta: StandMeta = { id, docId, time, author, parent, anchor, hash };
  if (name !== undefined) meta.name = name;
  if (v.form === "full" && typeof v.text === "string") return { meta, form: "full", text: v.text };
  if (v.form === "delta" && typeof v.base === "string") {
    const ops = parseOps(v.ops);
    return ops ? { meta, form: "delta", base: v.base, ops } : null;
  }
  return null;
}
