import { Plugin, getLanguage } from "obsidian";
import "./i18n/strings";
import { DEFAULT_SETTINGS, loadSettings, type DiachronicSettings } from "./core/settings";
import { createStandStore, type StandStore } from "./obsidian/stand-store";
import { holdIncoming, markChangesCommand, type CommandDeps } from "./obsidian/commands";
import { activeDoc } from "./obsidian/editor-io";
import { getLang, pickLang, setLang, t } from "./vendor/kit/i18n";
import type { StandNameStrings } from "./core/stand-plan";

function safeGetLanguage(): string | null { try { return getLanguage(); } catch { return null; } }

/** Kennung für Dokumente, Stände und Einträge: `crypto.randomUUID` ohne Bindestriche (Kleinbuchstaben und Ziffern, dateinamentauglich), wie die anderen Plugins. */
const randomId = (): string => crypto.randomUUID().replace(/-/g, "");

const standNames: StandNameStrings = {
  incoming: (n) => t("stand.incoming", n),
  outgoing: (n) => t("stand.outgoing", n),
  release: (v) => t("stand.release", v),
  get beforeBulk() { return t("stand.beforeBulk"); },
  get beforeKoda() { return t("stand.beforeKoda"); },
  get manual() { return t("stand.manual"); },
};

export default class DiachronicPlugin extends Plugin {
  settings: DiachronicSettings = DEFAULT_SETTINGS;
  stands!: StandStore;

  async onload(): Promise<void> {
    setLang(pickLang(safeGetLanguage() ?? getLang()));
    this.settings = loadSettings(await this.loadData());
    this.stands = createStandStore(this.app, () => this.settings.standFolder, standNames, () => new Date(), randomId);
    const deps: CommandDeps = {
      app: this.app,
      settings: () => this.settings,
      stands: this.stands,
      now: () => new Date(),
      newId: randomId,
      openSettings: () => { /* Einstellungs-Tab folgt in D9 */ },
    };
    this.addCommand({
      id: "hold-incoming",
      name: t("cmd.holdIncoming"),
      checkCallback: (checking) => {
        const doc = activeDoc(this.app);
        if (!doc) return false;
        if (!checking) void holdIncoming(deps, doc);
        return true;
      },
    });
    this.addCommand({
      id: "mark-changes",
      name: t("cmd.markChanges"),
      checkCallback: (checking) => {
        const doc = activeDoc(this.app);
        if (!doc) return false;
        if (!checking) void markChangesCommand(deps, doc);
        return true;
      },
    });
  }
}
