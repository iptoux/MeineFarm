import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { INITIAL_FIELD, type FieldBounds } from "../game/config/chunks";
import { applyWind } from "./wind";

/**
 * Zufällig über das Feld verteilte Bäume aus `Trees.glb` (5 Varianten, je
 * Stamm- und Kronen-Geometrie mit den geteilten Materialien Bark/Leaves).
 *
 * Aufbau wie beim Gras (`Grass.ts`): pro genutzter Variante zwei `InstancedMesh`
 * (Bark + Leaves) mit denselben Instanz-Matrizen. Die Krone wiegt über denselben
 * höhenmaskierten Wind-Shader (`wind.ts`) wie das Gras und reagiert via geteilter
 * `uWind`-Uniform auf Sturm/Unwetter; der Stamm bleibt steif.
 *
 * Belegte Flächen (Gebäude/Straßen) blenden Bäume per `setOccupancy()`-Compaction
 * aus (sichtbare Instanzen nach vorne packen, `count` senken) — so kann man
 * „darüber bauen", ohne dass ein Baum kollidiert oder blockiert.
 *
 * Das Layout ist deterministisch (seeded RNG aus der Feldgröße): gleiches Feld →
 * gleiche Bäume über Reloads hinweg; bei Erweiterung wächst die Fläche mit.
 */

const TREES_GLB = "/models/world/Trees.glb";

/** Zielhöhe eines Baums (längste/​Höhen-Kante) in Welt-Einheiten. */
const TREE_HEIGHT = 5;
/** Stamm-Radius für die Belegungsprüfung (nur der Stamm „belegt", nicht die Krone). */
const TRUNK_RADIUS = 0.5;
/** Wind-Amplitude der Krone (Objektraum; ×uWind vom Wetter). */
const LEAF_AMP = 0.12;
/** Baumzahl, die als Dichte fürs Startfeld gilt. */
const BASE_COUNT = 40;
/** Fläche des Startfeldes (Bezug für die Dichte). */
const BASE_AREA = (INITIAL_FIELD.maxX - INITIAL_FIELD.minX) * (INITIAL_FIELD.maxZ - INITIAL_FIELD.minZ);
/** Perf-Deckel: maximale Baumzahl. */
const CAP = 120;

/** Eine Baum-Variante: getrennte Stamm-/Kronen-Geometrie (gemeinsam normalisiert). */
interface TreeVariant {
  bark: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry;
}

/** Ein per Belegung ausblendbares InstancedMesh samt Originalmatrizen. */
interface Cullable {
  mesh: THREE.InstancedMesh;
  orig: Float32Array;
  baseHalf: number;
}

export class Trees {
  readonly object = new THREE.Group();
  private readonly uTime = { value: 0 };
  private readonly uWind = { value: 1 };
  private cullables: Cullable[] = [];

  constructor(
    private readonly variants: TreeVariant[],
    private readonly barkMat: THREE.Material,
    private readonly leavesMat: THREE.Material,
  ) {
    this.rebuildForField(INITIAL_FIELD);
  }

  /** Aktualisiert Windphase + -stärke (im Render-Loop). */
  update(tSec: number, windStrength: number): void {
    this.uTime.value = tSec;
    this.uWind.value = windStrength;
  }

  /**
   * Verteilt die Bäume passend zum (ggf. erweiterten) Feld neu. Anzahl skaliert
   * mit der Fläche (konstante Dichte), gedeckelt bei `CAP`. Danach muss
   * `setOccupancy` erneut laufen (über `World.cullGrass`).
   */
  rebuildForField(field: FieldBounds): void {
    for (const c of this.cullables) {
      this.object.remove(c.mesh);
      c.mesh.dispose();
      (c.mesh.material as THREE.Material).dispose();
    }
    this.cullables = [];
    if (this.variants.length === 0) return;

    const width = field.maxX - field.minX;
    const depth = field.maxZ - field.minZ;
    const area = width * depth;
    const density = BASE_COUNT / BASE_AREA;
    const count = Math.min(Math.round(density * area), CAP);
    if (count <= 0) return;

    const rng = mulberry32(seedFromField(field));
    const cell = Math.sqrt((width * depth) / Math.max(1, count));
    const cols = Math.max(1, Math.ceil(width / cell));

    // Instanz-Matrizen je Variante sammeln (jittered grid + Zufalls-Variante).
    const buckets: THREE.Matrix4[][] = this.variants.map(() => []);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const gx = i % cols;
      const gz = Math.floor(i / cols);
      const jx = (rng() - 0.5) * cell;
      const jz = (rng() - 0.5) * cell;
      dummy.position.set(field.minX + (gx + 0.5) * cell + jx, 0, field.minZ + (gz + 0.5) * cell + jz);
      dummy.rotation.set(0, rng() * Math.PI * 2, 0);
      const s = 0.8 + rng() * 0.6;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      const v = Math.min(this.variants.length - 1, Math.floor(rng() * this.variants.length));
      buckets[v].push(dummy.matrix.clone());
    }

