import type { GameState } from "../game/GameState";

/** Zeigt Geld + gesammelte Kürbisse im HUD und aktualisiert sie bei Zustandsänderungen. */
export class Hud {
  private moneyEl: HTMLElement;
  private pumpkinEl: HTMLElement;

  constructor(private state: GameState) {
    this.moneyEl = document.getElementById("hud-money")!;
    this.pumpkinEl = document.getElementById("pumpkin-count")!;
    state.onChange(() => this.render());
    this.render();
  }

  private render(): void {
    this.moneyEl.textContent = `${Math.floor(this.state.money).toLocaleString("de-DE")} €`;
    this.pumpkinEl.textContent = `${Math.floor(this.state.pumpkins).toLocaleString("de-DE")}`;
  }
}
