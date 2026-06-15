import { BUILDINGS } from "../game/config/buildings";
import { ROADS } from "../game/config/roads";
import type { GameState } from "../game/GameState";

interface MenuItem {
  id: string;
  label: string;
  cost: number;
}

/**
 * Globales Bau-Menü (unten zentriert). Listet baubare Gebäude + Straße mit Preis;
 * ein Klick startet den jeweiligen Bau-Modus. Karten werden deaktiviert, wenn
 * das Geld nicht reicht.
 */
export class BuildMenu {
  private el: HTMLElement;
  private cards = new Map<string, HTMLButtonElement>();
  private items: MenuItem[];

  constructor(
    private state: GameState,
    private onSelect: (id: string) => void,
  ) {
    this.el = document.getElementById("build-menu")!;
    this.items = [
      ...BUILDINGS.map((b) => ({ id: b.id, label: `${b.icon ?? "🏠"} ${b.name}`, cost: b.cost })),
      ...ROADS.map((r) => ({ id: r.id, label: `${r.id === "feldweg" ? "🌾" : "🛣️"} ${r.name}`, cost: r.cost })),
    ];
    this.build();
    state.onChange(() => this.refresh());
    this.refresh();
  }

  private build(): void {
    this.el.innerHTML = "";
    for (const item of this.items) {
      const card = document.createElement("button");
      card.className = "build-card";
      card.innerHTML = `<span class="bc-name">${item.label}</span><span class="bc-cost">${item.cost} €</span>`;
      card.addEventListener("click", () => {
        if (this.state.canAfford(item.cost)) this.onSelect(item.id);
      });
      this.cards.set(item.id, card);
      this.el.appendChild(card);
    }
  }

  private refresh(): void {
    for (const item of this.items) {
      const card = this.cards.get(item.id);
      if (card) card.disabled = !this.state.canAfford(item.cost);
    }
  }
}
