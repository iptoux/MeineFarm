import { getAnimal } from "./config/animals";
import { getBuilding } from "./config/buildings";
import {
  GROW_TO_GROWING_SEC,
  GROW_TO_READY_SEC,
  MAX_PEST_DAMAGE,
  PECK_DAMAGE_PER_SEC,
  yieldFromWeather,
  type FieldStateName,
} from "./config/fields";
import { getGood } from "./config/goods";
import { randomDogName } from "./config/dognames";
import { getRoad, ROAD_TILE, roadCellCenter } from "./config/roads";
import { STARTING_UNLOCKED, STARTING_MONEY, slotUnlockCost } from "./config/slots";
import {
  CHUNK,
  INITIAL_FIELD,
  INITIAL_SPAN,
  MAX_HALF,
  expansionCost,
  type FieldBounds,
  type FieldEdge,
} from "./config/chunks";

export interface SlotState {
  unlocked: boolean;
  /** ID des platzierten Tiers oder null (leer). */
  animalId: string | null;
  /** Aktuell in der Münz-Blase angesammelter, erntbarer Geldwert. */
  pending: number;
}

/** Wachstumszustand eines Feldes (nur bei Feld-Gebäuden gesetzt). */
export interface FieldGrowth {
  state: FieldStateName;
  /** Im aktuellen Zustand angesammelte Sekunden (zählt nur bis zum Übergang). */
  progress: number;
  /** Summe aus Wetterfaktor × Zeit über den Wachstumszeitraum (für den Ertrag). */
  weatherSum: number;
  /** Vergangene Wachstumszeit in Sekunden (Nenner für den Wetter-Durchschnitt). */
  weatherTime: number;
  /** Von Vögeln angerichteter Ernteschaden (0..1); mindert den Ertrag beim Ernten. */
  pestDamage: number;
}

export interface PlacedBuilding {
  defId: string;
  x: number;
  z: number;
  /** Drehung um die Hochachse in Radiant (Vielfache von 90°). */
  rotation: number;
  /** Wachstumszustand — nur bei Feldern (def.isField). */
  field?: FieldGrowth;
}

/** Frischer Feld-Zustand (Bau-Phase, alles auf null). */
export function freshFieldGrowth(): FieldGrowth {
  return { state: "dirt", progress: 0, weatherSum: 0, weatherTime: 0, pestDamage: 0 };
}

/** Dekorative Straßen-Kachel (Gitterzelle + Typ). */
export interface RoadTile {
  gx: number;
  gz: number;
  /** Straßentyp-ID (z.B. "strasse", "feldweg"). */
  type: string;
}

/** Dekorativer Teich (Weltposition). */
export interface PondTile {
  x: number;
  z: number;
}

/** Footprint-Radius eines Teichs (Platzierungsabstand + Gras-/Baum-Aussparung). */
export const POND_RADIUS = 4;

export interface SaveData {
  version: 3;
  money: number;
  buildings: PlacedBuilding[];
  slots: SlotState[];
  roads: RoadTile[];
  /** Spielfeld-Grenzen (seit v3; bei v2-Ständen fehlt es → Default). */
  field: FieldBounds;
  /** Gesammelte Kürbisse (seit Feld-Feature; bei alten Ständen fehlt es → 0). */
  pumpkins?: number;
  /** Dekorative Teiche (seit Teich-Feature; fehlt bei alten Ständen → 1 wird erzeugt). */
  ponds?: PondTile[];
  /** Erweiterungen seit dem letzten Teich. */
  expansionsSincePond?: number;
  /** Nach so vielen Erweiterungen kommt der nächste Teich (2–3). */
  nextPondAfter?: number;
  /** Tageszeit [0,1) zum Speicherzeitpunkt. */
  timeOfDay: number;
  /** Wetterlage zum Speicherzeitpunkt ("clear" | "rain" | "storm" | "fog"). */
  weather: string;
  /** Name des streunenden Hundes (seit v3 optional; fehlt → Zufallsname). */
  dogName?: string;
  lastSaveTs: number;
}

type Listener = () => void;

function makeSlot(unlocked = false, animalId: string | null = null): SlotState {
  return { unlocked, animalId, pending: 0 };
}

