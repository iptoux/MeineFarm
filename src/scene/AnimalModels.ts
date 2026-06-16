import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { ANIMALS } from "../game/config/animals";
import { BUILDINGS, getBuilding } from "../game/config/buildings";
import {
  FIELD_ID,
  FIELD_MODELS,
  PUMPKIN_MODEL,
  type FieldStateName,
} from "../game/config/fields";

const COIN_SIZE = 0.7;
const HEART_SIZE = 0.4;
/** Größe der schwebenden Ernte-Kürbis-Blase (wie die Münze). */
const PUMPKIN_SIZE = 0.7;

const COIN_URL = "/models/ui/Coin.glb";
const COIN_PILE_URL = "/models/ui/Coin Piles.glb";
const HEART_URL = "/models/ui/Heart.glb";
const POND_URL = "/models/world/Pond.glb";
/** Zielgröße (längste Kante) des Teich-Modells (≈ 2·POND_RADIUS). */
const POND_SIZE = 9;

/** Dekorative, nicht kaufbare Modelle (streunender Hund, Frosch). */
const DECOR: { id: string; url: string; size: number }[] = [
  { id: "shiba", url: "/models/animals/Shiba Inu.glb", size: 2.0 },
  { id: "frog", url: "/models/animals/Frog.glb", size: 0.45 },
];

/**
 * Vogel-Modelle für die fliegende Deko-Schar. `simple_bird`/`flying_bird` sind
 * Einzelvögel; `bird` ist ein Schwarm (mehrere Vögel in einem Modell) und daher
 * größer normalisiert.
 */
const BIRD_MODELS: { id: string; url: string; size: number }[] = [
  { id: "simple_bird", url: "/models/world/simple_bird.glb", size: 1.6 },
  { id: "flying_bird", url: "/models/world/flying_bird.glb", size: 1.8 },
  { id: "bird", url: "/models/world/bird.glb", size: 4.5 },
];

/**
 * Lädt die glTF-Modelle (Tiere + UI-Münzen) und normalisiert sie auf eine
 * einheitliche Größe. Liefert fertig skalierte Klon-Instanzen sowie die
 * Animations-Clips der Tiere.
 */
export class AnimalModels {
  private templates = new Map<string, THREE.Object3D>();
  private clips = new Map<string, THREE.AnimationClip[]>();
  private buildings = new Map<string, THREE.Object3D>();
  private fieldModels = new Map<FieldStateName, THREE.Object3D>();
  /** IDs erfolgreich geladener Vogel-Modelle (für BirdManager). */
  private loadedBirds: string[] = [];
  private coin: THREE.Object3D | null = null;
  private coinPile: THREE.Object3D | null = null;
  private pond: THREE.Object3D | null = null;
  private pumpkin: THREE.Object3D | null = null;
  private pumpkinIcon: THREE.Object3D | null = null;
  private heart: THREE.Object3D | null = null;

  async load(): Promise<void> {
    const loader = new GLTFLoader();
    await Promise.all([
      ...ANIMALS.map(async (def) => {
        try {
          const gltf = await loader.loadAsync(def.model);
          this.templates.set(def.id, this.normalize(gltf.scene, def.size, true));
          this.clips.set(def.id, gltf.animations ?? []);
        } catch {
          // ohne Modell greift später der Platzhalter-Fallback
        }
      }),
      ...BUILDINGS.filter((b) => b.model).map(async (def) => {
        try {
          const gltf = await loader.loadAsync(def.model!);
          this.buildings.set(def.id, this.normalizeBuilding(gltf.scene, def.width, def.depth, def.modelRotation ?? 0));
        } catch {
          // ohne Modell greift der Primitive-Fallback
        }
      }),
      ...DECOR.map(async (d) => {
        try {
          const gltf = await loader.loadAsync(d.url);
          this.templates.set(d.id, this.normalize(gltf.scene, d.size, true));
          this.clips.set(d.id, gltf.animations ?? []);
        } catch {
          // ohne Modell wird der Critter einfach nicht erzeugt
        }
      }),
      ...BIRD_MODELS.map(async (d) => {
        try {
          const gltf = await loader.loadAsync(d.url);
          this.templates.set(d.id, this.normalize(gltf.scene, d.size, false));
          this.clips.set(d.id, gltf.animations ?? []);
          this.loadedBirds.push(d.id);
        } catch {
          // ohne Modell fehlt dieser Vogel-Typ einfach in der Auswahl
        }
      }),
      (async () => {
        try {
          const gltf = await loader.loadAsync(COIN_URL);
          this.coin = this.normalize(gltf.scene, COIN_SIZE, false);
        } catch {
          /* Fallback-Kugel in SlotEntity */
        }
      })(),
      (async () => {
        try {
          const gltf = await loader.loadAsync(COIN_PILE_URL);
          this.coinPile = this.normalize(gltf.scene, 1, false);
        } catch {
          /* kein Icon */
        }
      })(),
      // Feld-Zustandsmodelle (auf die Feld-Grundfläche skaliert, wie Gebäude).
      ...(() => {
        const def = getBuilding(FIELD_ID);
        const w = def?.width ?? 6;
        const d = def?.depth ?? 6;
        return (Object.keys(FIELD_MODELS) as FieldStateName[]).map(async (s) => {
          try {
            const gltf = await loader.loadAsync(FIELD_MODELS[s]);
            this.fieldModels.set(s, this.normalizeBuilding(gltf.scene, w, d, def?.modelRotation ?? 0));
          } catch {
            /* ohne Modell greift der Primitive-Fallback in FieldEntity */
          }
        });
      })(),
      (async () => {
        try {
          const gltf = await loader.loadAsync(PUMPKIN_MODEL);
          this.pumpkin = this.normalize(gltf.scene, PUMPKIN_SIZE, false);
        } catch {
          /* Fallback-Kugel in FieldEntity */
        }
      })(),
      (async () => {
        try {
          const gltf = await loader.loadAsync(POND_URL);
          this.pond = this.normalize(gltf.scene, POND_SIZE, true);
        } catch {
          /* ohne Modell wird kein Teich gezeichnet */
        }
      })(),
      (async () => {
        try {
          const gltf = await loader.loadAsync(PUMPKIN_MODEL);
          this.pumpkinIcon = this.normalize(gltf.scene, 1, false);
        } catch {
          /* kein HUD-Icon */
        }
      })(),
      (async () => {
        try {
          const gltf = await loader.loadAsync(HEART_URL);
          this.heart = this.normalize(gltf.scene, HEART_SIZE, false);
        } catch {
          /* ohne Modell werden keine Herzen erzeugt */
        }
      })(),
    ]);
  }

