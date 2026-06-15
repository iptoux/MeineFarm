export interface BuildingDef {
  id: string;
  name: string;
  /** Baukosten (das Start-Gebäude wird kostenlos platziert). */
  cost: number;
  /** Anzahl der Slots, die dieses Gebäude bereitstellt. */
  slotCount: number;
  /** Grundfläche in Welt-Einheiten (Breite x Tiefe) — für Slot-Raster & Platzierung. */
  width: number;
  depth: number;
  /** Dachfarbe (Fallback-Primitive). */
  roofColor: number;
  /** Optional: Pfad zum glTF-Gebäudemodell (Poly Pizza). */
  model?: string;
  /** Optional: Basis-Drehung des Modells (Radiant), um die Vorderseite nach +z zu drehen. */
  modelRotation?: number;
  /** Optional: Material-Namen, die als „Dach" beim Nah-Zoom ausgeblendet werden. */
  roofMaterials?: string[];
  /** Optional: beim Nah-Zoom das ganze Gebäude ausblenden (für geschlossene Gebäude). */
  fadeAll?: boolean;
  /** Optional: Rand-Abstand des Slot-Rasters (x & z) — größer = Slots weiter innen. */
  slotInset?: number;
}

export const BUILDINGS: BuildingDef[] = [
  {
    id: "stall",
    name: "Stall",
    cost: 120,
    slotCount: 8,
    width: 10,
    depth: 10,
    roofColor: 0x8a3324,
    model: "/models/buildings/Open Barn.glb",
    roofMaterials: ["RoofBlack"],
    fadeAll: false,
  },
  {
    id: "scheune",
    name: "Große Scheune",
    cost: 300,
    slotCount: 16,
    width: 14,
    depth: 14,
    roofColor: 0x4a6a2a,
    model: "/models/buildings/Big Barn.glb",
    fadeAll: true,
    slotInset: 3.4,
  },
];

export function getBuilding(id: string): BuildingDef | undefined {
  return BUILDINGS.find((b) => b.id === id);
}
