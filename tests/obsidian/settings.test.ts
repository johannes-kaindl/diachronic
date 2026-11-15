import { describe, expect, it, vi } from "vitest";
import { PluginSettingTab, type App, type Plugin } from "obsidian";
import "../../src/i18n/strings";
import { DEFAULT_SETTINGS, loadSettings } from "../../src/core/settings";
import { commitFolderOf } from "../../src/core/commit-note";
import { DiachronicSettingTab, type SettingsHost } from "../../src/obsidian/settings";
import { installFolderHide } from "../../src/vendor/kit-obsidian/folder-hide";
import { makeFakeApp } from "../vendor/kit/obsidian-mock";

function tab() {
  const host = { manifest: { id: "diachronic" }, settings: { ...DEFAULT_SETTINGS }, saveSettings: vi.fn().mockResolvedValue(undefined) } as unknown as Plugin & SettingsHost;
  return { tab: new DiachronicSettingTab({} as App, host), host };
}

describe("settings", () => {
  it("keeps a stored folder for stand notes, also the old default, when loading a data.json from 0.2.0 (the new default only applies to an empty value)", () => {
    const aus020 = { authorName: "J", standFolder: "Diachronic", commitFolder: "Diachronic/Stand notes", hideStandFolder: true, colorByAuthor: false, exclusionOffered: true };
    expect(loadSettings(aus020).commitFolder).toBe("Diachronic/Stand notes");
    expect(loadSettings({ ...aus020, commitFolder: "  Protokoll  " }).commitFolder).toBe("Protokoll");
    expect(loadSettings({ ...aus020, commitFolder: "" }).commitFolder).toBe("");
    expect(commitFolderOf("Diachronic", loadSettings(aus020).commitFolder)).toBe("Diachronic/Stand notes");
    expect(commitFolderOf("Diachronic", loadSettings({ ...aus020, commitFolder: "" }).commitFolder)).toBe("Stand notes");
  });

  it("has the documented defaults", () => {
    expect(DEFAULT_SETTINGS).toEqual({ authorName: "", standFolder: "Diachronic", commitFolder: "", hideStandFolder: true, colorByAuthor: false, exclusionOffered: false });
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings({ authorName: " Johannes ", colorByAuthor: "ja", standFolder: "  " })).toEqual({ ...DEFAULT_SETTINGS, authorName: "Johannes" });
  });

  it("puts the help line first", () => {
    const defs = tab().tab.getSettingDefinitions() as Array<{ name?: string }>;
    expect(defs[0]?.name).toBe("Help");
    expect(defs).toHaveLength(6);
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

  it("keeps an emptied commit folder empty, which means: the subfolder of the stand folder", async () => {
    const { tab: t, host } = tab();
    await t.setControlValue("commitFolder", " Protokoll ");
    expect(host.settings.commitFolder).toBe("Protokoll");
    expect(t.getControlValue("commitFolder")).toBe("Protokoll");
    await t.setControlValue("commitFolder", "   ");
    expect(host.settings.commitFolder).toBe("");
    expect(loadSettings({ commitFolder: 7 }).commitFolder).toBe("");
    expect(loadSettings({ commitFolder: " A/B " }).commitFolder).toBe("A/B");
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