/** Ganzzahliger Zufall in [min, max]. */
function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Zentraler Spielzustand: Geld, platzierte Gebäude (mit ihren Slots) und
 * dekorative Straßen. Slots liegen flach; Gebäude i besitzt die Indizes
 * [slotBase(i) .. slotBase(i)+slotCount). Reine Daten; Produktion läuft im Loop,
 * Darstellung in der Szene. UI hängt sich über onChange() ein.
 */
export class GameState {
  money = STARTING_MONEY;
  /** Gesammelte Kürbisse (Ernte von Feldern). */
  pumpkins = 0;
  buildings: PlacedBuilding[] = [];
  slots: SlotState[] = [];
  roads: RoadTile[] = [];
  /** Dekorative Teiche (zufällig platziert; persistiert). */
  ponds: PondTile[] = [];
  /** Erweiterungen seit dem letzten Teich + Schwelle (2–3) für den nächsten. */
  expansionsSincePond = 0;
  nextPondAfter = randInt(2, 3);
  /** Erweiterbares Spielfeld (siehe config/chunks). */
  field: FieldBounds = { ...INITIAL_FIELD };
  /** Tageszeit + Wetter (vom Rig pro Frame gespiegelt, damit sie mitgespeichert werden). */
  timeOfDay = 0.32;
  weather = "clear";
  /** Name des streunenden Hundes (Default zufällig, vom Spieler änderbar). */
  dogName = randomDogName();

  private listeners = new Set<Listener>();

  constructor() {
    this.reset();
  }

  /** Neues Spiel: ein Start-Stall am Ursprung mit Gratis-Huhn in Slot 0. */
  reset(): void {
    this.money = STARTING_MONEY;
    this.pumpkins = 0;
    this.buildings = [{ defId: "stall", x: 0, z: 0, rotation: 0 }];
    const count = getBuilding("stall")?.slotCount ?? 8;
    this.slots = Array.from({ length: count }, (_, i) =>
      makeSlot(i < STARTING_UNLOCKED, i === 0 ? "huhn" : null),
    );
    this.roads = [];
    this.field = { ...INITIAL_FIELD };
    this.ponds = [];
    this.expansionsSincePond = 0;
    this.nextPondAfter = randInt(2, 3);
    this.tryPlacePond(INITIAL_FIELD); // genau ein Teich zum Start
    this.timeOfDay = 0.32;
    this.weather = "clear";
    this.dogName = randomDogName();
    this.emit();
  }

  /**
   * Versucht, einen Teich an einer freien Zufallsposition im Bereich `area` zu
   * platzieren (vollständig drin, abseits von Gebäuden und anderen Teichen). Gibt
   * true bei Erfolg zurück.
   */
  private tryPlacePond(area: FieldBounds): boolean {
    const r = POND_RADIUS;
    const minX = area.minX + r;
    const maxX = area.maxX - r;
    const minZ = area.minZ + r;
    const maxZ = area.maxZ - r;
    if (maxX <= minX || maxZ <= minZ) return false; // Bereich zu schmal
    for (let i = 0; i < 30; i++) {
      const x = minX + Math.random() * (maxX - minX);
      const z = minZ + Math.random() * (maxZ - minZ);
      if (this.pondBlocked(x, z, r)) continue;
      this.ponds.push({ x, z });
      return true;
    }
    return false;
  }

  /** Überlappt ein Teich-Kreis (x/z, Radius r) ein Gebäude oder einen anderen Teich? */
  private pondBlocked(x: number, z: number, r: number): boolean {
    for (const b of this.buildings) {
      const def = getBuilding(b.defId);
      if (!def) continue;
      const rotated = Math.abs(Math.sin(b.rotation)) > 0.5;
      const hw = (rotated ? def.depth : def.width) / 2 + r;
      const hd = (rotated ? def.width : def.depth) / 2 + r;
      if (Math.abs(x - b.x) <= hw && Math.abs(z - b.z) <= hd) return true;
    }
    for (const p of this.ponds) {
      if (Math.hypot(x - p.x, z - p.z) < r * 2.5) return true;
    }
    return false;
  }

