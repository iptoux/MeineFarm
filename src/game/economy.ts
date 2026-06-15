import type { AnimalDef } from "./config/animals";

/** Produktionsrate bei Normaltempo in Geld pro Sekunde. */
export function normalRatePerSec(def: AnimalDef): number {
  return def.income / (def.intervalMs / 1000);
}

/** Blase ist „voll", sobald der angesammelte Wert das Einkommen erreicht. */
export function isFull(def: AnimalDef, pending: number): boolean {
  return pending >= def.income;
}

/**
 * Online-Tick: erhöht den angesammelten Wert um die in `dtSec` produzierte Menge.
 * Sobald die Blase voll ist, läuft die Produktion mit `boostFactor` weiter
 * (Boost gilt nur online).
 */
export function tickPending(def: AnimalDef, pending: number, dtSec: number): number {
  const rate = normalRatePerSec(def) * (isFull(def, pending) ? def.boostFactor : 1);
  return pending + rate * dtSec;
}

/**
 * Offline-Gutschrift: volle abwesende Zeit, immer Normaltempo (kein Boost, kein Cap).
 */
export function offlineGain(def: AnimalDef, elapsedSec: number): number {
  return normalRatePerSec(def) * Math.max(0, elapsedSec);
}

/** Fortschritt 0..1 für die normale Füllung der Blase. */
export function fillRatio(def: AnimalDef, pending: number): number {
  return Math.min(pending / def.income, 1);
}
