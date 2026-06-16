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
  /** Optional: Emoji im Bau-Menü (Default 🏠). */
  icon?: string;
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
    // Beim Nah-Zoom das ganze Gebäude ausblenden (wie die Große Scheune) – nur das
    // Dach reicht nicht, da darunter noch eine rote Schicht sichtbar bliebe.
    fadeAll: true,
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
  {
    id: "zaun",
    name: "Zaun",
    cost: 15,
    slotCount: 0,
    width: 6,
    depth: 1,
    roofColor: 0x5a2f1a,
    model: "/models/buildings/Fence.glb",
    fadeAll: false,
    icon: "🚧",
  },
  {
    id: "zaun_gross",
    name: "Großer Zaun",
    cost: 30,
    slotCount: 0,
    width: 6,
    depth: 1,
    roofColor: 0x5a2f1a,
    model: "/models/buildings/Fence_big.glb",
    fadeAll: false,
    icon: "🚧",
  },
];

export function getBuilding(id: string): BuildingDef | undefined {
  return BUILDINGS.find((b) => b.id === id);
}