  /** Platziert genau einen Teich, falls noch keiner existiert (z.B. Alt-Stände beim Laden). */
  seedInitialPond(): void {
    if (this.ponds.length === 0) this.tryPlacePond(this.field);
  }

  /** Setzt den Hundenamen (getrimmt; leer → unverändert). */
  setDogName(name: string): void {
    const trimmed = name.trim().slice(0, 24);
    if (!trimmed) return;
    this.dogName = trimmed;
    this.emit();
  }

  /** Liegt eine Grundfläche (Mittelpunkt x/z, Halbausdehnung) vollständig im Feld? */
  inField(x: number, z: number, halfW = 0, halfD = 0): boolean {
    const f = this.field;
    return x - halfW >= f.minX && x + halfW <= f.maxX && z - halfD >= f.minZ && z + halfD <= f.maxZ;
  }

  /** Liegt die ganze Straßen-Kachel (gx,gz) im Feld? */
  roadCellInField(gx: number, gz: number): boolean {
    const c = roadCellCenter(gx, gz);
    return this.inField(c.x, c.z, ROAD_TILE / 2, ROAD_TILE / 2);
  }

  /** Kosten, um die gegebene Kante als Nächstes zu erweitern (oder null am Limit). */
  expandCost(edge: FieldEdge): number | null {
    const f = this.field;
    const span = edge === "minX" || edge === "maxX" ? f.maxX - f.minX : f.maxZ - f.minZ;
    if (span / 2 >= MAX_HALF) return null; // Achse am Perf-Deckel
    const n = Math.round((span - INITIAL_SPAN) / CHUNK);
    return expansionCost(n);
  }

  /** Erweitert eine Kante um `CHUNK` (kostet `expandCost`); false wenn am Limit/zu teuer. */
  expandField(edge: FieldEdge): boolean {
    const cost = this.expandCost(edge);
    if (cost === null || !this.canAfford(cost)) return false;
    this.money -= cost;
    const f = this.field;
    // Neu hinzukommender Streifen (für eine mögliche Teich-Platzierung) vor der Mutation.
    let strip: FieldBounds;
    if (edge === "maxX") {
      strip = { minX: f.maxX, maxX: f.maxX + CHUNK, minZ: f.minZ, maxZ: f.maxZ };
      f.maxX += CHUNK;
    } else if (edge === "minX") {
      strip = { minX: f.minX - CHUNK, maxX: f.minX, minZ: f.minZ, maxZ: f.maxZ };
      f.minX -= CHUNK;
    } else if (edge === "maxZ") {
      strip = { minX: f.minX, maxX: f.maxX, minZ: f.maxZ, maxZ: f.maxZ + CHUNK };
      f.maxZ += CHUNK;
    } else {
      strip = { minX: f.minX, maxX: f.maxX, minZ: f.minZ - CHUNK, maxZ: f.minZ };
      f.minZ -= CHUNK;
    }

    // Nach 2–3 Erweiterungen einen weiteren Teich auf der neuen Fläche platzieren.
    this.expansionsSincePond++;
    if (this.expansionsSincePond >= this.nextPondAfter) {
      this.tryPlacePond(strip);
      this.expansionsSincePond = 0;
      this.nextPondAfter = randInt(2, 3);
    }

    this.emit();
    return true;
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    for (const fn of this.listeners) fn();
  }

  /** Globaler Index des ersten Slots von Gebäude `buildingIndex`. */
  slotBase(buildingIndex: number): number {
    let base = 0;
    for (let i = 0; i < buildingIndex && i < this.buildings.length; i++) {
      base += getBuilding(this.buildings[i].defId)?.slotCount ?? 0;
    }
    return base;
  }

  get unlockedCount(): number {
    return this.slots.filter((s) => s.unlocked).length;
  }

  /** Kosten, um den nächsten gesperrten Slot freizuschalten. */
  nextUnlockCost(): number {
    return slotUnlockCost(this.unlockedCount);
  }

  addMoney(amount: number): void {
    this.money += amount;
    this.emit();
  }

  canAfford(amount: number): boolean {
    return this.money >= amount;
  }

