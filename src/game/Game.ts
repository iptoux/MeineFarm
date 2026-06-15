import type { SceneManager } from "../scene/SceneManager";

/** Maximaler Zeitschritt pro Frame (s), um Sprünge nach Lag/Tab-Wechsel zu dämpfen. */
const MAX_DT = 0.25;

/**
 * Treibt die Spiel-Schleife: ruft pro Frame den Tick-Callback (Produktion +
 * Effekte) auf und rendert die Szene.
 */
export class Game {
  private last = performance.now();

  constructor(
    private scene: SceneManager,
    private onTick: (dt: number, tSec: number) => void,
  ) {}

  start(): void {
    const loop = (now: number) => {
      const dt = Math.min((now - this.last) / 1000, MAX_DT);
      this.last = now;
      this.onTick(dt, now / 1000);
      this.scene.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
