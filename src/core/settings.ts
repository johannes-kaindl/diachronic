import { mergeSettings } from "../vendor/kit/settings";

export interface DiachronicSettings {
  /** Autor der Vorschläge und Kommentare; leer, bis die Person ihn einträgt. */
  authorName: string;
  /** Ordner der Stände im Vault (kein Punkt am Anfang: Sync überspringt Punkt-Ordner). */
  standFolder: string;
  hideStandFolder: boolean;
  /** Farbe je Autor statt je Art (Spec § 2 Punkt 12), standardmäßig aus. */
  colorByAuthor: boolean;
}

export const DEFAULT_SETTINGS: DiachronicSettings = {
  authorName: "",
  standFolder: "Diachronic",
  hideStandFolder: true,
  colorByAuthor: false,
};

/** Gespeicherte Werte über die Defaults; ein Wert vom falschen Typ fällt auf den Default zurück. */
export function loadSettings(raw: unknown): DiachronicSettings {
  const merged = mergeSettings(DEFAULT_SETTINGS, raw);
  return {
    authorName: typeof merged.authorName === "string" ? merged.authorName.trim() : DEFAULT_SETTINGS.authorName,
    standFolder: typeof merged.standFolder === "string" && merged.standFolder.trim() !== "" ? merged.standFolder.trim() : DEFAULT_SETTINGS.standFolder,
    hideStandFolder: typeof merged.hideStandFolder === "boolean" ? merged.hideStandFolder : DEFAULT_SETTINGS.hideStandFolder,
    colorByAuthor: typeof merged.colorByAuthor === "boolean" ? merged.colorByAuthor : DEFAULT_SETTINGS.colorByAuthor,
  };
}
