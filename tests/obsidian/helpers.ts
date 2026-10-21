import { vi } from "vitest";
import type { App } from "obsidian";
import "../../src/i18n/strings";
import { makeFakeApp, makeFakeEditor, TFile } from "../vendor/kit/obsidian-mock";
import { DEFAULT_SETTINGS, type DiachronicSettings } from "../../src/core/settings";
import type { StandNameStrings } from "../../src/core/stand-plan";
import type { CommandDeps } from "../../src/obsidian/commands";
import type { ActiveDoc } from "../../src/obsidian/editor-io";
import { createStandStore } from "../../src/obsidian/stand-store";

/** Ein Vault-Adapter im Speicher: `list` liefert wie Obsidian volle Pfade. */
export function memoryApp(): { app: App; files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const adapter = {
    exists: (p: string): Promise<boolean> => Promise.resolve(files.has(p) || dirs.has(p) || [...files.keys()].some((f) => f.startsWith(`${p}/`))),
    mkdir: (p: string): Promise<void> => { dirs.add(p); return Promise.resolve(); },
    write: (p: string, data: string): Promise<void> => { files.set(p, data); return Promise.resolve(); },
    read: (p: string): Promise<string> => Promise.resolve(files.get(p) ?? ""),
    list: (p: string): Promise<{ files: string[]; folders: string[] }> =>
      Promise.resolve({ files: [...files.keys()].filter((f) => f.startsWith(`${p}/`) && !f.slice(p.length + 1).includes("/")), folders: [] }),
  };
  return { app: { vault: { adapter } } as unknown as App, files, dirs };
}


export const standStrings: StandNameStrings = {
  incoming: (n) => `Round ${n} – incoming`, outgoing: (n) => `Round ${n} – outgoing`, release: (v) => v,
  beforeBulk: "bulk", beforeKoda: "koda", manual: "manual",
};

/** Ein Editor, der `transaction` wie Obsidian anwendet (Änderungen als Zeile/Zeichen). */
export function editorWith(text: string) {
  const ed = makeFakeEditor(text);
  ed.transaction = vi.fn((tx: { changes: Array<{ from: unknown; to: unknown; text: string }> }) => {
    for (const c of tx.changes) ed.replaceRange(c.text, c.from, c.to);
  });
  return ed;
}

export interface Harness {
  deps: CommandDeps;
  editor: ReturnType<typeof editorWith>;
  files: Map<string, string>;
  stands: ReturnType<typeof createStandStore>;
  ui: { confirm: ReturnType<typeof vi.fn>; askComment: ReturnType<typeof vi.fn>; showDiff: ReturnType<typeof vi.fn> };
  /** Reihenfolge der Schreibvorgänge: Stände und Editor-Transaktionen. */
  log: string[];
}

/** Alles, was ein Panel braucht: eine Notiz im Editor, Stände im Speicher, Dialoge als Attrappen. */
export function harness(text: string, settings: Partial<DiachronicSettings> = { authorName: "Johannes" }): Harness {
  const m = memoryApp();
  const app = Object.assign(makeFakeApp() as App, { vault: { adapter: (m.app as unknown as { vault: { adapter: unknown } }).vault.adapter } });
  const editor = editorWith(text);
  const log: string[] = [];
  const tx = editor.transaction as ReturnType<typeof vi.fn>;
  const baseTx = tx.getMockImplementation();
  tx.mockImplementation((arg: never) => { log.push("write"); baseTx?.(arg); });
  let n = 0;
  let t = Date.UTC(2026, 9, 18, 10, 0, 0);
  const stands = createStandStore(app, () => "Diachronic", standStrings, () => new Date((t += 60_000)), () => `x${++n}`);
  const add = stands.add.bind(stands);
  stands.add = async (...args) => { log.push(`stand:${args[2].reason}`); return add(...args); };
  const ui = { confirm: vi.fn().mockResolvedValue(true), askComment: vi.fn().mockResolvedValue("Bitte prüfen"), showDiff: vi.fn() };
  const doc: ActiveDoc = { file: new TFile("brief.md"), editor: editor as unknown as ActiveDoc["editor"] };
  let k = 0;
  const deps: CommandDeps = {
    app, settings: () => ({ ...DEFAULT_SETTINGS, ...settings }), stands, now: () => new Date(Date.UTC(2026, 9, 18, 16, 0, 0)),
    newId: () => `id${++k}`, openSettings: vi.fn(), when: (iso) => `@${iso.slice(0, 10)}`, doc: () => doc, ui,
  };
  return { deps, editor, files: m.files, stands, ui, log };
}

/** Lässt angestoßene Promises (Klick → Aktion → Neuaufbau) zu Ende laufen. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 12; i++) await new Promise<void>((r) => { setTimeout(r, 0); });
}
