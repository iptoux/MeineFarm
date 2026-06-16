import * as THREE from "three";
import type { AnimalDef } from "../game/config/animals";
import type { SlotState } from "../game/GameState";
import { fillRatio, isFull } from "../game/economy";
import type { AnimalModels } from "./AnimalModels";

/** Art eines anklickbaren Meshes — vom Picker ausgewertet. */
export type PickKind = "marker" | "bubble" | "animal" | "building" | "dog" | "field";

export interface PickData {
  kind: PickKind;
  /** Bei marker/bubble/animal: globaler Slot-Index. */
  slotIndex?: number;
  /** Bei building: Index des Gebäudes. */
  buildingIndex?: number;
}

const COIN_BOOST_EMISSIVE = new THREE.Color(0xaa7700);

/**
 * Visuelle Repräsentation eines Slots in der Szene. Drei Zustände:
 * gesperrt (Marker), leer (Marker), besetzt (Tier-Modell + Münze).
 * Liest pro Frame den SlotState und aktualisiert die Darstellung.
 */
export class SlotEntity {
  readonly group = new THREE.Group();

  private lockedMarker: THREE.Mesh;
  private emptyMarker: THREE.Mesh;

  private animal: THREE.Object3D | null = null;
  private animalIsPrimitive = false;
  private animalId: string | null = null;
  private animalPickMeshes: THREE.Mesh[] = [];
  private mixer: THREE.AnimationMixer | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private eatAction: THREE.AnimationAction | null = null;
  private currentAction: THREE.AnimationAction | null = null;
  private animTimer = 0;

  private coin: THREE.Object3D;
  private coinPickMeshes: THREE.Mesh[] = [];
  private coinMats: THREE.MeshStandardMaterial[] = [];
  private coinVisible = false;
  private bubbleBaseY = 1.7;

