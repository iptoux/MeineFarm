import { ROAD_TILE } from "./roads";

/**
 * Dynamisches Spielfeld: ein Rechteck in Welt-Einheiten, das der Spieler an den
 * 4 Kanten in Schritten von `CHUNK` erweitern kann. Eine einzige Quelle der
 * Wahrheit (`GameState.field`), aus der Boden, Gras, Bau-/Straßen-Grenzen,
 * Wolkenschatten und Kamera-Pan abgeleitet werden.
 */

/** Achsenparallele Spielfeld-Grenzen in Welt-Einheiten. */
export interface FieldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Erweiterungsschritt pro „+"-Klick (Vielfaches von ROAD_TILE → am Straßenraster). */
export const CHUNK = 4 * ROAD_TILE; // = 12

/** Startfeld – entspricht dem bisherigen FIELD_HALF (±45), keine Regression. */
export const INITIAL_FIELD: FieldBounds = { minX: -45, maxX: 45, minZ: -45, maxZ: 45 };

/** Halbe Startspanne pro Achse (für die Kosten-Staffelung). */
export const INITIAL_SPAN = INITIAL_FIELD.maxX - INITIAL_FIELD.minX; // = 90

/** Perf-Deckel: maximale halbe Ausdehnung pro Achse (vom Zentrum). */
export const MAX_HALF = 90;

/** Welche der 4 Kanten erweitert wird. */
export type FieldEdge = "minX" | "maxX" | "minZ" | "maxZ";

/** Steigende Kosten: n = Anzahl bereits erfolgter Erweiterungen auf dieser Achse. */
export function expansionCost(n: number): number {
  return Math.round(50 * Math.pow(1.6, n));
}

/** Mittelpunkt des Feldes. */
export function fieldCenter(f: FieldBounds): { x: number; z: number } {
  return { x: (f.minX + f.maxX) / 2, z: (f.minZ + f.maxZ) / 2 };
}

/** Validiert geladene Feld-Bounds (4 endliche Zahlen, positive Spanne). */
export function isValidField(f: unknown): f is FieldBounds {
  if (!f || typeof f !== "object") return false;
  const b = f as Record<string, unknown>;
  const nums = [b.minX, b.maxX, b.minZ, b.maxZ];
  if (!nums.every((v) => typeof v === "number" && Number.isFinite(v))) return false;
  return (b.maxX as number) > (b.minX as number) && (b.maxZ as number) > (b.minZ as number);
}
