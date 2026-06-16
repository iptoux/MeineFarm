import type { GameState } from "../game/GameState";
import { GOODS } from "../game/config/goods";

export interface SellDialogHandlers {
  /** Gesamten Bestand der Ware verkaufen → gibt den Erlös (€) zurück. */
  onSell: (goodId: string) => number;
}

/**
 * Zentrierter Modal-Dialog zum Verkaufen der Ernte-Waren. Pro Ware eine Zeile mit
 * Bestand und „Alle verkaufen"-Button (deaktiviert bei Bestand 0). Nach dem Verkauf
 * werden die Zeilen neu gezeichnet. Klick auf den Backdrop oder „Schließen" schließt.
 */
export class SellDialog {
  private el: HTMLElement;

  constructor(
    private state: GameState,
    private handlers: SellDialogHandlers,
  ) {
    this.el = document.getElementById("sell-dialog")!;
    this.el.addEventListener("pointerdown", (e) => {
      if (e.target === this.el) this.close(); // Klick auf den Backdrop
    });
  }

  close(): void {
    this.el.classList.add("hidden");
    this.el.innerHTML = "";
  }

  open(): void {
    this.render();
    this.el.classList.remove("hidden");
  }

  private render(): void {
    this.el.innerHTML = "";

    const panel = document.createElement("div");
    panel.className = "sell-panel";

    const title = document.createElement("div");
    title.className = "menu-title";
    title.textContent = "Verkaufen";
    panel.appendChild(title);

    for (const good of GOODS) {
      const count = this.state.goodCount(good.id);
      const row = document.createElement("div");
      row.className = "sell-row";

      const info = document.createElement("span");
      info.className = "sell-info";
      info.textContent = `${good.icon} ${good.name} ×${count} · ${good.price} €/Stk`;
      row.appendChild(info);

      const btn = document.createElement("button");
      btn.className = "menu-btn";
      btn.textContent = `Alle verkaufen — +${(count * good.price).toLocaleString("de-DE")} €`;
      btn.disabled = count <= 0;
      btn.addEventListener("click", () => {
        if (this.handlers.onSell(good.id) > 0) this.render(); // Bestand → 0, Zeile aktualisieren
      });
      row.appendChild(btn);

      panel.appendChild(row);
    }

    const closeBtn = document.createElement("button");
    closeBtn.className = "menu-btn sell-close";
    closeBtn.textContent = "Schließen";
    closeBtn.addEventListener("click", () => this.close());
    panel.appendChild(closeBtn);

    this.el.appendChild(panel);
  }
}
