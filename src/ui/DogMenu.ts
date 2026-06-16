import type { GameState } from "../game/GameState";

export interface DogMenuHandlers {
  onFeed: () => void;
  onPet: () => void;
  onPlay: () => void;
  /** Menü geschlossen (Klick außerhalb) → Auswahl aufheben, Kamera zurück. */
  onClose: () => void;
}

/**
 * Kontextmenü beim Klick auf den streunenden Hund: Füttern · Streicheln · Spielen
 * sowie „Name ändern" (Inline-Eingabe). Aktionen lassen das Menü offen (man kann
 * mehrfach streicheln); ein Klick außerhalb schließt es und meldet `onClose`.
 */
export class DogMenu {
  private el: HTMLElement;
  private isOpen = false;
  private lastScreen = { x: 0, y: 0 };

  constructor(
    private state: GameState,
    private handlers: DogMenuHandlers,
    signal?: AbortSignal,
  ) {
    this.el = document.getElementById("dog-menu")!;
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (this.isOpen && !this.el.contains(e.target as Node)) this.close();
      },
      { signal },
    );
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.add("hidden");
    this.el.innerHTML = "";
    this.handlers.onClose();
  }

  openForDog(screen: { x: number; y: number }): void {
    this.lastScreen = screen;
    this.isOpen = true;
    this.render();
  }

  /** Standard-Ansicht (Aktionen + „Name ändern"). */
  private render(): void {
    this.el.innerHTML = "";
    this.el.appendChild(this.makeTitle(`🐕 ${this.state.dogName}`));
    this.el.appendChild(this.makeButton("🦴 Füttern", () => this.handlers.onFeed()));
    this.el.appendChild(this.makeButton("🤍 Streicheln", () => this.handlers.onPet()));
    this.el.appendChild(this.makeButton("🎾 Spielen", () => this.handlers.onPlay()));
    this.el.appendChild(this.makeDivider());
    this.el.appendChild(this.makeButton("✏️ Name ändern", () => this.showRename()));
    this.show();
  }

  /** Inline-Eingabe zum Umbenennen. */
  private showRename(): void {
    this.el.innerHTML = "";
    this.el.appendChild(this.makeTitle("Name ändern"));

    const row = document.createElement("div");
    row.className = "menu-rename";

    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 24;
    input.value = this.state.dogName;
    input.className = "menu-rename-input";

    const ok = document.createElement("button");
    ok.className = "menu-btn menu-rename-ok";
    ok.textContent = "OK";

    const confirm = (): void => {
      this.state.setDogName(input.value);
      this.render(); // zurück zur Standard-Ansicht mit neuem Namen im Titel
    };
    ok.addEventListener("click", confirm);
    input.addEventListener("keydown", (e) => {
      e.stopPropagation(); // verhindert, dass WASD-Tippen die Kamera bewegt
      if (e.key === "Enter") confirm();
    });

    row.appendChild(input);
    row.appendChild(ok);
    this.el.appendChild(row);
    this.show();
    input.focus();
    input.select();
  }

  /** Sichtbar machen + im Viewport positionieren. */
  private show(): void {
    this.el.classList.remove("hidden");
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    this.el.style.left = `${Math.min(this.lastScreen.x, window.innerWidth - w - 8)}px`;
    this.el.style.top = `${Math.min(this.lastScreen.y, window.innerHeight - h - 8)}px`;
  }

  private makeTitle(text: string): HTMLElement {
    const t = document.createElement("div");
    t.className = "menu-title";
    t.textContent = text;
    return t;
  }

  private makeDivider(): HTMLElement {
    const d = document.createElement("div");
    d.className = "menu-divider";
    return d;
  }

  private makeButton(text: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = "menu-btn";
    btn.textContent = text;
    btn.addEventListener("click", onClick);
    return btn;
  }
}
