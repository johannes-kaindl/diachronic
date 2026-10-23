import { t } from "../vendor/kit/i18n";
import type { ConfirmOptions } from "../vendor/kit-obsidian/confirm";

/**
 * Die Stände sind Markdown-Dateien und erscheinen deshalb in Suche, Graph und Schnellwechsler. „Ausgeschlossene Dateien“
 * (Einstellungen → Dateien & Links) nimmt den Ordner heraus. Die öffentliche API hat dafür keinen Schreibweg (gemessen an
 * `obsidian.d.ts` 1.13.1); ein Griff in die interne Konfiguration wäre ein Eingriff in fremde Einstellungen. Das Plugin fragt
 * deshalb einmal und führt die Person zu der Einstellung, setzen tut sie den Eintrag selbst.
 */
export interface ExclusionHost {
  folder: () => string;
  /** Wurde schon gefragt (in den Einstellungen gespeichert). */
  offered: () => boolean;
  markOffered: () => Promise<void>;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  openFilesAndLinks: () => void;
}

export async function offerExclusion(host: ExclusionHost): Promise<void> {
  if (host.offered()) return;
  // Vor der Frage merken: ein zweiter Stand, der während der offenen Frage entsteht, fragt sonst noch einmal.
  await host.markOffered();
  const folder = host.folder();
  const yes = await host.confirm({
    title: t("exclude.title"),
    message: [t("exclude.message", folder), t("exclude.how", folder)],
    confirmLabel: t("exclude.open"), cancelLabel: t("exclude.later"), warning: false,
  });
  if (yes) host.openFilesAndLinks();
}