  /** Schaltet einen gesperrten Slot frei (kostet `nextUnlockCost`). */
  unlockSlot(index: number): boolean {
    const slot = this.slots[index];
    if (!slot || slot.unlocked) return false;
    const cost = this.nextUnlockCost();
    if (!this.canAfford(cost)) return false;
    this.money -= cost;
    slot.unlocked = true;
    this.emit();
    return true;
  }

  /** Kauft ein Tier und platziert es in einem freigeschalteten, leeren Slot. */
  buyAnimal(index: number, animalId: string): boolean {
    const slot = this.slots[index];
    const def = getAnimal(animalId);
    if (!slot || !def || !slot.unlocked || slot.animalId) return false;
    if (!this.canAfford(def.cost)) return false;
    this.money -= def.cost;
    slot.animalId = animalId;
    slot.pending = 0;
    this.emit();
    return true;
  }

  /** Rückerstattung beim Verkauf eines Tiers (50 % des Kaufpreises). */
  animalSellValue(index: number): number {
    const slot = this.slots[index];
    if (!slot?.animalId) return 0;
    const def = getAnimal(slot.animalId);
    return def ? Math.floor(def.cost * 0.5) : 0;
  }

  /** Verkauft das Tier eines Slots (Slot bleibt freigeschaltet, leer). Gibt die Rückerstattung zurück. */
  sellAnimal(index: number): number {
    const slot = this.slots[index];
    if (!slot?.animalId) return 0;
    const refund = this.animalSellValue(index);
    slot.animalId = null;
    slot.pending = 0;
    this.money += refund;
    this.emit();
    return refund;
  }

  /** Erntet den angesammelten Wert eines Slots und setzt ihn auf Normaltempo zurück. */
  harvest(index: number): number {
    const slot = this.slots[index];
    if (!slot || !slot.animalId || slot.pending <= 0) return 0;
    const gained = Math.floor(slot.pending);
    slot.pending = 0;
    this.money += gained;
    this.emit();
    return gained;
  }

  /** Aktueller Bestand einer verkaufbaren Ware (vorerst nur Kürbisse). */
  goodCount(goodId: string): number {
    return goodId === "pumpkin" ? this.pumpkins : 0;
  }

  /**
   * Verkauft den gesamten Bestand einer Ware zum Stückpreis aus dem Waren-Katalog.
   * Gibt den Erlös (€) zurück (0 falls nichts da/unbekannte Ware).
   */
  sellGood(goodId: string): number {
    const def = getGood(goodId);
    const count = this.goodCount(goodId);
    if (!def || count <= 0) return 0;
    const gained = count * def.price;
    if (goodId === "pumpkin") this.pumpkins = 0;
    this.money += gained;
    this.emit();
    return gained;
  }

  /** Baut ein neues Gebäude (kostet `def.cost`); gibt den Gebäude-Index zurück oder -1. */
  addBuilding(defId: string, x: number, z: number, rotation = 0): number {
    const def = getBuilding(defId);
    if (!def || !this.canAfford(def.cost)) return -1;
    this.money -= def.cost;
    const placed: PlacedBuilding = { defId, x, z, rotation };
    if (def.isField) placed.field = freshFieldGrowth();
    this.buildings.push(placed);
    for (let i = 0; i < def.slotCount; i++) this.slots.push(makeSlot());
    this.emit();
    return this.buildings.length - 1;
  }

  /**
   * Rückt das Wachstum eines Feldes voran. `weatherFactor` (0..1) gewichtet die
   * Wachstums-Güte und fließt in den späteren Ernte-Ertrag ein. Schaltet bei
   * Erreichen der Schwellen dirt→growing→ready; im Reif-Zustand passiert nichts mehr.
   */
  tickField(b: PlacedBuilding, dtSec: number, weatherFactor: number): void {
    const f = b.field;
    if (!f || f.state === "ready" || dtSec <= 0) return;
    f.progress += dtSec;
    f.weatherSum += weatherFactor * dtSec;
    f.weatherTime += dtSec;
    if (f.state === "dirt" && f.progress >= GROW_TO_GROWING_SEC) {
      f.progress -= GROW_TO_GROWING_SEC;
      f.state = "growing";
    }
    if (f.state === "growing" && f.progress >= GROW_TO_READY_SEC) {
      f.state = "ready";
      f.progress = 0;
    }
  }

