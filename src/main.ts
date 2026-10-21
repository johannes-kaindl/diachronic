import { Plugin, TFile, debounce, getLanguage, type Editor, type WorkspaceLeaf } from "obsidian";
import { EditorView } from "@codemirror/view";
import "./i18n/strings";
import { readDocMeta } from "./core/doc-meta";
import { splitDoc } from "./core/meta-zone";
import { authorSlotOf } from "./core/review-vm";
import { DEFAULT_SETTINGS, loadSettings, type DiachronicSettings } from "./core/settings";
import { createStandStore, type StandStore } from "./obsidian/stand-store";
import { commentSelection, decideNext, holdIncoming, markChangesCommand, releaseCommand, type CommandDeps } from "./obsidian/commands";
import { askComment } from "./obsidian/comment-modal";
import { showDiff } from "./obsidian/diff-modal";
import { activeDoc } from "./obsidian/editor-io";
import { handleArrival, pickNote, sendBack } from "./obsidian/exchange-io";
import { DiachronicSettingTab } from "./obsidian/settings";
import { DiachronicView, VIEW_TYPE } from "./obsidian/view";
import { installFolderHide, type FolderHideHandle } from "./vendor/kit-obsidian/folder-hide";
import { confirmAction } from "./vendor/kit-obsidian/confirm";
import { criticEditorExtension, criticRefresh } from "./vendor/kit-obsidian/critic-editor";
import { parseCritic, type CriticMark } from "./vendor/kit/critic-markup";
import { getLang, pickLang, setLang, t } from "./vendor/kit/i18n";
import type { StandNameStrings } from "./core/stand-plan";

function safeGetLanguage(): string | null { try { return getLanguage(); } catch { return null; } }

/** Kennung für Dokumente, Stände und Einträge: `crypto.randomUUID` ohne Bindestriche (Kleinbuchstaben und Ziffern, dateinamentauglich), wie die anderen Plugins. */
const randomId = (): string => crypto.randomUUID().replace(/-/g, "");

const standNames: StandNameStrings = {
  incoming: (n) => t("stand.incoming", n),
  outgoing: (n) => t("stand.outgoing", n),
  marked: (n) => t("stand.marked", n),
  release: (v) => t("stand.release", v),
  get beforeBulk() { return t("stand.beforeBulk"); },
  get beforeKoda() { return t("stand.beforeKoda"); },
  get manual() { return t("stand.manual"); },
};

const markKey = (kind: string, text: string, replacement: string | undefined): string => `${kind}\u0000${text}\u0000${replacement ?? ""}`;

export default class DiachronicPlugin extends Plugin {
  settings: DiachronicSettings = DEFAULT_SETTINGS;
  stands!: StandStore;
  private deps!: CommandDeps;
  private folderHide: FolderHideHandle | null = null;
  /** Autoren-Platz je Marke der aktiven Notiz, für „Farbe je Autor“ im Editor (Anzeige, kein Vertrag). */
  private authorSlots = new Map<string, number>();