  constructor(
    public readonly index: number,
    position: THREE.Vector3,
    private models: AnimalModels,
  ) {
    this.group.position.copy(position);

    this.lockedMarker = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.12, 1.6),
      new THREE.MeshStandardMaterial({ color: 0xb33a3a, transparent: true, opacity: 0.7 }),
    );
    this.lockedMarker.position.y = 0.07;
    this.lockedMarker.userData = { slotIndex: index, kind: "marker" } satisfies PickData;
    this.group.add(this.lockedMarker);

    this.emptyMarker = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.08, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x3aa655, transparent: true, opacity: 0.5 }),
    );
    this.emptyMarker.position.y = 0.05;
    this.emptyMarker.userData = { slotIndex: index, kind: "marker" } satisfies PickData;
    this.group.add(this.emptyMarker);

    // Münze (Coin.glb) als einsammelbare „Blase"; Fallback: Kugel
    this.coin = this.models.getCoin() ?? this.fallbackCoin();
    this.coin.position.y = this.bubbleBaseY;
    this.coin.visible = false;
    this.coin.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.userData = { slotIndex: index, kind: "bubble" } satisfies PickData;
        o.castShadow = true;
        this.coinPickMeshes.push(o);
        const mat = o.material as THREE.Material;
        if (mat instanceof THREE.MeshStandardMaterial) this.coinMats.push(mat);
      }
    });
    this.group.add(this.coin);
  }

  private fallbackCoin(): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 20, 16),
      new THREE.MeshStandardMaterial({ color: 0xffd54a, metalness: 0.6, roughness: 0.3 }),
    );
  }

  /** Alle aktuell anklickbaren Meshes (Münze/Tier nur, wenn vorhanden). */
  pickables(): THREE.Object3D[] {
    const list: THREE.Object3D[] = [this.lockedMarker, this.emptyMarker];
    if (this.coinVisible) list.push(...this.coinPickMeshes);
    if (this.animal) list.push(...this.animalPickMeshes);
    return list;
  }

  /** Name des aktuell laufenden Animations-Clips (für Tests/Debug; null wenn keiner). */
  get currentClip(): string | null {
    return this.currentAction?.getClip().name ?? null;
  }

  /** Weltposition der Münze (für den Einsammel-Effekt). */
  getBubbleWorldPos(): THREE.Vector3 {
    return this.group.position.clone().setY(this.group.position.y + this.bubbleBaseY);
  }

  /** Aktualisiert die Darstellung; `dt` für Animationen, `tSec` für Wippen/Spin. */
  update(slot: SlotState, def: AnimalDef | undefined, dt: number, tSec: number): void {
    const occupied = !!slot.animalId && !!def;

    this.lockedMarker.visible = !slot.unlocked;
    this.emptyMarker.visible = slot.unlocked && !occupied;

    if (occupied && slot.animalId !== this.animalId) {
      this.setAnimal(def!);
      this.animalId = slot.animalId;
    } else if (!occupied && this.animal) {
      this.group.remove(this.animal);
      this.disposeAnimal();
      this.animalId = null;
    }

    this.updateAnimation(dt);
    this.updateCoin(slot, def, tSec);
  }

  /** Spielt Idle und wechselt zufällig zu Eat (falls vorhanden) und zurück. */
  private updateAnimation(dt: number): void {
    if (!this.mixer) return;
    this.mixer.update(dt);
    if (!this.idleAction || !this.eatAction) return; // nur Idle → kein Wechsel nötig

    this.animTimer -= dt;
    if (this.animTimer > 0) return;

    const next = this.currentAction === this.idleAction ? this.eatAction : this.idleAction;
    const prev = this.currentAction!;
    next.reset();
    next.play();
    prev.crossFadeTo(next, 0.4, false);
    this.currentAction = next;
    // Eat kürzer, Idle länger – jeweils zufällig
    this.animTimer = next === this.eatAction ? 3 + Math.random() * 3 : 6 + Math.random() * 7;
  }

  private updateCoin(slot: SlotState, def: AnimalDef | undefined, tSec: number): void {
    const show = !!def && slot.pending > 0;
    this.coin.visible = show;
    this.coinVisible = show;
    if (!show) return;

    const fill = fillRatio(def!, slot.pending);
    const boosting = isFull(def!, slot.pending);
    const extra = boosting ? Math.min(slot.pending / def!.income - 1, 4) : 0;
    this.coin.scale.setScalar(0.35 + 0.65 * fill + extra * 0.18);
    this.coin.position.y = this.bubbleBaseY + 0.15 * Math.sin(tSec * 3 + this.index);
    this.coin.rotation.y = tSec * 1.5;

    for (const mat of this.coinMats) {
      if (boosting) {
        const pulse = 0.5 + 0.5 * Math.sin(tSec * 6);
        mat.emissive.copy(COIN_BOOST_EMISSIVE).multiplyScalar(0.4 + 0.6 * pulse);
      } else {
        mat.emissive.setRGB(0, 0, 0);
      }
    }
  }

  private setAnimal(def: AnimalDef): void {
    if (this.animal) {
      this.group.remove(this.animal);
      this.disposeAnimal();
    }
    const model = this.models.get(def.id);
    this.animal = model ?? buildAnimalMesh(def);
    this.animalIsPrimitive = !model;
    this.mixer = null;
    this.idleAction = this.eatAction = this.currentAction = null;

    // Tier-Meshes anklickbar machen (Verkaufen-Menü)
    this.animalPickMeshes = [];
    this.animal.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.userData = { slotIndex: this.index, kind: "animal" } satisfies PickData;
        this.animalPickMeshes.push(o);
      }
    });

    // Münz-Blase über dem Tier platzieren – Höhe richtet sich nach der Tiergröße
    // (Oberkante der Bounding-Box + Abstand). Vor dem Einhängen messen, damit die
    // Box in der lokalen Tier-Höhe liegt (Füße bei y=0).
    this.animal.updateWorldMatrix(true, true);
    const animalTop = new THREE.Box3().setFromObject(this.animal).max.y;
    this.bubbleBaseY = Math.max(animalTop + 0.2, 1.5);
    this.coin.position.y = this.bubbleBaseY;

    if (model) {
      const clips = this.models.getClips(def.id);
      const idle = pickIdle(clips);
      if (idle) {
        this.mixer = new THREE.AnimationMixer(this.animal);
        this.idleAction = this.mixer.clipAction(idle);
        this.idleAction.play();
        this.currentAction = this.idleAction;
        const eat = pickEat(clips);
        if (eat) this.eatAction = this.mixer.clipAction(eat);
        this.animTimer = 6 + Math.random() * 7;
      }
    }
    this.group.add(this.animal);
  }

  private disposeAnimal(): void {
    if (!this.animal) return;
    // Modell-Klone teilen Geometrie/Material mit dem Template → nicht freigeben;
    // nur der Platzhalter-Fallback besitzt eigene Ressourcen.
    if (this.animalIsPrimitive) {
      this.animal.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    }
    this.mixer = null;
    this.idleAction = this.eatAction = this.currentAction = null;
    this.animalPickMeshes = [];
    this.animal = null;
  }
}

/** Idle-Clip robust finden (exakt „Idle", sonst „…|Idle", sonst best-effort). */
function pickIdle(clips: THREE.AnimationClip[]): THREE.AnimationClip | null {
  const l = (c: THREE.AnimationClip) => c.name.toLowerCase();
  return (
    clips.find((c) => l(c) === "idle") ??
    clips.find((c) => l(c).endsWith("|idle")) ??
    clips.find((c) => l(c).endsWith("idle")) ??
    clips.find((c) => l(c).includes("idle") && !l(c).includes("react") && !l(c).includes("jump")) ??
    null
  );
}

/** Eat-Clip finden (enthält „eat", aber nicht „death"). */
function pickEat(clips: THREE.AnimationClip[]): THREE.AnimationClip | null {
  return (
    clips.find((c) => {
      const n = c.name.toLowerCase();
      return n.includes("eat") && !n.includes("death");
    }) ?? null
  );
}

/** Setzt ein erkennbares Tier aus Primitiven zusammen (Platzhalter-Fallback). */
function buildAnimalMesh(def: AnimalDef): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.8 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.5, 6, 12), bodyMat);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.45;
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), bodyMat);
  head.position.set(0.5, 0.62, 0);
  head.castShadow = true;
  g.add(head);

  const legMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 1 });
  for (const dx of [-0.25, 0.25]) {
    for (const dz of [-0.18, 0.18]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), legMat);
      leg.position.set(dx, 0.15, dz);
      leg.castShadow = true;
      g.add(leg);
    }
  }

  return g;
}
