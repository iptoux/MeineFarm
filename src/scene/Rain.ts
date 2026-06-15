import * as THREE from "three";

/**
 * Leichter Regen aus kurzen, fallenden Linien-Streifen (LineSegments → liest
 * sich als Regen-Strähnen statt runder Punkte). Das gesamte Tropfen-Volumen
 * folgt jeden Frame der Kamera, sodass es beim WASD-Panning immer um den
 * Betrachter herum regnet. Ein einziger Draw-Call; die Intensität steuert über
 * den Draw-Range nur den sichtbaren Präfix und die Deckkraft – bei trockenem
 * Wetter (Intensität 0) praktisch kostenlos.
 */

/** Maximale Tropfenzahl (= volle Sturm-Intensität). */
const MAX_DROPS = 2500;
/** Kantenlängen der Regen-Box um die Kamera (x, y, z). */
const BOX = new THREE.Vector3(60, 40, 60);
/** Basis-Fallgeschwindigkeit (Welt-Einheiten/Sekunde). */
const FALL_SPEED = 18;
/** Länge eines einzelnen Tropfen-Streifens. */
const STREAK = 0.9;
const MAX_OPACITY = 0.45;

export class RainSystem {
  private readonly lines: THREE.LineSegments;
  private readonly positions: Float32Array;
  /** Pro Tropfen lokale Ankerposition (Kopf des Streifens), relativ zur Box-Mitte. */
  private readonly anchors: Float32Array;
  private readonly mat: THREE.LineBasicMaterial;
  private intensity = 0;
  private slantX = 0;
  private slantZ = 0;

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    this.positions = new Float32Array(MAX_DROPS * 2 * 3);
    this.anchors = new Float32Array(MAX_DROPS * 3);
    for (let i = 0; i < MAX_DROPS; i++) this.seed(i);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geo.setDrawRange(0, 0);

    this.mat = new THREE.LineBasicMaterial({
      color: 0xaab4c2,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false; // folgt der Kamera → nie cullen
    this.lines.renderOrder = 2;
    scene.add(this.lines);
  }

  /** Regenstärke [0,1]: steuert Tropfenzahl (Draw-Range) und Deckkraft. */
  setIntensity(v: number): void {
    this.intensity = THREE.MathUtils.clamp(v, 0, 1);
  }

  /** Horizontale Schräge des Regens (aus Windrichtung × Windstärke). */
  setWind(slantX: number, slantZ: number): void {
    this.slantX = slantX;
    this.slantZ = slantZ;
  }

  update(dt: number): void {
    const active = Math.round(this.intensity * MAX_DROPS);
    this.mat.opacity = MAX_OPACITY * this.intensity;
    this.lines.geometry.setDrawRange(0, active * 2);
    if (active === 0) return;

    const cx = this.camera.position.x;
    const cy = this.camera.position.y;
    const cz = this.camera.position.z;
    // Sturm fällt schneller; Schräge skaliert leicht mit der Intensität.
    const speed = FALL_SPEED * (0.85 + 0.55 * this.intensity);
    const dxStep = this.slantX * dt;
    const dzStep = this.slantZ * dt;

    for (let i = 0; i < active; i++) {
      const a = i * 3;
      let ax = this.anchors[a];
      let ay = this.anchors[a + 1] - speed * dt;
      let az = this.anchors[a + 2];
      ax += dxStep;
      az += dzStep;
      // Unter den Box-Boden gefallen → oben neu einsetzen.
      if (ay < -BOX.y / 2) {
        ax = THREE.MathUtils.randFloatSpread(BOX.x);
        ay = BOX.y / 2;
        az = THREE.MathUtils.randFloatSpread(BOX.z);
      }
      // Horizontal in der Box halten (um die Kamera wickeln).
      if (ax > BOX.x / 2) ax -= BOX.x;
      else if (ax < -BOX.x / 2) ax += BOX.x;
      if (az > BOX.z / 2) az -= BOX.z;
      else if (az < -BOX.z / 2) az += BOX.z;
      this.anchors[a] = ax;
      this.anchors[a + 1] = ay;
      this.anchors[a + 2] = az;

      // Welt-Position = Kamera + lokaler Anker; Streifen leicht windschief.
      const p = i * 6;
      const hx = cx + ax;
      const hy = cy + ay;
      const hz = cz + az;
      this.positions[p] = hx;
      this.positions[p + 1] = hy;
      this.positions[p + 2] = hz;
      this.positions[p + 3] = hx - this.slantX * (STREAK / speed);
      this.positions[p + 4] = hy - STREAK;
      this.positions[p + 5] = hz - this.slantZ * (STREAK / speed);
    }

    const attr = this.lines.geometry.getAttribute("position") as THREE.BufferAttribute;
    attr.needsUpdate = true;
  }

  private seed(i: number): void {
    const a = i * 3;
    this.anchors[a] = THREE.MathUtils.randFloatSpread(BOX.x);
    this.anchors[a + 1] = THREE.MathUtils.randFloatSpread(BOX.y);
    this.anchors[a + 2] = THREE.MathUtils.randFloatSpread(BOX.z);
  }
}
