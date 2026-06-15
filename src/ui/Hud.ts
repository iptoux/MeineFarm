import type { GameState } from "../game/GameState";

/** Zeigt das aktuelle Geld im HUD und aktualisiert es bei Zustandsänderungen. */
export class Hud {
  private moneyEl: HTMLElement;

  constructor(private state: GameState) {
    this.moneyEl = document.getElementById("hud-money")!;
    state.onChange(() => this.render());
    this.render();
  }

  private render(): void {
    this.moneyEl.textContent = `${Math.floor(this.state.money).toLocaleString("de-DE")} €`;
  }
}
