import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { ANIMALS } from "../game/config/animals";
import { BUILDINGS } from "../game/config/buildings";

const COIN_SIZE = 0.7;

const COIN_URL = "/models/ui/Coin.glb";
const COIN_PILE_URL = "/models/ui/Coin Piles.glb";

/** Dekorative, nicht kaufbare Modelle (streunender Hund, Frosch). */
const DECOR: { id: string; url: string; size: number }[] = [
  { id: "shiba", url: "/models/animals/Shiba Inu.glb", size: 2.0 },
  { id: "frog", url: "/models/animals/Frog.glb", size: 0.45 },
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
  private coin: THREE.Object3D | null = null;
  private coinPile: THREE.Object3D | null = null;

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
}
