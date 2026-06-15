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
}

/**
 * Tier-Katalog. Neue Tiere = nur ein weiterer Eintrag.
 * Kosten & Einkommen steigen exponentiell (~x6-8 pro Stufe).
 */
export const ANIMALS: AnimalDef[] = [
  { id: "huhn", name: "Huhn", cost: 10, income: 2, intervalMs: 4000, boostFactor: 2, model: "/models/animals/Chicken.glb", color: 0xffffff },
  { id: "schwein", name: "Schwein", cost: 75, income: 12, intervalMs: 6000, boostFactor: 2, model: "/models/animals/Pig.glb", color: 0xff9aa2 },
  { id: "schaf", name: "Schaf", cost: 200, income: 32, intervalMs: 7000, boostFactor: 2, model: "/models/animals/Sheep.glb", color: 0xeeeae0 },
  { id: "kuh", name: "Kuh", cost: 400, income: 60, intervalMs: 9000, boostFactor: 2, model: "/models/animals/Cow.glb", color: 0x6b4f3a },
  { id: "pferd", name: "Pferd", cost: 1500, income: 220, intervalMs: 12000, boostFactor: 2, model: "/models/animals/Horse.glb", color: 0x7a5230 },
];

export function getAnimal(id: string): AnimalDef | undefined {
  return ANIMALS.find((a) => a.id === id);
}
