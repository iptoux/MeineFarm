import * as THREE from "three";
import type { FieldBounds } from "../game/config/chunks";

/**
 * Locker über den Himmel ziehende Low-Poly-Wolken, jede mit einem weichen
 * Schattenfleck am Boden. Die Schatten sind bewusst gefälschte „Decals" (flache
 * Planes mit radialem Alpha) statt echter Shadow-Map-Schatten – das liest sich
 * sauber als Wolkenschatten, ist performant und entkoppelt vom Sonnenstand.
 * Nachts werden die Schatten ausgeblendet; die Wolken selbst dunkeln über das
 * Szenenlicht automatisch mit ab.
 */

/** Maximale Wolkenzahl im Pool; die Dichte (Wetter) blendet einen Teil davon aus. */
const CLOUD_MAX = 42;
/** Halber Bereich (x/z), über den Wolken verteilt sind und wrappen (≥ MAX_HALF). */
const SPREAD = 95;
const CLOUD_HEIGHT = 28;
/** Basis-Windgeschwindigkeit (Welt-Einheiten/Sekunde); vom Wetter skaliert. */
const WIND = new THREE.Vector2(1.1, 0.25);
const SHADOW_MAX_OPACITY = 0.32;
/** Wie schnell Wolken bei Dichteänderung auf-/abblenden (1/Sekunde). */
const VIS_FADE_RATE = 0.6;

interface Cloud {
  sky: THREE.Group;
  shadow: THREE.Mesh;
  /** Horizontale Halbausdehnung (für das Wrappen am Rand). */
  half: number;
  /** Schwelle in [0,1): aktiv, sobald die Dichte sie übersteigt. */
  threshold: number;
  /** Aktuelle Sichtbarkeits-Hüllkurve [0,1] (0 = aufgelöst, 1 = voll). */
  vis: number;
}

export class CloudManager {
  private clouds: Cloud[] = [];
  private shadowTex: THREE.Texture;
  private puffGeo = new THREE.IcosahedronGeometry(1, 1);
  private cloudMat: THREE.MeshStandardMaterial;
  /** Zieldichte [0,1] (vom Wetter gesetzt) – steuert, wie viele Wolken sichtbar sind. */
  private targetDensity = 12 / CLOUD_MAX;
  /** Wind-Multiplikator (vom Wetter gesetzt). */
  private windMul = 1;
  /** Spielfeld-Grenzen: Schatten außerhalb werden ausgeblendet (kein Void-Schatten). */
  private bounds: FieldBounds | null = null;

  constructor(private scene: THREE.Scene) {
    this.shadowTex = makeRadialTexture();
    this.cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.95,
      flatShading: true,
    });

    for (let i = 0; i < CLOUD_MAX; i++) {
      const cloud = this.makeCloud();
      // Stabile, gleichmäßig verteilte Schwelle → höhere Dichte zeigt mehr Wolken.
      cloud.threshold = i / CLOUD_MAX;
      this.position(cloud, THREE.MathUtils.randFloatSpread(2 * SPREAD), THREE.MathUtils.randFloatSpread(2 * SPREAD));
      this.clouds.push(cloud);
      this.scene.add(cloud.sky, cloud.shadow);
    }
  }

  /**
   * Setzt Wolkenfarbe/-deckkraft und Zieldichte (vom WeatherManager pro Frame).
   * Die eigentliche weiche Auf-/Abblendung passiert in `update`.
   */
  applyWeather(color: THREE.Color, opacity: number, density: number): void {
    this.cloudMat.color.copy(color);
    this.cloudMat.opacity = opacity;
    this.targetDensity = THREE.MathUtils.clamp(density, 0, 1);
  }

  /** Wind-Multiplikator (vom Wetter): höher bei Regen/Sturm. */
  setWind(mul: number): void {
    this.windMul = mul;
  }

  /** Spielfeld-Grenzen setzen: Schatten außerhalb werden ausgeblendet. */
  setBounds(bounds: FieldBounds): void {
    this.bounds = bounds;
  }

  /** Verschiebt Wolken + Schatten mit dem Wind und blendet Schatten nach Tageslicht. */
  update(dt: number, daylight: number): void {
    const shadowOpacity = SHADOW_MAX_OPACITY * THREE.MathUtils.clamp(daylight, 0, 1);
    const fade = Math.min(1, dt * VIS_FADE_RATE);
    for (const c of this.clouds) {
      let x = c.sky.position.x + WIND.x * this.windMul * dt;
      let z = c.sky.position.z + WIND.y * this.windMul * dt;
      // Am Rand auf der Gegenseite neu einsetzen (mit etwas Variation).
      if (x - c.half > SPREAD) x = -SPREAD - c.half;
      if (z - c.half > SPREAD) z = -SPREAD - c.half;
      this.position(c, x, z);

      // Sichtbarkeit weich Richtung Ziel (0 oder 1) ziehen → Wolken bauen sich
      // auf bzw. lösen sich auf, statt zu poppen.
      const targetVis = this.targetDensity > c.threshold ? 1 : 0;
      c.vis += (targetVis - c.vis) * fade;
      const visible = c.vis > 0.01;
      c.sky.visible = visible;
      // Schatten nur auf dem Spielfeld zeigen (sonst läge er auf dem leeren Void).
      const b = this.bounds;
      const onField = !b || (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ);
      c.shadow.visible = visible && onField;
      if (visible) {
        c.sky.scale.setScalar(c.vis);
        (c.shadow.material as THREE.MeshBasicMaterial).opacity = shadowOpacity * c.vis;
      }
    }
  }

  private position(c: Cloud, x: number, z: number): void {
    c.sky.position.set(x, CLOUD_HEIGHT, z);
    c.shadow.position.set(x, 0.06, z);
  }

  private makeCloud(): Cloud {
    const scale = THREE.MathUtils.randFloat(2.2, 4.2);
    const sky = new THREE.Group();
    // Mehrere überlappende, leicht abgeflachte Kugeln ergeben eine bauschige Wolke.
    const puffs = 4 + Math.floor(Math.random() * 3);
    let maxR = 0;
    for (let i = 0; i < puffs; i++) {
      const r = THREE.MathUtils.randFloat(0.7, 1.3) * scale;
      const puff = new THREE.Mesh(this.puffGeo, this.cloudMat);
      puff.scale.set(r, r * 0.62, r);
      const px = THREE.MathUtils.randFloatSpread(2.4 * scale);
      const pz = THREE.MathUtils.randFloatSpread(1.4 * scale);
      puff.position.set(px, THREE.MathUtils.randFloatSpread(0.6 * scale), pz);
      sky.add(puff);
      maxR = Math.max(maxR, Math.abs(px) + r, Math.abs(pz) + r);
    }

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(maxR * 2.4, maxR * 2.4),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        map: this.shadowTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 1;

    return { sky, shadow, half: maxR, threshold: 0, vis: 0 };
  }
}

/** Weicher runder Alpha-Verlauf (Canvas) für die Schatten-Decals. */
function makeRadialTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.55, "rgba(255,255,255,0.8)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
