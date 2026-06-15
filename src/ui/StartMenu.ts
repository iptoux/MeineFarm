import { SaveManager, type SaveMeta } from "../storage/SaveManager";

export interface StartMenuHandlers {
  /** Spielstand `id` laden und starten. */
  onPlay: (id: string) => void;
}

/**
 * Vollbild-Startmenü: listet alle Spielstände (laden/löschen) und legt neue an.
 * Wird beim Seitenstart und bei jeder Rückkehr aus dem Spiel geöffnet.
 */
export class StartMenu {
  private el: HTMLElement;
  private listEl!: HTMLElement;

  constructor(private handlers: StartMenuHandlers) {
    this.el = document.getElementById("start-menu")!;
    this.buildShell();
  }

  open(): void {
    this.renderList();
    this.el.classList.remove("hidden");
  }

  close(): void {
    this.el.classList.add("hidden");
  }

  /** Statisches Gerüst (Titel + „Neues Spiel" + Listen-Container) einmalig aufbauen. */
  private buildShell(): void {
    this.el.innerHTML = "";

    const panel = document.createElement("div");
    panel.className = "sm-panel";

    const title = document.createElement("h1");
    title.className = "sm-title";
    title.textContent = "🐾 MeinHaustier";
    panel.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.className = "sm-subtitle";
    subtitle.textContent = "Tierfarm-Tycoon";
    panel.appendChild(subtitle);

    const newBtn = document.createElement("button");
    newBtn.className = "sm-new-btn";
    newBtn.textContent = "➕ Neues Spiel";
    newBtn.addEventListener("click", () => this.newGame());
    panel.appendChild(newBtn);

    this.listEl = document.createElement("div");
    this.listEl.className = "sm-list";
    panel.appendChild(this.listEl);

    this.el.appendChild(panel);
  }

  /** Spielstand-Liste neu befüllen. */
  private renderList(): void {
    this.listEl.innerHTML = "";
    const saves = SaveManager.listSaves();

    if (saves.length === 0) {
      const empty = document.createElement("div");
      empty.className = "sm-empty";
      empty.textContent = "Noch keine Spielstände — lege ein neues Spiel an.";
      this.listEl.appendChild(empty);
      return;
    }

    for (const meta of saves) this.listEl.appendChild(this.row(meta));
  }

  private row(meta: SaveMeta): HTMLElement {
    const row = document.createElement("div");
    row.className = "sm-row";

    const info = document.createElement("button");
    info.className = "sm-load";
    const money = `${Math.floor(meta.money).toLocaleString("de-DE")} €`;
    const when = new Date(meta.lastSaveTs).toLocaleString("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    info.innerHTML = `<span class="sm-name">${escapeHtml(meta.name)}</span><span class="sm-meta">${money} · ${when}</span>`;
    info.addEventListener("click", () => this.handlers.onPlay(meta.id));
    row.appendChild(info);

    const del = document.createElement("button");
    del.className = "sm-delete";
    del.title = "Spielstand löschen";
    del.textContent = "🗑️";
    del.addEventListener("click", () => {
      if (confirm(`Spielstand „${meta.name}" wirklich löschen?`)) {
        SaveManager.deleteSave(meta.id);
        this.renderList();
      }
    });
    row.appendChild(del);

    return row;
  }

  private newGame(): void {
    const fallback = `Bauernhof ${SaveManager.listSaves().length + 1}`;
    const name = prompt("Name des neuen Spiels:", fallback);
    if (name === null) return; // abgebrochen
    const id = SaveManager.createSave(name.trim() || fallback);
    this.handlers.onPlay(id);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
