import * as THREE from "three";
import type { FieldGrowth } from "../game/GameState";
import type { FieldStateName } from "../game/config/fields";
import type { AnimalModels } from "./AnimalModels";
import type { PickData } from "./SlotEntity";

/** Fallback-Farben je Zustand, falls ein Modell nicht geladen werden konnte. */
const FALLBACK_COLOR: Record<FieldStateName, number> = {
  dirt: 0x6b4a2b,
  growing: 0x4f7a32,
  ready: 0xd9a441,
};

/**
 * Visuelle Repräsentation eines Feldes in der Szene. Zeigt je nach Wachstums-
 * zustand ein anderes Modell (Erde → Wachstum → Ernte) und im Reif-Zustand eine
 * schwebende, anklickbare Kürbis-Blase (statt der Münze bei Tieren). Die Basis-
 * Meshes tragen `kind: "building"` (Rechtsklick-Menü), die Kürbis-Blase `kind: "field"`.
 */
export class FieldEntity {
  readonly group = new THREE.Group();

  private model: THREE.Object3D | null = null;
  private modelState: FieldStateName | null = null;
  private modelIsPrimitive = false;

  private pumpkin: THREE.Object3D;
  private pumpkinMats: THREE.MeshStandardMaterial[] = [];
  private pumpkinPickMeshes: THREE.Mesh[] = [];
  private pumpkinVisible = false;
  private bubbleBaseY = 1.6;

  constructor(
    public readonly buildingIndex: number,
    position: { x: number; z: number },
    rotation: number,
    private models: AnimalModels,
  ) {
    this.group.position.set(position.x, 0, position.z);
    this.group.rotation.y = rotation;

    this.pumpkin = this.models.getPumpkin() ?? this.fallbackPumpkin();
    this.pumpkin.position.y = this.bubbleBaseY;
    this.pumpkin.visible = false;
    this.pumpkin.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.userData = { kind: "field", buildingIndex } satisfies PickData;
        o.castShadow = true;
        this.pumpkinPickMeshes.push(o);
        const mat = o.material as THREE.Material;
        if (mat instanceof THREE.MeshStandardMaterial) this.pumpkinMats.push(mat);
      }
    });
    this.group.add(this.pumpkin);
  }

  private fallbackPumpkin(): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 20, 16),
      new THREE.MeshStandardMaterial({ color: 0xe07b1f, roughness: 0.6 }),
    );
  }

  /** Anklickbare Meshes: Feld-Basis (Rechtsklick) + Kürbis-Blase (nur wenn reif). */
  pickables(): THREE.Object3D[] {
    const list: THREE.Object3D[] = [];
    if (this.model) {
      this.model.traverse((o) => {
        if (o instanceof THREE.Mesh) list.push(o);
      });
    }
    if (this.pumpkinVisible) list.push(...this.pumpkinPickMeshes);
    return list;
  }

  /** Weltposition der Kürbis-Blase (für den Ernte-Effekt). */
  getPumpkinWorldPos(): THREE.Vector3 {
    return this.group.position.clone().setY(this.group.position.y + this.bubbleBaseY);
  }

  /** Aktualisiert Modell (bei Zustandswechsel) und die Kürbis-Blase. */
  update(field: FieldGrowth, _dt: number, tSec: number): void {
    if (field.state !== this.modelState) this.setModel(field.state);

    const ready = field.state === "ready";
    this.pumpkin.visible = ready;
    this.pumpkinVisible = ready;
    if (ready) {
      this.pumpkin.position.y = this.bubbleBaseY + 0.15 * Math.sin(tSec * 3 + this.buildingIndex);
      this.pumpkin.rotation.y = tSec * 1.2;
      const pulse = 0.5 + 0.5 * Math.sin(tSec * 5);
      for (const mat of this.pumpkinMats) {
        mat.emissive.setRGB(0.35 * pulse, 0.18 * pulse, 0);
      }
    }
  }

  private setModel(state: FieldStateName): void {
    if (this.model) {
      this.group.remove(this.model);
      this.disposeModel();
    }
    const model = this.models.getFieldModel(state);
    this.model = model ?? this.fallbackModel(state);
    this.modelIsPrimitive = !model;
    this.modelState = state;

    this.model.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.userData = { kind: "building", buildingIndex: this.buildingIndex } satisfies PickData;
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.group.add(this.model);

    // Kürbis-Blase über die Oberkante des Modells setzen.
    this.model.updateWorldMatrix(true, true);
    const top = new THREE.Box3().setFromObject(this.model).max.y - this.group.position.y;
    this.bubbleBaseY = Math.max(top + 0.4, 1.2);
    this.pumpkin.position.y = this.bubbleBaseY;
  }

  private fallbackModel(state: FieldStateName): THREE.Group {
    const g = new THREE.Group();
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(5.6, 0.25, 5.6),
      new THREE.MeshStandardMaterial({ color: FALLBACK_COLOR[state], roughness: 0.95 }),
    );
    plate.position.y = 0.12;
    plate.receiveShadow = true;
    g.add(plate);
    return g;
  }

  private disposeModel(): void {
    if (!this.model) return;
    // Modell-Klone teilen Geometrie mit dem Template (Material wurde geklont) → nur
    // Materialien des Klons und Ressourcen des Primitiv-Fallbacks freigeben.
    this.model.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        if (this.modelIsPrimitive) o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.model = null;
  }

  /** Gibt eigene GPU-Ressourcen frei (vor dem Entfernen aus der Szene). */
  dispose(): void {
    this.disposeModel();
    if (this.modelIsPrimitive) return;
    // Fallback-Kürbis besitzt eigene Geometrie/Material; Modell-Kürbis teilt Geometrie.
    this.pumpkin.traverse((o) => {
      if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
    });
  }
}
