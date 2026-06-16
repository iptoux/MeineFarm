export interface AnimalDef {
  /** Stabile ID, auch im Spielstand gespeichert. */
  id: string;
  /** Anzeigename im Menü. */
  name: string;
  /** Kaufpreis. */
  cost: number;
  /** Wert einer voll gefüllten Münz-Blase bei Normaltempo. */
  income: number;
  /** Zeit (ms), bis die Blase bei Normaltempo voll ist. */
  intervalMs: number;
  /** Produktionsfaktor im Boost-Modus (Blase voll, online). */
  boostFactor: number;
  /** Pfad zum glTF-Modell (Poly Pizza). */
  model: string;
  /** Fallback-Farbe, falls das Modell nicht geladen werden kann. */
  color: number;
  /** Zielgröße (längste Bounding-Box-Kante in Welt-Einheiten) für relative Tiergrößen. */
  size: number;
}

/**
 * Tier-Katalog. Neue Tiere = nur ein weiterer Eintrag.
 * Kosten & Einkommen steigen exponentiell (~x6-8 pro Stufe).
 */
export const ANIMALS: AnimalDef[] = [
  { id: "huhn", name: "Huhn", cost: 10, income: 2, intervalMs: 4000, boostFactor: 2, model: "/models/animals/Chicken.glb", color: 0xffffff, size: 0.85 },
  { id: "schwein", name: "Schwein", cost: 75, income: 4, intervalMs: 6000, boostFactor: 2, model: "/models/animals/Pig.glb", color: 0xff9aa2, size: 2.25 },
  { id: "schaf", name: "Schaf", cost: 150, income: 8, intervalMs: 5000, boostFactor: 2, model: "/models/animals/Sheep.glb", color: 0xeeeae0, size: 1.9 },
  { id: "kuh", name: "Kuh", cost: 200, income: 16, intervalMs: 8000, boostFactor: 2, model: "/models/animals/Cow.glb", color: 0x6b4f3a, size: 3.5 },
  { id: "pferd", name: "Pferd", cost: 500, income: 24, intervalMs: 6000, boostFactor: 2, model: "/models/animals/Horse.glb", color: 0x7a5230, size: 3.2 },
];

export function getAnimal(id: string): AnimalDef | undefined {
  return ANIMALS.find((a) => a.id === id);
}
