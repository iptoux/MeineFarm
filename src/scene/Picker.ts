import * as THREE from "three";
import type { PickData } from "./SlotEntity";

/** Distanz-Schwelle (px), ab der ein Zeiger als „Drag" (Kamera) statt Klick gilt. */
const CLICK_THRESHOLD = 6;
/** Unter dieser Deckkraft ist ein Mesh klick-durchlässig (z.B. ausgeblendetes Dach). */
const FADE_PICK_THRESHOLD = 0.5;

export interface PickerHandlers {
  /** Linksklick auf einen Slot-Marker (gesperrt oder leer). */
  onMarker: (slotIndex: number, screen: { x: number; y: number }) => void;
  /** Linksklick auf eine Münze (ernten). */
  onBubble: (slotIndex: number, screen: { x: number; y: number }) => void;
  /** Linksklick auf ein Tier (Verkaufen-Menü). */
  onAnimal: (slotIndex: number, screen: { x: number; y: number }) => void;
  /** Rechtsklick auf die Gebäude-Struktur (Gebäude-Menü). */
  onBuilding: (buildingIndex: number, screen: { x: number; y: number }) => void;
}

/**
 * Übersetzt Maus-/Touch-Klicks per Raycaster in Interaktionen. Linksklick:
 * Münze/Marker/Tier. Rechtsklick: Gebäude-Menü. Kamera-Drag (Bewegung über der
 * Schwelle) löst nichts aus. Stark transparente Meshes (ausgeblendetes Dach)
 * werden ignoriert, sodass Klicks „hindurchgehen".
 */
export class Picker {
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private downX = 0;
  private downY = 0;

  constructor(
    private camera: THREE.Camera,
    private dom: HTMLElement,
    private getPickables: () => THREE.Object3D[],
    private handlers: PickerHandlers,
    private isBlocked: () => boolean = () => false,
    signal?: AbortSignal,
  ) {
    dom.addEventListener("pointerdown", this.onDown, { signal });
    dom.addEventListener("pointerup", this.onUp, { signal });
    dom.addEventListener("contextmenu", (e) => e.preventDefault(), { signal });
  }

  private onDown = (e: PointerEvent): void => {
    this.downX = e.clientX;
    this.downY = e.clientY;
  };

  private onUp = (e: PointerEvent): void => {
    if (this.isBlocked()) return; // z.B. während Gebäude-/Straßen-Platzierung
    if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > CLICK_THRESHOLD) return;

    const rect = this.dom.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const targets = this.getPickables().filter((o) => o.visible && !isFaded(o));
    const hits = this.raycaster.intersectObjects(targets, false);
    if (hits.length === 0) return;

    const data = hits[0].object.userData as Partial<PickData>;
    const screen = { x: e.clientX, y: e.clientY };

    if (e.button === 2) {
      // Rechtsklick → nur Gebäude
      if (data.kind === "building" && data.buildingIndex !== undefined) {
        this.handlers.onBuilding(data.buildingIndex, screen);
      }
      return;
    }

    // Linksklick → Münze / Marker / Tier (Gebäude ignorieren)
    if (data.kind === "bubble" && data.slotIndex !== undefined) {
      this.handlers.onBubble(data.slotIndex, screen);
    } else if (data.kind === "marker" && data.slotIndex !== undefined) {
      this.handlers.onMarker(data.slotIndex, screen);
    } else if (data.kind === "animal" && data.slotIndex !== undefined) {
      this.handlers.onAnimal(data.slotIndex, screen);
    }
  };
}

/** Ein Mesh gilt als klick-durchlässig, wenn sein Material stark transparent ist. */
function isFaded(o: THREE.Object3D): boolean {
  const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
  return !!mat && mat.transparent && (mat as THREE.MeshStandardMaterial).opacity < FADE_PICK_THRESHOLD;
}
