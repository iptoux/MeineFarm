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
  /** Optional: dieses „Gebäude" ist ein Feld (Wachstums-Zyklus, Ernte statt Slots). */
  isField?: boolean;
  /** Optional: dieses Gebäude ist ein Marktstand (Linksklick → Verkaufs-Menü). */
  isMarket?: boolean;
  /** Kategorie im Bau-Menü (gruppiert die Karten im Popover). */
  category: BuildCategory;
}

/** Gruppen im Bau-Menü. */
export type BuildCategory = "tiere" | "farm" | "zaun";

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
    category: "tiere",
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
    category: "tiere",
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
    category: "zaun",
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
    category: "zaun",
  },
  {
    id: "feld",
    name: "Feld",
    cost: 50,
    slotCount: 0,
    width: 6,
    depth: 6,
    roofColor: 0x6b4a2b,
    model: "/models/farm/Farm Dirt.glb",
    fadeAll: false,
    icon: "🌱",
    isField: true,
    category: "farm",
  },
  {
    id: "marktstand",
    name: "Marktstand",
    cost: 250,
    slotCount: 0,
    width: 11,
    depth: 8,
    roofColor: 0x9a5a2a,
    model: "/models/buildings/Market Stalls.glb",
    fadeAll: false,
    icon: "🛒",
    isMarket: true,
    category: "farm",
  },
  {
    id: "windmuehle",
    name: "Windmühle",
    cost: 280,
    slotCount: 0,
    // Großzügig dimensioniert: Grundfläche 11×11 (größer als der Stall mit 10),
    // dicker Turm (Basis ~8.5) und hoch (~15.4) — die Mühle ist das markanteste
    // Gebäude und überragt Stall & Scheune.
    width: 11,
    depth: 11,
    roofColor: 0x141414,
    model: "/models/buildings/Windmill.glb",
    // Dekorativ: Linksklick öffnet/schließt die Türen, Flügel & Flagge animieren
    // dauerhaft. Nicht ausblenden, damit die Animationen sichtbar bleiben.
    fadeAll: false,
    icon: "🌬️",
    category: "farm",
  },
  {
    id: "vogelscheuche",
    name: "Vogelscheuche",
    cost: 20,
    slotCount: 0,
    width: 2.1,
    depth: 2.1,
    roofColor: 0x8a6a3a,
    model: "/models/farm/Scarecrow.glb",
    fadeAll: false,
    icon: "🧑‍🌾",
    category: "farm",
  },
];

export function getBuilding(id: string): BuildingDef | undefined {
  return BUILDINGS.find((b) => b.id === id);
}
