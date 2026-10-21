import { ItemView, type WorkspaceLeaf } from "obsidian";
import { buildHubInto, type HubController } from "../vendor/kit-obsidian/hub";
import { t } from "../vendor/kit/i18n";
import type { CommandDeps } from "./commands";
import { ReviewPanel } from "./review-panel";
import { StandsPanel } from "./stands-panel";

export const VIEW_TYPE = "diachronic-view";
type TabId = "review" | "stands";

/** Die eine Ansicht des Plugins (rechte Seitenleiste): Hub mit den Tabs „Prüfen“ und „Stände“. */
export class DiachronicView extends ItemView {
  private hub: HubController<TabId> | null = null;
  review: ReviewPanel;
  private readonly stands: StandsPanel;
  private tab: TabId = "review";

  constructor(leaf: WorkspaceLeaf, deps: CommandDeps) {
    super(leaf);
    this.review = new ReviewPanel(deps);
    this.stands = new StandsPanel(deps);
  }

  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return t("view.title"); }
  getIcon(): string { return "check-check"; }

  getState(): Record<string, unknown> { return { tab: this.hub?.currentTab() ?? this.tab }; }
  async setState(state: unknown, result: Parameters<ItemView["setState"]>[1]): Promise<void> {
    const tab = (state as { tab?: unknown } | null)?.tab;
    if (tab === "review" || tab === "stands") { this.tab = tab; this.hub?.setTab(tab); }
    await super.setState(state, result);
  }

  onOpen(): Promise<void> {
    this.hub = buildHubInto(this.contentEl, [this.review, this.stands], this.tab, { rootClasses: ["diachronic-view"] });
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    this.hub?.destroy();
    this.hub = null;
    return Promise.resolve();
  }

  /** Die aktive Notiz hat gewechselt oder sich geändert. */
  refresh(): void { this.hub?.refreshActive(); }
  notifyFileOpen(path: string | null): void { this.hub?.notifyFileOpen(path); }
  showTab(id: TabId): void { this.hub?.setTab(id); }
}
