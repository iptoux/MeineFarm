import type { GameState } from "../game/GameState";
import { getBuilding } from "../game/config/buildings";

export interface MarketMenuHandlers {
  /** „Verkaufen" gewählt → Verkaufs-Dialog öffnen. */
  onSell: (buildingIndex: number) => void;
}

/**
 * Kontextmenü beim Linksklick auf einen Marktstand: Aktion „Verkaufen", die den
 * Verkaufs-Dialog öffnet. Gleicher Stil/Klick-außerhalb-Verhalten wie die übrigen
 * Kontextmenüs (z.B. BuildingMenu).
 */
export class MarketMenu {
  private el: HTMLElement;

  constructor(
    private state: GameState,
    private handlers: MarketMenuHandlers,
    signal?: AbortSignal,
  ) {
    this.el = document.getElementById("market-menu")!;
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!this.el.contains(e.target as Node)) this.close();
      },
      { signal },
    );
  }

  close(): void {
    this.el.classList.add("hidden");
    this.el.innerHTML = "";
  }

  openForMarket(index: number, screen: { x: number; y: number }): void {
    const placed = this.state.buildings[index];
    if (!placed) return;
    const def = getBuilding(placed.defId);

    this.el.innerHTML = "";
    const title = document.createElement("div");
    title.className = "menu-title";
    title.textContent = `🛒 ${def ? def.name : "Marktstand"}`;
    this.el.appendChild(title);

    const btn = document.createElement("button");
    btn.className = "menu-btn";
    btn.textContent = "💰 Verkaufen";
    btn.addEventListener("click", () => {
      this.handlers.onSell(index);
      this.close();
    });
    this.el.appendChild(btn);

    this.el.classList.remove("hidden");
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    this.el.style.left = `${Math.min(screen.x, window.innerWidth - w - 8)}px`;
    this.el.style.top = `${Math.min(screen.y, window.innerHeight - h - 8)}px`;
  }
}
