/** Eine verkaufbare Ernte-Ware (Markt). */
export interface GoodDef {
  id: string;
  name: string;
  /** Emoji-Icon für Dialoge/HUD. */
  icon: string;
  /** Verkaufspreis pro Stück (€). */
  price: number;
}

/**
 * Katalog der am Marktstand verkaufbaren Waren. Aktuell nur Kürbisse; weitere
 * Ernten lassen sich hier ergänzen (Bestand-Mapping in GameState.goodCount/sellGood).
 */
export const GOODS: GoodDef[] = [
  { id: "pumpkin", name: "Kürbis", icon: "🎃", price: 12 },
];

export function getGood(id: string): GoodDef | undefined {
  return GOODS.find((g) => g.id === id);
}