  /** Lässt einen Vogel am Feld picken: baut Ernteschaden auf (gedeckelt). Kein emit (pro Frame). */
  peckField(b: PlacedBuilding, dtSec: number): void {
    const f = b.field;
    if (!f || dtSec <= 0) return;
    f.pestDamage = Math.min(MAX_PEST_DAMAGE, f.pestDamage + PECK_DAMAGE_PER_SEC * dtSec);
  }

  /**
   * Erntet ein reifes Feld: schreibt 4–10 Kürbisse gut (je nach Wetter über den
   * Wachstumszeitraum, abzüglich Vogel-Ernteschaden) und startet den Zyklus neu bei „Bau".
   * Gibt die Menge zurück (0 falls nicht reif).
   */
  harvestField(buildingIndex: number): number {
    const b = this.buildings[buildingIndex];
    const f = b?.field;
    if (!f || f.state !== "ready") return 0;
    const avg = f.weatherTime > 0 ? f.weatherSum / f.weatherTime : 0.7;
    const gained = Math.max(0, Math.round(yieldFromWeather(avg) * (1 - f.pestDamage)));
    this.pumpkins += gained;
    b.field = freshFieldGrowth();
    this.emit();
    return gained;
  }

  /** Dreht ein Gebäude um 90°. */
  rotateBuilding(buildingIndex: number): void {
    const b = this.buildings[buildingIndex];
    if (!b) return;
    b.rotation = (b.rotation + Math.PI / 2) % (Math.PI * 2);
    this.emit();
  }

  /** Verschiebt ein Gebäude an eine neue Position (optional mit neuer Drehung). */
  moveBuilding(buildingIndex: number, x: number, z: number, rotation?: number): void {
    const b = this.buildings[buildingIndex];
    if (!b) return;
    b.x = x;
    b.z = z;
    if (rotation !== undefined) b.rotation = rotation;
    this.emit();
  }

  /**
   * Entfernt ein Gebäude samt seiner Slots (kein Refund). Das letzte Gebäude
   * lässt sich nicht entfernen. Gibt true bei Erfolg zurück.
   */
  removeBuilding(buildingIndex: number): boolean {
    if (this.buildings.length <= 1) return false;
    if (buildingIndex < 0 || buildingIndex >= this.buildings.length) return false;
    const def = getBuilding(this.buildings[buildingIndex].defId);
    const base = this.slotBase(buildingIndex);
    const count = def?.slotCount ?? 0;
    this.buildings.splice(buildingIndex, 1);
    this.slots.splice(base, count);
    this.emit();
    return true;
  }

  hasRoad(gx: number, gz: number): boolean {
    return this.roads.some((r) => r.gx === gx && r.gz === gz);
  }

  /** Legt eine Straßen-Kachel des gegebenen Typs; false wenn belegt/zu teuer/unbekannt. */
  addRoad(gx: number, gz: number, type: string): boolean {
    const def = getRoad(type);
    if (!def || this.hasRoad(gx, gz) || !this.canAfford(def.cost)) return false;
    this.money -= def.cost;
    this.roads.push({ gx, gz, type });
    this.emit();
    return true;
  }

  /** Entfernt eine Straßen-Kachel (kein Refund). */
  removeRoad(gx: number, gz: number): boolean {
    const i = this.roads.findIndex((r) => r.gx === gx && r.gz === gz);
    if (i < 0) return false;
    this.roads.splice(i, 1);
    this.emit();
    return true;
  }

  toSave(): SaveData {
    return {
      version: 3,
      money: this.money,
      pumpkins: this.pumpkins,
      buildings: this.buildings,
      slots: this.slots,
      roads: this.roads,
      ponds: this.ponds,
      expansionsSincePond: this.expansionsSincePond,
      nextPondAfter: this.nextPondAfter,
      field: this.field,
      timeOfDay: this.timeOfDay,
      weather: this.weather,
      dogName: this.dogName,
      lastSaveTs: Date.now(),
    };
  }
}
