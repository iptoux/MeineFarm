import type { GameState, SaveData, SlotState } from "../game/GameState";
import { getAnimal } from "../game/config/animals";
import { offlineGain } from "../game/economy";

const KEY = "meinhaustier:save:v2";

/** Persistenz gegen localStorage inkl. Offline-Gutschrift und Autosave. */
export class SaveManager {
  constructor(private state: GameState) {}

  /**
   * Lädt einen Spielstand. Schreibt Geld/Gebäude/Slots in den State und schreibt
   * die abwesende Zeit als Offline-Ertrag (Normaltempo, kein Cap) den Tieren gut.
   * Gibt true zurück, wenn ein gültiger Stand geladen wurde.
   */
  load(): boolean {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    let data: SaveData;
    try {
      data = JSON.parse(raw);
    } catch {
      return false;
    }
    if (data.version !== 2 || !Array.isArray(data.buildings) || !Array.isArray(data.slots)) {
      return false;
    }

    this.state.money = data.money ?? 0;
    this.state.buildings = data.buildings.map((b) => ({
      defId: b.defId,
      x: b.x,
      z: b.z,
      rotation: b.rotation ?? 0,
    }));
    this.state.slots = data.slots.map(
      (s): SlotState => ({
        unlocked: s?.unlocked ?? false,
        animalId: s?.animalId ?? null,
        pending: s?.pending ?? 0,
      }),
    );
    this.state.roads = Array.isArray(data.roads)
      ? data.roads.map((r) => ({ gx: r.gx, gz: r.gz, type: r.type ?? "strasse" }))
      : [];

    const elapsedSec = Math.max(0, (Date.now() - (data.lastSaveTs ?? Date.now())) / 1000);
    if (elapsedSec > 0) {
      for (const slot of this.state.slots) {
        if (!slot.animalId) continue;
        const def = getAnimal(slot.animalId);
        if (def) slot.pending += offlineGain(def, elapsedSec);
      }
    }

    this.state.emit();
    return true;
  }

  save(): void {
    localStorage.setItem(KEY, JSON.stringify(this.state.toSave()));
  }

  /** Startet periodisches Speichern + Speichern beim Schließen des Tabs. */
  startAutosave(intervalMs = 5000): void {
    setInterval(() => this.save(), intervalMs);
    window.addEventListener("beforeunload", () => this.save());
  }
}
