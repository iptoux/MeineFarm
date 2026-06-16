import type { WeatherKind } from "../../scene/Weather";

/** Bau-/Building-ID des Feldes (in BUILDINGS mit slotCount 0). */
export const FIELD_ID = "feld";

/** Wachstumszustände eines Feldes. */
export type FieldStateName = "dirt" | "growing" | "ready";

/** Modellpfade je Zustand. */
export const FIELD_MODELS: Record<FieldStateName, string> = {
  dirt: "/models/farm/Farm Dirt.glb",
  growing: "/models/farm/Farm.glb",
  ready: "/models/farm/Crops.glb",
};

/** Modell der schwebenden Ernte-Blase (statt der Münze). */
export const PUMPKIN_MODEL = "/models/farm/Pumpkin.glb";

/** Ein Spiel-Tag in Sekunden (= DAY_LENGTH_SEC im SkyManager). */
const GAME_DAY_SEC = 360;

/** Bau → Wachstum nach 2 Spiel-Tagen. */
export const GROW_TO_GROWING_SEC = 2 * GAME_DAY_SEC;
/** Wachstum → Ernte nach 3 weiteren Spiel-Tagen. */
export const GROW_TO_READY_SEC = 3 * GAME_DAY_SEC;

/** Ertrags-Spanne pro Ernte (abhängig vom Wetter über den Wachstumszeitraum). */
export const MIN_YIELD = 4;
export const MAX_YIELD = 10;

/**
 * Wachstums-Güte je Wetterlage [0..1]. Regen ist ideal, Sturm schadet.
 * Wird über den ganzen Wachstumszeitraum gewichtet gemittelt und bestimmt den Ertrag.
 */
export const WEATHER_GROWTH_FACTOR: Record<WeatherKind, number> = {
  rain: 1.0,
  clear: 0.7,
  fog: 0.45,
  storm: 0.15,
};

/** Neutraler Wetterfaktor (Offline-Fortschritt, fehlende Daten). */
export const NEUTRAL_WEATHER_FACTOR = WEATHER_GROWTH_FACTOR.clear;

/** Rechnet einen gemittelten Wetterfaktor [0..1] in einen ganzzahligen Ertrag [4..10] um. */
export function yieldFromWeather(avgFactor: number): number {
  const f = Math.min(Math.max(avgFactor, 0), 1);
  const y = Math.round(MIN_YIELD + f * (MAX_YIELD - MIN_YIELD));
  return Math.min(Math.max(y, MIN_YIELD), MAX_YIELD);
}
