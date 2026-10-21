import type { App, DataAdapter } from "obsidian";
import { checkRelPath } from "../vendor/kit/rel-path";
import { addStand, parseStand, serializeStand, type StoredStand } from "../vendor/kit/version-chain";
import { isSafeId } from "../core/doc-meta";
import { isAnchor, standId, standName, type StandNameStrings, type StandReason } from "../core/stand-plan";
import { STAND_EXT } from "../core/types";

export interface StandInput {
  reason: StandReason;
  author: string;
  round: number;
  version: string | null;
  custom?: string;
}

export interface StandStore {
  /** Alle lesbaren Stände des Dokuments; beschädigte Dateien fehlen in der Rückgabe und stehen in `skippedFiles`. */
  load(docId: string): Promise<StoredStand[]>;
  /** Schreibt genau diese Stände, in dieser Reihenfolge (der neue Kopf zuerst: eine Unterbrechung lässt zwei volle Stände zurück, nie keinen). */
  save(docId: string, stands: readonly StoredStand[]): Promise<void>;
  add(docId: string, text: string, input: StandInput): Promise<StoredStand>;
  /** Beschädigte oder fremde Dateien des letzten `load`. */
  readonly skippedFiles: readonly string[];
  readonly skipped: number;
}

export function createStandStore(app: App, folder: () => string, strings: StandNameStrings, now: () => Date, newId: () => string): StandStore {
  const adapter = (): DataAdapter => app.vault.adapter;
  let skippedFiles: string[] = [];

  function root(): string {
    const r = checkRelPath(folder());
    if (!r.ok) throw new RangeError(`diachronic: unusable stand folder "${folder()}" (${r.problem})`);
    return r.path;
  }

  function docDir(docId: string): string {
    if (!isSafeId(docId)) throw new RangeError(`diachronic: unsafe document id "${docId}"`);
    return `${root()}/${docId}`;
  }

  async function ensureDir(path: string): Promise<void> {
    if (!(await adapter().exists(path))) await adapter().mkdir(path);
  }

  const suffix = `.${STAND_EXT}`;

  const store: StandStore = {
    get skippedFiles() { return skippedFiles; },
    get skipped() { return skippedFiles.length; },

    async load(docId) {
      const dir = docDir(docId);
      skippedFiles = [];
      if (!(await adapter().exists(dir))) return [];
      const listed = await adapter().list(dir);
      const out: StoredStand[] = [];
      for (const path of listed.files.filter((f) => f.endsWith(suffix)).sort()) {
        const stand = parseStand(await adapter().read(path));
        if (stand === null || stand.meta.docId !== docId) skippedFiles.push(path);
        else out.push(stand);
      }
      return out;
    },

    async save(docId, stands) {
      const dir = docDir(docId);
      await ensureDir(root());
      await ensureDir(dir);
      for (const s of stands) {
        if (!isSafeId(s.meta.id)) throw new RangeError(`diachronic: unsafe stand id "${s.meta.id}"`);
        await adapter().write(`${dir}/${s.meta.id}${suffix}`, serializeStand(s));
      }
    },

    async add(docId, text, input) {
      const unique = newId();
      if (!/^[A-Za-z0-9]+$/.test(unique)) throw new RangeError("diachronic: stand id part must be alphanumeric");
      const chain = await store.load(docId);
      const named = input.reason === "manual" && input.custom !== undefined && input.custom.trim() !== "";
      const { write } = addStand(chain, text, {
        id: standId(input.reason, input.round, unique),
        docId,
        time: now().toISOString(),
        author: input.author,
        name: standName(input.reason, input.round, input.version, strings, input.custom),
        anchor: isAnchor(input.reason) || named,
      });
      await store.save(docId, write);
      const fresh = write[0];
      if (!fresh) throw new Error("diachronic: addStand returned nothing to write");
      return fresh;
    },
  };
  return store;
}
