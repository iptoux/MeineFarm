import { BUILDINGS } from "../game/config/buildings";
import { ROADS } from "../game/config/roads";
import type { GameState } from "../game/GameState";

interface MenuItem {
  id: string;
  /** Emoji-Icon der Karte. */
  icon: string;
  /** Anzeigename. */
  name: string;
  cost: number;
}

interface Category {
  id: string;
  label: string;
  icon: string;
  items: MenuItem[];
}

/** Reihenfolge + Beschriftung der Kategorie-Leiste. */
const CATEGORY_META: { id: string; label: string; icon: string }[] = [
  { id: "tiere", label: "Tiere", icon: "🏠" },
  { id: "farm", label: "Farm", icon: "🌾" },
  { id: "zaun", label: "Zäune", icon: "🚧" },
  { id: "wege", label: "Wege", icon: "🛣️" },
];

/** Baut die Kategorien aus den Gebäude-/Straßen-Configs auf. */
function buildCategories(): Category[] {
  return CATEGORY_META.map((meta) => {
    const items: MenuItem[] =
      meta.id === "wege"
        ? ROADS.map((r) => ({
            id: r.id,
            icon: r.id === "feldweg" ? "🌾" : "🛣️",
            name: r.name,
            cost: r.cost,
          }))
        : BUILDINGS.filter((b) => b.category === meta.id).map((b) => ({
            id: b.id,
            icon: b.icon ?? "🏠",
            name: b.name,
            cost: b.cost,
          }));
    return { ...meta, items };
  }).filter((c) => c.items.length > 0);
}

/**
 * Globales Bau-Menü (unten zentriert). Statt einer flachen Karten-Reihe gibt es
 * eine kompakte Kategorie-Leiste; ein Klick öffnet ein Popover mit den baubaren
 * Elementen dieser Gruppe. Karten ohne ausreichendes Geld sind deaktiviert.
 */
export class BuildMenu {
  private el: HTMLElement;
  private popover: HTMLDivElement;
  private categories: Category[];
  private cards = new Map<string, HTMLButtonElement>();
  private catButtons = new Map<string, HTMLButtonElement>();
  private openCat: string | null = null;

  constructor(
    private state: GameState,
    private onSelect: (id: string) => void,
    signal?: AbortSignal,
  ) {
    this.el = document.getElementById("build-menu")!;
    this.categories = buildCategories();
    this.popover = document.createElement("div");
    this.popover.className = "build-popover hidden";

    this.build();
    this.el.appendChild(this.popover);

    state.onChange(() => this.refresh());
    // Klick außerhalb schließt das Popover.
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (this.openCat && !this.el.contains(e.target as Node)) this.close();
      },
      { signal },
    );
    this.refresh();
  }

  /** Schließt das Popover (z.B. beim Start einer Platzierung). */
  close(): void {
    this.openCat = null;
    this.popover.classList.add("hidden");
    for (const btn of this.catButtons.values()) btn.classList.remove("active");
  }

  private build(): void {
    this.el.innerHTML = "";
    this.catButtons.clear();
    for (const cat of this.categories) {
      const btn = document.createElement("button");
      btn.className = "build-cat";
      btn.innerHTML = `<span class="cat-icon">${cat.icon}</span><span class="cat-label">${cat.label}</span>`;
      btn.addEventListener("click", () => this.toggle(cat.id));
      this.catButtons.set(cat.id, btn);
      this.el.appendChild(btn);
    }
  }

  private toggle(catId: string): void {
    if (this.openCat === catId) {
      this.close();
      return;
    }
    this.openCat = catId;
    for (const [id, btn] of this.catButtons) btn.classList.toggle("active", id === catId);
    this.fillPopover(catId);

    // Popover mittig über der angeklickten Kategorie ausrichten.
    const btn = this.catButtons.get(catId)!;
    this.popover.style.left = `${btn.offsetLeft + btn.offsetWidth / 2}px`;
    this.popover.classList.remove("hidden");
  }

  private fillPopover(catId: string): void {
    const cat = this.categories.find((c) => c.id === catId);
    this.popover.innerHTML = "";
    this.cards.clear();
    if (!cat) return;
    for (const item of cat.items) {
      const card = document.createElement("button");
      card.className = "build-card";
      card.innerHTML =
        `<span class="bc-name">${item.icon} ${item.name}</span>` +
        `<span class="bc-cost">${item.cost} €</span>`;
      card.addEventListener("click", () => {
        if (!this.state.canAfford(item.cost)) return;
        this.onSelect(item.id);
        this.close();
      });
      this.cards.set(item.id, card);
      this.popover.appendChild(card);
    }
    this.refresh();
  }

  private refresh(): void {
    const cat = this.categories.find((c) => c.id === this.openCat);
    if (!cat) return;
    for (const item of cat.items) {
      const card = this.cards.get(item.id);
      if (card) card.disabled = !this.state.canAfford(item.cost);
    }
  }
}