    for (let v = 0; v < this.variants.length; v++) {
      const mats = buckets[v];
      if (mats.length === 0) continue;
      this.addInstanced(this.variants[v].bark, this.barkMat, mats, false);
      this.addInstanced(this.variants[v].leaves, this.leavesMat, mats, true);
    }
  }

  /**
   * Blendet Bäume auf belegten Flächen (Gebäude/Straße) aus — identisch zur
   * Gras-Compaction. Stamm- und Kronen-Mesh einer Variante teilen dieselben
   * Matrizen, werden also gleich umsortiert und bleiben deckungsgleich.
   */
  setOccupancy(isOccupied: (x: number, z: number, radius: number) => boolean): void {
    for (const c of this.cullables) {
      const arr = c.mesh.instanceMatrix.array as Float32Array;
      const orig = c.orig;
      const total = orig.length / 16;
      let w = 0;
      for (let i = 0; i < total; i++) {
        const o = i * 16;
        const scale = Math.hypot(orig[o], orig[o + 1], orig[o + 2]);
        const radius = c.baseHalf * scale;
        if (isOccupied(orig[o + 12], orig[o + 14], radius)) continue;
        arr.set(orig.subarray(o, o + 16), w * 16);
        w++;
      }
      c.mesh.count = w;
      c.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private addInstanced(
    geo: THREE.BufferGeometry,
    baseMat: THREE.Material,
    mats: THREE.Matrix4[],
    isLeaves: boolean,
  ): void {
    const mat = baseMat.clone();
    if (isLeaves) applyWind(mat, this.uTime, this.uWind, TREE_HEIGHT, LEAF_AMP);

    const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    for (let i = 0; i < mats.length; i++) mesh.setMatrixAt(i, mats[i]);
    mesh.instanceMatrix.needsUpdate = true;

    this.cullables.push({ mesh, orig: (mesh.instanceMatrix.array as Float32Array).slice(), baseHalf: TRUNK_RADIUS });
    this.object.add(mesh);
  }
}

/**
 * Lädt `Trees.glb`, extrahiert je Variante Stamm- und Kronen-Geometrie (auf die
 * Welt-Matrix gebacken, gemeinsam normalisiert: Basis y=0, in X/Z zentriert, auf
 * `TREE_HEIGHT` skaliert) und erstellt die `Trees`-Instanz. Fehlt das Modell,
 * wird eine leere (inaktive) `Trees`-Instanz geliefert.
 */
export async function createTrees(): Promise<Trees> {
  let barkMat: THREE.Material | null = null;
  let leavesMat: THREE.Material | null = null;
  const variants: TreeVariant[] = [];

  try {
    const gltf = await new GLTFLoader().loadAsync(TREES_GLB);
    gltf.scene.updateWorldMatrix(true, true);

    for (let i = 1; i <= 5; i++) {
      const node = gltf.scene.getObjectByName(`NormalTree_${i}`);
      if (!node) continue;
      const barkParts: THREE.BufferGeometry[] = [];
      const leavesParts: THREE.BufferGeometry[] = [];
      node.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const g = o.geometry.clone() as THREE.BufferGeometry;
        g.applyMatrix4(o.matrixWorld);
        for (const name of Object.keys(g.attributes)) {
          if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
        }
        const mat = (Array.isArray(o.material) ? o.material[0] : o.material) as THREE.Material;
        if ((mat.name ?? "").toLowerCase().includes("leav")) {
          leavesParts.push(g);
          leavesMat ??= mat;
        } else {
          barkParts.push(g);
          barkMat ??= mat;
        }
      });
      const bark = mergeOrNull(barkParts);
      const leaves = mergeOrNull(leavesParts);
      if (!bark || !leaves) continue;
      normalizeVariant(bark, leaves, TREE_HEIGHT);
      variants.push({ bark, leaves });
    }
  } catch {
    /* ohne Modell bleibt die Trees-Instanz leer (inaktiv) */
  }

  const bark = barkMat ?? new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 });
  const leaves = leavesMat ?? new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 1 });
  // Modell-Materialien sind metallisch/glänzend (metalness 0.4, roughness 0.3) →
  // erzeugt grelle Specular-„Glüh"-Flecken an Laub/Rinde. Bäume sind matt: kein
  // Metall, hohe Rauheit.
  for (const m of [bark, leaves]) {
    if (m instanceof THREE.MeshStandardMaterial) {
      m.metalness = 0;
      m.roughness = 1;
      m.emissive.setRGB(0, 0, 0);
    }
  }
  return new Trees(variants, bark, leaves);
}

/** Mergt die Geometrie-Teile (oder gibt das einzelne zurück); null wenn leer. */
function mergeOrNull(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : mergeGeometries(parts, false) || null;
}

/** Normalisiert Stamm+Krone gemeinsam: Basis y=0, in X/Z zentriert, Zielhöhe. */
function normalizeVariant(bark: THREE.BufferGeometry, leaves: THREE.BufferGeometry, targetHeight: number): void {
  bark.computeBoundingBox();
  leaves.computeBoundingBox();
  const box = new THREE.Box3().union(bark.boundingBox!).union(leaves.boundingBox!);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const scale = size.y > 1e-4 ? targetHeight / size.y : 1;
  for (const g of [bark, leaves]) {
    g.translate(-center.x, -box.min.y, -center.z); // Basis auf y=0, in X/Z zentriert
    g.scale(scale, scale, scale); // Basis bleibt bei 0 → nur Höhe skaliert
  }
}

/** Deterministischer Seed aus den (gerundeten) Feldgrenzen. */
function seedFromField(f: FieldBounds): number {
  const w = Math.round(f.maxX - f.minX);
  const d = Math.round(f.maxZ - f.minZ);
  return ((w * 73856093) ^ (d * 19349663)) >>> 0;
}

/** Kleiner, schneller seeded PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
