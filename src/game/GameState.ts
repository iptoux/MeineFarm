import { getAnimal } from "./config/animals";
import { getBuilding } from "./config/buildings";
import { getRoad } from "./config/roads";
import { STARTING_UNLOCKED, STARTING_MONEY, slotUnlockCost } from "./config/slots";

export interface SlotState {
  unlocked: boolean;
  /** ID des platzierten Tiers oder null (leer). */
  animalId: string | null;
  /** Aktuell in der Münz-Blase angesammelter, erntbarer Geldwert. */
  pending: number;
}

export interface PlacedBuilding {
  defId: string;
  x: number;
  z: number;
  /** Drehung um die Hochachse in Radiant (Vielfache von 90°). */
  rotation: number;
}

/** Dekorative Straßen-Kachel (Gitterzelle + Typ). */
export interface RoadTile {
  gx: number;
  gz: number;
  /** Straßentyp-ID (z.B. "strasse", "feldweg"). */
  type: string;
}

export interface SaveData {
  version: 2;
  money: number;
  buildings: PlacedBuilding[];
  slots: SlotState[];
  roads: RoadTile[];
  lastSaveTs: number;
}

type Listener = () => void;

function makeSlot(unlocked = false, animalId: string | null = null): SlotState {
  return { unlocked, animalId, pending: 0 };
}

/**
 * Zentraler Spielzustand: Geld, platzierte Gebäude (mit ihren Slots) und
 * dekorative Straßen. Slots liegen flach; Gebäude i besitzt die Indizes
 * [slotBase(i) .. slotBase(i)+slotCount). Reine Daten; Produktion läuft im Loop,
 * Darstellung in der Szene. UI hängt sich über onChange() ein.
 */
export class GameState {
  money = STARTING_MONEY;
  buildings: PlacedBuilding[] = [];
  slots: SlotState[] = [];
  roads: RoadTile[] = [];

  private listeners = new Set<Listener>();

  constructor() {
    this.reset();
  }

  /** Neues Spiel: ein Start-Stall am Ursprung mit Gratis-Huhn in Slot 0. */
  reset(): void {
    this.money = STARTING_MONEY;
    this.buildings = [{ defId: "stall", x: 0, z: 0, rotation: 0 }];
    const count = getBuilding("stall")?.slotCount ?? 8;
    this.slots = Array.from({ length: count }, (_, i) =>
      makeSlot(i < STARTING_UNLOCKED, i === 0 ? "huhn" : null),
    );
    this.roads = [];
    this.emit();
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

  /** Baut ein neues Gebäude (kostet `def.cost`); gibt den Gebäude-Index zurück oder -1. */
  addBuilding(defId: string, x: number, z: number): number {
    const def = getBuilding(defId);
    if (!def || !this.canAfford(def.cost)) return -1;
    this.money -= def.cost;
    this.buildings.push({ defId, x, z, rotation: 0 });
    for (let i = 0; i < def.slotCount; i++) this.slots.push(makeSlot());
    this.emit();
    return this.buildings.length - 1;
  }

  /** Dreht ein Gebäude um 90°. */
  rotateBuilding(buildingIndex: number): void {
    const b = this.buildings[buildingIndex];
    if (!b) return;
    b.rotation = (b.rotation + Math.PI / 2) % (Math.PI * 2);
    this.emit();
  }

  /** Verschiebt ein Gebäude an eine neue Position. */
  moveBuilding(buildingIndex: number, x: number, z: number): void {
    const b = this.buildings[buildingIndex];
    if (!b) return;
    b.x = x;
    b.z = z;
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
      version: 2,
      money: this.money,
      buildings: this.buildings,
      slots: this.slots,
      roads: this.roads,
      lastSaveTs: Date.now(),
    };
  }
}
