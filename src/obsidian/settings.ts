import { PluginSettingTab, type App, type Plugin, type SettingDefinitionItem } from "obsidian";
import { DEFAULT_SETTINGS, type DiachronicSettings } from "../core/settings";
import { githubHelpUrls, helpSettingDefinition } from "../vendor/kit-obsidian/help-setting";
import { installTabRefreshOnOpen, renderSettingDefinitions } from "../vendor/kit-obsidian/settings_walker";
import { t } from "../vendor/kit/i18n";

/** Was der Tab vom Plugin braucht: die Werte und das Speichern (das auch den Ordner-Schalter und den Editor nachzieht). */
export interface SettingsHost {
  settings: DiachronicSettings;
  saveSettings(): Promise<void>;
}

/** Deklarative Einstellungen (ab Obsidian 1.13 fragt der Host `getSettingDefinitions()` selbst, darunter zeichnet `display()` dieselbe Struktur). */
export class DiachronicSettingTab extends PluginSettingTab {
  private cleanup: () => void = () => {};
  private uninstallRefresh: () => void = () => {};

  constructor(app: App, plugin: Plugin & SettingsHost) {
    super(app, plugin);
    this.host = plugin;
    this.installRefresh();
  }

  private readonly host: SettingsHost;

  /** Ab 1.13 ruft das Öffnen `renderTab()` statt `display()`; ohne den Hook bliebe der Tab beim zweiten Öffnen veraltet. */
  private installRefresh(): void {
    this.uninstallRefresh();
    this.uninstallRefresh = installTabRefreshOnOpen(this, () => { this.renderImperative(); });
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const help = helpSettingDefinition({
      ...githubHelpUrls("diachronic"),
      texts: { name: t("set.help.name"), desc: t("set.help.desc"), openDocs: t("set.help.openDocs"), reportIssue: t("set.help.reportIssue") },
    });
    const items = [
      { name: t("set.authorName"), desc: t("set.authorNameDesc"), control: { type: "text", key: "authorName", placeholder: t("set.authorNamePlaceholder") } },
      { name: t("set.standFolder"), desc: t("set.standFolderDesc"), control: { type: "folder", key: "standFolder", placeholder: DEFAULT_SETTINGS.standFolder } },
      { name: t("set.hideStandFolder"), desc: t("set.hideStandFolderDesc"), control: { type: "toggle", key: "hideStandFolder" } },
      { name: t("set.colorByAuthor"), desc: t("set.colorByAuthorDesc"), control: { type: "toggle", key: "colorByAuthor" } },
    ];
    return [help, ...(items as unknown as SettingDefinitionItem[])];
  }

  getControlValue(key: string): string | boolean | undefined {
    const s = this.host.settings;
    switch (key) {
      case "authorName": return s.authorName;
      case "standFolder": return s.standFolder;
      case "hideStandFolder": return s.hideStandFolder;
      case "colorByAuthor": return s.colorByAuthor;
      default: return undefined;
    }
  }

  setControlValue(key: string, value: unknown): Promise<void> {
    const s = this.host.settings;
    switch (key) {
      case "authorName": s.authorName = typeof value === "string" ? value.trim() : s.authorName; break;
      // Ein leerer Ordner würde Stände in den Vault-Stamm schreiben: dann gilt der Standard.
      case "standFolder": s.standFolder = typeof value === "string" && value.trim() !== "" ? value.trim() : DEFAULT_SETTINGS.standFolder; break;
      case "hideStandFolder": s.hideStandFolder = value === true; break;
      case "colorByAuthor": s.colorByAuthor = value === true; break;
      default: return Promise.resolve();
    }
    return this.host.saveSettings();
  }

  display(): void { this.installRefresh(); this.renderImperative(); }

  private renderImperative(): void {
    this.cleanup();
    this.containerEl.empty();
    this.cleanup = renderSettingDefinitions(this.containerEl, this.getSettingDefinitions(), this, this.app);
  }
}
