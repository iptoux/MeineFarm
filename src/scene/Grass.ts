import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Animiertes Wind-Gras auf dem Boden, aufgebaut aus instanzierten GLB-Büscheln:
 *  - `Grass Patch.glb` als dichter Haupt-Teppich,
 *  - `grass yellowing.glb` als vereinzelte trockene Akzente.
 *
 * Beide nutzen denselben höhenmaskierten Wind-Vertex-Shader (Wurzel bleibt fix,
 * Spitze wiegt) und teilen sich EINE `uTime`-Uniform.
 *
 * Belegte Flächen (Gebäude/Straßen) werden über `setOccupancy()` per Compaction
 * ausgeblendet: sichtbare Instanzen werden im Buffer nach vorne gepackt und
 * `mesh.count` reduziert, sodass verdeckte Büschel gar nicht erst gerendert
 * werden (spart Vertex-Last ohne Buffer-Neuanlage).
 */

const GRASS_GLB = "/models/world/Grass Patch.glb";
const GRASS_DRY_GLB = "/models/world/grass yellowing.glb";

/** Halbe Kantenlänge des Streubereichs (Boden ist 120×120). */
const AREA = 46;
const CLUMP_HEIGHT = 0.9;

/** Eine Geometrie/Material-Kombi für instanzierte Büschel. */
export interface ClumpSource {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  count: number;
  amplitude: number;
  /** true = rein zufällig (Akzente); false = jittered Grid (Flächendeckung). */
  scatter: boolean;
}

/** Ein per Belegung ausblendbares InstancedMesh samt Originalmatrizen. */
interface Cullable {
  mesh: THREE.InstancedMesh;
  /** Alle erzeugten Instanz-Matrizen (vollständig, Reihenfolge stabil). */
  orig: Float32Array;
  /** Halbe XZ-Ausdehnung der Geometrie (bei Skalierung 1) für überlappungs-genaues Culling. */
  baseHalf: number;
}

export class Grass {
  readonly object = new THREE.Group();
  /** Gemeinsame Zeit-Uniform für alle Gras-Materialien. */
  private readonly uTime = { value: 0 };
  private readonly cullables: Cullable[] = [];

  constructor(clumps: ClumpSource[]) {
    for (const c of clumps) this.add(this.buildClumps(c));
  }

  /** Aktualisiert die Windphase (im Render-Loop mit Gesamtzeit in Sekunden). */
  update(tSec: number): void {
    this.uTime.value = tSec;
  }

