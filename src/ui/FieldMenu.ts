import type { GameState } from "../game/GameState";
import { CHUNK, type FieldEdge } from "../game/config/chunks";

export interface FieldMenuHandlers {
  /** Erweiterung bestätigt: Kante erweitern (zieht Geld ab) + View aktualisieren. */
  onConfirm: (edge: FieldEdge) => void;
}

/**
 * Bestätigungs-Popup beim Klick auf ein „+"-Pad: zeigt die Kosten der nächsten
 * Erweiterung und einen Bestätigen-Button (deaktiviert, wenn zu teuer). Klick
 * außerhalb schließt. Gleicher Stil wie die übrigen Kontextmenüs.
 */
export class FieldMenu {
  private el: HTMLElement;

  constructor(
    private state: GameState,
    private handlers: FieldMenuHandlers,
    signal?: AbortSignal,
  ) {
    this.el = document.getElementById("field-menu")!;
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

  openForEdge(edge: FieldEdge, screen: { x: number; y: number }): void {
    const cost = this.state.expandCost(edge);
    if (cost === null) return; // Achse am Maximum

    this.el.innerHTML = "";
    const title = document.createElement("div");
    title.className = "menu-title";
    title.textContent = `Feld erweitern (+${CHUNK})`;
    this.el.appendChild(title);

    const affordable = this.state.canAfford(cost);
    const btn = document.createElement("button");
    btn.className = "menu-btn";
    btn.textContent = `➕ Erweitern — −${cost.toLocaleString("de-DE")} €`;
    btn.disabled = !affordable;
    btn.addEventListener("click", () => {
      this.handlers.onConfirm(edge);
      this.close();
    });
    this.el.appendChild(btn);

    if (!affordable) {
      const hint = document.createElement("div");
      hint.className = "menu-title";
      hint.textContent = "Nicht genug Geld";
      this.el.appendChild(hint);
    }

    this.el.classList.remove("hidden");
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    this.el.style.left = `${Math.min(screen.x, window.innerWidth - w - 8)}px`;
    this.el.style.top = `${Math.min(screen.y, window.innerHeight - h - 8)}px`;
  }
}
