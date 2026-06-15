import type { GameState } from "../game/GameState";
import type { AudioManager } from "./AudioManager";

/**
 * Spielt in unregelmäßigen Abständen leise Rufe der Tiere, die der Spieler
 * tatsächlich besitzt – so wirkt der Hof lebendig, ohne aufdringlich zu sein.
 * Pro Spielstand (hängt am GameState), nutzt den geteilten AudioManager.
 */
export class AmbientAnimals {
  private timer = randomDelay();

  constructor(
    private state: GameState,
    private audio: AudioManager,
  ) {}

  /** Pro Frame aus der Spielschleife aufgerufen. */
  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = randomDelay();

    const ids = this.state.slots.map((s) => s.animalId).filter((id): id is string => !!id);
    if (ids.length === 0) return;
    const id = ids[Math.floor(Math.random() * ids.length)];
    this.audio.playAnimalCall(id, 0.22);
  }
}

/** Zufälliger Abstand zwischen Hintergrund-Rufen (Sekunden). */
function randomDelay(): number {
  return 8 + Math.random() * 12;
}
