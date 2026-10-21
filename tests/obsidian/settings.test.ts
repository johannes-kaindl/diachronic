import { describe, expect, it, vi } from "vitest";
import { PluginSettingTab, type App, type Plugin } from "obsidian";
import "../../src/i18n/strings";
import { DEFAULT_SETTINGS, loadSettings } from "../../src/core/settings";
import { DiachronicSettingTab, type SettingsHost } from "../../src/obsidian/settings";
import { installFolderHide } from "../../src/vendor/kit-obsidian/folder-hide";
import { makeFakeApp } from "../vendor/kit/obsidian-mock";

function tab() {
  const host = { manifest: { id: "diachronic" }, settings: { ...DEFAULT_SETTINGS }, saveSettings: vi.fn().mockResolvedValue(undefined) } as unknown as Plugin & SettingsHost;
  return { tab: new DiachronicSettingTab({} as App, host), host };
}

describe("settings", () => {
  it("has the documented defaults", () => {
    expect(DEFAULT_SETTINGS).toEqual({ authorName: "", standFolder: "Diachronic", hideStandFolder: true, colorByAuthor: false });
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings({ authorName: " Johannes ", colorByAuthor: "ja", standFolder: "  " })).toEqual({ ...DEFAULT_SETTINGS, authorName: "Johannes" });
  });

  it("puts the help line first", () => {
    const defs = tab().tab.getSettingDefinitions() as Array<{ name?: string }>;
    expect(defs[0]?.name).toBe("Help");
    expect(defs).toHaveLength(5);
  });

  it("saves a changed value and trims the name", async () => {
    const { tab: t, host } = tab();
    await t.setControlValue("authorName", "  Johannes ");
    expect(host.settings.authorName).toBe("Johannes");
    await t.setControlValue("colorByAuthor", true);
    expect(host.settings.colorByAuthor).toBe(true);
    expect(host.saveSettings).toHaveBeenCalledTimes(2);
    expect(t.getControlValue("colorByAuthor")).toBe(true);
  });

  it("falls back to the default folder when the field is emptied", async () => {
    const { tab: t, host } = tab();
    await t.setControlValue("standFolder", "Versionen");
    expect(host.settings.standFolder).toBe("Versionen");
    await t.setControlValue("standFolder", "   ");
    expect(host.settings.standFolder).toBe("Diachronic");
  });

  it("toggling 'hide' reaches the folder-hide handle through saveSettings", async () => {
    const app = makeFakeApp() as App;
    const handle = installFolderHide(app.workspace.rootSplit.doc, "Diachronic", true);
    const update = vi.spyOn(handle, "update");
    const host = { manifest: { id: "diachronic" }, settings: { ...DEFAULT_SETTINGS }, saveSettings: () => { handle.update(host.settings.standFolder, host.settings.hideStandFolder); return Promise.resolve(); } } as unknown as Plugin & SettingsHost;
    const t = new DiachronicSettingTab(app, host);
    await t.setControlValue("hideStandFolder", false);
    expect(update).toHaveBeenCalledWith("Diachronic", false);
  });

  it("re-renders when the tab opens again after hide (Obsidian 1.13: open calls renderTab)", () => {
    const proto = PluginSettingTab.prototype as unknown as { renderTab?: () => void };
    let native = 0;
    proto.renderTab = () => { native++; };
    try {
      const rebuild = vi.spyOn(DiachronicSettingTab.prototype as unknown as { renderImperative(): void }, "renderImperative").mockImplementation(() => {});
      const { tab: t } = tab();
      const x = t as unknown as { renderTab(): void; hide(): void };
      x.renderTab();
      x.hide();
      x.renderTab();
      expect(rebuild).toHaveBeenCalledTimes(2);
      expect(native).toBe(0);
      rebuild.mockRestore();
    } finally {
      delete proto.renderTab;
    }
  });
});