  /**
   * Blendet Instanzen auf belegten Flächen (Gebäude/Straße) aus, indem nur die
   * sichtbaren nach vorne gepackt und gerendert werden. Bei jeder Bau-/Straßen-
   * Änderung aufrufen — verdeckte Büschel erscheinen nach Entfernen wieder.
   */
  setOccupancy(isOccupied: (x: number, z: number, radius: number) => boolean): void {
    for (const c of this.cullables) {
      const arr = c.mesh.instanceMatrix.array as Float32Array;
      const orig = c.orig;
      const total = orig.length / 16;
      let w = 0;
      for (let i = 0; i < total; i++) {
        const o = i * 16;
        // Skalierung steckt in der Länge der ersten Matrix-Spalte (uniform skaliert).
        const scale = Math.hypot(orig[o], orig[o + 1], orig[o + 2]);
        const radius = c.baseHalf * scale;
        if (isOccupied(orig[o + 12], orig[o + 14], radius)) continue;
        // IMMER aus orig kopieren (nie aus dem schon umsortierten arr), sonst
        // verschieben sich bei wiederholten Aufrufen die Positionen.
        arr.set(orig.subarray(o, o + 16), w * 16);
        w++;
      }
      c.mesh.count = w; // nur die sichtbaren Instanzen rendern
      c.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Registriert ein Mesh als Cullable und hängt es in die Gruppe. */
  private add(mesh: THREE.InstancedMesh): void {
    const geo = mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    // Geometrie ist in XZ um den Ursprung zentriert → halbe Ausdehnung.
    const baseHalf = Math.max(bb.max.x, -bb.min.x, bb.max.z, -bb.min.z);
    this.cullables.push({ mesh, orig: (mesh.instanceMatrix.array as Float32Array).slice(), baseHalf });
    this.object.add(mesh);
  }

  /**
   * GLB-Büschel über die Fläche verteilen. `scatter: true` (Akzente) streut rein
   * zufällig; sonst auf einem jittered Grid — das garantiert lückenlose, gleich-
   * mäßige Abdeckung (reines Zufalls-Streuen erzeugt Klumpen und kahle Stellen).
   */
  private buildClumps(src: ClumpSource): THREE.InstancedMesh {
    const mat = src.material.clone();
    applyWind(mat, this.uTime, CLUMP_HEIGHT, src.amplitude);

    const mesh = new THREE.InstancedMesh(src.geometry, mat, src.count);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // Instanzen sind über die ganze Fläche verteilt

    const dummy = new THREE.Object3D();
    const cols = Math.ceil(Math.sqrt(src.count));
    const cell = (AREA * 2) / cols;

    for (let i = 0; i < src.count; i++) {
      if (src.scatter) {
        dummy.position.set((Math.random() * 2 - 1) * AREA, 0, (Math.random() * 2 - 1) * AREA);
      } else {
        // Rasterzelle + Jitter → überlappende, gleichmäßige Abdeckung
        const gx = i % cols;
        const gz = Math.floor(i / cols);
        const jx = (Math.random() - 0.5) * cell;
        const jz = (Math.random() - 0.5) * cell;
        dummy.position.set(-AREA + (gx + 0.5) * cell + jx, 0, -AREA + (gz + 0.5) * cell + jz);
      }
      dummy.rotation.y = Math.random() * Math.PI * 2;
      const s = 0.95 + Math.random() * 0.55;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }
}

/**
 * Lädt die Gras-Büschel-Modelle, normalisiert sie (Wurzel auf y=0, zentriert,
 * auf CLUMP_HEIGHT skaliert) und erstellt die `Grass`-Instanz. Fehlende Modelle
 * werden übersprungen.
 *
 * Achtung Performance: `Grass Patch.glb` hat ~8.5k Dreiecke pro Büschel — die
 * Instanzzahl bewusst niedrig halten (Tuning über die count-Werte / AREA).
 */
export async function createGrass(): Promise<Grass> {
  const clumps: ClumpSource[] = [];
  const green = await loadClump(GRASS_GLB);
  if (green) clumps.push({ ...green, count: 1700, amplitude: 0.07, scatter: false });
  const dry = await loadClump(GRASS_DRY_GLB);
  if (dry) clumps.push({ ...dry, count: 350, amplitude: 0.06, scatter: true });
  return new Grass(clumps);
}

/** Lädt ein Gras-GLB und liefert genormte Geometrie + Material. */
async function loadClump(
  url: string,
): Promise<{ geometry: THREE.BufferGeometry; material: THREE.Material } | null> {
  try {
    const gltf = await new GLTFLoader().loadAsync(url);
    const parts: THREE.BufferGeometry[] = [];
    let material: THREE.Material | null = null;
    gltf.scene.updateWorldMatrix(true, true);
    gltf.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const g = o.geometry.clone() as THREE.BufferGeometry;
        g.applyMatrix4(o.matrixWorld);
        // Nur Position/Normal/UV behalten, damit sich die Teile mergen lassen.
        for (const name of Object.keys(g.attributes)) {
          if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
        }
        parts.push(g);
        if (!material) material = Array.isArray(o.material) ? o.material[0] : o.material;
      }
    });
    if (parts.length === 0 || !material) return null;
    const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
    if (!merged) return null;
    normalizeToGround(merged, CLUMP_HEIGHT);
    return { geometry: merged, material };
  } catch {
    return null;
  }
}

/** Verschiebt/skaliert die Geometrie: Basis auf y=0, in X/Z zentriert, Zielhöhe. */
function normalizeToGround(geo: THREE.BufferGeometry, targetHeight: number): void {
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const scale = size.y > 1e-4 ? targetHeight / size.y : 1;
  geo.translate(-center.x, -box.min.y, -center.z);
  geo.scale(scale, scale, scale);
  geo.computeVertexNormals();
}

/**
 * Patcht ein Material so, dass Vertices oberhalb der Wurzel im Wind schwingen.
 * Die Auslenkung ist höhenmaskiert (smoothstep) und pro Instanz phasenverschoben
 * (aus der Instanz-Weltposition), damit nicht alle Büschel synchron wippen.
 */
function applyWind(
  material: THREE.Material,
  uTime: { value: number },
  height: number,
  amplitude: number,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uHeight = { value: height };
    shader.uniforms.uAmp = { value: amplitude };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uTime;
         uniform float uHeight;
         uniform float uAmp;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         {
           #ifdef USE_INSTANCING
             vec3 instPos = instanceMatrix[3].xyz;
           #else
             vec3 instPos = vec3(0.0);
           #endif
           float phase = instPos.x * 0.35 + instPos.z * 0.35;
           float mask = smoothstep(0.0, uHeight, position.y);
           float w = sin(uTime * 1.6 + phase) * 0.6 + sin(uTime * 0.7 + phase * 1.7) * 0.4;
           transformed.x += w * mask * uAmp;
           transformed.z += w * mask * uAmp * 0.4;
         }`,
      );
  };
  material.needsUpdate = true;
}
