import { ANIMALS } from "../game/config/animals";
import type { GameState } from "../game/GameState";
import type { AudioManager } from "../audio/AudioManager";

/**
 * Kontextmenü am angeklickten Slot:
 * - gesperrter Slot → „Freischalten (Preis)"
 * - leerer Slot → Liste kaufbarer Tiere (deaktiviert, wenn zu teuer)
 */
export class SlotMenu {
  private el: HTMLElement;

  constructor(
    private state: GameState,
    private audio: AudioManager,
    signal?: AbortSignal,
  ) {
    this.el = document.getElementById("slot-menu")!;
    // Klick außerhalb schließt das Menü
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

  openForSlot(index: number, screen: { x: number; y: number }): void {
    const slot = this.state.slots[index];
    if (!slot) return;

    this.el.innerHTML = "";

    if (!slot.unlocked) {
      const cost = this.state.nextUnlockCost();
      this.el.appendChild(this.makeTitle("Slot gesperrt"));
      const btn = this.makeButton(`Freischalten — ${cost} €`, this.state.canAfford(cost), () => {
        if (this.state.unlockSlot(index)) this.audio.playUnlock();
        this.close();
      });
      this.el.appendChild(btn);
    } else if (!slot.animalId) {
      this.el.appendChild(this.makeTitle("Tier kaufen"));
      for (const def of ANIMALS) {
        const label = `${def.name} — ${def.cost} € (+${def.income})`;
        const btn = this.makeButton(label, this.state.canAfford(def.cost), () => {
          if (this.state.buyAnimal(index, def.id)) this.audio.playPurchase();
          this.close();
        });
        this.el.appendChild(btn);
      }
    } else {
      return; // besetzter Slot hat kein Menü
    }

    // Positionieren (innerhalb des Viewports halten)
    this.el.classList.remove("hidden");
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    const x = Math.min(screen.x, window.innerWidth - w - 8);
    const y = Math.min(screen.y, window.innerHeight - h - 8);
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }

  private makeTitle(text: string): HTMLElement {
    const t = document.createElement("div");
    t.className = "menu-title";
    t.textContent = text;
    return t;
  }

  private makeButton(text: string, enabled: boolean, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = "menu-btn";
    btn.textContent = text;
    btn.disabled = !enabled;
    if (enabled) btn.addEventListener("click", onClick);
    return btn;
  }
}
