/** Kantenlänge einer Straßen-Kachel in Welt-Einheiten (Rasterweite). */
export const ROAD_TILE = 3;

export interface RoadDef {
  id: string;
  name: string;
  cost: number;
  color: number;
}

/** Baubare Straßentypen. */
export const ROADS: RoadDef[] = [
  { id: "strasse", name: "Straße", cost: 5, color: 0x55524d },
  { id: "feldweg", name: "Feldweg", cost: 2, color: 0x8a6a44 },
];

export function getRoad(id: string): RoadDef | undefined {
  return ROADS.find((r) => r.id === id);
}

/** Welt-Mittelpunkt einer Gitterzelle. */
export function roadCellCenter(gx: number, gz: number): { x: number; z: number } {
  return { x: gx * ROAD_TILE, z: gz * ROAD_TILE };
}

/** Gitterzelle, in der ein Welt-Punkt liegt. */
export function worldToCell(x: number, z: number): { gx: number; gz: number } {
  return { gx: Math.round(x / ROAD_TILE), gz: Math.round(z / ROAD_TILE) };
}
