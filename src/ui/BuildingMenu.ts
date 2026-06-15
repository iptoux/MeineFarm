import type { GameState } from "../game/GameState";
import { getBuilding } from "../game/config/buildings";

export interface BuildingMenuHandlers {
  onMove: (buildingIndex: number) => void;
  onRotate: (buildingIndex: number) => void;
  onRemove: (buildingIndex: number) => void;
}

/**
 * Kontextmenü beim Klick auf ein Gebäude: Bewegen, Drehen, Entfernen.
 * „Entfernen" ist deaktiviert, wenn nur noch ein Gebäude übrig ist.
 */
export class BuildingMenu {
  private el: HTMLElement;

  constructor(
    private state: GameState,
    private handlers: BuildingMenuHandlers,
  ) {
    this.el = document.getElementById("building-menu")!;
    document.addEventListener("pointerdown", (e) => {
      if (!this.el.contains(e.target as Node)) this.close();
    });
  }

  close(): void {
    this.el.classList.add("hidden");
    this.el.innerHTML = "";
  }

  openForBuilding(index: number, screen: { x: number; y: number }): void {
    const placed = this.state.buildings[index];
    if (!placed) return;
    const def = getBuilding(placed.defId);

    this.el.innerHTML = "";
    this.el.appendChild(this.title(def ? def.name : "Gebäude"));
    this.el.appendChild(
      this.button("↔️ Bewegen", true, () => {
        this.handlers.onMove(index);
        this.close();
      }),
    );
    this.el.appendChild(
      this.button("🔄 Drehen", true, () => {
        this.handlers.onRotate(index);
        this.close();
      }),
    );
    const canRemove = this.state.buildings.length > 1;
    this.el.appendChild(
      this.button("🗑️ Entfernen", canRemove, () => {
        this.handlers.onRemove(index);
        this.close();
      }),
    );

    this.el.classList.remove("hidden");
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    this.el.style.left = `${Math.min(screen.x, window.innerWidth - w - 8)}px`;
    this.el.style.top = `${Math.min(screen.y, window.innerHeight - h - 8)}px`;
  }

  private title(text: string): HTMLElement {
    const t = document.createElement("div");
    t.className = "menu-title";
    t.textContent = text;
    return t;
  }

  private button(text: string, enabled: boolean, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = "menu-btn";
    btn.textContent = text;
    btn.disabled = !enabled;
    if (enabled) btn.addEventListener("click", onClick);
    return btn;
  }
}