  async onload(): Promise<void> {
    setLang(pickLang(safeGetLanguage() ?? getLang()));
    this.settings = loadSettings(await this.loadData());
    this.stands = createStandStore(this.app, () => this.settings.standFolder, standNames, () => new Date(), randomId);
    this.deps = {
      app: this.app,
      settings: () => this.settings,
      stands: this.stands,
      now: () => new Date(),
      newId: randomId,
      openSettings: () => { this.openSettings(); },
      when: (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }); },
      doc: () => activeDoc(this.app),
      ui: {
        confirm: (opts) => confirmAction(this.app, opts),
        askComment: (opts) => askComment(this.app, opts),
        showDiff: (opts) => { showDiff(this.app, opts); },
        pickNote: (files, stem) => pickNote(this.app, files, stem),
      },
    };
    const deps = this.deps;

    this.addSettingTab(new DiachronicSettingTab(this.app, this));
    // Der Ordner der Stände bleibt im Vault und wird nur im Datei-Explorer ausgeblendet; das Hauptfenster, nicht `activeDocument` (beim Laden ungewiss).
    this.app.workspace.onLayoutReady(() => {
      this.folderHide = installFolderHide(this.app.workspace.rootSplit.doc, this.settings.standFolder, this.settings.hideStandFolder, () => {});
    });
    this.register(() => { this.folderHide?.remove(); });

    this.registerView(VIEW_TYPE, (leaf: WorkspaceLeaf) => new DiachronicView(leaf, deps));
    this.registerEditorExtension(criticEditorExtension({
      onMarkClick: (mark) => { void this.focusCard(mark); },
      authorSlot: (mark) => this.authorSlots.get(markKey(mark.kind, mark.text, mark.replacement)),
      colorByAuthor: () => this.settings.colorByAuthor,
    }));

    const withDoc = (run: (doc: NonNullable<ReturnType<typeof activeDoc>>) => Promise<void>) => (checking: boolean): boolean => {
      const doc = activeDoc(this.app);
      if (!doc) return false;
      if (!checking) void run(doc);
      return true;
    };
    this.addCommand({ id: "open-view", name: t("cmd.openView"), callback: () => { void this.activateView(); } });
    this.addCommand({ id: "hold-incoming", name: t("cmd.holdIncoming"), checkCallback: withDoc((doc) => holdIncoming(deps, doc)) });
    this.addCommand({ id: "mark-changes", name: t("cmd.markChanges"), checkCallback: withDoc((doc) => markChangesCommand(deps, doc)) });
    this.addCommand({ id: "comment", name: t("cmd.comment"), checkCallback: withDoc((doc) => commentSelection(deps, doc)) });
    this.addCommand({ id: "send", name: t("cmd.send"), checkCallback: withDoc((doc) => sendBack(deps, doc)) });
    this.addCommand({ id: "release", name: t("cmd.release"), checkCallback: withDoc((doc) => releaseCommand(deps, doc)) });
    this.addCommand({ id: "take-over", name: t("cmd.takeOver"), checkCallback: withDoc((doc) => handleArrival(deps, doc.file, true)) });
    this.addCommand({ id: "accept-next", name: t("cmd.acceptNext"), checkCallback: withDoc((doc) => decideNext(deps, doc, "accept")) });
    this.addCommand({ id: "reject-next", name: t("cmd.rejectNext"), checkCallback: withDoc((doc) => decideNext(deps, doc, "reject")) });

    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor: Editor) => {
      if (!editor.somethingSelected()) return;
      menu.addItem((item) => item.setTitle(t("cmd.comment")).setIcon("message-square").onClick(() => {
        const doc = activeDoc(this.app);
        if (doc) void commentSelection(deps, doc);
      }));
    }));

    // Neu angekommene Dateien (erst nach dem Laden des Vaults, sonst meldet jede Datei beim Start „create“): Übernehmen anbieten, nie automatisch.
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(this.app.vault.on("create", (file) => { if (file instanceof TFile) void handleArrival(deps, file); }));
    });

    // Die Ansicht folgt der aktiven Notiz; Änderungen am Text bauen die Liste (entprellt) neu auf.
    const rebuild = debounce(() => { this.rebuildAuthors(); this.view()?.refresh(); }, 300, true);
    this.registerEvent(this.app.workspace.on("file-open", (file) => { this.rebuildAuthors(); this.view()?.notifyFileOpen(file?.path ?? null); }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => { this.rebuildAuthors(); this.view()?.notifyFileOpen(activeDoc(this.app)?.file.path ?? null); }));
    this.registerEvent(this.app.vault.on("modify", (file) => { if (file.path === activeDoc(this.app)?.file.path) rebuild(); }));
    this.registerEvent(this.app.workspace.on("editor-change", () => { if (this.settings.colorByAuthor) rebuild(); }));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.folderHide?.update(this.settings.standFolder, this.settings.hideStandFolder);
    this.rebuildAuthors();
  }

  /** Öffnet die Einstellungen dieses Plugins (der Name fehlt noch, bevor etwas geschrieben werden kann). */
  private openSettings(): void {
    const setting = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } }).setting;
    setting?.open();
    setting?.openTabById(this.manifest.id);
  }

  private view(): DiachronicView | null {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    return leaf && leaf.view instanceof DiachronicView ? leaf.view : null;
  }

  async activateView(): Promise<DiachronicView | null> {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      const right = this.app.workspace.getRightLeaf(false);
      if (!right) return null;
      await right.setViewState({ type: VIEW_TYPE, active: true });
      leaf = right;
    }
    // Eine Seitenleiste, die nur über setViewState geöffnet wurde, bleibt 0×0 breit, bis sie enthüllt wird (REGISTRY).
    await this.app.workspace.revealLeaf(leaf);
    return leaf.view instanceof DiachronicView ? leaf.view : null;
  }

  /** Klick auf eine Marke im Editor: Ansicht öffnen, Tab „Prüfen“ zeigen, die zugehörige Karte hervorheben. */
  private async focusCard(mark: CriticMark): Promise<void> {
    const view = await this.activateView();
    if (!view) return;
    view.showTab("review");
    await view.review.refresh();
    const id = view.review.idAt(mark.start);
    if (id) view.review.highlight(id);
  }

  /** Autoren-Platz je Marke der aktiven Notiz neu aufbauen und die Editoren zur Neuberechnung bewegen. */
  private rebuildAuthors(): void {
    this.authorSlots.clear();
    const doc = activeDoc(this.app);
    const text = doc?.editor?.getValue();
    if (text === undefined) return;
    const meta = readDocMeta(text);
    const split = splitDoc(text);
    if (!meta || !split.ok) return;
    // Die Einträge stehen im Metadaten-Block; ihr Zitat ist der Rohtext der Marke.
    for (const e of split.parts.entries) {
      const m = parseCritic(e.quote.exact, { skipFrontmatter: false }).marks[0];
      if (m) this.authorSlots.set(markKey(m.kind, m.text, m.replacement), authorSlotOf(e.author, meta));
    }
    const cm = (doc?.editor as unknown as { cm?: unknown } | null)?.cm;
    if (cm instanceof EditorView) cm.dispatch({ effects: criticRefresh.of(null) });
  }
}