  /**
   * Skaliert auf `target` (längste Kante), zentriert in x/z. Bei `feetOnGround`
   * sitzen die Füße auf y=0, sonst wird auch in y zentriert.
   */
  private normalize(root: THREE.Object3D, target: number, feetOnGround: boolean): THREE.Object3D {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    root.scale.setScalar(target / maxDim);

    const box2 = new THREE.Box3().setFromObject(root);
    const center = new THREE.Vector3();
    box2.getCenter(center);
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= feetOnGround ? box2.min.y : center.y;

    root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });

    const wrapper = new THREE.Group();
    wrapper.add(root);
    return wrapper;
  }

  /**
   * Gebäude-Modell: uniform auf die Grundfläche (width x depth) skalieren, in x/z
   * zentrieren, Unterkante auf y=0, Basis-Drehung anwenden. Alle Materialien
   * `transparent` (für den Zoom-Fade; Opazität bleibt 1 → wirkt deckend).
   */
  private normalizeBuilding(root: THREE.Object3D, width: number, depth: number, rotation: number): THREE.Object3D {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = Math.min(width / (size.x || 1), depth / (size.z || 1));
    root.scale.setScalar(scale);

    const box2 = new THREE.Box3().setFromObject(root);
    const center = new THREE.Vector3();
    box2.getCenter(center);
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= box2.min.y;

    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        const mat = o.material as THREE.Material;
        if (mat) mat.transparent = true;
      }
    });

    const wrapper = new THREE.Group();
    wrapper.rotation.y = rotation;
    wrapper.add(root);
    return wrapper;
  }

  /** Klon eines Gebäudemodells (mit pro-Instanz geklonten Materialien) oder null. */
  getBuildingModel(id: string): THREE.Object3D | null {
    const t = this.buildings.get(id);
    if (!t) return null;
    const c = t.clone(true);
    c.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = (o.material as THREE.Material).clone();
    });
    return c;
  }

  /** Klon-Instanz eines Tiermodells oder null. SkeletonUtils klont auch gerigte Modelle korrekt. */
  get(animalId: string): THREE.Object3D | null {
    const t = this.templates.get(animalId);
    return t ? skeletonClone(t) : null;
  }

  /** Animations-Clips eines Tiermodells. */
  getClips(animalId: string): THREE.AnimationClip[] {
    return this.clips.get(animalId) ?? [];
  }

  /** IDs der verfügbaren Vogel-Modelle (für die fliegende Deko-Schar). */
  birdIds(): string[] {
    return this.loadedBirds;
  }

  /** Klon der Münze (mit geklonten Materialien für individuelles Einfärben) oder null. */
  getCoin(): THREE.Object3D | null {
    if (!this.coin) return null;
    const c = this.coin.clone(true);
    c.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = (o.material as THREE.Material).clone();
    });
    return c;
  }

  /** Vorlage des Münzhaufens für das HUD-Icon (oder null). */
  getCoinPile(): THREE.Object3D | null {
    return this.coinPile ? this.coinPile.clone(true) : null;
  }

  /** Klon des Feld-Modells für den gegebenen Zustand (mit geklonten Materialien) oder null. */
  getFieldModel(state: FieldStateName): THREE.Object3D | null {
    const t = this.fieldModels.get(state);
    if (!t) return null;
    const c = t.clone(true);
    c.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = (o.material as THREE.Material).clone();
    });
    return c;
  }

  /** Klon der Kürbis-Blase (mit geklonten Materialien) oder null. */
  getPumpkin(): THREE.Object3D | null {
    if (!this.pumpkin) return null;
    const c = this.pumpkin.clone(true);
    c.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = (o.material as THREE.Material).clone();
    });
    return c;
  }

  /** Vorlage des Kürbisses für das HUD-Icon (oder null). */
  getPumpkinIcon(): THREE.Object3D | null {
    return this.pumpkinIcon ? this.pumpkinIcon.clone(true) : null;
  }

  /** Klon des Teich-Modells (oder null). */
  getPond(): THREE.Object3D | null {
    return this.pond ? this.pond.clone(true) : null;
  }

  /** Klon-Instanz des Herzens (für den Streichel-Effekt) oder null. */
  getHeart(): THREE.Object3D | null {
    if (!this.heart) return null;
    const c = this.heart.clone(true);
    c.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = (o.material as THREE.Material).clone();
    });
    return c;
  }
}
