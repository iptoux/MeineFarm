import {
  GameState,
  freshFieldGrowth,
  type FieldGrowth,
  type SaveData,
  type SlotState,
} from "../game/GameState";
import { getAnimal } from "../game/config/animals";
import { getBuilding } from "../game/config/buildings";
import { randomDogName } from "../game/config/dognames";
import { INITIAL_FIELD, isValidField } from "../game/config/chunks";
import { NEUTRAL_WEATHER_FACTOR } from "../game/config/fields";
import { offlineGain } from "../game/economy";

/** Index aller Spielstände (leichte Metadaten fürs Startmenü). */
const INDEX_KEY = "meinhaustier:saves";
/** Präfix der einzelnen Spielstand-Keys: `meinhaustier:save:<id>`. */
const SAVE_PREFIX = "meinhaustier:save:";
/** Alter Einzel-Spielstand (vor Mehrfach-Ständen) — wird einmalig migriert. */
const LEGACY_KEY = "meinhaustier:save:v2";

/** Kompakte Beschreibung eines Spielstands für die Menü-Liste. */
export interface SaveMeta {
  id: string;
  name: string;
  lastSaveTs: number;
  money: number;
}

function saveKey(id: string): string {
  return SAVE_PREFIX + id;
}

/** Stellt einen gültigen Feld-Wachstumszustand her (Defaults bei fehlenden/kaputten Daten). */
function sanitizeFieldGrowth(f: FieldGrowth | undefined): FieldGrowth {
  if (!f || (f.state !== "dirt" && f.state !== "growing" && f.state !== "ready")) {
    return freshFieldGrowth();
  }
  return {
    state: f.state,
    progress: typeof f.progress === "number" && f.progress >= 0 ? f.progress : 0,
    weatherSum: typeof f.weatherSum === "number" && f.weatherSum >= 0 ? f.weatherSum : 0,
    weatherTime: typeof f.weatherTime === "number" && f.weatherTime >= 0 ? f.weatherTime : 0,
    pestDamage:
      typeof f.pestDamage === "number" ? Math.min(1, Math.max(0, f.pestDamage)) : 0,
  };
}

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readIndex(): SaveMeta[] {
  const raw = localStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as SaveMeta[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(list: SaveMeta[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

/** Übernimmt einen evtl. vorhandenen alten Einzel-Spielstand in einen benannten Slot. */
function migrateLegacy(): void {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return;
  const id = newId();
  localStorage.setItem(saveKey(id), raw);
  let money = 0;
  let ts = Date.now();
  try {
    const data = JSON.parse(raw) as SaveData;
    money = data.money ?? 0;
    ts = data.lastSaveTs ?? Date.now();
  } catch {
    /* ignorieren — Stand wird trotzdem migriert, Metadaten als Default */
  }
  const index = readIndex();
  index.push({ id, name: "Mein Bauernhof", lastSaveTs: ts, money });
  writeIndex(index);
  localStorage.removeItem(LEGACY_KEY);
}

// Migration einmalig beim Laden des Moduls.
migrateLegacy();

/**
 * Persistenz mehrerer benannter Spielstände gegen localStorage. Jeder Stand liegt
 * unter `meinhaustier:save:<id>` (Format `SaveData`, version 2); ein Index unter
 * `meinhaustier:saves` hält leichte Metadaten für die Menü-Liste. Statisch, da es
 * keinen Instanz-Zustand gibt — die aktive Session reicht (state, id) durch.
 */
export class SaveManager {
  /** Alle Spielstände, neueste zuerst. */
  static listSaves(): SaveMeta[] {
    return readIndex().sort((a, b) => b.lastSaveTs - a.lastSaveTs);
  }

  /** Legt einen frischen Spielstand an und gibt seine ID zurück. */
  static createSave(name: string): string {
    const id = newId();
    const data = new GameState().toSave(); // GameState.reset() läuft im Konstruktor
    localStorage.setItem(saveKey(id), JSON.stringify(data));
    const index = readIndex();
    index.push({ id, name, lastSaveTs: data.lastSaveTs, money: data.money });
    writeIndex(index);
    return id;
  }

  /** Entfernt einen Spielstand samt Index-Eintrag. */
  static deleteSave(id: string): void {
    localStorage.removeItem(saveKey(id));
    writeIndex(readIndex().filter((m) => m.id !== id));
  }

  /**
   * Lädt einen Spielstand in den State und schreibt die abwesende Zeit als
   * Offline-Ertrag (Normaltempo, kein Cap) den Tieren gut. Gibt true bei Erfolg.
   */
  static loadInto(state: GameState, id: string): boolean {
    const raw = localStorage.getItem(saveKey(id));
    if (!raw) return false;
    let data: SaveData;
    try {
      data = JSON.parse(raw);
    } catch {
      return false;
    }
    // v2 (ohne Feld) und v3 (mit Feld) werden geladen; alles andere abgelehnt.
    const version = (data as { version?: number }).version;
    if ((version !== 2 && version !== 3) || !Array.isArray(data.buildings) || !Array.isArray(data.slots)) {
      return false;
    }

    state.money = data.money ?? 0;
    state.pumpkins = typeof data.pumpkins === "number" ? data.pumpkins : 0;
    // Feldgrenzen: v3 validieren, sonst (v2 / kaputt) Startfeld. Bestehende
    // Gebäude/Straßen außerhalb bleiben erhalten – nur NEUE Platzierung ist begrenzt.
    state.field = isValidField(data.field) ? { ...data.field } : { ...INITIAL_FIELD };
    state.timeOfDay = typeof data.timeOfDay === "number" ? data.timeOfDay : 0.32;
    state.weather = typeof data.weather === "string" ? data.weather : "clear";
    state.dogName = typeof data.dogName === "string" && data.dogName ? data.dogName : randomDogName();
    state.buildings = data.buildings.map((b) => {
      const isField = getBuilding(b.defId)?.isField ?? false;
      return {
        defId: b.defId,
        x: b.x,
        z: b.z,
        rotation: b.rotation ?? 0,
        // Feld-Wachstum übernehmen (mit Defaults absichern); Nicht-Felder: kein Zustand.
        ...(isField ? { field: sanitizeFieldGrowth(b.field) } : {}),
      };
    });
    state.slots = data.slots.map(
      (s): SlotState => ({
        unlocked: s?.unlocked ?? false,
        animalId: s?.animalId ?? null,
        pending: s?.pending ?? 0,
      }),
    );
    state.roads = Array.isArray(data.roads)
      ? data.roads.map((r) => ({ gx: r.gx, gz: r.gz, type: r.type ?? "strasse" }))
      : [];

    // Teiche: vorhandene übernehmen, Alt-Stände (kein `ponds`) bekommen genau einen.
    if (Array.isArray(data.ponds)) {
      state.ponds = data.ponds
        .filter((p) => p && typeof p.x === "number" && typeof p.z === "number")
        .map((p) => ({ x: p.x, z: p.z }));
      state.expansionsSincePond = typeof data.expansionsSincePond === "number" ? data.expansionsSincePond : 0;
      if (typeof data.nextPondAfter === "number" && data.nextPondAfter > 0) {
        state.nextPondAfter = data.nextPondAfter;
      }
    } else {
      state.ponds = [];
      state.seedInitialPond();
    }

    const elapsedSec = Math.max(0, (Date.now() - (data.lastSaveTs ?? Date.now())) / 1000);
    if (elapsedSec > 0) {
      for (const slot of state.slots) {
        if (!slot.animalId) continue;
        const def = getAnimal(slot.animalId);
        if (def) slot.pending += offlineGain(def, elapsedSec);
      }
      // Felder wachsen offline mit neutralem Wetterfaktor weiter.
      for (const b of state.buildings) {
        if (b.field) state.tickField(b, elapsedSec, NEUTRAL_WEATHER_FACTOR);
      }
    }

    state.emit();
    return true;
  }

  /** Schreibt den State in den Slot `id` und aktualisiert dessen Index-Metadaten. */
  static save(state: GameState, id: string): void {
    const data = state.toSave();
    localStorage.setItem(saveKey(id), JSON.stringify(data));
    const index = readIndex();
    const meta = index.find((m) => m.id === id);
    if (meta) {
      meta.lastSaveTs = data.lastSaveTs;
      meta.money = data.money;
      writeIndex(index);
    }
  }

  /**
   * Startet periodisches Speichern + Speichern beim Schließen des Tabs.
   * Gibt eine Stop-Funktion zurück (Intervall + beforeunload abmelden).
   */
  static startAutosave(state: GameState, id: string, intervalMs = 5000): () => void {
    const onUnload = (): void => SaveManager.save(state, id);
    const timer = setInterval(() => SaveManager.save(state, id), intervalMs);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(timer);
      window.removeEventListener("beforeunload", onUnload);
    };
  }
}
